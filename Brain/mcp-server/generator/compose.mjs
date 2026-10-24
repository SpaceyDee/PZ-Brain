import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GenerateError, fail } from "./errors.mjs";
import { verbNames, verbsByName } from "./verbs/registry.mjs";
import { DEFAULT_AUTHOR } from "../paths.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const INSERT_ORDER = ["header", "constants", "helpers", "registrations", "eof"];
const ARCHETYPES = ["script-only", "sandbox-qol", "network-mp", "timed-action"];

const DEFAULTS = {
  author: DEFAULT_AUTHOR,
  modversion: "1.0.0",
  pzversion: "42.18",
  versionMin: "42.0",
  overwrite: false,
};

export function generateMod(spec, outputRoot, options = {}) {
  try {
    return generateModUnsafe(spec, outputRoot, options);
  } catch (err) {
    if (err instanceof GenerateError) return err.toResult();
    throw err;
  }
}

function generateModUnsafe(spec, outputRoot, options) {
  if (!spec || typeof spec !== "object") fail("spec_invalid", "spec must be an object");
  const modId = String(spec.modId ?? "").trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(modId)) {
    fail("spec_invalid", "modId must be a Lua-safe identifier", { modId });
  }
  const archetypeId = String(spec.archetype ?? "").trim();
  if (!ARCHETYPES.includes(archetypeId)) {
    fail("unknown_archetype", `unknown archetype: ${archetypeId}`, {
      detected: archetypeId,
      supported: ARCHETYPES,
    });
  }
  const archetype = loadArchetype(archetypeId);
  const features = Array.isArray(spec.features) ? spec.features : [];
  const overwrite = spec.overwrite === true;
  const luaIdent = luaIdentFrom(modId);
  const sandboxNamespace = String(spec.translation?.sandboxNamespace ?? luaIdent);
  const generatedAt = options.now ?? new Date().toISOString();
  const luaSides = [...new Set(archetype.luaSides ?? [])];

  const verbCounts = {};
  const declared = new Set();
  for (const feature of features) {
    const verb = String(feature?.verb ?? "");
    if (!verbsByName[verb]) {
      fail("unknown_verb", `unknown verb: ${verb}`, {
        detected: verb,
        closest: closest(verb, verbNames),
      });
    }
    if (!archetype.allowedVerbs.includes(verb) && !(verbsByName[verb].compatibleArchetypes ?? []).includes(archetypeId)) {
      fail("verb_archetype_mismatch", `verb ${verb} is not allowed on ${archetypeId}`, {
        verb,
        archetype: archetypeId,
      });
    }
    if (!archetype.allowedVerbs.includes(verb)) {
      fail("verb_archetype_mismatch", `verb ${verb} is not allowed on ${archetypeId}`, {
        verb,
        archetype: archetypeId,
      });
    }
    validateVerbSpec(verbsByName[verb], feature);
    verbCounts[verb] = (verbCounts[verb] ?? 0) + 1;
    declared.add(verb);
  }

  if ((verbCounts["add-tr-helper"] ?? 0) > 1) {
    fail("feature_collision", "add-tr-helper may only appear once");
  }
  if ((verbCounts["add-module-id-constant"] ?? 0) > 1) {
    fail("feature_collision", "add-module-id-constant may only appear once");
  }

  const sandboxIds = new Set();
  const eventKeys = new Set();
  for (const feature of features) {
    if (feature.verb === "add-sandbox-option") {
      const id = String(feature.id);
      if (sandboxIds.has(id)) fail("feature_collision", `duplicate sandbox option id: ${id}`);
      sandboxIds.add(id);
    }
    if (feature.verb === "add-event-hook") {
      const key = `${feature.target}:${feature.handler}`;
      if (eventKeys.has(key)) fail("feature_collision", `duplicate event handler: ${key}`);
      eventKeys.add(key);
    }
    const requires = verbsByName[feature.verb].requires ?? [];
    for (const need of requires) {
      if (!declared.has(need)) {
        fail("missing_prerequisite_verb", `verb ${feature.verb} requires ${need}`, {
          requested_by: feature.verb,
          missing: need,
        });
      }
    }
  }

  for (const need of archetype.requiredVerbs ?? []) {
    if (!declared.has(need)) {
      fail("missing_prerequisite_verb", `archetype ${archetypeId} requires ${need}`, {
        requested_by: archetypeId,
        missing: need,
      });
    }
  }

  const outRoot = resolve(String(outputRoot ?? ""));
  const target = join(outRoot, modId);
  if (exists(target) && !overwrite) {
    fail("target_exists", `target already exists: ${target}`, { path: target });
  }

  const tempDir = mkdtempSync(join(tmpdir(), "space_gen_"));
  const ctx = {
    spec: applyDefaults(spec),
    modId,
    luaIdent,
    archetype: archetypeId,
    luaSides,
    sandboxNamespace,
    generatedAt,
  };

  const bags = new Map();
  const notes = [];

  for (const feature of features) {
    const verb = verbsByName[feature.verb];
    let fragments;
    try {
      fragments = verb.emit(feature, ctx) ?? [];
    } catch (err) {
      fail("verb_spec_invalid", err.message, { verb: feature.verb, detail: err.message });
    }
    for (const frag of fragments) {
      if (!frag || !frag.file || !INSERT_ORDER.includes(frag.insertPoint)) {
        fail("verb_bug_unknown_slot", "verb returned a bad fragment", {
          verb: feature.verb,
          detail: frag,
        });
      }
      if (!bags.has(frag.file)) bags.set(frag.file, emptyBag());
      bags.get(frag.file)[frag.insertPoint].push(frag.snippet);
    }
  }

  const slotPaths = materializeSkeleton(tempDir, ctx, luaSides, bags);

  for (const [slot, bag] of bags.entries()) {
    const abs = slotPaths.get(slot) ?? resolveSlot(tempDir, ctx, slot);
    slotPaths.set(slot, abs);
    mkdirSync(dirname(abs), { recursive: true });
    const body = flushFile(slot, bag, ctx);
    if (abs.endsWith(".lua")) {
      const balance = luaBalance(body);
      if (balance.functions !== balance.ends) {
        fail("lua_prebalance_failed", `block/end mismatch in ${slot}`, {
          file: slot,
          verb_stack: features.map((f) => f.verb),
          opens: balance.functions,
          ends: balance.ends,
        });
      }
    }
    writeFileSync(abs, body, "utf8");
  }

  writeFileSync(join(tempDir, ".generator-spec.json"), JSON.stringify(spec, null, 2) + "\n", "utf8");
  notes.push("preview.png and poster.png are not generated; run Brain/templates/preview_placeholder.py before Workshop upload.");

  try {
    mkdirSync(outRoot, { recursive: true });
    if (exists(target) && overwrite) {
      const stamp = timestamp(generatedAt);
      renameSync(target, `${target}.replaced-${stamp}`);
    }
    try {
      renameSync(tempDir, target);
    } catch (err) {
      if (err && err.code === "EXDEV") {
        cpSync(tempDir, target, { recursive: true });
        rmSync(tempDir, { recursive: true, force: true });
      } else {
        fail("move_failed", "failed to move generated mod into place", {
          temp_dir: tempDir,
          target,
          detail: String(err && err.message ? err.message : err),
        });
      }
    }
  } catch (err) {
    if (err instanceof GenerateError) throw err;
    fail("move_failed", "failed to move generated mod into place", {
      temp_dir: tempDir,
      target,
      detail: String(err && err.message ? err.message : err),
    });
  }

  const files = listFiles(target).map((abs) => ({
    path: relative(target, abs).replaceAll("\\", "/"),
    bytes: statSync(abs).size,
  }));

  return {
    ok: true,
    modId,
    root: target,
    files,
    verbs_applied: features.map((f) => f.verb),
    notes,
  };
}

function applyDefaults(spec) {
  const workshop = spec.workshop ?? {};
  return {
    ...spec,
    author: spec.author ?? DEFAULTS.author,
    modversion: spec.modversion ?? DEFAULTS.modversion,
    pzversion: spec.pzversion ?? DEFAULTS.pzversion,
    versionMin: spec.versionMin ?? DEFAULTS.versionMin,
    workshop: {
      id: workshop.id ?? "0",
      visibility: workshop.visibility ?? "unlisted",
      tags: workshop.tags ?? ["Build 42", "Multiplayer"],
    },
  };
}

function loadArchetype(id) {
  const raw = JSON.parse(readFileSync(join(HERE, "archetypes", `${id}.json`), "utf8"));
  return raw;
}

function luaIdentFrom(modId) {
  return modId.replace(/[^A-Za-z0-9_]/g, "_");
}

function emptyBag() {
  return { header: [], constants: [], helpers: [], registrations: [], eof: [] };
}

function materializeSkeleton(tempDir, ctx, luaSides, bags) {
  const paths = new Map();
  const filled = applyDefaults(ctx.spec);
  const modRoot = join(tempDir, "Contents", "mods", ctx.modId);
  const v42 = join(modRoot, "42");
  mkdirSync(join(v42, "media", "scripts"), { recursive: true });
  mkdirSync(join(v42, "media", "lua", "shared"), { recursive: true });

  const workshop = [
    "version=1",
    `id=${filled.workshop.id}`,
    `title=${filled.workshopTitle ?? filled.modName ?? ctx.modId}`,
    `description=${filled.description ?? filled.modName ?? ctx.modId}`,
    `tags=${(filled.workshop.tags ?? []).join(";")}`,
    `visibility=${filled.workshop.visibility}`,
    "",
  ].join("\n");
  writeFileSync(join(tempDir, "workshop.txt"), workshop, "utf8");
  paths.set("workshop", join(tempDir, "workshop.txt"));

  const modInfo = [
    `name=${filled.modName ?? ctx.modId}`,
    `id=${ctx.modId}`,
    `description=${filled.description ?? filled.modName ?? ctx.modId}`,
    `author=${filled.author}`,
    `modversion=${filled.modversion}`,
    `pzversion=${filled.pzversion}`,
    `versionMin=${filled.versionMin}`,
    "",
  ].join("\n");
  writeFileSync(join(modRoot, "mod.info"), modInfo, "utf8");
  writeFileSync(join(v42, "mod.info"), modInfo, "utf8");
  paths.set("modinfo-root", join(modRoot, "mod.info"));
  paths.set("modinfo-42", join(v42, "mod.info"));

  for (const side of luaSides) {
    mkdirSync(join(v42, "media", "lua", side), { recursive: true });
    const slot = `lua-${side}`;
    if (!bags.has(slot)) bags.set(slot, emptyBag());
    paths.set(slot, join(v42, "media", "lua", side, `${ctx.modId}_${capitalize(side)}.lua`));
  }

  if (bags.has("sandbox-options")) {
    paths.set("sandbox-options", join(v42, "media", "sandbox-options.txt"));
  }
  if (bags.has("translate-sandbox")) {
    const p = join(v42, "media", "lua", "shared", "Translate", "EN", "Sandbox.json");
    mkdirSync(dirname(p), { recursive: true });
    paths.set("translate-sandbox", p);
  }
  if (bags.has("translate-contextmenu")) {
    const p = join(v42, "media", "lua", "shared", "Translate", "EN", "ContextMenu.json");
    mkdirSync(dirname(p), { recursive: true });
    paths.set("translate-contextmenu", p);
  }

  for (const slot of bags.keys()) {
    if (slot.startsWith("scripts:")) {
      paths.set(slot, resolveSlot(tempDir, ctx, slot));
    }
  }
  return paths;
}

function resolveSlot(tempDir, ctx, slot) {
  const v42 = join(tempDir, "Contents", "mods", ctx.modId, "42");
  if (slot.startsWith("scripts:")) {
    return join(v42, "media", "scripts", slot.slice("scripts:".length));
  }
  if (slot.startsWith("lua-")) {
    const side = slot.slice("lua-".length);
    return join(v42, "media", "lua", side, `${ctx.modId}_${capitalize(side)}.lua`);
  }
  fail("verb_bug_unknown_slot", `unknown file slot: ${slot}`, { detail: slot });
}

function flushFile(slot, bag, ctx) {
  const parts = [];
  if (slot.startsWith("lua-")) {
    const side = slot.slice("lua-".length);
    parts.push(`-- Generated by space_generate_mod on ${ctx.generatedAt}. Edit freely.`);
    if (side === "server") parts.push("if isClient() then return end");
    if (side === "client") parts.push("if isServer() then return end");
    parts.push(`${ctx.luaIdent} = ${ctx.luaIdent} or {}`);
    parts.push("");
  } else if (slot.startsWith("scripts:")) {
    parts.push(`/* Generated by space_generate_mod on ${ctx.generatedAt}. Edit freely. */`);
    parts.push("");
  } else if (slot === "sandbox-options") {
    parts.push("VERSION = 1,");
    parts.push("");
  }

  for (const point of INSERT_ORDER) {
    for (const snippet of bag[point]) {
      if (snippet) parts.push(snippet.endsWith("\n") ? snippet.slice(0, -1) : snippet);
    }
  }

  let body = parts.join("\n");
  if (!body.endsWith("\n")) body += "\n";

  if (slot === "translate-sandbox" || slot === "translate-contextmenu") {
    const inner = parts.join("\n").replace(/^\n+/, "").replace(/,\s*$/, "");
    body = "{\n" + inner + "\n}\n";
  }
  return body;
}

function luaBalance(source) {
  const stripped = source
    .replace(/--\[\[[\s\S]*?\]\]/g, "")
    .replace(/--[^\n]*/g, "")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
  const functions = (stripped.match(/\bfunction\b/g) || []).length;
  const opens =
    functions +
    (stripped.match(/\bif\b/g) || []).length +
    (stripped.match(/\bfor\b/g) || []).length +
    (stripped.match(/\bwhile\b/g) || []).length;
  const ends = (stripped.match(/\bend\b/g) || []).length;
  return { functions: opens, ends };
}

function validateVerbSpec(verb, feature) {
  const required = verb.schema?.required ?? [];
  for (const key of required) {
    if (feature[key] == null || feature[key] === "") {
      fail("verb_spec_invalid", `verb ${verb.name} missing ${key}`, {
        verb: verb.name,
        path: key,
        detail: `missing ${key}`,
      });
    }
  }
}

function closest(name, names) {
  return names
    .map((n) => ({ n, s: similarity(name, n) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => x.n);
}

function similarity(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.6;
  let hits = 0;
  for (const ch of a) if (b.includes(ch)) hits++;
  return hits / Math.max(a.length, b.length);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function exists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

function timestamp(iso) {
  return String(iso).replace(/[-:TZ.]/g, "").slice(0, 14);
}

function listFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listFiles(full, out);
    else out.push(full);
  }
  return out;
}
