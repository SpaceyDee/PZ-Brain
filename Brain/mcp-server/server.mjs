#!/usr/bin/env node
// PZ Modding Brain — MCP server (stdio).
// Resources: every .md/.json under Brain/. Tools: ListTools is authoritative.
// Do not treat Brain/truth/pending.json line count as an approval backlog.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { MOD_INDEX_TOOLS } from "./mod-index-tools.mjs";
import { DEFAULT_WORKSHOP_MODS, parseWorkshopTxt, stageWorkshopUploads } from "./workshop-publisher.mjs";
import {
  auditTruthStore,
  deprecateTruth,
  getTruth,
  promoteTruth,
  proposeTruth,
  reviewTruths,
  searchTruths,
  TRUTH_KIND_LIST,
} from "./truth-store.mjs";
import { generateMod } from "./generator/compose.mjs";
import { prepareHeadlessProbe, runHeadlessProbe } from "./headless-probe.mjs";
import {
  HERE,
  BRAIN_ROOT,
  WORKSHOP_ROOT,
  LUAC_PATH,
  PENDING_PATCH_DIR,
  BACKUP_ROOT,
  TRUTH_ROOT,
  WORKSHOP_UPLOAD_STAGING_ROOT,
  PUBLIC_MODE,
  describeRoots,
} from "./paths.mjs";
import { findRequireMissingReturns } from "./require-module-return.mjs";
const MAX_READ_BYTES = 512 * 1024;
const TEXT_EXTENSIONS = new Set([
  ".bbcode",
  ".cfg",
  ".csv",
  ".ini",
  ".java",
  ".json",
  ".lua",
  ".md",
  ".mjs",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

// ---------- file walk ----------

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (
      e.name === "mcp-server" ||
      e.name === "node_modules" ||
      e.name === "mod-corpus" ||
      e.name === "snapshots" ||
      e.name === "pz-bridge" ||
      e.name.startsWith(".")
    ) continue;
    if (/\.bak($|-)/i.test(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (/\.(md|json)$/i.test(e.name)) out.push(full);
  }
  return out;
}

async function walkLua(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "mod-corpus" || e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await walkLua(full, out);
    else if (extname(e.name).toLowerCase() === ".lua") out.push(full);
  }
  return out;
}

async function walkTextFiles(dir, out = [], limit = 1000) {
  if (out.length >= limit) return out;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (out.length >= limit) break;
    if (e.name === "node_modules" || e.name === ".git" || e.name === "mod-corpus" || e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await walkTextFiles(full, out, limit);
    else if (e.isFile() && TEXT_EXTENSIONS.has(extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

async function walkFiles(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === ".input" || e.name === "mod-corpus") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      // Skip accidental nested copies like `_workspace/Foo/Foo/Contents/...`
      // when the parent already has `Contents/mods`.
      if (e.name === basename(dir)) {
        const nestedMods = join(full, "Contents", "mods");
        const parentMods = join(dir, "Contents", "mods");
        if (await pathExists(nestedMods) && await pathExists(parentMods)) continue;
      }
      await walkFiles(full, out);
    } else if (e.isFile()) out.push(full);
  }
  return out;
}

async function findAncestorWorkshopTxt(startDir, maxHops = 8) {
  let dir = startDir;
  for (let i = 0; i < maxHops; i++) {
    const candidate = join(dir, "workshop.txt");
    if (await pathExists(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function luaLeadingCode(lines, maxExecutable = 80) {
  const kept = [];
  for (const line of lines) {
    const stripped = line.replace(/--\[\[.*$/s, "").replace(/--.*$/, "").trim();
    if (!stripped) continue;
    kept.push(stripped);
    if (kept.length >= maxExecutable) break;
  }
  return kept.join("\n");
}

function extractLuaBlockFrom(text, startIdx) {
  const lines = text.slice(startIdx).split(/\r?\n/);
  const body = [];
  let depth = 0;
  for (const line of lines) {
    body.push(line);
    const stripped = line.replace(/--.*$/, "");
    if (/\bfunction\b|\bthen\b|\bdo\b|\brepeat\b/.test(stripped)) depth++;
    if (/\bend\b/.test(stripped)) depth--;
    if (body.length > 1 && depth <= 0) break;
  }
  return body.join("\n");
}

function collectEventAddHandlers(text, eventName, constants) {
  const handlers = [];
  const needle = `Events.${eventName}.Add`;
  let searchFrom = 0;
  while (true) {
    const idx = text.indexOf(needle, searchFrom);
    if (idx < 0) break;
    const afterNeedle = text.slice(idx + needle.length);
    const paren = afterNeedle.match(/^\s*\(/);
    if (!paren) {
      searchFrom = idx + needle.length;
      continue;
    }
    const innerStart = idx + needle.length + paren[0].length;
    const inner = text.slice(innerStart).replace(/^\s*/, "");
    const ws = text.slice(innerStart).length - inner.length;
    let body = "";
    let fnName = "(anonymous)";
    if (inner.startsWith("function")) {
      body = extractLuaBlockFrom(text, innerStart + ws);
    } else {
      const nameMatch = inner.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
      if (nameMatch) {
        fnName = nameMatch[1];
        body = extractFunctionBody(text, fnName) ?? "";
      }
    }
    const modules = new Set();
    for (const match of body.matchAll(/\bmodule\s*(?:==|~=)\s*([A-Za-z_][A-Za-z0-9_]*|["'][^"']+["'])/g)) {
      const resolved = resolveLuaToken(match[1], constants);
      if (resolved) modules.add(resolved);
    }
    handlers.push({
      function: fnName,
      line: lineFromIndex(text, idx),
      modules,
      commands: extractCommandRefs(body, text),
    });
    searchFrom = idx + needle.length;
  }
  return handlers;
}

function toUri(absPath) {
  const rel = relative(BRAIN_ROOT, absPath).split(sep).join("/");
  return `brain://${rel}`;
}

async function fromUri(uri) {
  if (!uri.startsWith("brain://")) throw new Error(`unsupported uri: ${uri}`);
  const rel = uri.slice("brain://".length);
  const abs = await realpath(join(BRAIN_ROOT, rel));
  const root = await realpath(BRAIN_ROOT);
  if (!isWithin(abs, root) || relative(root, abs).split(sep).some(p => ["mcp-server", "backups", "migration-reports"].includes(p)) || !/\.(md|json)$/i.test(abs)) throw new Error("not a public Brain resource");
  return abs;
}

function isWithin(candidate, root) {
  const c = process.platform === "win32" ? resolve(candidate).toLowerCase() : resolve(candidate);
  const r = process.platform === "win32" ? resolve(root).toLowerCase() : resolve(root);
  return c === r || c.startsWith(r + sep);
}

function validateWorkshopPath(rawPath) {
  const raw = String(rawPath ?? "").trim();
  if (!raw) throw new Error("path must be a non-empty string");
  const abs = resolve(raw);
  if (!isWithin(abs, WORKSHOP_ROOT)) {
    throw new Error(`path is outside workshop root: ${raw}`);
  }
  return abs;
}

function validateLocalPath(rawPath) {
  const raw = String(rawPath ?? "").trim();
  if (!raw) throw new Error("path must be a non-empty string");
  return resolve(raw);
}

async function findWorkshopFolderForModId(modId) {
  const wanted = String(modId ?? "").trim();
  if (!wanted) return null;

  const entries = await readdir(WORKSHOP_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(WORKSHOP_ROOT, entry.name);
    const contentsModRoot = join(candidate, "Contents", "mods", wanted);
    if (await pathExists(contentsModRoot)) return candidate;

    const legacyModRoot = join(candidate, "mods", wanted);
    if (await pathExists(legacyModRoot)) return candidate;
  }

  return null;
}

async function resolveLocalPath(rawPath) {
  const abs = validateLocalPath(rawPath);
  if (await pathExists(abs)) return abs;

  if (!isWithin(abs, WORKSHOP_ROOT)) return abs;

  const rel = relative(WORKSHOP_ROOT, abs);
  if (!rel || rel.startsWith("..")) return abs;

  const parts = rel.split(sep).filter(Boolean);
  if (!parts.length) return abs;

  const aliasedRoot = await findWorkshopFolderForModId(parts[0]);
  if (!aliasedRoot) return abs;

  return parts.length === 1
    ? aliasedRoot
    : join(aliasedRoot, ...parts.slice(1));
}

function describePath(absPath) {
  if (isWithin(absPath, WORKSHOP_ROOT)) {
    return relative(WORKSHOP_ROOT, absPath).split(sep).join("/") || ".";
  }
  return absPath;
}

function hashText(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function safePatchId(id) {
  const patchId = String(id ?? "").trim();
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(patchId)) throw new Error("invalid patch_id");
  return patchId;
}

function pendingPatchPath(patchId) {
  return join(PENDING_PATCH_DIR, `${safePatchId(patchId)}.json`);
}

async function readTextFile(absPath) {
  const info = await stat(absPath);
  if (!info.isFile()) throw new Error("path is not a file");
  if (info.size > MAX_READ_BYTES) {
    throw new Error(`file is too large to read (${info.size} bytes, max ${MAX_READ_BYTES})`);
  }
  const ext = extname(absPath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) {
    throw new Error(`unsupported text extension: ${ext || "(none)"}`);
  }
  return readFile(absPath, "utf8");
}

async function collectFolderEntries(target, recursive, maxEntries) {
  const rows = [];
  async function collect(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (rows.length >= maxEntries) break;
      if (e.name === "node_modules" || e.name === ".git" || e.name === "mod-corpus") continue;
      const full = join(dir, e.name);
      const s = await stat(full);
      rows.push({
        type: e.isDirectory() ? "dir" : e.isFile() ? "file" : "other",
        path: describePath(full),
        size: e.isFile() ? s.size : null,
        modified: s.mtime.toISOString(),
      });
      if (recursive && e.isDirectory() && rows.length < maxEntries) await collect(full);
    }
  }
  await collect(target);
  return rows;
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function runLuac(filePath) {
  return new Promise((resolve) => {
    const child = spawn(LUAC_PATH, ["-p", filePath], {
      cwd: WORKSHOP_ROOT,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      resolve({ ok: false, error: error.message });
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        error: (stderr || stdout || `luac exited with code ${code}`).trim(),
      });
    });
  });
}

function isPublishableLua(file) {
  if (extname(file).toLowerCase() !== ".lua") return false;
  const normalized = file.split(/[\\/]+/).join("/");
  return /\/42(?:\.\d+)?\/media\/lua\//.test(normalized);
}

function detectLuaSide(file) {
  if (file.includes(`${sep}media${sep}lua${sep}client${sep}`)) return "client";
  if (file.includes(`${sep}media${sep}lua${sep}server${sep}`)) return "server";
  if (file.includes(`${sep}media${sep}lua${sep}shared${sep}`)) return "shared";
  return "unknown";
}

function lineNumberList(items, max = 12) {
  const first = items.slice(0, max).join(", ");
  return `${items.length} hit${items.length === 1 ? "" : "s"}${first ? `, first lines ${first}` : ""}`;
}

async function inspectModLayout(rawPath) {
  const root = validateLocalPath(rawPath);
  const info = await stat(root);
  if (!info.isDirectory()) throw new Error("path is not a directory");
  const files = await walkFiles(root);
  const luaFiles = files.filter(isPublishableLua);
  const modInfos = files.filter((f) => f.endsWith(`${sep}mod.info`));
  const workshopTxt = join(root, "workshop.txt");
  const ancestorWorkshopTxt = await findAncestorWorkshopTxt(root);
  const rootParts = root.split(/[\\/]+/);
  const steamCacheRoot = /^\d+$/.test(basename(root))
    && (
      (rootParts.includes("workshop") && rootParts.includes("content") && rootParts.includes("108600"))
      || rootParts.includes("mod-corpus")
    );
  const roots = {
    steam_cache_root: steamCacheRoot,
    root_workshop_txt: await pathExists(workshopTxt),
    ancestor_workshop_txt: Boolean(ancestorWorkshopTxt),
    root_42_mirror: await pathExists(join(root, "42")),
    contents_mods: await pathExists(join(root, "Contents", "mods")),
    steam_mods: await pathExists(join(root, "mods")),
    root_admin_monitor: await pathExists(join(root, "admin_monitor")),
    contents_admin_monitor: files.some((f) => f.includes(`${sep}Contents${sep}mods${sep}`) && f.includes(`${sep}admin_monitor${sep}`)),
  };
  const luaBySide = luaFiles.reduce((acc, file) => {
    const side = detectLuaSide(file);
    acc[side] = (acc[side] || 0) + 1;
    return acc;
  }, {});
  const issues = [];
  if (!roots.root_workshop_txt && !roots.steam_cache_root && !roots.ancestor_workshop_txt) {
    issues.push("missing root workshop.txt");
  }
  if (!modInfos.length) issues.push("missing mod.info");
  if (roots.root_42_mirror && roots.contents_mods) issues.push("duplicate root 42/ mirror and Contents/mods package");
  if (roots.root_admin_monitor && roots.contents_admin_monitor) issues.push("duplicate admin_monitor at root and inside Contents/mods");

  return JSON.stringify({
    root: describePath(root),
    summary: {
      total_files: files.length,
      lua_files: luaFiles.length,
      mod_info_files: modInfos.length,
      lua_by_side: luaBySide,
    },
    layout: roots,
    mod_info_paths: modInfos.map(describePath),
    issues,
  }, null, 2);
}

async function auditLuaGuards(rawPath) {
  const root = validateLocalPath(rawPath);
  const info = await stat(root);
  const luaFiles = info.isDirectory()
    ? (await walkFiles(root)).filter(isPublishableLua)
    : [root].filter(isPublishableLua);
  const findings = [];
  for (const file of luaFiles) {
    const text = await readFile(file, "utf8");
    const lines = text.split(/\r?\n/);
    const leading = luaLeadingCode(lines, 80);
    const side = detectLuaSide(file);
    const rel = describePath(file);
    const timedActionClass = /ISBaseTimedAction:derive|ISEatFoodAction:derive/.test(text);
    if (side === "client" && !timedActionClass && !/if\s+isServer\(\)\s+then\s+return\s+end/.test(leading)) {
      findings.push({ severity: "medium", path: rel, required_guard: "if isServer() then return end", issue: "client file missing required guard" });
    }
    if (side === "server" && !timedActionClass && !/if\s+isClient\(\)\s+then\s+return\s+end/.test(leading)) {
      findings.push({ severity: "medium", path: rel, required_guard: "if isClient() then return end", issue: "server file missing required guard" });
    }
    if (side === "shared" && /^if\s+is(?:Server|Client)\(\)\s+then\s+return\s+end/m.test(leading)) {
      findings.push({ severity: "medium", path: rel, issue: "shared file has an env guard at top — shared files must have no file-level guard (guards break solo and hosted-host)", recommendation: "Remove the guard from the shared file. Move side-specific logic into client/ or server/ files." });
    }
    const negative = classifyNegativeEnvGuards(lines);
    const nonCanonical = [];
    lines.forEach((line, idx) => {
      if (/if\s+isClient\(\)\s+and\s+not\s+isServer\(\)\s+then\s+return\s+end/.test(line)) nonCanonical.push(idx + 1);
    });
    if (negative.fileLevel.length) {
      findings.push({
        severity: "high",
        path: rel,
        lines: negative.fileLevel,
        rule: "forbidden_negative_env_guard",
        issue: "forbidden negative environment guard",
        recommendation: "File-level `if not isServer/isClient() then return end` breaks solo and hosted-host. Use `if isClient() then return end` on server files and `if isServer() then return end` on client files.",
      });
    }
    if (negative.inner.length) {
      findings.push({
        severity: "medium",
        path: rel,
        lines: negative.inner,
        rule: "inner_negative_env_guard",
        issue: "inner negative environment guard",
        recommendation: "Indented `if not isClient() then return end` is only valid immediately before sendClientCommand (SP must not send). In UI/gameplay handlers it skips singleplayer. Prefer the file-level canonical guard.",
      });
    }
    if (nonCanonical.length) findings.push({ severity: "medium", path: rel, lines: nonCanonical, issue: "non-canonical server guard", recommendation: "Server files should use exactly: if isClient() then return end" });
  }
  return JSON.stringify({ checked_lua_files: luaFiles.length, findings }, null, 2);
}

async function auditSafeCall(rawPath) {
  const root = validateLocalPath(rawPath);
  const info = await stat(root);
  const luaFiles = info.isDirectory()
    ? (await walkFiles(root)).filter(isPublishableLua)
    : [root].filter(isPublishableLua);
  const findings = [];
  for (const file of luaFiles) {
    const text = await readFile(file, "utf8");
    const lines = text.split(/\r?\n/);
    const safeLines = [];
    const pcallLines = [];
    lines.forEach((line, idx) => {
      const codePart = line.replace(/--.*$/, ""); // strip inline comments before checking
      if (/\bsafeCall\b/.test(codePart) && !/pcall removed/i.test(line)) safeLines.push(idx + 1);
      if (/\bpcall\s*\(/.test(codePart)) pcallLines.push(idx + 1);
    });
    if (!safeLines.length && !pcallLines.length) continue;
    const helperText = lines.slice(0, Math.min(lines.length, 80)).join("\n");
    let helperKind = "unknown";
    if (/function\s+safeCall\s*\([^)]*\)[\s\S]{0,180}pcall\s*\(/.test(helperText)) helperKind = "wraps pcall";
    else if (/function\s+safeCall\s*\([^)]*\)[\s\S]{0,180}return\s+fn\s*\(/.test(helperText)) helperKind = "direct fn() wrapper";
    findings.push({
      path: describePath(file),
      side: detectLuaSide(file),
      safeCall: safeLines.length ? lineNumberList(safeLines) : "none",
      pcall: pcallLines.length ? lineNumberList(pcallLines) : "none",
      helper_kind: helperKind,
      recommendation: helperKind === "direct fn() wrapper"
        ? "Remove the helper and replace calls with direct calls plus explicit nil/type guards where needed."
        : "Replace pcall/safeCall with explicit nil/type guards before external API calls.",
    });
  }
  return JSON.stringify({ checked_lua_files: luaFiles.length, findings }, null, 2);
}

function addRisk(findings, severity, path, line, rule, issue, recommendation, evidence) {
  findings.push({
    severity,
    path,
    line,
    rule,
    issue,
    recommendation,
    evidence,
  });
}

function sortFindings(findings) {
  const severityRank = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));
  return findings;
}

function extractTranslationKeys(text) {
  const keys = new Set();
  for (const match of text.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) {
    keys.add(match[1]);
  }
  return keys;
}

function isLikelyLocalTranslationKey(key) {
  return /(^|_)(BB|BBCommonSense|Biteme|BiteMe|Haven|SpaceRP|NetFix|CSCore|CSVehicles)(_|$)/i.test(key);
}

async function auditTranslations(rawPath) {
  const root = validateLocalPath(rawPath);
  const info = await stat(root);
  const files = info.isDirectory() ? await walkFiles(root) : [root];
  const translationFiles = files.filter((file) =>
    file.split(/[\\/]+/).includes("Translate") && TEXT_EXTENSIONS.has(extname(file).toLowerCase())
  );
  const sandboxFiles = files.filter((file) => basename(file).toLowerCase() === "sandbox-options.txt");
  const luaFiles = files.filter(isPublishableLua);
  const declared = new Set();
  const findings = [];

  for (const file of translationFiles) {
    const text = await readTextFile(file);
    if (extname(file).toLowerCase() === ".json") {
      try {
        const obj = JSON.parse(text);
        for (const key of Object.keys(obj)) {
          declared.add(key);
          // TXT files omit the Sandbox_ prefix on option keys; add the stripped form too
          if (key.startsWith("Sandbox_")) declared.add(key.slice(8));
        }
      } catch { /* skip malformed JSON */ }
    } else {
      for (const key of extractTranslationKeys(text)) declared.add(key);
    }
  }

  for (const file of sandboxFiles) {
    const rel = describePath(file);
    const text = await readTextFile(file);
    for (const match of text.matchAll(/translation\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const base = match[1];
      const label = `${base}`;
      const tooltip = `${base}_tooltip`;
      if (!declared.has(label)) {
        findings.push({
          severity: "medium",
          path: rel,
          rule: "missing_sandbox_translation",
          issue: `Sandbox option translation key ${label} is not defined in Translate files.`,
          recommendation: "Add the matching ${base}* entry under media/lua/shared/Translate/<LANG>/<LANG>.txt.",
          evidence: `translation = ${base}`,
        });
      }
      if (!declared.has(tooltip)) {
        findings.push({
          severity: "low",
          path: rel,
          rule: "missing_sandbox_tooltip_translation",
          issue: `Sandbox option tooltip key ${tooltip} is not defined in Translate files.`,
          recommendation: "Add a tooltip entry so server admins see useful sandbox option help text.",
          evidence: `translation = ${base}`,
        });
      }
    }
    for (const match of text.matchAll(/page\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const pageKey = `Sandbox_${match[1]}`;
      if (!declared.has(pageKey)) {
        findings.push({
          severity: "medium",
          path: rel,
          rule: "missing_sandbox_page_translation",
          issue: `Sandbox page translation key ${pageKey} is not defined in Translate files.`,
          recommendation: "Add the Sandbox_* page entry under media/lua/shared/Translate/<LANG>/Sandbox_<LANG>.txt.",
          evidence: `page = ${match[1]}`,
        });
      }
    }
  }

  for (const file of luaFiles) {
    const rel = describePath(file);
    const text = await readFile(file, "utf8");
    for (const match of text.matchAll(/getText\s*\(\s*["']([^"']+)["']\s*\)/g)) {
      const key = match[1];
      if (!declared.has(key) && isLikelyLocalTranslationKey(key)) {
        const before = text.slice(0, match.index);
        findings.push({
          severity: "medium",
          path: rel,
          line: before.split(/\r?\n/).length,
          rule: "missing_gettext_translation",
          issue: `Lua getText key ${key} is not defined in this mod's Translate files.`,
          recommendation: "Add the key to the appropriate Translate file or verify it is a vanilla/game-provided key.",
          evidence: match[0],
        });
      }
    }
  }

  sortFindings(findings);
  return JSON.stringify({
    checked_translation_files: translationFiles.length,
    checked_sandbox_files: sandboxFiles.length,
    checked_lua_files: luaFiles.length,
    declared_translation_keys: declared.size,
    findings,
    recommended_status: findings.some((f) => f.severity === "medium" || f.severity === "high")
      ? "needs review"
      : findings.length
        ? "minor translation cleanup suggested"
        : "translation checks passed",
  }, null, 2);
}

function lineFromIndex(text, index) {
  return text.slice(0, Math.max(0, index)).split(/\r?\n/).length;
}

function extractStringConstants(text) {
  const constants = new Map();
  for (const match of text.matchAll(/(?:local\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*["']([^"']+)["']/g)) {
    constants.set(match[1], match[2]);
  }
  return constants;
}

function resolveLuaToken(token, constants) {
  const raw = String(token ?? "").trim();
  const quoted = raw.match(/^["']([^"']+)["']$/);
  if (quoted) return quoted[1];
  if (constants.has(raw)) return constants.get(raw);
  const dotted = raw.match(/\.([A-Za-z_][A-Za-z0-9_]*)$/);
  if (dotted && constants.has(dotted[1])) return constants.get(dotted[1]);
  return null;
}

function extractCallArgString(text, openParenIdx) {
  let paren = 1;
  let inStr = null;
  let i = openParenIdx + 1;
  while (i < text.length) {
    const ch = text[i];
    if (inStr) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      i++;
      continue;
    }
    if (ch === "(") paren++;
    else if (ch === ")") {
      paren--;
      if (paren === 0) return text.slice(openParenIdx + 1, i);
    }
    i++;
  }
  return text.slice(openParenIdx + 1);
}

function splitTopLevelLuaArgs(argStr) {
  const args = [];
  let cur = "";
  let paren = 0;
  let brace = 0;
  let bracket = 0;
  let inStr = null;
  for (let i = 0; i < argStr.length; i++) {
    const ch = argStr[i];
    if (inStr) {
      cur += ch;
      if (ch === "\\" && i + 1 < argStr.length) {
        cur += argStr[++i];
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      cur += ch;
      continue;
    }
    if (ch === "(") paren++;
    else if (ch === ")") paren--;
    else if (ch === "{") brace++;
    else if (ch === "}") brace--;
    else if (ch === "[") bracket++;
    else if (ch === "]") bracket--;
    if (ch === "," && paren === 0 && brace === 0 && bracket === 0) {
      args.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

function collectNetworkSends(text, fnName, constants) {
  const sends = [];
  const re = new RegExp(`\\b${fnName}\\s*\\(`, "g");
  let match;
  while ((match = re.exec(text))) {
    const openIdx = match.index + match[0].length - 1;
    const argStr = extractCallArgString(text, openIdx);
    const args = splitTopLevelLuaArgs(argStr);
    let moduleToken;
    let commandToken;
    let playerFirst = false;
    if (args.length >= 4) {
      playerFirst = true;
      moduleToken = args[1];
      commandToken = args[2];
    } else if (args.length === 3) {
      const firstResolved = resolveLuaToken(args[0], constants);
      if (firstResolved) {
        moduleToken = args[0];
        commandToken = args[1];
      } else {
        playerFirst = true;
        moduleToken = args[1];
        commandToken = args[2];
      }
    } else {
      moduleToken = args[0];
      commandToken = args[1];
    }
    sends.push({
      line: lineFromIndex(text, match.index),
      module: resolveLuaToken(moduleToken, constants),
      command: resolveLuaToken(commandToken, constants),
      playerFirst,
      arity: args.length,
      evidence: `${fnName}(${argStr.replace(/\s+/g, " ").trim().slice(0, 120)}`,
    });
  }
  return sends;
}

function extractBraceBlock(text, openBraceIdx) {
  let depth = 0;
  let inStr = null;
  for (let i = openBraceIdx; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(openBraceIdx, i + 1);
    }
  }
  return text.slice(openBraceIdx);
}

function namedTableKeys(text, tableName) {
  const keys = new Set();
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:local\\s+)?${escaped}\\s*=\\s*\\{`, "g");
  const match = re.exec(text);
  if (!match) return keys;
  const openIdx = match.index + match[0].length - 1;
  const body = extractBraceBlock(text, openIdx);
  for (const key of body.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*true\b/gm)) {
    keys.add(key[1]);
  }
  for (const key of body.matchAll(/\[\s*["']([^"']+)["']\s*\]\s*=/g)) {
    keys.add(key[1]);
  }
  return keys;
}

function classifyNegativeEnvGuards(lines) {
  const fileLevel = [];
  const sendSkip = [];
  const inner = [];
  for (let i = 0; i < lines.length; i++) {
    const code = lines[i].replace(/--.*$/, "");
    const m = code.match(/^\s*if\s+not\s+is(Server|Client)\(\)\s+then\s+return\s+end\s*$/);
    if (!m) continue;
    const indent = (lines[i].match(/^(\s*)/) || ["", ""])[1].length;
    const which = m[1];
    if (indent === 0) {
      fileLevel.push(i + 1);
      continue;
    }
    const window = lines.slice(i, Math.min(lines.length, i + 12)).join("\n");
    if (which === "Client" && /\bsendClientCommand\s*\(/.test(window)) {
      sendSkip.push(i + 1);
      continue;
    }
    if (which === "Server" && /\bsendServerCommand\s*\(/.test(window)) {
      sendSkip.push(i + 1);
      continue;
    }
    inner.push(i + 1);
  }
  return { fileLevel, sendSkip, inner };
}

function extractFunctionBody(text, fnName) {
  const escaped = fnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:local\\s+)?function\\s+${escaped}\\s*\\([^)]*\\)`, "g");
  const match = re.exec(text);
  if (!match) return null;
  const start = match.index;
  const lines = text.slice(start).split(/\r?\n/);
  const body = [];
  let depth = 0;
  for (const line of lines) {
    body.push(line);
    if (/\bfunction\b|\bthen\b|\bdo\b|\brepeat\b/.test(line)) depth++;
    if (/^\s*end\s*[,)]?\s*$/.test(line) || /\bend\s*$/.test(line)) depth--;
    if (body.length > 1 && depth <= 0) break;
  }
  return body.join("\n");
}

function extractCommandRefs(text, fileText = text) {
  const refs = new Set();
  for (const match of text.matchAll(/\bcommand\s*(?:==|~=)\s*["']([^"']+)["']/g)) refs.add(match[1]);
  for (const match of text.matchAll(/\bcommand\s*==\s*([A-Za-z_][A-Za-z0-9_]*)/g)) refs.add(match[1]);
  for (const match of text.matchAll(/\bcommandHandlers\s*\[\s*["']([^"']+)["']\s*\]/g)) refs.add(match[1]);
  for (const match of text.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*command\s*\]/g)) {
    for (const key of namedTableKeys(fileText, match[1])) refs.add(key);
  }
  return refs;
}

async function auditCommandContracts(rawPath) {
  const root = validateLocalPath(rawPath);
  const info = await stat(root);
  const luaFiles = info.isDirectory()
    ? (await walkFiles(root)).filter(isPublishableLua)
    : [root].filter(isPublishableLua);
  const findings = [];
  const sendsToServer = [];
  const sendsToClient = [];
  const clientHandlers = [];
  const serverHandlers = [];

  for (const file of luaFiles) {
    const rel = describePath(file);
    const side = detectLuaSide(file);
    const text = await readFile(file, "utf8");
    const constants = extractStringConstants(text);

    for (const send of collectNetworkSends(text, "sendClientCommand", constants)) {
      sendsToServer.push({
        direction: "client_to_server",
        path: rel,
        ...send,
      });
    }
    for (const send of collectNetworkSends(text, "sendServerCommand", constants)) {
      sendsToClient.push({
        direction: "server_to_client",
        path: rel,
        ...send,
      });
    }

    for (const handler of collectEventAddHandlers(text, "OnClientCommand", constants)) {
      serverHandlers.push({ side, path: rel, ...handler });
    }
    for (const handler of collectEventAddHandlers(text, "OnServerCommand", constants)) {
      clientHandlers.push({ side, path: rel, ...handler });
    }
  }

  function handlerMatches(handler, send) {
    if (send.module && handler.modules.size && !handler.modules.has(send.module)) return false;
    return true;
  }

  function auditSends(sends, handlers, receiverName) {
    for (const send of sends) {
      if (!send.module || !send.command) {
        findings.push({
          severity: "low",
          path: send.path,
          line: send.line,
          rule: "dynamic_command_contract",
          issue: "Command send uses a dynamic module or command token that cannot be statically matched.",
          recommendation: "Prefer literal or local constant module/command names so contract audits can verify both ends.",
          evidence: send.evidence,
        });
        continue;
      }
      const matchingHandlers = handlers.filter((handler) => handlerMatches(handler, send));
      if (!matchingHandlers.length) {
        findings.push({
          severity: "medium",
          path: send.path,
          line: send.line,
          rule: "missing_command_receiver",
          issue: `${send.direction} sends ${send.module}.${send.command}, but no matching ${receiverName} handler was found in this mod.`,
          recommendation: "Add the receiver handler or verify the command is intentionally handled by another mod.",
          evidence: send.evidence,
        });
        continue;
      }
      const hasCommandRef = matchingHandlers.some((handler) => handler.commands.has(send.command));
      const hasAnyRefs = matchingHandlers.some((handler) => handler.commands.size > 0);
      if (hasAnyRefs && !hasCommandRef) {
        findings.push({
          severity: "medium",
          path: send.path,
          line: send.line,
          rule: "unhandled_command_name",
          issue: `${send.direction} sends ${send.module}.${send.command}, but matching handlers do not reference that command name.`,
          recommendation: "Check for a typo or add a branch for this command in the receiver.",
          evidence: send.evidence,
        });
      }
    }
  }

  auditSends(sendsToServer, serverHandlers, "Events.OnClientCommand");
  auditSends(sendsToClient, clientHandlers, "Events.OnServerCommand");
  sortFindings(findings);
  return JSON.stringify({
    checked_lua_files: luaFiles.length,
    sends_to_server: sendsToServer.length,
    sends_to_client: sendsToClient.length,
    server_handlers: serverHandlers.length,
    client_handlers: clientHandlers.length,
    findings,
    recommended_status: findings.some((f) => f.severity === "medium" || f.severity === "high")
      ? "needs review"
      : findings.length
        ? "dynamic command contracts present"
        : "command contracts checked",
  }, null, 2);
}

function parseSandboxOptions(text) {
  const options = [];
  const re = /option\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\{([\s\S]*?)\}/g;
  for (const match of text.matchAll(re)) {
    const body = match[2];
    const fields = {};
    for (const field of body.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^,\r\n]+)\s*,?\s*$/gm)) {
      fields[field[1]] = field[2].trim();
    }
    options.push({ name: match[1], body, fields, index: match.index });
  }
  return options;
}

function extractTranslationEntries(text) {
  const entries = new Map();
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed)) {
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) entries.set(key, String(value));
      }
      return entries;
    }
  } catch {
    // Fall through to TXT-style parsing.
  }

  for (const match of text.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^,\r\n]*))\s*,?\s*$/gm)) {
    entries.set(match[1], String(match[2] ?? match[3] ?? match[4] ?? "").trim());
  }
  return entries;
}

function parseScalar(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (/^true$/i.test(text)) return true;
  if (/^false$/i.test(text)) return false;
  const quoted = text.match(/^["']([^"']*)["']$/);
  if (quoted) return quoted[1];
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return text;
}

const BB_SANDBOX_EXPECTATIONS = {
  BBCommonSenseAdminTools: {
    modName: "BB Common Sense Admin Tools",
    purposeTerms: ["admin", "tool", "safehouse", "server"],
  },
  BBCommonSenseContainers: {
    modName: "BB Common Sense Containers",
    purposeTerms: ["container", "barrel", "sink", "water", "favorite"],
  },
  BBCommonSenseCore: {
    modName: "BB Common Sense Core",
    purposeTerms: ["core", "pry", "door", "window", "loot", "map", "can"],
  },
  BBCommonSenseCrafting: {
    modName: "BB Common Sense Crafting",
    purposeTerms: ["craft", "batch", "clothing", "ammo", "can", "bindle"],
  },
  BBCommonSenseMedical: {
    modName: "BB Common Sense Medical",
    purposeTerms: ["medical", "doctor", "first aid", "infection", "treatment"],
  },
  BBCommonSenseSurvival: {
    modName: "BB Common Sense Survival",
    purposeTerms: ["survival", "forage", "resource", "flashlight", "map"],
  },
  BBCommonSenseVehicles: {
    modName: "BB Common Sense Vehicles",
    purposeTerms: ["vehicle", "car", "tow", "claim", "door", "window"],
  },
};

function wordsFromCamel(text) {
  return String(text ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !new Set(["enable", "all", "the", "and", "with", "chance", "level", "range", "mode", "debug"]).has(word));
}

function includesAnyTerm(text, terms) {
  const lower = String(text ?? "").toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

async function auditBBSandboxMenu(rawPath) {
  const root = rawPath ? validateLocalPath(rawPath) : WORKSHOP_ROOT;
  const info = await stat(root);
  const files = info.isDirectory() ? await walkFiles(root) : [root];
  const sandboxFiles = files.filter((file) => basename(file).toLowerCase() === "sandbox-options.txt");
  const findings = [];
  const checkedPages = new Set();
  let checkedOptions = 0;

  for (const file of sandboxFiles) {
    const text = await readTextFile(file);
    const options = parseSandboxOptions(text).filter((option) => /^BBCommonSense[A-Za-z0-9]+\./.test(option.name));
    if (!options.length) continue;

    const rel = describePath(file);
    const pageValues = new Set(options.map((option) => String(parseScalar(option.fields.page) ?? "")));
    const prefixValues = new Set(options.map((option) => option.name.split(".")[0]));
    for (const prefix of prefixValues) {
      const expected = BB_SANDBOX_EXPECTATIONS[prefix];
      if (!expected) {
        findings.push({
          severity: "medium",
          path: rel,
          rule: "unknown_bb_sandbox_prefix",
          issue: `BB sandbox prefix ${prefix} has no menu expectation configured in the MCP validator.`,
          recommendation: "Add this BB module to BB_SANDBOX_EXPECTATIONS or fix the option namespace.",
          evidence: prefix,
        });
        continue;
      }

      checkedPages.add(prefix);
      const translationFiles = files.filter((candidate) => {
        if (!candidate.split(/[\\/]+/).includes("Translate")) return false;
        if (extname(candidate).toLowerCase() !== ".json" && extname(candidate).toLowerCase() !== ".txt") return false;
        return relative(dirname(file), candidate).startsWith("..") || candidate.includes(prefix);
      });
      const translations = new Map();
      for (const translationFile of translationFiles) {
        try {
          const t = await readTextFile(translationFile);
          for (const [key, value] of extractTranslationEntries(t)) translations.set(key, value);
        } catch {
          // Ignore unreadable translations; translation audit handles read failures separately.
        }
      }

      if (!pageValues.has(prefix)) {
        findings.push({
          severity: "high",
          path: rel,
          rule: "bb_sandbox_page_mismatch",
          issue: `Options for ${prefix} are not grouped under page ${prefix}.`,
          recommendation: `Set page = ${prefix} on every ${prefix} option.`,
          evidence: [...pageValues].join(", ") || "(missing)",
        });
      }

      const pageKey = `Sandbox_${prefix}`;
      const pageLabel = translations.get(pageKey);
      if (pageLabel !== expected.modName) {
        findings.push({
          severity: "medium",
          path: rel,
          rule: "bb_sandbox_page_label_mismatch",
          issue: `${pageKey} should display the mod name "${expected.modName}".`,
          recommendation: `Set ${pageKey} = "${expected.modName}" in the EN sandbox translation file.`,
          evidence: pageLabel ?? "(missing)",
        });
      }

      const pageTooltipKey = `${pageKey}_tooltip`;
      const pageTooltip = translations.get(pageTooltipKey);
      if (!pageTooltip || !includesAnyTerm(pageTooltip, expected.purposeTerms)) {
        findings.push({
          severity: "medium",
          path: rel,
          rule: "bb_sandbox_page_tooltip_missing_or_generic",
          issue: `${pageTooltipKey} should briefly explain what ${expected.modName} does.`,
          recommendation: `Add a tooltip mentioning the module purpose, using terms such as: ${expected.purposeTerms.join(", ")}.`,
          evidence: pageTooltip ?? "(missing)",
        });
      }

      for (const option of options.filter((item) => item.name.startsWith(`${prefix}.`))) {
        checkedOptions++;
        const line = lineFromIndex(text, option.index);
        const optionLocalName = option.name.split(".")[1] ?? "";
        const translationBase = String(parseScalar(option.fields.translation) ?? "");
        const labelKey = translationBase ? `Sandbox_${translationBase}` : "";
        const tooltipKey = labelKey ? `${labelKey}_tooltip` : "";
        const label = translations.get(labelKey);
        const tooltip = translations.get(tooltipKey);
        const expectedTerms = [...new Set([...wordsFromCamel(optionLocalName), ...expected.purposeTerms])];

        if (!translationBase || !translationBase.startsWith(prefix)) {
          findings.push({
            severity: "medium",
            path: rel,
            line,
            rule: "bb_sandbox_translation_prefix_mismatch",
            issue: `${option.name} should use a translation key prefixed with ${prefix}.`,
            recommendation: `Use translation = ${prefix}_${optionLocalName} and matching Sandbox_* entries.`,
            evidence: translationBase || "(missing)",
          });
        }
        if (!label) {
          findings.push({
            severity: "medium",
            path: rel,
            line,
            rule: "bb_sandbox_option_label_missing",
            issue: `${option.name} has no translated sandbox label.`,
            recommendation: `Add ${labelKey || `Sandbox_${prefix}_${optionLocalName}`} to the EN sandbox translation file.`,
            evidence: labelKey || "(missing)",
          });
        } else if (!includesAnyTerm(label, expectedTerms) && !includesAnyTerm(tooltip, expectedTerms)) {
          findings.push({
            severity: "low",
            path: rel,
            line,
            rule: "bb_sandbox_option_label_generic",
            issue: `${option.name} label/tooltip may not clearly describe the feature it controls.`,
            recommendation: `Mention the feature context in the label or tooltip. Expected terms include: ${expectedTerms.slice(0, 8).join(", ")}.`,
            evidence: label,
          });
        }
        if (!tooltip || tooltip.length < 24) {
          findings.push({
            severity: "low",
            path: rel,
            line,
            rule: "bb_sandbox_option_tooltip_missing_or_short",
            issue: `${option.name} should have a useful tooltip for server admins.`,
            recommendation: `Add ${tooltipKey || `Sandbox_${prefix}_${optionLocalName}_tooltip`} explaining the effect of this setting.`,
            evidence: tooltip ?? "(missing)",
          });
        }
      }
    }
  }

  sortFindings(findings);
  return JSON.stringify({
    checked_pages: checkedPages.size,
    checked_options: checkedOptions,
    expected_pages: Object.keys(BB_SANDBOX_EXPECTATIONS).length,
    findings,
    recommended_status: findings.some((f) => f.severity === "high")
      ? "block release"
      : findings.some((f) => f.severity === "medium")
        ? "needs menu text review"
        : findings.length
          ? "minor menu text cleanup suggested"
          : "BB sandbox menus checked",
  }, null, 2);
}

async function auditSandboxSchema(rawPath) {
  const root = validateLocalPath(rawPath);
  const info = await stat(root);
  const files = info.isDirectory() ? await walkFiles(root) : [root];
  const sandboxFiles = files.filter((file) => basename(file).toLowerCase() === "sandbox-options.txt");
  const findings = [];
  const seen = new Map();
  const validTypes = new Set(["boolean", "integer", "double", "string", "enum"]);
  let optionCount = 0;

  for (const file of sandboxFiles) {
    const rel = describePath(file);
    const text = await readTextFile(file);
    const options = parseSandboxOptions(text);
    optionCount += options.length;
    for (const option of options) {
      const line = lineFromIndex(text, option.index);
      if (seen.has(option.name)) {
        findings.push({
          severity: "high",
          path: rel,
          line,
          rule: "duplicate_sandbox_option",
          issue: `Sandbox option ${option.name} is declared more than once.`,
          recommendation: "Remove or rename duplicate sandbox options; duplicate option ids can load unpredictably.",
          evidence: `first seen in ${seen.get(option.name)}`,
        });
      } else {
        seen.set(option.name, rel);
      }

      const type = String(parseScalar(option.fields.type) ?? "");
      const def = parseScalar(option.fields.default);
      const min = parseScalar(option.fields.min);
      const max = parseScalar(option.fields.max);

      if (!type || !validTypes.has(type)) {
        findings.push({
          severity: "medium",
          path: rel,
          line,
          rule: "invalid_sandbox_type",
          issue: `Sandbox option ${option.name} has invalid or missing type ${JSON.stringify(type)}.`,
          recommendation: "Use one of: boolean, integer, double, string, enum.",
          evidence: option.fields.type ?? "(missing)",
        });
      }
      if (!option.fields.page) {
        findings.push({
          severity: "medium",
          path: rel,
          line,
          rule: "missing_sandbox_page",
          issue: `Sandbox option ${option.name} has no page field.`,
          recommendation: "Add a page field so options group correctly in the sandbox UI.",
          evidence: option.name,
        });
      }
      const pageVal = parseScalar(option.fields.page);
      if (typeof pageVal === "string" && pageVal.includes("_")) {
        findings.push({
          severity: "high",
          path: rel,
          line,
          rule: "sandbox_page_has_underscores",
          issue: `Sandbox page name "${pageVal}" contains underscores. The UI looks up Sandbox_<page> for the tab title — underscores in the page name cause the raw key (e.g. "Sandbox_BB_CommonSense_Medical") to display instead of the translated label.`,
          recommendation: `Rename page to PascalCase with no underscores: "${pageVal.replace(/_([a-z])/gi, (_, c) => c.toUpperCase()).replace(/_/g, "")}" — and update all SandboxVars references and translation keys to match.`,
          evidence: pageVal,
        });
      }
      if (!option.fields.translation) {
        findings.push({
          severity: "medium",
          path: rel,
          line,
          rule: "missing_sandbox_translation_field",
          issue: `Sandbox option ${option.name} has no translation field.`,
          recommendation: "Add translation = <OptionKey> and matching Sandbox_* translation entries.",
          evidence: option.name,
        });
      }
      if (type === "boolean" && typeof def !== "boolean") {
        findings.push({
          severity: "medium",
          path: rel,
          line,
          rule: "boolean_default_not_boolean",
          issue: `Sandbox boolean ${option.name} default is not true/false.`,
          recommendation: "Use default = true or default = false.",
          evidence: option.fields.default ?? "(missing)",
        });
      }
      if ((type === "integer" || type === "double") && typeof def !== "number") {
        findings.push({
          severity: "medium",
          path: rel,
          line,
          rule: "numeric_default_not_number",
          issue: `Sandbox numeric option ${option.name} default is not numeric.`,
          recommendation: "Use a numeric default compatible with the option type.",
          evidence: option.fields.default ?? "(missing)",
        });
      }
      if (type === "integer" && typeof def === "number" && !Number.isInteger(def)) {
        findings.push({
          severity: "medium",
          path: rel,
          line,
          rule: "integer_default_not_integer",
          issue: `Sandbox integer option ${option.name} has a non-integer default.`,
          recommendation: "Use an integer default value.",
          evidence: option.fields.default,
        });
      }
      if (typeof min === "number" && typeof max === "number" && min > max) {
        findings.push({
          severity: "high",
          path: rel,
          line,
          rule: "sandbox_min_greater_than_max",
          issue: `Sandbox option ${option.name} has min greater than max.`,
          recommendation: "Fix the numeric range.",
          evidence: `min=${min}, max=${max}`,
        });
      }
      if (typeof def === "number" && typeof min === "number" && def < min) {
        findings.push({
          severity: "medium",
          path: rel,
          line,
          rule: "sandbox_default_below_min",
          issue: `Sandbox option ${option.name} default is below min.`,
          recommendation: "Move default inside the declared range.",
          evidence: `default=${def}, min=${min}`,
        });
      }
      if (typeof def === "number" && typeof max === "number" && def > max) {
        findings.push({
          severity: "medium",
          path: rel,
          line,
          rule: "sandbox_default_above_max",
          issue: `Sandbox option ${option.name} default is above max.`,
          recommendation: "Move default inside the declared range.",
          evidence: `default=${def}, max=${max}`,
        });
      }
    }
  }

  sortFindings(findings);
  return JSON.stringify({
    checked_sandbox_files: sandboxFiles.length,
    option_count: optionCount,
    findings,
    recommended_status: findings.some((f) => f.severity === "high")
      ? "block release"
      : findings.length
        ? "needs review"
        : "sandbox schema checks passed",
  }, null, 2);
}

async function auditTextEncoding(rawPath) {
  const root = validateLocalPath(rawPath);
  const info = await stat(root);
  const files = info.isDirectory()
    ? (await walkFiles(root)).filter((file) => TEXT_EXTENSIONS.has(extname(file).toLowerCase()))
    : [root].filter((file) => TEXT_EXTENSIONS.has(extname(file).toLowerCase()));
  const findings = [];
  const mojibakeRe = /(?:Ã.|Â.|â[€™€œ€“€”¦]|ã[\u0080-\u009F]|�)/g;
  let checked = 0;

  for (const file of files) {
    const rel = describePath(file);
    let text;
    try {
      text = await readTextFile(file);
    } catch {
      continue;
    }
    checked++;
    const lines = text.split(/\r?\n/);
    const samples = [];
    let hitCount = 0;
    lines.forEach((line, idx) => {
      const matches = line.match(mojibakeRe) ?? [];
      if (!matches.length) return;
      hitCount += matches.length;
      if (samples.length < 5) {
        samples.push({ line: idx + 1, text: line.trim().slice(0, 180) });
      }
    });
    if (hitCount) {
      const translateFile = rel.split("/").includes("Translate");
      findings.push({
        severity: hitCount >= 2 || translateFile ? "medium" : "low",
        path: rel,
        line: samples[0]?.line ?? null,
        rule: "suspected_text_mojibake",
        issue: `Text contains ${hitCount} marker(s) commonly produced by UTF-8/Windows-1252 mojibake.`,
        recommendation: "Re-import or rewrite this text as valid UTF-8; pay particular attention to translated files.",
        evidence: samples,
      });
    }
  }

  sortFindings(findings);
  return JSON.stringify({
    checked_text_files: checked,
    findings,
    recommended_status: findings.some((f) => f.severity === "medium" || f.severity === "high")
      ? "needs review"
      : findings.length
        ? "minor encoding review suggested"
        : "text encoding checks passed",
  }, null, 2);
}

function lineHasAny(line, needles) {
  return needles.some((needle) => line.includes(needle));
}

function flagFullscreenOverlayWithoutPassthrough(findings, rel, text, lines) {
  const derivesPanel = /=\s*IS(?:UIElement|Panel|PanelJoypad):derive\s*\(/.test(text);
  const usesBothScreenAxes = /getScreenWidth\s*\(/.test(text) && /getScreenHeight\s*\(/.test(text);
  const addedToUi = /addToUIManager\s*\(/.test(text);
  if (!derivesPanel || !usesBothScreenAxes || !addedToUi) return;

  const hasInteractiveChild = /ISButton:new|ISTickBox:new|ISComboBox:new|ISTextEntryBox:new|ISScrollingListBox:new|ISTabPanel:new/.test(text);
  if (hasInteractiveChild) return;

  const hasPassthrough = /function\s+[\w.:]+isMouseOver\s*\([^)]*\)[\s\S]{0,200}return\s+false/.test(text)
    || /function\s+[\w.:]+onMouseDown\s*\([^)]*\)[\s\S]{0,200}return\s+false/.test(text);
  if (hasPassthrough) return;

  const addIdx = lines.findIndex((line) => /addToUIManager\s*\(/.test(line));
  addRisk(
    findings,
    "high",
    rel,
    addIdx >= 0 ? addIdx + 1 : 1,
    "fullscreen_overlay_without_mouse_passthrough",
    "A screen-sized ISUIElement/ISPanel is added to UIManager without mouse passthrough, so it eats HUD/world clicks.",
    "Override isMouseOver/onMouseDown/onMouseUp/onMouseMove/onRightMouseDown/onRightMouseUp to return false, or keep the overlay behind interactive UI.",
    (addIdx >= 0 ? lines[addIdx] : lines[0]).trim(),
  );
}

async function auditRuntimeRisks(rawPath) {
  const root = validateLocalPath(rawPath);
  const info = await stat(root);
  const luaFiles = info.isDirectory()
    ? (await walkFiles(root)).filter(isPublishableLua)
    : [root].filter(isPublishableLua);
  const findings = [];

  const destructiveCalls = [
    ":Damage(",
    ":smashIntoPieces(",
    ":dumpContentsInSquare(",
    ":removeFromWorld(",
    ":removeFromSquare(",
    "IsoFireManager.StartFire(",
  ];

  for (const file of luaFiles) {
    const rel = describePath(file);
    const side = detectLuaSide(file);
    const text = await readFile(file, "utf8");
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNo = i + 1;
      const windowText = lines.slice(i, Math.min(lines.length, i + 18)).join("\n");
      const prevWindow = lines.slice(Math.max(0, i - 10), i + 1).join("\n");

      if (/for\s+\w+\s*=\s*0\s*,\s*[\w:().]+\s*-\s*1/.test(line) && lineHasAny(windowText, destructiveCalls)) {
        addRisk(
          findings,
          "high",
          rel,
          lineNo,
          "mutable_square_object_forward_iteration",
          "Forward iteration over a square/object list near destructive calls can throw IndexOutOfBoundsException when the list mutates.",
          "Iterate backwards and re-check collection size before objects:get(i).",
          line.trim(),
        );
      }

      if (/objects:get\s*\(\s*i\s*\)/.test(line) && /for\s+i\s*=\s*0\s*,/.test(prevWindow) && lineHasAny(windowText, destructiveCalls)) {
        addRisk(
          findings,
          "high",
          rel,
          lineNo,
          "objects_get_forward_loop_destructive",
          "objects:get(i) appears inside a forward loop that also damages/removes/smashes objects.",
          "Use for i = n - 1, 0, -1 and guard i < objects:size().",
          line.trim(),
        );
      }

      if (/bringToTop\s*\(/.test(line)) {
        const header = lines.slice(0, i).reverse().find((l) => /function\s+/.test(l.replace(/--.*$/, ""))) ?? "";
        const inRepeatDraw = /:(render|prerender)\s*\(/.test(header) || /OnPostUIDraw/.test(header);
        const guardedBackgroundFlag = /not\s+KEEP_[A-Z0-9_]*BACKGROUND/.test(prevWindow + "\n" + line);
        if (inRepeatDraw && !guardedBackgroundFlag) {
          addRisk(
            findings,
            "high",
            rel,
            lineNo,
            "forced_ui_top_layer_loop",
            "bringToTop() is called from a repeated render/tick path, which can trap UI above dialogs and intercept clicks.",
            "Only raise UI on explicit open/focus, or make the overlay passive/background with mouse passthrough.",
            line.trim(),
          );
        }
      }

      if (/setAlwaysOnTop\s*\(\s*true\s*\)/.test(line)) {
        addRisk(
          findings,
          "medium",
          rel,
          lineNo,
          "always_on_top_ui",
          "UI is forced always-on-top. This is risky for full-screen overlays and gameplay confirmation dialogs.",
          "Use sparingly; full-screen overlays should implement mouse passthrough and avoid covering menus.",
          line.trim(),
        );
      }

      if (/IsoFireManager\.StartFireOnSquare\s*\(/.test(line)) {
        addRisk(
          findings,
          "high",
          rel,
          lineNo,
          "nonexistent_fire_api",
          "IsoFireManager.StartFireOnSquare does not exist in verified B42 APIs; guarded calls silently no-op.",
          "Use IsoFireManager.StartFire(getCell(), square, spread, life, energy) after checking the square is loaded.",
          line.trim(),
        );
      }

      if (/getGridSquare\s*\(/.test(line) && !/function\s+\w*safeGetSquare/.test(line) && !/function\s+safeGetSquare/.test(line) && !/function\s+safeGetSquare/.test(prevWindow) && lineHasAny(windowText, ["IsoFireManager.StartFire(", "StartFireOnSquare", "burnSquare(", "damageSquare("]) && !/if\s+not\s+\w+\s+then\s+return/.test(windowText)) {
        addRisk(
          findings,
          "medium",
          rel,
          lineNo,
          "unchecked_grid_square_runtime",
          "Code gets a grid square and soon performs world mutation; getGridSquare() can return nil for unloaded cells.",
          "Guard nil squares, and do not mark unloaded target tiles as completed/visited.",
          line.trim(),
        );
      }

      const fileWriterAssign = line.match(/\b(?:local\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*get(?:Mod)?FileWriter\s*\(/);
      if (fileWriterAssign) {
        const writerName = fileWriterAssign[1];
        const writerUseRe = new RegExp(`\\b${writerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`);
        const hasWriterUse = writerUseRe.test(windowText);
        const guardRe = new RegExp(`if\\s+(?:not\\s+${writerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+then|${writerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+then)`);
        if (hasWriterUse && !guardRe.test(windowText)) {
          addRisk(
            findings,
            "medium",
            rel,
            lineNo,
            "file_writer_without_nil_guard",
            "Current B42 file writers can return nil/null when initialized incorrectly; direct :write/:close calls can crash Lua.",
            "After getFileWriter/getModFileWriter, add `if not writer then return end` before write/close calls.",
            line.trim(),
          );
        }
      }

      if (/\w+\.visited\s*\[[^\]]+\]\s*=\s*true/.test(line) && /getGridSquare|safeGetSquare|burnSquare|IsoFireManager\.StartFire|StartFireOnSquare/.test(windowText)) {
        addRisk(
          findings,
          "medium",
          rel,
          lineNo,
          "visited_mark_before_world_mutation",
          "A tile is marked visited before nearby world mutation can prove the square is loaded and changed.",
          "Mark visited only after mutation succeeds; unloaded squares should remain retryable or be skipped explicitly.",
          line.trim(),
        );
      }

      if ((/activeQuest\s*=\s*[^=\n]*activeQuests\s*\[\s*1\s*\]/.test(line) || /activeQuests\s*\[\s*1\s*\]/.test(line))
        && !/populateActiveQuestList|activeQuestList|trackedQuestList/.test(text)) {
        addRisk(
          findings,
          "low",
          rel,
          lineNo,
          "plural_contract_collapsed_to_first_item",
          "A plural server contract is collapsed to the first item. This can hide additional active records in UI.",
          "Render the collection or make the single-item behavior explicit in the contract.",
          line.trim(),
        );
      }
    }

    // Timed action declared as local — crashes MP (B42.13+)
    if (/\blocal\s+\w+\s*=\s*ISBaseTimedAction:derive\s*\(/.test(text)) {
      const matchLines = [];
      text.split(/\r?\n/).forEach((ln, i) => {
        if (/\blocal\s+\w+\s*=\s*ISBaseTimedAction:derive\s*\(/.test(ln)) matchLines.push(i + 1);
      });
      addRisk(findings, "high", rel, matchLines[0] ?? null, "timed_action_declared_local",
        "Timed action class declared as 'local' — Kahlua loses the reference during MP sync, breaking all timed actions in multiplayer (B42.13+).",
        "Remove 'local': declare as a global with a mod prefix: MyMod_MyAction = ISBaseTimedAction:derive('MyMod_MyAction')",
        `local declaration at line(s): ${matchLines.join(', ')}`);
    }

    // XP added via getXp():AddXP() — no MP sync
    if (/:getXp\s*\(\s*\)\s*:\s*AddXP\s*\(/.test(text)) {
      const matchLines = [];
      text.split(/\r?\n/).forEach((ln, i) => {
        if (/:getXp\s*\(\s*\)\s*:\s*AddXP\s*\(/.test(ln)) matchLines.push(i + 1);
      });
      addRisk(findings, "high", rel, matchLines[0] ?? null, "xp_addxp_no_mp_sync",
        "character:getXp():AddXP() gives XP with no MP sync — other clients never see the gain.",
        "Use the global addXp(character, Perks.SkillName, amount) which handles MP sync.",
        `getXp():AddXP() at line(s): ${matchLines.join(', ')}`);
    }

    // ResourceLocation compared directly to string — always false
    if (/:\s*(?:getBodyLocation|getDisplayCategory|getBodyLocationGroup)\s*\(\s*\)\s*==/.test(text)) {
      const matchLines = [];
      text.split(/\r?\n/).forEach((ln, i) => {
        if (/:\s*(?:getBodyLocation|getDisplayCategory|getBodyLocationGroup)\s*\(\s*\)\s*==/.test(ln)) matchLines.push(i + 1);
      });
      addRisk(findings, "high", rel, matchLines[0] ?? null, "resource_location_direct_string_compare",
        "getBodyLocation()/getDisplayCategory() return Java ResourceLocation objects, not strings — direct == comparison always returns false.",
        "Wrap with tostring(): tostring(item:getBodyLocation()) == 'Hands'",
        `Direct ResourceLocation compare at line(s): ${matchLines.join(', ')}`);
    }

    // ipairs or # on a Java collection — silently wrong
    // Bare Java list getters only. Qualified helpers such as
    // DangerousWeatherCore.getOnlinePlayers() that return a Lua table must not match.
    const javaListPattern = /(?:^|[^\w.])(?:getOnlinePlayers|getAllTypeRecurse|getObjectListForLua|getObjects|getInventoryItems|getSurround|getAdjacentSquare)\s*\(/;
    if (javaListPattern.test(text)) {
      const matchLines = [];
      text.split(/\r?\n/).forEach((ln, i) => {
        if (/\bipairs\s*\(\s*\w+\s*\)/.test(ln) || /(?:^|[^\w])#\w+/.test(ln)) {
          const before = text.split(/\r?\n/).slice(Math.max(0, i - 5), i).join("\n");
          if (javaListPattern.test(before)) matchLines.push(i + 1);
        }
      });
      if (matchLines.length) {
        addRisk(findings, "high", rel, matchLines[0], "ipairs_or_hash_on_java_list",
          "ipairs() or # used on what appears to be a Java ArrayList — ipairs always stops at index 1 (lists are 0-indexed), # always returns 0.",
          "Iterate with: for i = 0, list:size() - 1 do ... list:get(i) ... end",
          `Suspect ipairs/# on Java list at line(s): ${matchLines.join(', ')}`);
      }
    }

    if (/Events\.OnTick\.Add/.test(text) && !/(nextTickAt|TICK_INTERVAL|EveryOneMinute|EveryTenMinutes|OnTick\.Remove|bootstrapTries|tickCounter|tickCount|THROTTLE_TICKS|lastTick|TICK_MS)/.test(text)) {
      addRisk(
        findings,
        "medium",
        rel,
        null,
        "unthrottled_on_tick",
        `${side} file registers OnTick without an obvious throttle variable. OnTick fires 30×/sec.`,
        "Throttle tick work with nextTickAt/TICK_INTERVAL or use EveryOneMinute/EveryTenMinutes.",
        "Events.OnTick.Add",
      );
    }

    const buttonCallbackMatches = [...text.matchAll(/ISButton:new\s*\([^,\n]+,[^,\n]+,[^,\n]+,[^,\n]+,[^,\n]+,\s*self\s*,\s*([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\s*\)/g)];
    for (const match of buttonCallbackMatches) {
      const className = match[1];
      const methodName = match[2];
      if (className === "self") continue;
      const methodRe = new RegExp(`function\\s+${className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:${methodName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(`);
      if (!methodRe.test(text)) {
        const before = text.slice(0, match.index);
        const lineNo = before.split(/\r?\n/).length;
        addRisk(
          findings,
          "high",
          rel,
          lineNo,
          "missing_ui_button_callback",
          `ISButton references ${className}.${methodName}, but function ${className}:${methodName} was not found in the same file.`,
          "Define the callback or point the button at an existing method.",
          match[0],
        );
      }
    }

    flagFullscreenOverlayWithoutPassthrough(findings, rel, text, lines);
  }

  const textFiles = info.isDirectory()
    ? (await walkFiles(root)).filter((file) => TEXT_EXTENSIONS.has(extname(file).toLowerCase()))
    : [root].filter((file) => TEXT_EXTENSIONS.has(extname(file).toLowerCase()));
  for (const file of textFiles) {
    const rel = describePath(file);
    const text = await readTextFile(file);
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNo = i + 1;
      // B42 removed: getDelta() returns nil — use getCurrentUsesFloat()
      if (/:getDelta\s*\(\s*\)/.test(line)) {
        addRisk(
          findings, "high", rel, lineNo,
          "b42_removed_getDelta",
          ":getDelta() was removed in B42 — always returns nil, causing 'attempt to arithmetic on a nil value'.",
          "Replace with item:getCurrentUsesFloat(). Also gate with instanceof(item, 'DrainableComboItem') — getCurrentUsesFloat() returns 1.0 for all non-drainables.",
          line.trim(),
        );
      }

      // B42 wound-method naming, verified against vanilla 42.19 source:
      //   scratched() is the bare form vanilla uses; isScratched() never appears -> flag (low).
      //   isCut() is canonical (ISHealthPanel.lua:312, ClientCommands.lua:587) and bare cut() is unused -> do NOT flag.
      //   isDeepWounded() AND deepWounded() both exist in vanilla -> do NOT flag either.
      if (/:isScratched\s*\(\s*\)/.test(line)) {
        addRisk(
          findings, "low", rel, lineNo,
          "b42_renamed_wound_method",
          "bodyPart:isScratched() does not appear in vanilla B42 42.19 source — vanilla uses the bare bodyPart:scratched().",
          "Use bodyPart:scratched(). Note: isCut() and isDeepWounded() DO exist in B42 and are correct — do not 'fix' those.",
          line.trim(),
        );
      }

      // B42.18 removed: getAttachmentsProvided()
      if (/:getAttachmentsProvided\s*\(\s*\)/.test(line)) {
        addRisk(
          findings, "high", rel, lineNo,
          "b42_removed_getAttachmentsProvided",
          "item:getAttachmentsProvided() was removed entirely in B42.18.",
          "Use item:DoParam(...) for attachment data — do not read attachment lists from items.",
          line.trim(),
        );
      }

      // context:getNew() crashes silently — must be ISContextMenu:getNew()
      const code = line.replace(/--.*$/, "");
      if (/\bcontext:getNew\s*\(/.test(code)) {
        addRisk(
          findings, "high", rel, lineNo,
          "wrong_submenu_constructor",
          "context:getNew(context) crashes silently and suppresses the entire OnFillWorldObjectContextMenu callback with no console error.",
          "Use ISContextMenu:getNew(context) instead.",
          line.trim(),
        );
      }

      // item:hasTag(string) is broken in B42 — must use ItemTag.get(ResourceLocation.of(...))
      if (/:hasTag\s*\(\s*["']/.test(line)) {
        addRisk(
          findings, "high", rel, lineNo,
          "b42_broken_hasTag_string",
          "item:hasTag(string) is broken in B42 — passing a raw string silently returns false.",
          "Use ItemTag.get(ResourceLocation.of('base:tagname')) to get the tag object, then item:hasTag(tag). Tags are always base:<lowercase>.",
          line.trim(),
        );
      }

      if (/DisableSafehouseWhenPlayerConnected/.test(line)) {
        addRisk(
          findings,
          "medium",
          rel,
          lineNo,
          "renamed_server_option",
          "Project Zomboid renamed DisableSafehouseWhenPlayerConnected to DisableSafehouseWhenOwnerConnected.",
          "Update configs, docs, and generated server option references to DisableSafehouseWhenOwnerConnected.",
          line.trim(),
        );
      }
      if (/AutoCreateUserInWhiteList/.test(line)) {
        addRisk(
          findings,
          "high",
          rel,
          lineNo,
          "removed_server_option",
          "Project Zomboid removed AutoCreateUserInWhiteList after an account takeover issue.",
          "Remove this setting from generated configs and documentation; do not rely on auto whitelist user creation.",
          line.trim(),
        );
      }
    }
  }

  sortFindings(findings);
  return JSON.stringify({
    checked_lua_files: luaFiles.length,
    checked_text_files: textFiles.length,
    findings,
    recommended_status: findings.some((f) => f.severity === "high")
      ? "block release"
      : findings.length
        ? "needs review"
        : "runtime risk checks passed",
  }, null, 2);
}

async function analyzePzLog(rawPath, rawText) {
  let text = String(rawText ?? "");
  if (!text && rawPath) {
    const file = validateLocalPath(rawPath);
    text = await readTextFile(file);
  }
  if (!text.trim()) throw new Error("provide either text or path");

  const lines = text.split(/\r?\n/);
  const findings = [];
  const luaFrames = [];
  const repeatCounts = new Map();
  let stalledVolcanoCount = 0;
  let stalledVolcanoFirst = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const normalized = line
      .replace(/f:\d+\s+st:[^>]+>\s*/, "")
      .replace(/\d+/g, "#")
      .trim();
    if (normalized) repeatCounts.set(normalized, (repeatCounts.get(normalized) || 0) + 1);

    const frame = line.match(/Lua\(\(MOD:([^)]+)\)\)\.([A-Za-z0-9_:.]+)\(([^:()]+\.lua):(\d+)\)/);
    if (frame) {
      luaFrames.push({
        line: i + 1,
        mod: frame[1],
        function: frame[2],
        file: frame[3],
        lua_line: Number(frame[4]),
      });
    }

    if (/attempt to (index|call) a nil value/.test(line)) {
      findings.push({
        severity: "high",
        rule: "lua_nil_access",
        line: i + 1,
        issue: `Lua nil access: '${(line.match(/attempt to .+/) ?? [""])[0]}'`,
        recommendation: "Add nil/type guards before the failing call. Check init order and that referenced objects exist at call time.",
        evidence: line.trim(),
      });
    }

    if (/ReturnValues\.put|callFrame.*NPE|NullPointerException.*kahlua|kahlua.*NullPointerException/i.test(line)) {
      findings.push({
        severity: "high",
        rule: "kahlua_returnvalues_npe",
        line: i + 1,
        issue: "Kahlua ReturnValues NPE — often caused by too many top-level vanilla ISUI require statements corrupting the call frame stack, causing all timed actions to crash.",
        recommendation: "Remove all top-level vanilla ISUI require statements. In B42, ISUI classes are pre-loaded globals — requires are optional and accumulating many of them corrupts the callFrame stack.",
        evidence: line.trim(),
      });
    }

    if (/IndexOutOfBoundsException/.test(line)) {
      findings.push({
        severity: "high",
        rule: "java_index_out_of_bounds_from_lua",
        line: i + 1,
        issue: "Java IndexOutOfBoundsException surfaced through Lua. In PZ mods this often means a Java list was mutated while Lua iterated it.",
        recommendation: "Inspect nearby Lua stack frames. For square object lists, iterate backwards and re-check size before get(i).",
      });
    }

    if (/InvocationTargetException/.test(line)) {
      findings.push({
        severity: "medium",
        rule: "lua_java_invocation_target_exception",
        line: i + 1,
        issue: "A Java method invoked by Lua threw internally.",
        recommendation: "Use the Lua stack frame immediately above the Java trace as the ownership point.",
      });
    }

    if (/Volcano tick/.test(line) && /burned=0/.test(line) && /frontier=0/.test(line) && /branches=\d+/.test(line)) {
      stalledVolcanoCount++;
      stalledVolcanoFirst = stalledVolcanoFirst ?? { line: i + 1, evidence: line.trim() };
    }

    if (/ClassCastException/.test(line) && /AntiCheat/.test(lines.slice(i, i + 8).join("\n"))) {
      findings.push({
        severity: "low",
        rule: "pz_anticheat_packet_exception",
        line: i + 1,
        issue: "PZ Java anti-cheat packet exception. Usually not actionable from Lua unless it correlates exactly with mod packet sends.",
        recommendation: "Treat as engine/server config noise unless repeated with a mod command trigger.",
      });
    }

    if (/(SyncVisualsPacket\.parse|StatePacket\.apply|CellLoader\.DoTileObjectCreation|NetworkCharacterAI\.onDied|deadCharacterPacket\.square is null)/.test(line)) {
      findings.push({
        severity: "low",
        rule: "latest_patch_engine_mp_exception_signature",
        line: i + 1,
        issue: "This matches a multiplayer engine exception signature called out in the latest PZ patch notes.",
        recommendation: "If the stack has no Lua MOD frames, treat it as engine/build noise. If Lua frames exist, use those frames as ownership points.",
        evidence: line.trim(),
      });
    }

    if (/(Fire and Smoke anti-cheat|XPPlayer anti-cheat|AddXP packet|AntiCheatProtection.*Fire|AntiCheatProtection.*Smoke|AntiCheatProtection.*XP)/i.test(line)) {
      findings.push({
        severity: "low",
        rule: "removed_redundant_anticheat_reference",
        line: i + 1,
        issue: "The latest PZ patch removed redundant Fire/Smoke and XP/XPPlayer anti-cheats plus the unused AddXP packet.",
        recommendation: "Remove stale server-config or diagnostic assumptions around these removed anti-cheat paths.",
        evidence: line.trim(),
      });
    }

    // --- Overnight probe expansion: companion / nil-call / cross-mod / MP / tick ---
    if (/Object tried to call nil/i.test(line)) {
      findings.push({
        severity: "high",
        rule: "kahlua_object_tried_to_call_nil",
        line: i + 1,
        issue: "Kahlua 'Object tried to call nil' — usually a missing forward-declared local, shadowed global, or nil method on a Java object.",
        recommendation: "Check Lua stack frames above this line. Forward-declare locals used before definition; never re-declare names that are already assigned as chunk globals.",
        evidence: line.trim(),
      });
    }

    if (/\bBUGOUT\b/i.test(line) && /(breach|n=0|path_exit)/i.test(line)) {
      findings.push({
        severity: "high",
        rule: "buddy_bugout_breach_loop",
        line: i + 1,
        issue: "Buddy BUGOUT breach loop signature — often false positives from ally IsoZombie shells in porch/threat scans.",
        recommendation: "Ensure escort/NPC shells are filtered in findNearbyZombies/squareHasZed and parkedN uses filtered threats only.",
        evidence: line.trim(),
      });
    }

    if (/\[escort\]|HW_Companion|HavenWingmanCompanions|HFB_Escort|HW_Escort/i.test(line) && /(ERROR|Exception|nil)/i.test(line)) {
      findings.push({
        severity: "high",
        rule: "companion_escort_runtime_error",
        line: i + 1,
        issue: "Companion/escort runtime error in log.",
        recommendation: "Attribute to HavenWingmanCompanions / HFB_Escorts; verify ModData tags and Hit/pathFind APIs.",
        evidence: line.trim(),
      });
    }

    if (/ModData\.(transmit|request|add)|send(Client|Server)Command|OnClientCommand|OnServerCommand/i.test(line) && /(Exception|ERROR|NPE|null)/i.test(line)) {
      findings.push({
        severity: "high",
        rule: "mp_network_mod_failure",
        line: i + 1,
        issue: "Network/ModData path failed — can desync or crash MP sessions.",
        recommendation: "Never transmit inside OnInitGlobalModData; validate module/player/args on commands; check udpEngine readiness.",
        evidence: line.trim(),
      });
    }

    if (/Events\.OnTick|OnTick\.Add|permanent OnTick/i.test(line) && /(ERROR|Exception|WARN)/i.test(line)) {
      findings.push({
        severity: "medium",
        rule: "ontick_hazard_signal",
        line: i + 1,
        issue: "OnTick-related error/warn — permanent OnTick gameplay can tank SP/MP performance and cascade into other mods.",
        recommendation: "Prefer EveryOneMinute/EveryTenMinutes; register OnTick only while a short queue drains.",
        evidence: line.trim(),
      });
    }

    if (/__le not defined|__lt not defined|__add not defined|attempt to perform arithmetic/i.test(line)) {
      findings.push({
        severity: "high",
        rule: "java_numeric_not_lua_number",
        line: i + 1,
        issue: "Java boxed numeric compared/arithmetic'd as Lua number.",
        recommendation: "Always tonumber() Java Float/Integer/damage returns before compare or math.",
        evidence: line.trim(),
      });
    }

    if (/no such location|AttachedItems/i.test(line)) {
      findings.push({
        severity: "medium",
        rule: "attacheditems_missing_location",
        line: i + 1,
        issue: "AttachedItems:getItem(location) threw — location not registered on that character group.",
        recommendation: "Iterate AttachedItems group locations before speculative getItem(locationName).",
        evidence: line.trim(),
      });
    }

    if (/isClient\(\)|isServer\(\)|hosted.?host|coop/i.test(line) && /(ERROR|Exception|wrong environment|guard)/i.test(line)) {
      findings.push({
        severity: "medium",
        rule: "env_guard_or_hosted_host_signal",
        line: i + 1,
        issue: "Environment-guard / hosted-host related failure signal.",
        recommendation: "Use canonical guards (server: if isClient() then return end). Hosted host player is isClient=true.",
        evidence: line.trim(),
      });
    }

    if (/require\(|module .* not found|file is nil/i.test(line) && /\.lua/i.test(line)) {
      findings.push({
        severity: "high",
        rule: "lua_require_missing_module",
        line: i + 1,
        issue: "Lua require failed — missing module or wrong path under client/server/shared.",
        recommendation: "Verify require path matches media/lua layout; soft-require optional companions with pcall.",
        evidence: line.trim(),
      });
    }
  }

  if (stalledVolcanoCount > 0) {
    findings.push({
      severity: "medium",
      rule: "stalled_volcano_front",
      line: stalledVolcanoFirst.line,
      issue: `Volcano front reports no burned tiles, no frontier, and active branches (${stalledVolcanoCount} occurrence${stalledVolcanoCount === 1 ? "" : "s"}). This usually means the branch path is walking unloaded squares or discarding targets.`,
      recommendation: "Do not mark unloaded squares visited. Add a stall guard and/or keep spread within loaded cells.",
      evidence: stalledVolcanoFirst.evidence,
    });
  }

  for (const [message, count] of repeatCounts.entries()) {
    if (count >= 5 && /(burned=#|ERROR|Exception|WARN|bringToTop|OnTick)/i.test(message)) {
      findings.push({
        severity: /ERROR|Exception/i.test(message) ? "high" : "medium",
        rule: "repeated_log_pattern",
        issue: `Repeated log pattern occurred ${count} times.`,
        recommendation: "Repeated runtime logs should be rate-limited or treated as stalled state.",
        evidence: message,
      });
    }
  }

  const severityRank = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  return JSON.stringify({
    lines_checked: lines.length,
    lua_stack_frames: luaFrames,
    findings,
    recommended_status: findings.some((f) => f.severity === "high")
      ? "investigate before release"
      : findings.length
        ? "review warnings"
        : "no known runtime failure patterns found",
  }, null, 2);
}

async function proposeSafeCallPatch(rawPath) {
  const file = validateLocalPath(rawPath);
  const text = await readTextFile(file);
  if (extname(file).toLowerCase() !== ".lua") throw new Error("path must be a Lua file");
  const lines = text.split(/\r?\n/);
  const findings = JSON.parse(await auditSafeCall(file)).findings;
  const examples = [];
  lines.forEach((line, idx) => {
    if (/\bsafeCall\s*\(\s*function\s*\(\)\s*return\s+([^)]*:get[A-Za-z0-9_]+\(\))\s*end\s*\)/.test(line)) {
      examples.push({
        line: idx + 1,
        kind: "getter",
        current: line.trim(),
        replacement_pattern: "Use explicit object and method guards, assign fallback value when nil.",
      });
    } else if (/\bsafeCall\s*\(\s*function\s*\(\)\s*([^)]*:?[A-Za-z0-9_]+\([^)]*\))\s*end\s*\)/.test(line)) {
      examples.push({
        line: idx + 1,
        kind: "action/callback",
        current: line.trim(),
        replacement_pattern: "Check target object/function exists, then call directly.",
      });
    }
  });
  const helperLines = [];
  lines.forEach((line, idx) => {
    if (/function\s+safeCall/.test(line) || /\bsafeCall\b/.test(line)) helperLines.push(idx + 1);
  });
  return [
    "Finding",
    `${describePath(file)} contains ${helperLines.length} safeCall-related lines.`,
    "",
    "Evidence",
    JSON.stringify(findings, null, 2),
    "",
    "Patch Proposal",
    "Do not apply mechanically across the whole file. Use these rules:",
    "- Delete the local safeCall helper only after replacing all call sites.",
    "- For getter calls, use explicit nil/method guards and a fallback value.",
    "- For callbacks, check type(callback) == \"function\" before calling.",
    "- For PZ API object methods, check object and object.method before calling.",
    "",
    "Examples",
    JSON.stringify(examples.slice(0, 20), null, 2),
  ].join("\n");
}

async function validateModPackage(rawPath) {
  const root = validateLocalPath(rawPath);
  const layout = JSON.parse(await inspectModLayout(root));
  const guards = JSON.parse(await auditLuaGuards(root));
  const safe = JSON.parse(await auditSafeCall(root));
  const translations = JSON.parse(await auditTranslations(root));
  const commands = JSON.parse(await auditCommandContracts(root));
  const sandbox = JSON.parse(await auditSandboxSchema(root));
  const encoding = JSON.parse(await auditTextEncoding(root));
  const runtime = JSON.parse(await auditRuntimeRisks(root));
  const luaFiles = (await walkFiles(root)).filter(isPublishableLua);
  const syntaxFailures = [];
  for (const file of luaFiles) {
    const result = await runLuac(file);
    if (!result.ok) syntaxFailures.push({ path: describePath(file), error: result.error });
  }
  return JSON.stringify({
    root: describePath(root),
    layout_issues: layout.issues,
    guard_findings: guards.findings,
    safe_call_findings: safe.findings,
    translation_findings: translations.findings,
    command_contract_findings: commands.findings,
    sandbox_schema_findings: sandbox.findings,
    text_encoding_findings: encoding.findings,
    runtime_risk_findings: runtime.findings,
    lua_syntax: {
      checked: luaFiles.length,
      failures: syntaxFailures,
    },
    recommended_status: syntaxFailures.length
      || guards.findings.length
      || safe.findings.length
      || translations.findings.some((finding) => finding.severity !== "low")
      || commands.findings.some((finding) => finding.severity !== "low")
      || sandbox.findings.length
      || encoding.findings.some((finding) => finding.severity !== "low")
      || runtime.findings.some((finding) => finding.severity === "high")
      || layout.issues.length
      ? "needs review"
      : "static checks passed",
  }, null, 2);
}

function normalizeFinding(source, severity, finding) {
  return {
    source,
    severity: severity || finding.severity || "medium",
    path: finding.path ?? null,
    line: finding.line ?? null,
    rule: finding.rule ?? finding.issue ?? source,
    issue: finding.issue ?? finding.title ?? JSON.stringify(finding),
    recommendation: finding.recommendation ?? null,
    evidence: finding.evidence ?? finding.detail ?? null,
    raw: finding,
  };
}

async function productionReleaseGate(rawPath, rawLogPath, rawLogText) {
  const root = validateLocalPath(rawPath);
  const layout = JSON.parse(await inspectModLayout(root));
  const guards = JSON.parse(await auditLuaGuards(root));
  const safe = JSON.parse(await auditSafeCall(root));
  const translations = JSON.parse(await auditTranslations(root));
  const commands = JSON.parse(await auditCommandContracts(root));
  const sandbox = JSON.parse(await auditSandboxSchema(root));
  const encoding = JSON.parse(await auditTextEncoding(root));
  const runtime = JSON.parse(await auditRuntimeRisks(root));
  const eventHooks = JSON.parse(await auditEventHooks(root));
  const b42Raw = await validateB42Changes(root);
  const b42ApiTraps = JSON.parse(await auditB42ApiTraps(root, { json: true }));
  const luaFiles = (await walkFiles(root)).filter(isPublishableLua);

  const syntaxFailures = [];
  for (const file of luaFiles) {
    const result = await runLuac(file);
    if (!result.ok) syntaxFailures.push({ path: describePath(file), error: result.error });
  }

  let logAnalysis = null;
  if ((rawLogPath && String(rawLogPath).trim()) || (rawLogText && String(rawLogText).trim())) {
    logAnalysis = JSON.parse(await analyzePzLog(rawLogPath, rawLogText));
  }

  const workshopCopy = JSON.parse(await auditWorkshopCopy(root));
  const bareGettext = JSON.parse(await auditBareGettext(root));

  const blockers = [];
  const review = [];
  const info = [];

  for (const issue of layout.issues || []) {
    const severity = /missing root workshop|missing mod\.info/i.test(issue) ? "high" : "medium";
    const item = normalizeFinding("layout", severity, { issue, recommendation: "Fix package layout before Workshop upload." });
    (severity === "high" ? blockers : review).push(item);
  }

  for (const failure of syntaxFailures) {
    blockers.push(normalizeFinding("lua_syntax", "high", {
      path: failure.path,
      issue: "Lua syntax validation failed.",
      recommendation: "Fix parser error before loading the mod.",
      evidence: failure.error,
    }));
  }

  for (const finding of guards.findings || []) {
    const item = normalizeFinding("lua_guards", finding.severity, finding);
    (finding.severity === "high" ? blockers : review).push(item);
  }

  for (const finding of safe.findings || []) {
    const hasPcall = finding.pcall && finding.pcall !== "none";
    const wrapsPcall = finding.helper_kind === "wraps pcall";
    const severity = hasPcall || wrapsPcall ? "high" : "medium";
    const item = normalizeFinding("safe_call", severity, {
      ...finding,
      issue: hasPcall || wrapsPcall
        ? "pcall/safeCall wrapper can trigger Kahlua issues in B42.15+."
        : "Direct safeCall wrapper remains; review and replace with explicit guards.",
    });
    (severity === "high" ? blockers : review).push(item);
  }

  for (const finding of translations.findings || []) {
    const item = normalizeFinding("translations", finding.severity, finding);
    (finding.severity === "high" ? blockers : finding.severity === "medium" ? review : info).push(item);
  }

  for (const finding of commands.findings || []) {
    const item = normalizeFinding("command_contracts", finding.severity, finding);
    (finding.severity === "high" ? blockers : finding.severity === "medium" ? review : info).push(item);
  }

  for (const finding of sandbox.findings || []) {
    const item = normalizeFinding("sandbox_schema", finding.severity, finding);
    (finding.severity === "high" ? blockers : finding.severity === "medium" ? review : info).push(item);
  }

  for (const finding of encoding.findings || []) {
    const item = normalizeFinding("text_encoding", finding.severity, finding);
    (finding.severity === "high" ? blockers : finding.severity === "medium" ? review : info).push(item);
  }

  for (const finding of runtime.findings || []) {
    const item = normalizeFinding("runtime_risk", finding.severity, finding);
    (finding.severity === "high" ? blockers : finding.severity === "medium" ? review : info).push(item);
  }

  for (const finding of eventHooks.findings || []) {
    const item = normalizeFinding("event_hooks", finding.severity, finding);
    (finding.severity === "high" ? blockers : finding.severity === "medium" ? review : info).push(item);
  }

  // validateB42Changes returns a plain text string — parse HIGH/WARN lines
  for (const line of b42Raw.split(/\r?\n/)) {
    if (/^HIGH\s+/.test(line)) {
      blockers.push(normalizeFinding("b42_changes", "high", { issue: line.replace(/^HIGH\s+/, ""), recommendation: "See space_validate_b42_changes for details." }));
    } else if (/^WARN\s+/.test(line)) {
      review.push(normalizeFinding("b42_changes", "medium", { issue: line.replace(/^WARN\s+/, ""), recommendation: "See space_validate_b42_changes for details." }));
    } else if (/^FAIL\s+/.test(line)) {
      blockers.push(normalizeFinding("b42_changes", "high", { issue: line.replace(/^FAIL\s+/, ""), recommendation: "See space_validate_b42_changes for details." }));
    }
  }

  for (const finding of b42ApiTraps.findings || []) {
    const item = normalizeFinding("b42_api_traps", finding.severity, finding);
    (finding.severity === "high" ? blockers : finding.severity === "medium" ? review : info).push(item);
  }

  for (const finding of workshopCopy.findings || []) {
    const item = normalizeFinding("workshop_copy", finding.severity, finding);
    (finding.severity === "high" ? blockers : review).push(item);
  }

  for (const finding of bareGettext.findings || []) {
    const item = normalizeFinding("bare_gettext", finding.severity, finding);
    review.push(item);
  }

  const hasMasteryConfig = luaFiles.some((file) => /MasteryConfig\.lua$/i.test(file));
  let masteryFindings = [];
  if (hasMasteryConfig) {
    const mastery = JSON.parse(await auditMasterySystem(root));
    masteryFindings = mastery.findings || [];
    for (const finding of masteryFindings) {
      const item = normalizeFinding("mastery_system", finding.severity, finding);
      (finding.severity === "high" ? blockers : finding.severity === "medium" ? review : info).push(item);
    }
  }

  if (logAnalysis) {
    for (const finding of logAnalysis.findings || []) {
      const item = normalizeFinding("log_analysis", finding.severity, finding);
      (finding.severity === "high" ? blockers : finding.severity === "medium" ? review : info).push(item);
    }
  } else {
    review.push(normalizeFinding("probe_boot", "medium", {
      path: describePath(root),
      rule: "probe_log_missing",
      issue: "No pz-sp-probe / pz-mp-probe log was supplied. Static checks cannot PASS a handoff.",
      recommendation: "Owner-run pz-sp-probe (and pz-mp-probe if the change touches commands, ModData.transmit, or sendClient/ServerCommand). Pass log_path or log_text into this gate. Zero attributable errors required. See docs/tracking/PROBE_PREHANDOFF_GATE.md.",
    }));
  }

  sortFindings(blockers);
  sortFindings(review);
  sortFindings(info);

  const verdict = blockers.length > 0
    ? "BLOCK"
    : review.length > 0
      ? "REVIEW"
      : "PASS";

  const nextActions = [];
  if (syntaxFailures.length) nextActions.push("Fix Lua syntax failures first; nothing else matters until the parser passes.");
  if (blockers.some((f) => f.source === "runtime_risk")) nextActions.push("Resolve high-severity runtime-risk findings before server testing.");
  if (blockers.some((f) => f.source === "log_analysis")) nextActions.push("Use log Lua stack frames as ownership points and patch the referenced code.");
  if (review.some((f) => f.source === "safe_call")) nextActions.push("Plan a follow-up safeCall cleanup pass; direct wrappers are review debt, pcall wrappers are blockers.");
  if (review.some((f) => f.source === "lua_guards")) nextActions.push("Add missing client/server guards to reduce dedicated-server load surprises.");
  if (review.some((f) => f.source === "translations")) nextActions.push("Add missing local translation keys so sandbox and UI text render cleanly in-game.");
  if (review.some((f) => f.source === "command_contracts")) nextActions.push("Review command contract findings so client/server command names stay aligned.");
  if (blockers.some((f) => f.source === "event_hooks") || review.some((f) => f.source === "event_hooks")) nextActions.push("Fix event hook issues — wrong bootstrap hook or removed/deprecated event can cause silent failures on dedicated servers.");
  if (blockers.some((f) => f.source === "b42_changes") || review.some((f) => f.source === "b42_changes")) nextActions.push("Fix B42 breaking-change violations — removed APIs and renamed items cause crashes or silent wrong behavior.");
  if (blockers.some((f) => f.source === "b42_api_traps") || review.some((f) => f.source === "b42_api_traps")) {
    nextActions.push("Fix B42 API trap findings (require-missing-return, module-reference-integrity, hasTrait, etc.) — these cause boot nil crashes or silent wrong behavior.");
  }
  if (review.some((f) => f.source === "sandbox_schema")) nextActions.push("Fix sandbox option schema issues before upload or server option generation.");
  if (review.some((f) => f.source === "text_encoding")) nextActions.push("Repair suspected mojibake in text/translation files before publishing.");
  if (blockers.some((f) => f.source === "workshop_copy") || review.some((f) => f.source === "workshop_copy")) {
    nextActions.push("Update workshop.txt description and changenote= to match the current change, then save workshop.txt last.");
  }
  if (review.some((f) => f.source === "bare_gettext")) {
    nextActions.push("Replace bare getText(\"...\") with tr(key, fallback) unless this mod's established convention is vanilla getText keys.");
  }
  if (blockers.some((f) => f.source === "mastery_system") || review.some((f) => f.source === "mastery_system")) {
    nextActions.push("Fix MasterySystem grammar findings (getActive capstone-only, internalTrait scripts, footstep weight band, player-first commands).");
  }
  if (review.some((f) => f.rule === "probe_log_missing") || review.some((f) => f.source === "probe_boot")) {
    nextActions.push("Owner-run pz-sp-probe (and pz-mp-probe when MP paths changed) and re-run this gate with log_path. Static-pass alone is not a handoff.");
  }
  if (verdict === "PASS") nextActions.push("Static release gate passed with a probe log. Proceed to scenario testing on a disposable save/server.");

  return JSON.stringify({
    target: describePath(root),
    verdict,
    release_ready: verdict === "PASS",
    summary: {
      lua_files_checked: luaFiles.length,
      layout_issues: layout.issues?.length ?? 0,
      syntax_failures: syntaxFailures.length,
      guard_findings: guards.findings?.length ?? 0,
      safe_call_findings: safe.findings?.length ?? 0,
      translation_findings: translations.findings?.length ?? 0,
      command_contract_findings: commands.findings?.length ?? 0,
      sandbox_schema_findings: sandbox.findings?.length ?? 0,
      text_encoding_findings: encoding.findings?.length ?? 0,
      runtime_risk_findings: runtime.findings?.length ?? 0,
      event_hook_findings: eventHooks.findings?.length ?? 0,
      b42_change_findings: b42Raw.split(/\r?\n/).filter(l => /^(HIGH|WARN|FAIL)\s+/.test(l)).length,
      b42_api_trap_findings: b42ApiTraps.findings?.length ?? 0,
      mastery_findings: masteryFindings.length,
      bare_gettext_findings: bareGettext.findings?.length ?? 0,
      probe_log_supplied: Boolean(logAnalysis),
      log_findings: logAnalysis?.findings?.length ?? 0,
      blockers: blockers.length,
      review: review.length,
      info: info.length,
    },
    blockers,
    review,
    info,
    log_stack_frames: logAnalysis?.lua_stack_frames ?? [],
    next_actions: nextActions,
  }, null, 2);
}

function guardInsertionIndex(lines) {
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === "" || trimmed === "--" || trimmed.startsWith("-- ")) {
      i++;
      continue;
    }
    break;
  }
  return i;
}

function ensureLuaGuard(text, side) {
  const lines = text.split(/\r?\n/);
  const first25 = lines.slice(0, 25).join("\n");
  const required = side === "client"
    ? "if isServer() then return end"
    : side === "server"
      ? "if isClient() then return end"
      : null;
  if (!required || first25.includes(required)) return { text, changed: false, required };
  const index = guardInsertionIndex(lines);
  lines.splice(index, 0, required, "");
  return { text: lines.join("\n"), changed: true, required };
}

function unwrapDirectSafeCall(text) {
  let changed = false;
  let skipped = 0;
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (
      /^\s*local\s+function\s+safeCall\s*\(\s*fn\s*\)\s*$/.test(lines[i])
      && lines[i + 1] !== undefined
      && /pcall removed|Direct call/i.test(lines[i + 1])
      && /^\s*return\s+fn\s*\(\s*\)\s*$/.test(lines[i + 2] ?? "")
      && /^\s*end\s*$/.test(lines[i + 3] ?? "")
    ) {
      changed = true;
      i += 3;
      continue;
    }

    let line = lines[i];
    if (/\bsafeCall\s*\(\s*function\s*\(\)/.test(line) && !/\bend\s*\)/.test(line)) {
      skipped++;
      out.push(line);
      continue;
    }

    const before = line;
    line = line.replace(/\bsafeCall\s*\(\s*function\s*\(\)\s*return\s+(.+?)\s*end\s*\)/g, "($1)");
    line = line.replace(/\bsafeCall\s*\(\s*function\s*\(\)\s*(.+?)\s*end\s*\)/g, "$1");
    if (line !== before) changed = true;
    out.push(line);
  }
  return { text: out.join("\n"), changed, skipped };
}

function makeChangeSummary(original, updated) {
  const oldLines = original.split(/\r?\n/);
  const newLines = updated.split(/\r?\n/);
  const max = Math.max(oldLines.length, newLines.length);
  const changes = [];
  for (let i = 0; i < max; i++) {
    if (oldLines[i] !== newLines[i]) {
      changes.push({
        line: i + 1,
        before: oldLines[i] ?? "",
        after: newLines[i] ?? "",
      });
      if (changes.length >= 25) break;
    }
  }
  return changes;
}

async function createPendingModFixPatch(rawPath, fixTypesArg) {
  const root = validateWorkshopPath(rawPath);
  const info = await stat(root);
  const fixTypes = Array.isArray(fixTypesArg) && fixTypesArg.length
    ? fixTypesArg.map((v) => String(v))
    : ["guards", "safeCall"];
  const allowGuards = fixTypes.includes("guards");
  const allowSafeCall = fixTypes.includes("safeCall") || fixTypes.includes("safecall");
  if (!allowGuards && !allowSafeCall) throw new Error("fix_types must include guards and/or safeCall");

  let luaFiles = [];
  if (info.isDirectory()) luaFiles = (await walkFiles(root)).filter(isPublishableLua);
  else if (info.isFile() && extname(root).toLowerCase() === ".lua") luaFiles = [root];
  else throw new Error("path must be a Lua file or folder under the Workshop root");

  const changes = [];
  let skippedSafeCallSites = 0;
  for (const file of luaFiles) {
    const original = await readFile(file, "utf8");
    let updated = original;
    const notes = [];

    if (allowGuards) {
      const side = detectLuaSide(file);
      const guarded = ensureLuaGuard(updated, side);
      updated = guarded.text;
      if (guarded.changed) notes.push(`insert ${guarded.required}`);
    }

    if (allowSafeCall) {
      const unwrapped = unwrapDirectSafeCall(updated);
      updated = unwrapped.text;
      skippedSafeCallSites += unwrapped.skipped;
      if (unwrapped.changed) notes.push("unwrap direct safeCall helper/calls");
      if (unwrapped.skipped) notes.push(`left ${unwrapped.skipped} multiline safeCall site(s) for manual review`);
    }

    if (updated !== original) {
      changes.push({
        path: describePath(file),
        abs_path: file,
        original_hash: hashText(original),
        original_size: original.length,
        updated_hash: hashText(updated),
        updated_content: updated,
        notes,
        preview: makeChangeSummary(original, updated),
      });
    }
  }

  const patchId = `patch-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const approvalText = `APPROVE PATCH ${patchId}`;
  const patch = {
    patch_id: patchId,
    created_at: new Date().toISOString(),
    workshop_root: WORKSHOP_ROOT,
    target: describePath(root),
    fix_types: fixTypes,
    approval_text: approvalText,
    status: "pending",
    changes,
    skipped: {
      multiline_safeCall_sites: skippedSafeCallSites,
    },
    safety: {
      scope: "writes are refused outside the Workshop root",
      backups: "central backup under Brain/mcp-server/backups/<patch_id>/",
      deletes: "disabled",
    },
  };
  await mkdir(PENDING_PATCH_DIR, { recursive: true });
  await writeFile(pendingPatchPath(patchId), JSON.stringify(patch, null, 2) + "\n", "utf8");
  return JSON.stringify({
    patch_id: patchId,
    status: "pending",
    target: patch.target,
    fix_types: fixTypes,
    files_changed: changes.length,
    skipped: patch.skipped,
    approval_text: approvalText,
    changes: changes.map((change) => ({
      path: change.path,
      notes: change.notes,
      preview: change.preview,
    })),
    next_step: `Review this output, then call space_apply_pending_patch with approval_text exactly: ${approvalText}`,
  }, null, 2);
}

async function loadPendingPatch(patchId) {
  const text = await readFile(pendingPatchPath(patchId), "utf8");
  return JSON.parse(text);
}

async function inspectPendingPatch(patchId) {
  const patch = await loadPendingPatch(patchId);
  return JSON.stringify({
    patch_id: patch.patch_id,
    created_at: patch.created_at,
    status: patch.status,
    target: patch.target,
    fix_types: patch.fix_types,
    approval_text: patch.approval_text,
    files_changed: patch.changes.length,
    skipped: patch.skipped,
    changes: patch.changes.map((change) => ({
      path: change.path,
      notes: change.notes,
      preview: change.preview,
    })),
  }, null, 2);
}

async function applyPendingPatch(patchId, approvalText) {
  const patch = await loadPendingPatch(patchId);
  if (patch.status !== "pending") throw new Error(`patch status is ${patch.status}, not pending`);
  if (String(approvalText ?? "") !== patch.approval_text) {
    throw new Error(`approval_text must exactly equal: ${patch.approval_text}`);
  }
  if (!patch.changes.length) throw new Error("patch has no file changes");

  const backupDir = join(BACKUP_ROOT, patch.patch_id);
  await mkdir(backupDir, { recursive: true });

  for (const change of patch.changes) {
    const abs = validateWorkshopPath(change.abs_path);
    const current = await readFile(abs, "utf8");
    if (hashText(current) !== change.original_hash) {
      throw new Error(`refusing to apply: file changed since patch was created: ${change.path}`);
    }
  }

  const applied = [];
  for (const change of patch.changes) {
    const abs = validateWorkshopPath(change.abs_path);
    const backupRel = relative(WORKSHOP_ROOT, abs);
    const backupPath = join(backupDir, backupRel);
    await mkdir(dirname(backupPath), { recursive: true });
    await copyFile(abs, backupPath);
    await writeFile(abs, change.updated_content, "utf8");
    applied.push({
      path: change.path,
      backup: relative(HERE, backupPath).split(sep).join("/"),
      updated_hash: change.updated_hash,
    });
  }

  const syntaxFailures = [];
  for (const change of patch.changes) {
    const abs = validateWorkshopPath(change.abs_path);
    if (extname(abs).toLowerCase() === ".lua") {
      const result = await runLuac(abs);
      if (!result.ok) syntaxFailures.push({ path: change.path, error: result.error });
    }
  }

  patch.status = syntaxFailures.length ? "applied_with_validation_failures" : "applied";
  patch.applied_at = new Date().toISOString();
  patch.backup_dir = backupDir;
  patch.validation = { lua_syntax_failures: syntaxFailures };
  await writeFile(pendingPatchPath(patch.patch_id), JSON.stringify(patch, null, 2) + "\n", "utf8");

  return JSON.stringify({
    patch_id: patch.patch_id,
    status: patch.status,
    applied_files: applied,
    backup_dir: relative(HERE, backupDir).split(sep).join("/"),
    lua_syntax: {
      checked: patch.changes.filter((change) => extname(change.abs_path).toLowerCase() === ".lua").length,
      failures: syntaxFailures,
    },
    warning: syntaxFailures.length
      ? "Patch was applied but Lua syntax validation failed. Use backups to review or restore manually."
      : "Patch applied and Lua syntax validation passed.",
  }, null, 2);
}

async function auditBitemeMods(rawPath, maxFindings = 10) {
  const root = rawPath ? validateLocalPath(rawPath) : WORKSHOP_ROOT;
  const rootInfo = await stat(root);
  if (!rootInfo.isDirectory()) throw new Error("audit path is not a directory");

  const entries = await readdir(root, { withFileTypes: true });
  const modRoots = entries
    .filter((e) => e.isDirectory() && /bite\s*me|biteme/i.test(e.name))
    .map((e) => join(root, e.name));

  const findings = [];
  const summaries = [];
  let totalLua = 0;
  let syntaxFailures = 0;

  function addFinding(severity, title, detail) {
    findings.push({ severity, title, detail });
  }

  for (const modRoot of modRoots) {
    const name = relative(root, modRoot).split(sep).join("/");
    const files = await walkFiles(modRoot);
    const luaFiles = files.filter((f) =>
      extname(f).toLowerCase() === ".lua" && f.includes(`${sep}42${sep}media${sep}lua${sep}`),
    );
    const modInfos = files.filter((f) => f.endsWith(`${sep}mod.info`));
    const workshopTxt = join(modRoot, "workshop.txt");
    const hasWorkshop = await pathExists(workshopTxt);
    const rootMirror42 = await pathExists(join(modRoot, "42"));
    const contentsMods = join(modRoot, "Contents", "mods");
    const rootMirrorAdmin = await pathExists(join(modRoot, "admin_monitor"));
    const contentsAdmin = files.some((f) => f.includes(`${sep}Contents${sep}mods${sep}`) && f.includes(`${sep}admin_monitor${sep}`));

    totalLua += luaFiles.length;
    summaries.push(
      `- ${name}: ${luaFiles.length} Lua files, ${modInfos.length} mod.info, workshop.txt=${hasWorkshop ? "yes" : "no"}`,
    );

    if (!hasWorkshop) addFinding("high", `${name}: missing root workshop.txt`, "Workshop package metadata is incomplete.");
    if (!modInfos.length) addFinding("high", `${name}: missing mod.info`, "No mod.info found under the package.");
    if (rootMirror42 && (await pathExists(contentsMods))) {
      addFinding("medium", `${name}: duplicate root 42 mirror`, "Both root-level 42/ and Contents/mods/.../42 content exist. Pick a source of truth before patching or packaging.");
    }
    if (rootMirrorAdmin && contentsAdmin) {
      addFinding("medium", `${name}: duplicate admin_monitor mirror`, "admin_monitor exists both at root and inside Contents/mods. This can create stale bundled tools.");
    }

    for (const modInfo of modInfos) {
      let text = "";
      try { text = await readFile(modInfo, "utf8"); } catch {}
      if (text && !/^author=Mr Space Cadet$/m.test(text)) {
        addFinding("low", `${name}: mod.info author differs`, `${describePath(modInfo)} does not contain author=Mr Space Cadet.`);
      }
      if (text && !/^versionMin=42\.0$/m.test(text)) {
        addFinding("medium", `${name}: mod.info missing versionMin=42.0`, describePath(modInfo));
      }
    }

    for (const file of luaFiles) {
      const rel = describePath(file);
      const syntax = await runLuac(file);
      if (!syntax.ok) {
        syntaxFailures++;
        addFinding("high", `${name}: Lua syntax failure`, `${rel}: ${syntax.error}`);
      }

      let text = "";
      try { text = await readFile(file, "utf8"); } catch { continue; }
      const lines = text.split(/\r?\n/);
      const first25 = lines.slice(0, 25).join("\n");
      const isClientFile = file.includes(`${sep}media${sep}lua${sep}client${sep}`);
      const isServerFile = file.includes(`${sep}media${sep}lua${sep}server${sep}`);

      if (isClientFile && !/if\s+isServer\(\)\s+then\s+return\s+end/.test(first25)) {
        addFinding("medium", `${name}: client file missing guard: if isServer() then return end`, rel);
      }
      if (isServerFile && !/if\s+isClient\(\)\s+then\s+return\s+end/.test(first25)) {
        addFinding("medium", `${name}: server file missing guard: if isClient() then return end`, rel);
      }

      const pcallLines = [];
      const safeCallLines = [];
      const nonCanonicalGuardLines = [];
      const onTickLines = [];
      const negative = classifyNegativeEnvGuards(lines);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNo = i + 1;
        if (/\bpcall\s*\(/.test(line)) pcallLines.push(lineNo);
        if (/\bsafeCall\b/.test(line) && !/pcall removed/i.test(line)) safeCallLines.push(lineNo);
        if (/if\s+isClient\(\)\s+and\s+not\s+isServer\(\)\s+then\s+return\s+end/.test(line)) {
          nonCanonicalGuardLines.push(lineNo);
        }
        if (/Events\.OnTick/.test(line)) onTickLines.push(lineNo);
      }

      const lineSummary = (items) => {
        const first = items.slice(0, 8).join(", ");
        return `${rel}: ${items.length} hit${items.length === 1 ? "" : "s"}${first ? `, first lines ${first}` : ""}`;
      };
      if (pcallLines.length) addFinding("high", `${name}: pcall usage`, lineSummary(pcallLines));
      if (safeCallLines.length) addFinding("high", `${name}: safeCall usage`, lineSummary(safeCallLines));
      if (negative.fileLevel.length) addFinding("high", `${name}: forbidden file-level negative environment guard`, lineSummary(negative.fileLevel));
      if (negative.inner.length) addFinding("medium", `${name}: inner negative env guard (only valid immediately before sendClientCommand)`, lineSummary(negative.inner));
      if (nonCanonicalGuardLines.length) addFinding("medium", `${name}: non-canonical server guard`, lineSummary(nonCanonicalGuardLines));
      if (onTickLines.length) addFinding("medium", `${name}: OnTick handler to review`, lineSummary(onTickLines));
    }
  }

  const severityRank = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  const limit = Math.min(100, Math.max(1, Number(maxFindings ?? 10)));
  const shown = findings.slice(0, limit);
  const body = [
    "Finding",
    `Scanned ${modRoots.length} Biteme/BiteMe mod folders under ${describePath(root)}. Lua syntax checked ${totalLua} publishable Lua files with ${syntaxFailures} syntax failures.`,
    "",
    "Evidence",
    ...summaries,
    "",
    "Top Findings",
    ...(shown.length
      ? shown.map((f) => `- [${f.severity}] ${f.title}: ${f.detail}`)
      : ["- No audit findings from the configured checks."]),
    findings.length > shown.length ? `- Truncated ${findings.length - shown.length} additional findings.` : "",
    "",
    "Action Needed",
    "Prioritize high severity pcall/safeCall and guard findings, then resolve duplicate mirrors before packaging.",
    "",
    "Risk",
    "This is a static read-only audit. It does not prove runtime behavior on a dedicated server.",
    "",
    "Tool Use",
    "space_audit_biteme_mods",
  ].filter(Boolean).join("\n");

  return body;
}

// ---------- method DB (lazy) ----------

let methodDbCache = null;
async function loadMethodDb() {
  if (methodDbCache) return methodDbCache;
  const p = join(BRAIN_ROOT, "references", "build42", "B42_Method_Database.json");
  const raw = await readFile(p, "utf8");
  methodDbCache = JSON.parse(raw);
  return methodDbCache;
}

// ---------- PZ script block schema DB (lazy) ----------

let scriptBlockDbCache = null;
async function loadScriptBlockDb() {
  if (scriptBlockDbCache) return scriptBlockDbCache;
  const p = join(BRAIN_ROOT, "references", "build42", "pz-scripts-data", "scriptBlocks.json");
  const raw = await readFile(p, "utf8");
  scriptBlockDbCache = JSON.parse(raw);
  return scriptBlockDbCache;
}

function scriptBlockMatches(key, block, needle) {
  const haystack = [
    key,
    block?.name,
    block?.description,
    ...(Array.isArray(block?.parents) ? block.parents : []),
    ...(Array.isArray(block?.pattern) ? block.pattern : []),
  ].filter(Boolean).join("\n").toLowerCase();
  return haystack.includes(needle);
}

function scriptBlockParameters(block) {
  const params = block?.parameters;
  if (Array.isArray(params)) return params;
  if (params && typeof params === "object") {
    return Object.entries(params).map(([key, value]) => ({
      parameter_key: key,
      ...(value && typeof value === "object" ? value : { value }),
    }));
  }
  return [];
}

function summarizeScriptBlock(key, block, parameterNeedle = "") {
  const params = scriptBlockParameters(block);
  const shownParams = parameterNeedle
    ? params.filter((p) => String(p?.name ?? "").toLowerCase().includes(parameterNeedle))
    : params.slice(0, 80);

  return {
    key,
    name: block?.name ?? key,
    description: block?.description ?? "",
    parents: block?.parents ?? [],
    needsChildren: block?.needsChildren ?? [],
    isRoot: Boolean(block?.isRoot),
    shouldHaveParent: Boolean(block?.shouldHaveParent),
    softOverride: Boolean(block?.softOverride),
    deprecated: block?.deprecated ?? null,
    parameter_count: params.length,
    parameters_truncated: !parameterNeedle && params.length > shownParams.length,
    parameters: shownParams.map((p) => ({
      name: p?.name,
      type: p?.type ?? null,
      required: Boolean(p?.required),
      default: p?.default,
      description: p?.description ?? "",
      deprecated: p?.deprecated ?? null,
      needs: p?.needs ?? undefined,
    })),
  };
}

// ---------- space_audit_moddata_usage ----------
async function auditModdataUsage(rawPath) {
  const root = validateLocalPath(rawPath);
  const info = await stat(root);
  const luaFiles = info.isDirectory()
    ? (await walkFiles(root)).filter(isPublishableLua)
    : [root].filter(isPublishableLua);
  const findings = [];

  for (const file of luaFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split(/\r?\n/);
    const rel = describePath(file);
    const side = detectLuaSide(file);

    const hasModDataRef  = /ModData\./.test(text);
    const hasGetOrCreate = /ModData\.getOrCreate\s*\(/.test(text);
    const hasTransmit    = /ModData\.transmit\s*\(/.test(text);
    const hasVersion     = /_version/.test(text);

    if (hasModDataRef && !hasGetOrCreate) {
      findings.push({ severity: 'medium', path: rel, issue: 'ModData referenced but ModData.getOrCreate() not found', recommendation: 'Use ModData.getOrCreate(MODULE_ID) to ensure consistent key namespace' });
    }

    if ((side === 'server' || side === 'shared') && hasGetOrCreate && !hasTransmit) {
      findings.push({ severity: 'low', path: rel, issue: 'ModData.getOrCreate() found in server/shared file but no ModData.transmit() call', recommendation: 'Call ModData.transmit(MODULE_ID) after any mutation that clients need to observe' });
    }

    if (hasGetOrCreate && !hasVersion) {
      findings.push({ severity: 'low', path: rel, issue: 'ModData store found with no _version field', recommendation: 'Add a _version field to ModData stores for forward-compatible migration support' });
    }

    lines.forEach((line, idx) => {
      if (/args\.username/.test(line)) {
        findings.push({ severity: 'high', path: rel, line: idx + 1, issue: 'args.username used for player identity', recommendation: 'Use the engine-supplied `player` argument — args.username can be forged by clients' });
      }
      if (/\b(md|store|modData)\s*\.\s*\w+\s*=\s*function/.test(line)) {
        findings.push({ severity: 'medium', path: rel, line: idx + 1, issue: 'Function literal assigned to ModData-like table field', recommendation: 'Functions are silently dropped on ModData serialization — store a string key and look up the function by name' });
      }
    });
  }

  return JSON.stringify({ checked_files: luaFiles.length, findings }, null, 2);
}

// ---------- space_audit_network_commands ----------
async function auditNetworkCommands(rawPath) {
  const root = validateLocalPath(rawPath);
  const info = await stat(root);
  const luaFiles = info.isDirectory()
    ? (await walkFiles(root)).filter(isPublishableLua)
    : [root].filter(isPublishableLua);
  const findings = [];

  for (const file of luaFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split(/\r?\n/);
    const rel = describePath(file);
    const side = detectLuaSide(file);

    if (/Events\.On(Client|Server)Command\.Add/.test(text)) {
      const hasModuleGuard = /module\s*~=\s*MODULE_ID/.test(text);
      if (!hasModuleGuard) {
        findings.push({ severity: 'high', path: rel, issue: 'OnClientCommand/OnServerCommand handler missing module ~= MODULE_ID guard', recommendation: 'First line of every command handler must be: if module ~= MODULE_ID then return end' });
      }
    }

    lines.forEach((line, idx) => {
      if (/args\.username/.test(line)) {
        findings.push({ severity: 'high', path: rel, line: idx + 1, issue: 'args.username used for player identity', recommendation: 'Use the engine-supplied `player` argument — args.username is client-supplied and can be forged' });
      }
      const sendMatch = line.match(/send(?:Client|Server)Command\s*\(([^)]*)\)/);
      if (sendMatch) {
        const argCount = sendMatch[1].split(',').length;
        if (argCount < 3) {
          findings.push({ severity: 'medium', path: rel, line: idx + 1, issue: 'sendClientCommand/sendServerCommand may be missing args table', recommendation: 'Always pass a table as the last argument, even if empty. Prefer sendClientCommand(player, MODULE_ID, "cmd", {}).' });
        }
      }
    });

    if (side === 'server' && /sendServerCommand/.test(text) && !/isAdmin\s*\(/.test(text)) {
      findings.push({ severity: 'low', path: rel, issue: 'Server file sends commands but has no isAdmin() check', recommendation: 'Gate all state-mutating server commands with isAdmin(player) unless the action is explicitly player-allowed' });
    }

    // Check isAdmin implementations for missing GM and Observer access levels
    const isAdminMatch = text.match(/function\s+isAdmin\s*\([^)]*\)([\s\S]{0,600}?)(?:^|\n)\s*end/m);
    if (isAdminMatch) {
      const body = isAdminMatch[1];
      const missingLevels = [];
      if (!/"gm"|'gm'|"GM"|'GM'/.test(body)) missingLevels.push('"gm"/"GM"');
      if (!/"observer"|'observer'|"Observer"|'Observer'/.test(body)) missingLevels.push('"observer"/"Observer"');
      if (missingLevels.length) {
        findings.push({
          severity: 'medium',
          path: rel,
          issue: `isAdmin() implementation is missing access levels: ${missingLevels.join(', ')}`,
          recommendation: 'isAdmin() must check all six levels: admin, moderator, overseer, gm, observer (each in both capitalizations). Missing levels silently break access gates for those ranks.',
        });
      }
    }
  }

  return JSON.stringify({ checked_files: luaFiles.length, findings }, null, 2);
}

// ---------- space_audit_event_hooks ----------
async function auditEventHooks(rawPath) {
  const root = validateLocalPath(rawPath);
  const info = await stat(root);
  const luaFiles = info.isDirectory()
    ? (await walkFiles(root)).filter(isPublishableLua)
    : [root].filter(isPublishableLua);
  const findings = [];

  const removedEvents = [
    { event: 'OnExitVehicle',     severity: 'high',   recommendation: 'Removed in B42.18 — use EveryOneMinute polling with a lastVehicle local to detect exit' },
    { event: 'OnFillVehicleMenu', severity: 'high',   recommendation: 'Removed in B42 — use Events.OnFillWorldObjectContextMenu + square:getVehicleContainer()' },
    { event: 'OnPlayerDisconnect', severity: 'medium', recommendation: 'Deprecated — use OnDisconnect with custom player tracking instead' },
  ];

  const warnEvents = [
    { event: 'OnTick',         severity: 'medium', recommendation: 'OnTick fires 30x/sec — use EveryOneMinute or EveryTenMinutes for gameplay logic' },
    { event: 'OnPlayerUpdate', severity: 'medium', recommendation: 'OnPlayerUpdate fires 30x/sec per player — use EveryOneMinute unless per-frame logic is required' },
  ];

  for (const file of luaFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split(/\r?\n/);
    const rel = describePath(file);
    const side = detectLuaSide(file);

    if ((side === 'server' || side === 'shared') && /Events\.OnGameStart\.Add/.test(text)) {
      const matchLines = [];
      lines.forEach((line, idx) => { if (/Events\.OnGameStart\.Add/.test(line)) matchLines.push(idx + 1); });
      const isModDataInit = /ModData\./.test(text);
      findings.push({
        severity: 'high', path: rel, lines: matchLines,
        issue: `${side === 'server' ? 'Server' : 'Shared'} file uses Events.OnGameStart for bootstrap${isModDataInit ? ' and also touches ModData' : ''}`,
        recommendation: 'Use Events.OnInitGlobalModData.Add for server-side ModData bootstrap — OnGameStart fires inconsistently on dedicated servers and does not fire for the server process on dedi.'
      });
    }

    for (const { event, severity, recommendation } of [...removedEvents, ...warnEvents]) {
      const pattern = new RegExp(`Events\\.${event}\\.Add`);
      if (pattern.test(text)) {
        if (event === "OnTick" && /Events\.OnTick\.Remove|nextTickAt|TICK_INTERVAL|bootstrapTries|tickCounter|tickCount|THROTTLE_TICKS|lastTick|TICK_MS/.test(text)) continue;
        if (event === "OnPlayerUpdate" && /isSprinting|_sprintHooked/.test(text)) continue;
        const matchLines = [];
        lines.forEach((line, idx) => { if (pattern.test(line)) matchLines.push(idx + 1); });
        findings.push({ severity, path: rel, lines: matchLines, event, issue: `Events.${event}.Add used`, recommendation });
      }
    }
  }

  return JSON.stringify({ checked_files: luaFiles.length, findings }, null, 2);
}

// ---------- validation tool wrappers ----------

function runPowerShell(scriptPath, args) {
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args], {
      cwd: WORKSHOP_ROOT,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("close", (code) => {
      resolve({ ok: code === 0, output: (stdout + stderr).trim() });
    });
  });
}

// ---------- space_validate_env_guards ----------
async function validateEnvGuards(rawPath) {
  const root = validateLocalPath(rawPath);
  const info = await stat(root);
  const luaFiles = info.isDirectory()
    ? (await walkFiles(root)).filter(isPublishableLua)
    : [root].filter(isPublishableLua);

  const failures = [];
  for (const file of luaFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split(/\r?\n/);
    const leading = luaLeadingCode(lines, 80);
    const side = detectLuaSide(file);
    const rel = describePath(file);
    const timedActionClass = /ISBaseTimedAction:derive|ISEatFoodAction:derive/.test(text);

    const negative = classifyNegativeEnvGuards(lines);
    for (const lineNo of negative.fileLevel) {
      failures.push(`HIGH  ${rel}:${lineNo} — forbidden file-level guard "if not isServer/isClient() then return end" (breaks solo + hosted-host)`);
    }
    for (const lineNo of negative.inner) {
      failures.push(`WARN  ${rel}:${lineNo} — inner negative env guard; only valid immediately before sendClientCommand (SP must not send)`);
    }

    if (side === 'server' && !timedActionClass && !/if\s+isClient\(\)\s+then\s+return\s+end/.test(leading))
      failures.push(`FAIL  ${rel} — server file missing "if isClient() then return end" in leading executable code`);
    if (side === 'client' && !timedActionClass && !/if\s+isServer\(\)\s+then\s+return\s+end/.test(leading))
      failures.push(`FAIL  ${rel} — client file missing "if isServer() then return end" in leading executable code`);
    if (side === 'shared' && /^if\s+is(?:Server|Client)\(\)\s+then\s+return\s+end/m.test(leading))
      failures.push(`WARN  ${rel} — shared file has an env guard at top (shared files should have no file-level guard)`);
  }

  if (failures.length === 0) return `PASS — all ${luaFiles.length} Lua files have correct environment guards.`;
  return `FAIL — ${failures.length} issue(s) in ${luaFiles.length} file(s):\n\n${failures.join('\n')}`;
}

// ---------- space_audit_workshop_copy ----------
// Enforced every release gate / workshop-meta check:
//   1. workshop.txt must exist
//   2. changenote= is the NEXT push changelog and must name current modversion
//   3. description must not be a placeholder
//   4. workshop.txt mtime must be >= newest lua/scripts/sandbox/translate/preview/poster
//      so copy is updated whenever gameplay or art changes
async function auditWorkshopCopy(rawPath) {
  const root = validateLocalPath(rawPath);
  const findings = [];
  const allFiles = await walkFiles(root);
  let workshopTxt = allFiles.find((f) => f.endsWith("workshop.txt") && !f.includes("node_modules"));
  if (!workshopTxt) workshopTxt = await findAncestorWorkshopTxt(root);
  if (!workshopTxt) {
    findings.push({
      severity: "high",
      path: describePath(root),
      rule: "workshop_copy_missing",
      issue: "workshop.txt not found — cannot verify Workshop description or changelog.",
      recommendation: "Put workshop.txt at the package root used for in-game / Steam pushes.",
    });
    return JSON.stringify({ findings });
  }

  const wtRel = describePath(workshopTxt);
  const wtText = await readFile(workshopTxt, "utf8");
  const wt = parseWorkshopTxt(wtText);
  const wtStat = await stat(workshopTxt);

  if (/PLACEHOLDER|replace before releas/i.test(wtText)) {
    findings.push({
      severity: "high",
      path: wtRel,
      rule: "workshop_copy_placeholder",
      issue: "workshop.txt still contains placeholder copy.",
      recommendation: "Rewrite title/description for the live feature set before push.",
    });
  }

  const changenote = String(wt.changenote || "").trim();
  if (!changenote) {
    findings.push({
      severity: "high",
      path: wtRel,
      rule: "workshop_copy_changenote_missing",
      issue: "workshop.txt is missing changenote= (the changelog for the NEXT Workshop push).",
      recommendation: "Add changenote=v<modversion> — <what changed>. Update it on every feature change, then paste it into the in-game changelog field on push.",
    });
  }

  const modInfoFiles = allFiles.filter((f) => f.endsWith("mod.info"));
  let modversion = "";
  for (const mi of modInfoFiles) {
    if (!/[\\/]42[\\/]mod\.info$/.test(mi)) continue;
    const text = await readFile(mi, "utf8");
    const m = text.match(/^\s*modversion\s*=\s*(.+)$/m);
    if (m) {
      modversion = m[1].trim();
      break;
    }
  }
  if (modversion && changenote && !changenote.includes(modversion)) {
    findings.push({
      severity: "high",
      path: wtRel,
      rule: "workshop_copy_changenote_version",
      issue: `changenote= does not name current modversion ${modversion}.`,
      recommendation: `Start changenote with v${modversion} so the next push changelog matches this build.`,
    });
  }

  const desc = String(wt.description || "");
  if (desc.length < 80) {
    findings.push({
      severity: "high",
      path: wtRel,
      rule: "workshop_copy_description_thin",
      issue: "workshop.txt description is too short to describe the live mod.",
      recommendation: "Keep the Steam BBCode body in sync with current features, commands, and sandbox options.",
    });
  }

  let newestMs = 0;
  let newestRel = "";
  for (const file of allFiles) {
    const norm = file.replace(/\\/g, "/");
    if (norm.endsWith("workshop.txt")) continue;
    if (!/\/(media\/lua\/|media\/scripts\/|sandbox-options\.txt$|Translate\/|preview\.png$|poster\.png$)/i.test(norm)) continue;
    if (/\.bak$/i.test(norm)) continue;
    const st = await stat(file);
    const ms = st.mtimeMs || 0;
    if (ms > newestMs) {
      newestMs = ms;
      newestRel = describePath(file);
    }
  }
  if (newestMs && newestMs > wtStat.mtimeMs + 2000) {
    findings.push({
      severity: "high",
      path: wtRel,
      rule: "workshop_copy_stale",
      issue: `workshop.txt is older than ${newestRel}. Description/changelog are out of date for this change.`,
      recommendation: "Update workshop.txt description AND changenote= to match the change, then save workshop.txt last so this gate passes.",
    });
  }

  return JSON.stringify({ findings });
}

async function formatWorkshopCopyAudit(rawPath) {
  const parsed = JSON.parse(await auditWorkshopCopy(rawPath));
  const findings = parsed.findings || [];
  if (!findings.length) return "PASS — workshop.txt description and changenote are current.";
  const highs = findings.filter((f) => f.severity === "high");
  const lines = findings.map((f) => `${(f.severity || "high").toUpperCase()}  ${f.rule}: ${f.issue}`);
  return `${highs.length ? "FAIL" : "REVIEW"} — workshop copy (${findings.length} finding(s)):\n\n${lines.join("\n")}`;
}

// ---------- space_validate_workshop_meta ----------
async function validateWorkshopMeta(rawPath) {
  const root = validateLocalPath(rawPath);
  const failures = [];
  const warnings = [];

  // Locate mod.info files
  const allFiles = await walkFiles(root);
  const modInfoFiles = allFiles.filter(f => f.endsWith('mod.info'));

  if (modInfoFiles.length === 0) {
    return 'FAIL — no mod.info files found under the given path.';
  }

  for (const modInfo of modInfoFiles) {
    const text = await readFile(modInfo, 'utf8');
    const rel = describePath(modInfo);

    const required = ['id=', 'name=', 'description=', 'author='];
    for (const field of required) {
      if (!text.includes(field)) failures.push(`FAIL  ${rel} — missing required field: ${field}`);
    }
    if (!/versionMin=42\./.test(text))
      failures.push(`FAIL  ${rel} — versionMin must be "42.x" (e.g. versionMin=42.0), not bare "42"`);
    if (/require\s*=\s*base/.test(text))
      failures.push(`FAIL  ${rel} — "require=base" is invalid; "base" is not a mod ID — remove this line`);
    if (/authors\s*=/.test(text))
      warnings.push(`WARN  ${rel} — use "author=" not "authors=" (field name matters)`);
  }

  // Check both mod.info copies exist: root-level and 42/ level
  const hasRoot42 = modInfoFiles.some(f => /Contents[/\\]mods[/\\][^/\\]+[/\\]42[/\\]mod\.info/.test(f));
  const hasRootCopy = modInfoFiles.some(f => /Contents[/\\]mods[/\\][^/\\]+[/\\]mod\.info$/.test(f) && !/42[/\\]mod\.info$/.test(f));
  if (!hasRoot42)    failures.push('FAIL — missing Contents/mods/<ModId>/42/mod.info (required for game version gating)');
  if (!hasRootCopy)  failures.push('FAIL — missing Contents/mods/<ModId>/mod.info root copy (required for dedicated server discovery)');

  // Check workshop.txt (this folder, any descendant, or a parent package root)
  let workshopTxt = allFiles.find(f => f.endsWith('workshop.txt') && !f.includes('node_modules'));
  if (!workshopTxt) workshopTxt = await findAncestorWorkshopTxt(root);
  if (!workshopTxt) {
    failures.push('FAIL — workshop.txt not found');
  } else {
    const wt = await readFile(workshopTxt, 'utf8');
    const rel = describePath(workshopTxt);
    for (const field of ['version=', 'title=', 'description=', 'visibility=', 'tags=']) {
      if (!wt.includes(field)) failures.push(`FAIL  ${rel} — missing required field: ${field}`);
    }
    if (!/Build 42/.test(wt)) warnings.push(`WARN  ${rel} — tags should include "Build 42"`);
  }

  const copy = JSON.parse(await auditWorkshopCopy(root));
  for (const f of copy.findings || []) {
    const line = `${f.rule} — ${f.issue}`;
    if (f.severity === "high") failures.push(`FAIL  ${line}`);
    else warnings.push(`WARN  ${line}`);
  }

  const all = [...failures, ...warnings];
  if (failures.length === 0) return `PASS${warnings.length ? ' (with warnings)' : ''} — workshop metadata looks correct.\n\n${warnings.join('\n')}`.trim();
  return `FAIL — ${failures.length} error(s), ${warnings.length} warning(s):\n\n${all.join('\n')}`;
}

// ---------- space_validate_file_structure ----------
async function validateFileStructure(rawPath) {
  const root = validateLocalPath(rawPath);
  const failures = [];
  const warnings = [];

  const allFiles = await walkFiles(root);
  const relFiles = allFiles.map(f => f.replace(/\\/g, '/'));

  // workshop.txt at this folder or an ancestor Workshop package root
  const workshopHere = relFiles.some(f => /workshop\.txt$/.test(f) && f.split('/').length - root.replace(/\\/g, '/').split('/').length <= 1);
  if (!workshopHere && !(await findAncestorWorkshopTxt(root)))
    failures.push('FAIL — workshop.txt missing at mod root');

  // preview.png at root
  if (!relFiles.some(f => /preview\.png$/i.test(f) && f.split('/').length - root.replace(/\\/g, '/').split('/').length <= 1))
    failures.push('FAIL — preview.png missing at mod root (256×256 PNG, mandatory for Workshop card)');

  // Contents/mods/<ModId>/mod.info (root copy)
  if (!relFiles.some(f => /Contents\/mods\/[^/]+\/mod\.info$/.test(f) && !/42\/mod\.info$/.test(f)))
    failures.push('FAIL — missing Contents/mods/<ModId>/mod.info (root copy — dedicated server discovery requires this)');

  // Contents/mods/<ModId>/42/mod.info
  if (!relFiles.some(f => /Contents\/mods\/[^/]+\/42\/mod\.info$/.test(f)))
    failures.push('FAIL — missing Contents/mods/<ModId>/42/mod.info');

  // poster.png inside 42/
  if (!relFiles.some(f => /Contents\/mods\/[^/]+\/42\/poster\.png$/i.test(f)))
    failures.push('FAIL — missing Contents/mods/<ModId>/42/poster.png (256×256 PNG, mandatory for in-game mod list)');

  // Lua files must be in subdirectories of media/lua/, never directly in media/lua/
  const luaDirect = relFiles.filter(f => /\/media\/lua\/[^/]+\.lua$/.test(f));
  if (luaDirect.length > 0)
    failures.push(`FAIL — ${luaDirect.length} Lua file(s) directly in media/lua/ — they will not be loaded; place them in media/lua/client/, server/, or shared/`);

  // sandbox-options.txt implies either Sandbox_EN.txt (TXT) or Sandbox.json (JSON)
  const hasSandbox = relFiles.some(f => /sandbox-options\.txt$/.test(f));
  const hasSandboxTranslation = relFiles.some(f => /Translate\/EN\/Sandbox_EN\.txt$/.test(f))
    || relFiles.some(f => /Translate\/EN\/Sandbox\.json$/.test(f));
  if (hasSandbox && !hasSandboxTranslation)
    warnings.push('WARN — sandbox-options.txt found but no sandbox translation file detected (expected Translate/EN/Sandbox_EN.txt or Translate/EN/Sandbox.json)');

  const all = [...failures, ...warnings];
  if (failures.length === 0) return `PASS${warnings.length ? ' (with warnings)' : ''} — file structure looks correct.\n\n${warnings.join('\n')}`.trim();
  return `FAIL — ${failures.length} structural error(s), ${warnings.length} warning(s):\n\n${all.join('\n')}`;
}

// ---------- space_validate_b42_changes ----------
async function validateB42Changes(rawPath) {
  const root = validateLocalPath(rawPath);
  const info = await stat(root);
  const luaFiles = info.isDirectory()
    ? (await walkFiles(root)).filter(f => f.endsWith('.lua'))
    : [root].filter(f => f.endsWith('.lua'));

  const scriptFiles = info.isDirectory()
    ? (await walkFiles(root)).filter(f => f.endsWith('.txt') && f.includes('scripts'))
    : [];

  const failures = [];

  // Lua checks
  for (const file of luaFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split(/\r?\n/);
    const rel = describePath(file);

    lines.forEach((line, idx) => {
      const loc = `${rel}:${idx + 1}`;
      // Broken hasTag API
      if (/item:hasTag\s*\(\s*["']/.test(line))
        failures.push(`HIGH  ${loc} — item:hasTag(string) is broken in B42; use ItemTag.get(ResourceLocation.of("base:tagname")) then item:hasTag(tag)`);
      // Removed events
      if (/Events\.OnFillVehicleMenu\.Add/.test(line))
        failures.push(`HIGH  ${loc} — Events.OnFillVehicleMenu removed in B42; use Events.OnFillWorldObjectContextMenu + square:getVehicleContainer()`);
      if (/Events\.OnExitVehicle\.Add/.test(line))
        failures.push(`HIGH  ${loc} — Events.OnExitVehicle removed in B42.18; use EveryOneMinute polling with a lastVehicle local`);
      // Removed API
      if (/getAttachmentsProvided\s*\(/.test(line))
        failures.push(`HIGH  ${loc} — item:getAttachmentsProvided() removed in B42.18; use item:DoParam(...) for attachment data`);
      // Deprecated getObjectById for zombies
      if (/getObjectById\s*\(/.test(line))
        failures.push(`WARN  ${loc} — getObjectById() unreliable for IsoZombie in B42.17+; iterate getObjectListForLua() with instanceof filter`);
      // isEngineStarted() is true DURING CRANKING, not when running — common semantic mistake
      if (/\bisEngineStarted\s*\(\s*\)/.test(line))
        failures.push(`WARN  ${loc} — vehicle:isEngineStarted() is true DURING CRANKING (not fully running); use vehicle:isEngineRunning() to detect a fully operational engine`);
      // Old item names — only flag in string/item-ID contexts to reduce false positives
      if (/["'](?:Base\.)?Stone["'](?!2)/.test(line) || /\bBase_Stone\b(?!2)/.test(line))
        failures.push(`WARN  ${loc} — "Stone" renamed to "Stone2" in B42`);
      if (/["'](?:Base\.)?WoodenStick["'](?!2)/.test(line) || /\bBase_WoodenStick\b(?!2)/.test(line))
        failures.push(`WARN  ${loc} — "WoodenStick" renamed to "WoodenStick2" in B42`);
      if (/["'](?:Base\.)?TreeBranch["'](?!2)/.test(line) || /\bBase_TreeBranch\b(?!2)/.test(line))
        failures.push(`WARN  ${loc} — "TreeBranch" renamed to "TreeBranch2" in B42`);
      // getObjectList -> getObjectListForLua
      if (/getObjectList\s*\(\s*\)/.test(line) && !/getObjectListForLua/.test(line))
        failures.push(`HIGH  ${loc} — IsoCell:getObjectList() renamed to IsoCell:getObjectListForLua() in B42.17`);
      // cell:getZombieList
      if (/getZombieList\s*\(/.test(line))
        failures.push(`HIGH  ${loc} — cell:getZombieList() removed in B42.17; use getObjectListForLua() with instanceof filter`);
    });
  }

  // Script file checks
  for (const file of scriptFiles) {
    const text = await readFile(file, 'utf8');
    const lines = text.split(/\r?\n/);
    const rel = describePath(file);

    lines.forEach((line, idx) => {
      const loc = `${rel}:${idx + 1}`;
      if (/^\s*Type\s*=\s*(Weapon|Food|Drainable|Clothing|Container|Normal)/.test(line))
        failures.push(`FAIL  ${loc} — old script format "Type = X"; use "ItemType = base:x" in B42`);
      if (/^\s*recipe\s+\w/.test(line))
        failures.push(`WARN  ${loc} — old recipe format "recipe Name { }"; B42 uses "craftRecipe Name { time=, inputs { }, outputs { } }"`);
    });

    let inInputs = false;
    let wildcardSeen = false;
    let lastTagsLine = "";
    let lastTagsLoc = "";
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const loc = `${rel}:${idx + 1}`;
      if (/^\s*Tags\s*=/.test(line)) {
        lastTagsLine = line;
        lastTagsLoc = loc;
      }
      if (/^\s*inputs\s*\{/.test(line)) {
        inInputs = true;
        wildcardSeen = false;
        if (lastTagsLine && /InHandCraft/.test(lastTagsLine) && !/CanBeDoneFromFloor/.test(lastTagsLine) && !/AnySurfaceCraft/.test(lastTagsLine)) {
          failures.push(`WARN  ${lastTagsLoc} — InHandCraft without CanBeDoneFromFloor hides floor/nearby-container ingredients; vanilla SawLogs uses InHandCraft;CanBeDoneFromFloor`);
        }
        continue;
      }
      if (inInputs) {
        if (/^\s*item\s+/.test(line)) {
          const isWild = /\[\s*\*\s*\]/.test(line);
          if (wildcardSeen && !isWild) {
            failures.push(`HIGH  ${loc} — craftRecipe wildcard [*] must be the last input; earlier [*] steals typed/tag slots`);
          }
          if (isWild) wildcardSeen = true;
        }
        if (/^\s*\}/.test(line)) inInputs = false;
      }
    }
  }

  if (failures.length === 0) return `PASS — no B42 breaking change violations found across ${luaFiles.length} Lua file(s) and ${scriptFiles.length} script file(s).`;
  return `FAIL — ${failures.length} issue(s) found:\n\n${failures.join('\n')}`;
}


// ---------- space_audit_mastery_system ----------
async function auditMasterySystem(rawPath) {
  const root = validateLocalPath(rawPath);
  const info = await stat(root);
  if (!info.isDirectory()) throw new Error("path is not a directory");

  const files = await walkFiles(root);
  const luaFiles = files.filter(isPublishableLua);
  const scriptFiles = files.filter((file) => /[\\/]42(?:\.\d+)?[\\/]media[\\/]scripts[\\/].*\.txt$/i.test(file));
  const findings = [];

  function rel(file) {
    return describePath(file);
  }

  function firstLine(text, pattern) {
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) return i + 1;
    }
    return null;
  }

  const packagedConfig = files.find((file) =>
    /[\\/]Contents[\\/]mods[\\/][^\\/]+[\\/]42(?:\.\d+)?[\\/]media[\\/]lua[\\/]shared[\\/]MasteryConfig\.lua$/i.test(file),
  );
  const looseConfig = files.find((file) =>
    /[\\/]media[\\/]lua[\\/]shared[\\/]MasteryConfig\.lua$/i.test(file)
    && !/[\\/]Contents[\\/]mods[\\/]/i.test(file),
  );

  if (!packagedConfig) {
    addRisk(
      findings,
      "high",
      describePath(root),
      null,
      "mastery_config_not_packaged",
      "MasteryConfig.lua is not present in the packaged B42 shared Lua folder.",
      "Place it at Contents/mods/<ModId>/42/media/lua/shared/MasteryConfig.lua.",
      looseConfig ? rel(looseConfig) : "not found",
    );
  }

  const wrongTraitScripts = files.filter((file) =>
    /[\\/]42(?:\.\d+)?[\\/]scripts[\\/].*Mastery.*\.txt$/i.test(file),
  );
  for (const file of wrongTraitScripts) {
    addRisk(
      findings,
      "high",
      rel(file),
      1,
      "mastery_traits_wrong_script_path",
      "Mastery trait scripts under 42/scripts are not in the normal B42 media script path.",
      "Move trait scripts to Contents/mods/<ModId>/42/media/scripts/.",
      rel(file),
    );
  }

  const masteryTraitScripts = scriptFiles.filter((file) => /Mastery.*\.txt$/i.test(file));
  if (!masteryTraitScripts.length) {
    addRisk(
      findings,
      "medium",
      describePath(root),
      null,
      "mastery_traits_missing",
      "No Mastery trait script was found under 42/media/scripts.",
      "Add a script file defining every config-generated rank and ultimate trait ID.",
      "searched 42/media/scripts",
    );
  }

  let configText = "";
  if (packagedConfig) configText = await readFile(packagedConfig, "utf8");

  const luaTexts = [];
  for (const file of luaFiles) {
    luaTexts.push({ file, text: await readFile(file, "utf8") });
  }

  const scriptText = (await Promise.all(masteryTraitScripts.map((file) => readFile(file, "utf8")))).join("\n");

  if (configText && /Perks\s*\[\s*skillName\s*\]/.test(configText)) {
    addRisk(findings, "high", rel(packagedConfig), firstLine(configText, /Perks\s*\[\s*skillName\s*\]/), "dynamic_perk_lookup", "MasteryConfig uses config/display keys for dynamic Perks lookup.", "Use an explicit PERK_BY_SKILL map and nil-check the resolved perk before getPerkLevel().", "Perks[skillName]");
  }

  if (configText && /function\s+MasteryConfig\.canSelect[\s\S]*player:getPerkLevel/.test(configText)) {
    for (const { file, text } of luaTexts.filter((entry) => detectLuaSide(entry.file) === "client")) {
      const line = firstLine(text, /MasteryConfig\.canSelect\s*\(/);
      if (line) addRisk(findings, "medium", rel(file), line, "client_calls_authority_validation", "Client UI calls MasteryConfig.canSelect(), which also performs player perk validation.", "Keep server-authority validation on the server; expose side-safe display helpers for UI availability labels.", "MasteryConfig.canSelect(...)");
    }
  }

  for (const { file, text } of luaTexts) {
    const line = firstLine(text, /MasteryManager:canSelect\s*\(/);
    if (line && !/function\s+MasteryManager:canSelect/.test(text)) {
      addRisk(findings, "high", rel(file), line, "wrong_canselect_owner", "Code calls MasteryManager:canSelect(), but this function is not defined in that file.", "Call MasteryConfig.canSelect(...) or add a real MasteryManager:canSelect wrapper consistently.", "MasteryManager:canSelect(...)");
    }

    const lines = text.split(/\r?\n/);
    const argsLine = firstLine(text, /if\s+not\s+args\.\w+/);
    if (argsLine && !/not\s+args\s+or/.test(lines[argsLine - 1])) {
      addRisk(findings, "high", rel(file), argsLine, "args_indexed_before_nil_check", "Command validation indexes args before proving args exists.", "Use if not args or not args.skillName ... before reading fields.", lines[argsLine - 1].trim());
    }

    if (/OnClientCommand/.test(text) && /args\.rank/.test(text) && !/(tonumber\s*\(\s*args\.rank|math\.floor\s*\(|rank\s*<\s*1|rank\s*>\s*MasteryConfig\.maxRank)/.test(text)) {
      addRisk(findings, "medium", rel(file), firstLine(text, /args\.rank/), "rank_not_type_checked", "Client command accepts rank without visible numeric integer/range validation.", "Convert with tonumber(), require integer rank, and enforce 1..MasteryConfig.maxRank.", "args.rank");
    }

    if (/table\.insert\s*\([^)]*History/.test(text) || (/Mastery\.History/.test(text) && /score\s*=\s*score\s*\+/.test(text))) {
      addRisk(findings, "medium", rel(file), firstLine(text, /History/), "append_only_history_prereq", "Mastery history appears to be used for prerequisite scoring or appended without dedupe.", "Use current per-skill state for prerequisites. Keep history only as an audit log with dedupe/versioning.", "Mastery.History");
    }

    if (/ISCharacterInfoWindow\.createChildren\s*=/.test(text) && !/(Mastery.*Patch|patch.*Installed|__Mastery|masteryPatchInstalled)/i.test(text)) {
      addRisk(findings, "low", rel(file), firstLine(text, /ISCharacterInfoWindow\.createChildren\s*=/), "ui_patch_no_duplicate_guard", "ISCharacterInfoWindow.createChildren is wrapped without an obvious duplicate-install guard.", "Add a file/global flag so Lua reloads cannot stack wrappers or duplicate Mastery tabs.", "ISCharacterInfoWindow.createChildren = function(self)");
    }
  }

  if (/^\s*trait\s+/m.test(scriptText) && !/character_trait_definition/.test(scriptText)) {
    addRisk(findings, "medium", masteryTraitScripts.length ? rel(masteryTraitScripts[0]) : describePath(root), firstLine(scriptText, /^\s*trait\s+/m), "trait_script_format_unverified", "Mastery traits use `trait ... { name = ... }` blocks, not B42 vanilla `character_trait_definition` blocks.", "Verify this script surface works in B42, or convert to the same character_trait_definition format used by vanilla traits.", "trait Mastery_...");
  }

  const luaAll = luaTexts.map((entry) => entry.text).join("\n");
  const customEffectFields = [...scriptText.matchAll(/\b(SpeedModifier|ConstructionBonus)\s*=/g)].map((m) => m[1]);
  if (customEffectFields.length) {
    for (const field of [...new Set(customEffectFields)]) {
      const occurrences = (luaAll.match(new RegExp(`\\b${field}\\b`, "g")) || []).length;
      if (!occurrences) {
        addRisk(findings, "high", masteryTraitScripts.length ? rel(masteryTraitScripts[0]) : describePath(root), firstLine(scriptText, new RegExp(`\\b${field}\\s*=`)), "custom_trait_field_inert", `Trait script field ${field} is declared but no Lua code reads it.`, "Add Lua effect handlers for timed actions/crafting/construction, or document the field as inert metadata.", `${field} = ...`);
      }
    }
  }

  if (configText) {
    const newSchema = extractFunctionBody(configText, "_getActiveFromNewSchema") || "";
    if (newSchema) {
      if (!/local\s+ult1\s*=\s*capstoneId\b/.test(newSchema)) {
        addRisk(
          findings,
          "high",
          rel(packagedConfig),
          firstLine(configText, /local\s+ult1\s*=/),
          "getactive_ult_not_capstone_only",
          "MasteryConfig.getActive new-schema path does not bind ult1 to capstoneId only.",
          "3-value callers treat ult1 as the capstone. Bind `local ult1 = capstoneId` and do not fall back to the T5 specialization name (Electrical Locksmith collision).",
          "local ult1 = capstoneId",
        );
      }
      if (/ult1\s*=\s*(specName|earlyPath|committedPath)\b/.test(newSchema) || /capstoneId\s+or\s+(specName|earlyPath)/.test(newSchema)) {
        addRisk(
          findings,
          "high",
          rel(packagedConfig),
          firstLine(newSchema, /ult1\s*=/),
          "getactive_ult_t5_fallback",
          "getActive falls back from capstoneId to a T5 spec/earlyPath name.",
          "Capstone abilities must stay nil until a Capstone.* selection exists. T5 names can collide with capstone ids.",
          "ult1 fallback",
        );
      }
    }
  }

  const internalTraits = [];
  for (const { file, text } of luaTexts) {
    for (const match of text.matchAll(/internalTrait\s*=\s*["']([^"']+)["']/g)) {
      internalTraits.push({ file, id: match[1], index: match.index });
    }
  }
  const missingInternal = internalTraits.filter((entry) => !scriptText.includes(entry.id));
  if (missingInternal.length) {
    const sample = [...new Set(missingInternal.map((entry) => entry.id))].slice(0, 12);
    addRisk(
      findings,
      "high",
      masteryTraitScripts.length ? rel(masteryTraitScripts[0]) : describePath(root),
      null,
      "internal_trait_missing_from_scripts",
      `${sample.length === missingInternal.length ? missingInternal.length : `${missingInternal.length}`} internalTrait id(s) are missing from MasteryTraits scripts.`,
      "Regenerate MasteryTraits.txt from authored Path internalTrait fields (Mastery_<Skill>_<Discipline>_<Path>_TierN / Capstone).",
      sample.join(", "),
    );
  }

  if (luaAll.includes("MasteryFootstepNoise") || /WEIGHT_NORMAL\s*=/.test(luaAll)) {
    const min = luaAll.match(/WEIGHT_MIN\s*=\s*(\d+)/);
    const nrm = luaAll.match(/WEIGHT_NORMAL\s*=\s*(\d+)/);
    const max = luaAll.match(/WEIGHT_MAX\s*=\s*(\d+)/);
    if (!min || min[1] !== "60" || !nrm || nrm[1] !== "80" || !max || max[1] !== "100") {
      addRisk(
        findings,
        "medium",
        "MasteryFootstepNoise.lua",
        null,
        "footstep_weight_band",
        "Footstep extra-ping weight band is not 60 / 80 / 100 (Nutrition getWeight).",
        "Clamp Nutrition:getWeight() to 60 (unhealthy-light floor), 80 (normal / silent walk), 100 (loudness cap).",
        `WEIGHT_MIN=${min?.[1] ?? "missing"} WEIGHT_NORMAL=${nrm?.[1] ?? "missing"} WEIGHT_MAX=${max?.[1] ?? "missing"}`,
      );
    }
  }

  for (const { file, text } of luaTexts) {
    if (/player:setEngineFeature|player:getEngineLoudness/.test(text)) {
      addRisk(
        findings,
        "high",
        rel(file),
        firstLine(text, /player:setEngineFeature|player:getEngineLoudness/),
        "vehicle_noise_api_on_player",
        "Vehicle engine loudness API called on a player. That API is vehicle-only and does not change footsteps.",
        "For extra zombie hearing on foot, use addSound(player, x, y, z, radius, volume) on the server. Leave vanilla footsteps engine-owned.",
        "player:setEngineFeature / player:getEngineLoudness",
      );
    }

    const constants = extractStringConstants(text);
    for (const send of collectNetworkSends(text, "sendClientCommand", constants)) {
      if (send.arity >= 4 && send.playerFirst) continue;
      if (send.arity === 3 && !send.playerFirst) {
        addRisk(
          findings,
          "medium",
          rel(file),
          send.line,
          "sendclientcommand_player_first",
          "sendClientCommand uses the 3-arg module-first form.",
          "Prefer sendClientCommand(player, MODULE_ID, command, args) so hosted-host and dedicated share one call shape.",
          send.evidence,
        );
      }
    }
  }

  if (/ATTR_TIERS[\s\S]{0,800}Cunning/.test(luaAll) && /base:graceful|base:inconspicuous/.test(luaAll)) {
    if (!/CharacterTrait\.get\s*\(/.test(luaAll) || !/ResourceLocation\.of\s*\(/.test(luaAll)) {
      addRisk(
        findings,
        "high",
        describePath(root),
        null,
        "cunning_trait_api",
        "Cunning trait grants exist but CharacterTrait.get(ResourceLocation.of(...)) is missing.",
        "B42 hasTrait(string) throws. Resolve CharacterTrait.get(ResourceLocation.of(\"base:graceful\")) then getCharacterTraits():add/remove.",
        "base:graceful / base:inconspicuous",
      );
    }
  }

  sortFindings(findings);
  return JSON.stringify({
    checked_root: describePath(root),
    lua_files: luaFiles.length,
    mastery_script_files: masteryTraitScripts.map(rel),
    findings,
    recommended_status: findings.some((f) => f.severity === "high")
      ? "blocked"
      : findings.some((f) => f.severity === "medium")
        ? "needs review"
        : "mastery audit passed",
  }, null, 2);
}

// ---- space_find_bare_gettext -------------------------------------------
// Flags getText("literal") calls outside tr()/tryText() helpers (pitfall #58).
async function auditBareGettext(rawPath) {
  const target = validateLocalPath(rawPath);
  const info = await stat(target);
  const files = info.isDirectory()
    ? (await walkFiles(target)).filter(isPublishableLua)
    : [target].filter((file) => extname(file).toLowerCase() === ".lua");
  const findings = [];
  for (const file of files) {
    const text = await readFile(file, "utf8").catch(() => "");
    const lines = text.split(/\r?\n/);
    let helperDepth = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const stripped = line.replace(/--.*$/, "");
      if (helperDepth === 0 && /function\s+[\w.:]*\b(tr|tryText)\s*\(/.test(stripped)) {
        helperDepth = 1;
        continue;
      }
      if (helperDepth > 0) {
        if (/\bfunction\b|\bthen\b|\bdo\b|\brepeat\b/.test(stripped)) helperDepth++;
        if (/\bend\b/.test(stripped)) helperDepth--;
        continue;
      }
      if (/^\s*--/.test(line)) continue;
      if (/\bgetText(?:OrNull)?\s*\(\s*["']/.test(stripped)) {
        findings.push({
          severity: "medium",
          path: describePath(file),
          line: i + 1,
          rule: "bare_gettext",
          issue: "Bare getText(\"...\") bypasses the mod tr()/tryText() helper and can leak raw keys in-game.",
          recommendation: "Route player-facing text through tr(key, fallback) or tryText(key, fallback). Vanilla keys may stay as getText only when that is the established convention for this mod.",
          evidence: line.trim(),
        });
      }
    }
  }
  return JSON.stringify({ findings });
}

async function findBareGettext(pathArg) {
  const parsed = JSON.parse(await auditBareGettext(pathArg));
  const hits = parsed.findings || [];
  if (!hits.length) return "OK: no bare getText() calls with string literals found (tr/tryText helpers exempt).";
  return `WARN: ${hits.length} bare getText() call(s) found.\nRoute player-facing text through tr(key, fallback) or tryText(key, fallback).\n\n${hits.map((h) => `  ${h.path}:${h.line}\n  ${h.evidence}`).join("\n\n")}`;
}

// ---- space_list_todo_items ---------------------------------------------
async function listTodoItems(pathArg, maxResults = 50) {
  const target = await resolveLocalPath(pathArg);
  const info = await stat(target);
  const files = info.isDirectory() ? await walkLua(target) : [target];
  const pattern = /\b(TODO|FIXME|HACK|XXX|BUG)\b/;
  const hits = [];
  for (const file of files) {
    const text = await readFile(file, "utf8").catch(() => "");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length && hits.length < maxResults; i++) {
      const m = lines[i].match(pattern);
      if (m) hits.push({ tag: m[0], file: relative(WORKSHOP_ROOT, file).replace(/\\/g, "/"), line: i + 1, text: lines[i].trim() });
    }
    if (hits.length >= maxResults) break;
  }
  if (!hits.length) return "OK: no TODO/FIXME/HACK/XXX/BUG annotations found.";
  const grouped = {};
  for (const h of hits) { if (!grouped[h.tag]) grouped[h.tag] = []; grouped[h.tag].push(`  ${h.file}:${h.line}  ${h.text}`); }
  return `Found ${hits.length} annotation(s):\n\n` + Object.entries(grouped).map(([t, ls]) => `### ${t} (${ls.length})\n${ls.join("\n")}`).join("\n\n");
}

// ---- space_audit_timed_actions -----------------------------------------
// Checks ISBaseTimedAction subclasses for pitfalls #24 and #26.
async function auditTimedActions(pathArg) {
  const target = await resolveLocalPath(pathArg);
  const info = await stat(target);
  const files = info.isDirectory() ? await walkLua(target) : [target];
  const issues = [];
  for (const file of files) {
    const text = await readFile(file, "utf8").catch(() => "");
    const rel = relative(WORKSHOP_ROOT, file).replace(/\\/g, "/");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/(local\s+)?(\w+)\s*=\s*ISBaseTimedAction\s*:\s*derive\s*\(/);
      if (!m) continue;
      const isLocal = !!m[1];
      const aName = m[2];
      if (isLocal) {
        issues.push(`FAIL  ${rel}:${i + 1}  "${aName}" declared as local — must be a global with mod prefix for MP (pitfall #24)`);
        continue;
      }
      // Check function bodies for required parent calls and maxTime.
      const checkBody = (fnSuffix, reqPat, pitfall, msg) => {
        const idx = text.indexOf(`function ${aName}:${fnSuffix}`);
        if (idx === -1) return;
        const fnLine = text.substring(0, idx).split("\n").length;
        let found = false;
        for (let j = fnLine - 1; j < Math.min(fnLine + 40, lines.length); j++) {
          if (new RegExp(reqPat).test(lines[j])) { found = true; break; }
          if (j > fnLine && /^\s*end\s*$/.test(lines[j])) break;
        }
        if (!found) issues.push(`WARN  ${rel}:${fnLine}  ${aName}:${fnSuffix}() ${msg} (pitfall #${pitfall})`);
      };
      checkBody("perform", "ISBaseTimedAction\\.perform", "24", "missing ISBaseTimedAction.perform(self) — action queue stuck");
      checkBody("stop",    "ISBaseTimedAction\\.stop",    "24", "missing ISBaseTimedAction.stop(self) — animation stuck");
      // maxTime check in :new()
      const newIdx = text.indexOf(`function ${aName}:new`);
      if (newIdx !== -1) {
        const newLine = text.substring(0, newIdx).split("\n").length;
        let hasMaxTime = false;
        for (let j = newLine - 1; j < Math.min(newLine + 25, lines.length); j++) {
          if (/\.maxTime\s*=/.test(lines[j])) { hasMaxTime = true; break; }
          if (j > newLine && /^\s*end\s*$/.test(lines[j])) break;
        }
        if (!hasMaxTime) issues.push(`WARN  ${rel}:${newLine}  ${aName}:new() missing o.maxTime — defaults to -1, progress bar never fills (pitfall #26)`);
      }
    }
  }
  if (!issues.length) return "OK: no timed action issues found.";
  return `Found ${issues.length} timed action issue(s):\n\n${issues.join("\n")}`;
}

// ---- space_audit_isadmin_completeness ----------------------------------
// Ensures isAdmin/getAccessLevel guards include all 10 required rank strings (pitfall #43).
async function auditIsAdminCompleteness(pathArg) {
  const target = await resolveLocalPath(pathArg);
  const info = await stat(target);
  const files = info.isDirectory() ? await walkLua(target) : [target];
  const required = ["admin", "moderator", "overseer", "gm", "observer"];
  const issues = [];
  for (const file of files) {
    const text = await readFile(file, "utf8").catch(() => "");
    const rel = relative(WORKSHOP_ROOT, file).replace(/\\/g, "/");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const fnM = lines[i].match(/function\s+(\w*[iI]s[aA]dmin\w*)\s*\(/);
      if (!fnM) continue;
      const body = lines.slice(i, Math.min(i + 30, lines.length)).join("\n").toLowerCase();
      if (!body.includes("getaccesslevel")) continue;
      const missing = required.filter((lvl) => !body.includes(`"${lvl}"`));
      if (missing.length > 0) {
        issues.push(`WARN  ${rel}:${i + 1}  ${fnM[1]}() missing access levels: ${missing.join(", ")} (pitfall #43)\n        Add both cases, e.g. "gm" and "GM".`);
      }
    }
  }
  if (!issues.length) return "OK: all isAdmin-style functions cover the required access levels (admin, moderator, overseer, gm, observer).";
  return `Found ${issues.length} incomplete isAdmin() guard(s):\n\nRequired: admin/Admin, moderator/Moderator, overseer/Overseer, gm/GM, observer/Observer\n\n${issues.join("\n\n")}`;
}

// ---- space_audit_b42_api_traps -----------------------------------------
// Detects B42 API trap patterns documented in pending truths (2026-06-03).
// Rules cover: hasTrait string-arg, HasTrait pascal case, legacy getTraits():add(),
// stale require paths, and createChildren() called before addView/addChild.
// The Java-method presence-guard trap is noted but not auto-detected (too noisy).
async function auditB42ApiTraps(rawPath, options = {}) {
  const wantJson = options && options.json === true;
  const root = await resolveLocalPath(rawPath);
  const info = await stat(root);
  const allFiles = info.isDirectory() ? await walkFiles(root) : [root];

  const luaFiles = allFiles.filter(isPublishableLua);
  const scriptFiles = allFiles.filter((f) => {
    const norm = f.replace(/\\/g, "/");
    return /\/42(?:\.\d+)?\/media\/scripts\/characters\/.*\.txt$/i.test(norm);
  });

  // Extensible map: stale require path → correct path
  const STALE_REQUIRE_PATHS = new Map([
    ["ISUI/ISCharacterInfoWindow", "XpSystem/ISUI/ISCharacterInfoWindow"],
  ]);

  const findings = [];

  // ---- Build subdir module name index ----
  // PZ auto-loads only root-level files in client/, server/, shared/. Files in any
  // subdirectory are invisible to the loader and must be require()d explicitly.
  // When auditing a single file, walk up to the nearest 42/ mod ancestor so the index
  // covers the full mod tree, not just the one target file.
  // (truth b42.lua.subdir-modules-not-autoloaded)
  let subdirScanRoot = root;
  if (!info.isDirectory()) {
    let p = dirname(root);
    for (let depth = 0; depth < 12; depth++) {
      if (/^42(?:\.\d+)?$/.test(basename(p))) { subdirScanRoot = p; break; }
      const parent = dirname(p);
      if (parent === p) break;
      p = parent;
    }
  }
  const subdirScanFiles = subdirScanRoot === root
    ? allFiles
    : await walkFiles(subdirScanRoot).catch(() => []);
  const subdirModuleNames = new Map(); // tableName -> "SubDir/TableName" require path
  for (const f of subdirScanFiles.filter(isPublishableLua)) {
    const norm = f.replace(/\\/g, "/");
    const m = norm.match(/\/media\/lua\/(?:client|server|shared)\/([\w][\w/]*)\/(\w+)\.lua$/i);
    if (!m) continue; // root-level file — auto-loaded by PZ; not a subdir module
    subdirModuleNames.set(m[2], `${m[1]}/${m[2]}`);
  }

  // ---- Lua file scans ----
  for (const file of luaFiles) {
    const rel = describePath(file);
    const text = await readFile(file, "utf8");
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const code = lines[i].replace(/--.*$/, ""); // strip inline comments
      const lineNo = i + 1;

      // Rule: hasTrait with string literal  (truth b42.api.hastrait-string-arg-no-impl-found-b4219)
      if (/:hasTrait\s*\(\s*["']/.test(code)) {
        addRisk(findings, "high", rel, lineNo,
          "hastrait_string_arg",
          ":hasTrait() called with a string literal — throws 'No implementation found for hasTrait(java.lang.String)' in B42.19",
          "Resolve handle first: local h = CharacterTrait.get(ResourceLocation.of(\"ns:id\")); then :hasTrait(h)",
          "b42.api.hastrait-string-arg-no-impl-found-b4219");
      }

      // Rule: PascalCase HasTrait  (truth b42.api.hastrait-string-arg-no-impl-found-b4219)
      if (/:HasTrait\s*\(/.test(code)) {
        addRisk(findings, "high", rel, lineNo,
          "hastrait_pascal_case",
          ":HasTrait() does not exist in B42.19 — PascalCase variant is absent from the exposed Java surface",
          "Use lowercase :hasTrait(characterTraitHandle) with a resolved CharacterTrait handle",
          "b42.api.hastrait-string-arg-no-impl-found-b4219");
      }

      // Rule: legacy getTraits():add()  (truth b42.api.grant-trait-getcharactertraits-add-handle-b4219)
      if (/getTraits\s*\(\s*\)\s*:\s*add\s*\(/.test(code)) {
        addRisk(findings, "high", rel, lineNo,
          "gettraits_add",
          ":getTraits():add() uses the legacy B41 string-trait collection — disconnected from B42 hasTrait() and the trait system",
          "Use player:getCharacterTraits():add(handle) with a resolved CharacterTrait handle",
          "b42.api.grant-trait-getcharactertraits-add-handle-b4219");
      }

      // Rule: stale require paths  (truth b42.layout.ischaracterinfowindow-path-xpsystem-isui)
      for (const [stale, correct] of STALE_REQUIRE_PATHS) {
        const escaped = stale.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`require\\s*["']${escaped}["']`).test(code)) {
          addRisk(findings, "high", rel, lineNo,
            "stale_require_path",
            `require "${stale}" is a B41-era path — file relocated in B42`,
            `Change to: require "${correct}"`,
            "b42.layout.ischaracterinfowindow-path-xpsystem-isui");
        }
      }
    }

    // Rule: module-reference-integrity
    // Flag Name.X(...) or Name:X(...) where Name is a known subdir module in this mod
    // but is not locally bound in this file.
    // Precision: only fires when Name exactly matches a filename in this mod's own
    // shared/*/Name.lua subdir index — engine/vanilla globals never appear there.
    // (truth b42.lua.subdir-modules-not-autoloaded, b42.lua.module-local-not-global)
    if (subdirModuleNames.size > 0) {
      // Collect all binding names that make a PascalCase reference valid in this file:
      //   (a) the file's own base name — a class file legitimately calls itself
      //   (b) local Name = ...
      //   (c) bare global assignments: Name = ... (no local) e.g. ISMasteryPanel = ISPanel:derive(...)
      const localBindings = new Set();
      localBindings.add(basename(file, ".lua"));
      for (const ln of lines) {
        const c = ln.replace(/--.*$/, "");
        const lm = c.match(/^\s*local\s+([\w,\s]+?)(?:\s*=|$)/);
        if (lm) {
          for (const part of lm[1].split(",")) {
            const nm = part.trim().split(/\s+/)[0];
            if (nm) localBindings.add(nm);
          }
          continue;
        }
        // Bare global assignment: captures ISMasteryPanel = ISPanel:derive(...), MasterySystem = ...
        const gm = c.match(/^\s*([A-Z][A-Za-z0-9_]*)\s*=/);
        if (gm) localBindings.add(gm[1]);
      }
      for (let i = 0; i < lines.length; i++) {
        const code = lines[i].replace(/--.*$/, "");
        const refs = [...code.matchAll(/\b([A-Z][A-Za-z0-9_]*)\s*[.:]\s*\w+\s*\(/g)];
        for (const ref of refs) {
          const name = ref[1];
          if (!subdirModuleNames.has(name)) continue; // not a subdir module in this mod
          if (localBindings.has(name)) continue;      // properly bound — ok
          const reqPath = subdirModuleNames.get(name);
          addRisk(findings, "high", rel, i + 1,
            "module_reference_integrity",
            `"${name}" used as a module table but not require()-bound in this file — ` +
              `shared/ subdir files are not auto-loaded by PZ; bare global evaluates to nil`,
            `Add near the top of this file: local ${name} = require "${reqPath}"`,
            "b42.lua.subdir-modules-not-autoloaded");
          break; // one finding per line is enough
        }
      }
    }

    // Rule: require() targets must return a module table
    // (truth b42.lua.require-must-return-module-table — pending until approved)
    {
      const luaSources = [];
      for (const file of luaFiles) {
        luaSources.push({ path: file, text: await readFile(file, "utf8") });
      }
      for (const finding of findRequireMissingReturns(luaSources)) {
        addRisk(
          findings,
          finding.severity,
          describePath(finding.path),
          finding.line,
          finding.rule,
          finding.issue,
          finding.recommendation,
          finding.evidence,
        );
      }
    }

    // Rule: varExpr:createChildren() immediately before addView/addChild in same scope
    // (truth b42.ui.istabpanel-addview-no-preheat-createchildren)
    for (let i = 0; i < lines.length; i++) {
      const code = lines[i].replace(/--.*$/, "");
      // Skip function definitions (line starts with 'function')
      if (/^\s*function\s+/.test(code)) continue;
      // Match  varExpr:createChildren()  — must be a call, not a definition
      const m = code.match(/^\s*([\w.]+)\s*:\s*createChildren\s*\(\s*\)/);
      if (!m) continue;
      const varExpr = m[1];
      // Exclude bare 'self' (internal base-class forward calls like ISPanel.createChildren(self) use dot anyway)
      if (varExpr === "self") continue;
      // The leaf name to look for in the addView/addChild lines
      const leaf = varExpr.split(".").pop();
      // Look ahead up to 8 lines for addView or addChild that also references our variable
      const window8 = lines.slice(i + 1, Math.min(lines.length, i + 9));
      const triggered = window8.some((l) => {
        const c = l.replace(/--.*$/, "");
        return (c.includes("addView") || c.includes("addChild")) && c.includes(leaf);
      });
      if (triggered) {
        addRisk(findings, "medium", rel, i + 1,
          "createchildren_before_addview",
          `${varExpr}:createChildren() called before addView/addChild — premature javaObject creation outside the parent hierarchy; click events may not be registered`,
          "Remove the :createChildren() call; addView/addChild triggers instantiate() → createChildren() automatically at the correct time",
          "b42.ui.istabpanel-addview-no-preheat-createchildren");
      }
    }
  }

  // ---- Scripts file scans: mixed-case CharacterTrait IDs ----
  // (truth b42.api.character-trait-registry-id-lowercase)
  for (const file of scriptFiles) {
    const rel = describePath(file);
    const text = await readFile(file, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNo = i + 1;

      // character_trait_definition namespace:VALUE — value part must be lowercase
      const blockM = line.match(/^\s*character_trait_definition\s+\S+?:([A-Za-z0-9_]+)/i);
      if (blockM) {
        const val = blockM[1];
        if (/[A-Z]/.test(val)) {
          addRisk(findings, "medium", rel, lineNo,
            "character_trait_id_uppercase",
            `character_trait_definition ID value "${val}" contains uppercase — B42 registry lookup is case-sensitive; mixed-case causes CharacterTraitDefinition.<init> NPE`,
            "Use all-lowercase for the trait ID value part (after the namespace colon)",
            "b42.api.character-trait-registry-id-lowercase");
        }
      }

      // CharacterTrait = namespace:VALUE — value part must be lowercase
      const fieldM = line.match(/\bCharacterTrait\s*=\s*\S+?:([A-Za-z0-9_]+)/);
      if (fieldM) {
        const val = fieldM[1].replace(/,$/, "").trim();
        if (/[A-Z]/.test(val)) {
          addRisk(findings, "medium", rel, lineNo,
            "character_trait_id_uppercase",
            `CharacterTrait field value "${val}" contains uppercase — must match the lowercase registry key`,
            "Lowercase the value part to match the registered trait ID",
            "b42.api.character-trait-registry-id-lowercase");
        }
      }
    }
  }

  sortFindings(findings);

  const presenceGuardNote =
    "NOTE (manual review): 'if x.method then' presence guards on Java objects are unreliable — " +
    "Kahlua returns a truthy accessor for absent methods (truth b42.lua.java-method-presence-guard-unreliable). " +
    "Review any guard pattern like 'if player.hasTrait' or 'if obj.SomeMethod' that immediately precedes a :method() call on the same object.";

  const summary = `Checked ${luaFiles.length} Lua file(s) and ${scriptFiles.length} scripts/characters file(s).`;
  if (wantJson) {
    return JSON.stringify({
      ok: findings.length === 0,
      checked_lua_files: luaFiles.length,
      checked_script_files: scriptFiles.length,
      findings,
      note: presenceGuardNote,
    }, null, 2);
  }
  if (!findings.length) {
    return `OK: no B42 API traps found. ${summary}\n\n${presenceGuardNote}`;
  }
  const byLevel = { high: 0, medium: 0 };
  for (const f of findings) byLevel[f.severity] = (byLevel[f.severity] ?? 0) + 1;
  const hdr = `Found ${findings.length} B42 API trap(s) (high: ${byLevel.high ?? 0}, medium: ${byLevel.medium ?? 0}). ${summary}`;
  return `${hdr}\n\n${JSON.stringify(findings, null, 2)}\n\n${presenceGuardNote}`;
}

// ---- space_validate_workshop_versions ----------------------------------
// Checks modversion consistency across mod.info copies and versionMin format.
async function validateWorkshopVersions(pathArg) {
  const target = await resolveLocalPath(pathArg);
  async function findModInfos(dir, out = []) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (["node_modules", "mod-corpus", "mcp-server"].includes(e.name) || e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) await findModInfos(full, out);
      else if (e.name === "mod.info") out.push(full);
    }
    return out;
  }
  const modInfoFiles = await findModInfos(target);
  if (!modInfoFiles.length) return "No mod.info files found at path.";
  const byId = {};
  for (const f of modInfoFiles) {
    const text = await readFile(f, "utf8").catch(() => "");
    const rel = relative(WORKSHOP_ROOT, f).replace(/\\/g, "/");
    const id = (text.match(/^\s*id\s*=\s*(.+)$/m) || [])[1]?.trim() || "?";
    if (!byId[id]) byId[id] = [];
    byId[id].push({
      path: rel,
      modversion: (text.match(/^\s*modversion\s*=\s*(.+)$/m) || [])[1]?.trim() || "<missing>",
      pzversion:  (text.match(/^\s*pzversion\s*=\s*(.+)$/m)  || [])[1]?.trim() || "<missing>",
      versionMin: (text.match(/^\s*versionMin\s*=\s*(.+)$/m) || [])[1]?.trim() || "<missing>",
    });
  }
  const issues = [];
  const report = [];
  for (const [id, infos] of Object.entries(byId)) {
    report.push(`### ${id}`);
    infos.forEach((inf) => report.push(`  ${inf.path}: modversion=${inf.modversion} pzversion=${inf.pzversion} versionMin=${inf.versionMin}`));
    const versions = [...new Set(infos.map((i) => i.modversion))];
    if (versions.length > 1) issues.push(`FAIL  ${id}: modversion mismatch — ${versions.join(" vs ")}`);
    for (const v of [...new Set(infos.map((i) => i.versionMin))]) {
      if (v !== "<missing>" && /^42$/.test(v)) issues.push(`FAIL  ${id}: versionMin=42 must be "42.0" (engine rejects bare form)`);
    }
    if (infos.some((i) => i.modversion === "<missing>")) issues.push(`WARN  ${id}: modversion missing from one or more mod.info files`);
  }
  if (!issues.length) return `OK: all version fields consistent.\n\n${report.join("\n")}`;
  return `${issues.length} version issue(s):\n\n${issues.join("\n")}\n\n${report.join("\n")}`;
}


const server = new Server(
  { name: "pz-modding-brain", version: JSON.parse(await readFile(join(HERE, "package.json"), "utf8")).version },
  { capabilities: { resources: {}, tools: {} } },
);

async function currentToolNameSet() {
  const source = await readFile(fileURLToPath(import.meta.url), "utf8");
  return new Set([...source.matchAll(/name:\s*"([^"]+)"/g)].map((match) => match[1]));
}

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const files = await walk(BRAIN_ROOT);
  return {
    resources: files.map((f) => {
      const rel = relative(BRAIN_ROOT, f).split(sep).join("/");
      return {
        uri: toUri(f),
        name: rel,
        mimeType: f.endsWith(".json") ? "application/json" : "text/markdown",
      };
    }),
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const abs = await fromUri(req.params.uri);
  await stat(abs); // throws if missing
  const text = await readFile(abs, "utf8");
  return {
    contents: [
      {
        uri: req.params.uri,
        mimeType: abs.endsWith(".json") ? "application/json" : "text/markdown",
        text,
      },
    ],
  };
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "space_brain_status",
      description: "Show installed Brain version, configured directories, public profile, and truth counts. Pending and imported records are not verified facts.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "space_search_brain",
      description:
        "Case-insensitive substring search across every brain file. Returns up to max_results hits with file path, line number, and surrounding context.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Substring or word to find." },
          max_results: { type: "integer", minimum: 1, maximum: 50, default: 10 },
        },
        required: ["query"],
      },
    },
    {
      name: "space_lookup_method",
      description:
        "Look up a PZ B42 method, event, or pattern by name in the method database. Substring match on method_or_pattern_name. Returns the full DB entries.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Method, event, or pattern name (e.g. 'ModData.transmit', 'Events.OnGameStart')." },
        },
        required: ["name"],
      },
    },
    {
      name: "space_lookup_script_block",
      description:
        "Look up Project Zomboid script block/schema metadata from the ingested PZ-Wiki-Modding pz-scripts-data dataset. Use for script formats such as item, craftRecipe, fluid, entity, vehicle, mod.info, and sandbox-options.txt.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Script block or root document name, e.g. item, craftRecipe, fluid, ROOT-ModInfo." },
          parameter: { type: "string", description: "Optional parameter-name filter inside matched blocks, e.g. ItemType, versionMin, xpAward." },
          full: { type: "boolean", default: false, description: "When true, return full raw matching block objects instead of a concise summary." },
        },
        required: ["name"],
      },
    },
    {
      name: "space_scan_folder",
      description:
        "Use this when the user asks to scan, browse, inspect, or summarize a local folder. Returns a concise inventory of files and folders for the selected path.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local folder path to scan, for example <workshop-root>." },
          recursive: { type: "boolean", default: false, description: "When true, include nested entries." },
          max_entries: { type: "integer", minimum: 1, maximum: 1000, default: 200 },
        },
        required: ["path"],
      },
    },
    {
      name: "space_list_folder",
      description:
        "List files and folders in a selected local folder. Use this before reading or searching a folder.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local folder path to inspect." },
          recursive: { type: "boolean", default: false, description: "When true, list nested entries too." },
          max_entries: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
        },
        required: ["path"],
      },
    },
    {
      name: "space_read_text_file",
      description:
        "Read a selected local text/code file. Supports common mod text formats such as .lua, .txt, .md, .json, .xml, .java, and .bbcode.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local text file path to read." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_search_folder",
      description:
        "Case-insensitive substring search through text/code files in a selected local folder.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local file or folder path to search." },
          query: { type: "string", description: "Substring or word to search for." },
          max_results: { type: "integer", minimum: 1, maximum: 100, default: 25 },
          max_files: { type: "integer", minimum: 1, maximum: 5000, default: 1000 },
        },
        required: ["path", "query"],
      },
    },
    {
      name: "space_validate_lua_syntax",
      description:
        "Read-only Lua 5.1 parse check via paths.mjs LUAC_PATH (first existing: PZ_LUAC_PATH, mcp-server/vendor, Workshop/_tooling/lua-5.1.5, Workshop/lua-5.1.5, then luac5.1 on PATH). Accepts a Lua file or folder under the Workshop root. Pair with scripts/kahlua_compat_guard.py for post-5.1 syntax.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Lua file or folder under <workshop-root>." },
          max_files: { type: "integer", minimum: 1, maximum: 500, default: 200 },
        },
        required: ["path"],
      },
    },
    {
      name: "space_audit_biteme_mods",
      description:
        "One-call static audit for Biteme/BiteMe Project Zomboid Workshop mods. Scans the Workshop folder, identifies Biteme mod folders, checks metadata, Lua syntax, pcall/safeCall, server/client guards, OnTick usage, and duplicate mirrors.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Workshop folder path to scan. Defaults to <workshop-root>." },
          max_findings: { type: "integer", minimum: 1, maximum: 100, default: 10, description: "Maximum number of findings to return. Use 10 for concise reports." },
        },
      },
    },
    {
      name: "space_inspect_mod_layout",
      description:
        "Read-only Project Zomboid mod layout inspection. Checks workshop.txt, mod.info files, Contents/mods structure, Lua file counts, and duplicate root mirrors.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder path to inspect." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_audit_lua_guards",
      description:
        "Read-only audit of Project Zomboid Lua client/server/shared file guards. Checks client files have 'if isServer() then return end', server files have 'if isClient() then return end', flags shared files that wrongly carry a guard, and flags forbidden FILE-LEVEL negative guards (if not isServer/isClient) that break singleplayer and hosted-host. Indented `if not isClient() then return end` immediately before sendClientCommand is allowed (SP must not send). Inner negative guards elsewhere are review-level.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder or Lua file path to audit." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_audit_safe_call",
      description:
        "Read-only audit of pcall/safeCall usage in Project Zomboid Lua files. Classifies safeCall helpers as pcall wrappers or direct fn() wrappers where possible.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder or Lua file path to audit." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_audit_translations",
      description:
        "Read-only audit of Project Zomboid translation coverage. Checks sandbox option labels/tooltips/pages and likely local getText() keys against this mod's Translate files.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder or file path to audit." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_audit_command_contracts",
      description:
        "Read-only audit of client/server command contracts. Resolves local MODULE_ID constants and the 4-arg player-first sendClientCommand/sendServerCommand form. Matches command names against OnClientCommand/OnServerCommand handlers, including `RESULT_COMMANDS[command] = true` lookup tables.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder or Lua file path to audit." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_audit_sandbox_schema",
      description:
        "Read-only audit of sandbox-options.txt schema. Checks duplicate option ids, valid types, defaults, min/max ranges, page fields, and translation fields.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder or sandbox-options.txt path to audit." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_audit_bb_sandbox_menu",
      description:
        "Read-only BB Common Sense sandbox menu audit. Checks each BB sandbox page is named after its mod, page tooltip explains the module purpose, and option labels/tooltips are feature-relevant.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Optional local BB mod folder or Workshop root path. Defaults to the current Workshop root.",
          },
        },
      },
    },
    {
      name: "space_stage_workshop_uploads",
      description:
        "Stage Project Zomboid Workshop upload VDFs without posting. Defaults to the current BB/Biteme batch. mode='hold' creates an approval-gated upload plan; mode='store' stores VDFs/manifests for local deploy/testing only.",
      inputSchema: {
        type: "object",
        properties: {
          mods: {
            type: "array",
            items: { type: "string" },
            description: "Optional Workshop-root folder names. Defaults to the current BB Common Sense + BitemeAdminTools batch.",
          },
          changenote: {
            type: "string",
            description: "Optional Workshop changenote to write into each generated VDF. Defaults to blank.",
          },
          mode: {
            type: "string",
            enum: ["hold", "store"],
            description: "hold = prepare for upload but require explicit approval later; store = local artifacts only, no upload approval text.",
            default: "hold",
          },
        },
      },
    },
    {
      name: "space_audit_text_encoding",
      description:
        "Read-only audit for suspected text mojibake/encoding damage in mod text and translation files.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder or text file path to audit." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_audit_runtime_risks",
      description:
        "Read-only production-risk audit for Project Zomboid Lua runtime hazards. Catches: mutable square object iteration, forced UI top-layer loops, screen-sized ISUIElement/ISPanel overlays added to UIManager without mouse passthrough, unchecked unloaded grid squares, local timed action class declaration (breaks MP in B42.13+), character:getXp():AddXP() with no MP sync (use global addXp()), ResourceLocation objects compared directly to strings (always false — wrap with tostring()), ipairs or # used on Java ArrayList results (use 0-indexed :size()/:get()), unthrottled OnTick on any file side, B42-removed getDelta() and wound method renames, broken item:hasTag(string), and more.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder or Lua file path to audit." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_analyze_pz_log",
      description:
        "Analyze pasted Project Zomboid server/client log text or a local log file for known mod-development failure patterns and likely ownership points.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Optional local log file path to analyze." },
          text: { type: "string", description: "Optional pasted log text to analyze. Used when path is omitted." },
        },
      },
    },
    {
      name: "space_production_release_gate",
      description:
        "Single production-readiness gate for a Project Zomboid mod. Runs all audit tools and returns a PASS/REVIEW/BLOCK verdict with prioritised findings. Covers: mod layout, Lua syntax, environment guards, safeCall/pcall, translations, bare getText, command contracts, sandbox schema, text encoding, runtime risks (including screen-sized overlays without mouse passthrough), event hooks, B42 breaking changes, workshop copy, MasterySystem grammar when MasteryConfig.lua is present, and PZ log analysis. Without log_path/log_text the verdict cannot be PASS (probe_log_missing → REVIEW). A clean owner-run pz-sp-probe console.txt is required for handoff; pz-mp-probe is required when MP command/ModData paths changed.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder path to validate." },
          log_path: { type: "string", description: "Required for PASS. Local pz-sp-probe / pz-mp-probe console.txt (or coop-console.txt) to analyze." },
          log_text: { type: "string", description: "Optional pasted PZ log text. Same role as log_path; required for PASS if log_path is omitted." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_propose_safe_call_patch",
      description:
        "Read-only patch proposal for removing safeCall from one Lua file. Does not edit files. Returns replacement rules and examples.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local Lua file path to inspect." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_validate_mod_package",
      description:
        "Read-only static validation for one Project Zomboid mod package: layout, guards, pcall/safeCall, and Lua syntax.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder path to validate." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_create_pending_mod_fix_patch",
      description:
        "Autonomous but read-only planning tool. Creates a pending patch for safe first-pass fixes under the Workshop root only: missing client/server guards and direct safeCall(function() fn() end) cleanup. Does not edit mod files.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Lua file or mod folder under <workshop-root>." },
          fix_types: {
            type: "array",
            items: { type: "string", enum: ["guards", "safeCall"] },
            default: ["guards", "safeCall"],
            description: "Fix types to include in the pending patch.",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "space_inspect_pending_patch",
      description:
        "Read a pending patch by ID before approval. Shows files, notes, previews, skipped items, and the exact approval text.",
      inputSchema: {
        type: "object",
        properties: {
          patch_id: { type: "string", description: "Patch ID returned by space_create_pending_mod_fix_patch." },
        },
        required: ["patch_id"],
      },
    },
    {
      name: "space_apply_pending_patch",
      description:
        "Human-in-the-loop write tool. Applies a pending patch only when approval_text exactly matches APPROVE PATCH <patch_id>. Creates central backups first, refuses files changed since planning, and validates Lua syntax after writing.",
      inputSchema: {
        type: "object",
        properties: {
          patch_id: { type: "string", description: "Patch ID returned by space_create_pending_mod_fix_patch." },
          approval_text: { type: "string", description: "Must exactly match the patch approval text, e.g. APPROVE PATCH patch-..." },
        },
        required: ["patch_id", "approval_text"],
      },
    },
    {
      name: "space_validate_env_guards",
      description:
        "Validates environment guards in Project Zomboid mod Lua files. Checks server files have 'if isClient() then return end', client files have 'if isServer() then return end', shared files have no guard, and flags forbidden FILE-LEVEL negative guards. Scans leading executable lines (comment/blank banners skipped). Inner `if not isClient() then return end` immediately before sendClientCommand is allowed.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder or Lua file path to validate." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_validate_workshop_meta",
      description:
        "Validates mod.info and workshop.txt workshop metadata. Checks required fields (id, name, description, author, versionMin=42.x), both mod.info copies (root and 42/), workshop.txt required fields and tags, changenote= for the next push, and whether workshop.txt is newer than gameplay/art files.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder path to validate." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_audit_workshop_copy",
      description:
        "Pass/fail audit that Workshop listing copy is current: workshop.txt description, changenote= (next-push changelog, must name current modversion), no PLACEHOLDER text, and workshop.txt saved after the newest lua/scripts/sandbox/translate/preview/poster change.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local Workshop package folder (the folder that contains workshop.txt)." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_validate_file_structure",
      description:
        "Validates the Workshop mod folder structure. Checks for workshop.txt, preview.png, both mod.info copies, poster.png, correct Lua subdirectory placement, and sandbox translation files.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder path to validate." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_validate_b42_changes",
      description:
        "Checks Lua and script files for B42 breaking change violations: broken item:hasTag(string) API, removed events (OnFillVehicleMenu, OnExitVehicle), removed APIs (getAttachmentsProvided, getZombieList, getObjectList), vehicle:isEngineStarted() semantic warning (true during cranking, not running — use isEngineRunning()), renamed items (Stone→Stone2 etc. — only flagged in string/item-ID contexts), and old script formats (Type= / recipe).",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder or Lua file path to check." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_audit_moddata_usage",
      description:
        "Audits ModData patterns in Project Zomboid mod Lua files. Checks for correct use of ModData.getOrCreate(), ModData.transmit() after mutations, _version migration fields, args.username identity issues, and function storage in ModData.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder or Lua file path to audit." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_audit_network_commands",
      description:
        "Audits sendClientCommand/sendServerCommand usage and OnClientCommand/OnServerCommand handler guards. Checks for missing module ~= MODULE_ID guards, args.username identity trust issues, missing args tables, and absent isAdmin checks on server command handlers.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder or Lua file path to audit." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_audit_event_hooks",
      description:
        "Audits event hook patterns in Project Zomboid mod Lua files. Flags server files using OnGameStart for bootstrap, OnTick/OnPlayerUpdate abuse, deprecated OnPlayerDisconnect, and B42-removed events like OnExitVehicle and OnFillVehicleMenu.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Local mod folder or Lua file path to audit." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_find_bare_gettext",
      description:
        "Scans publishable Lua for bare getText(\"literal\") / getTextOrNull calls that bypass the mod's tr()/tryText() helper. The helper definition itself is exempt. These leak raw translation keys when the deployed Workshop copy is older than local Translate files. Folded into space_production_release_gate as REVIEW.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Mod folder or Lua file path to scan." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_list_todo_items",
      description:
        "Lists all TODO, FIXME, HACK, XXX, and BUG annotations in Lua files under the given path, grouped by tag type with file:line references.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Mod folder or Lua file path to scan." },
          max_results: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        },
        required: ["path"],
      },
    },
    {
      name: "space_audit_timed_actions",
      description:
        "Audits ISBaseTimedAction subclasses for common pitfalls: (a) class declared as local instead of global (breaks MP), (b) :perform() missing ISBaseTimedAction.perform(self) call, (c) :stop() missing ISBaseTimedAction.stop(self) call, (d) :new() not setting o.maxTime (action never completes). Covers CLAUDE.md pitfalls #24 and #26.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Mod folder or Lua file path to audit." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_audit_isadmin_completeness",
      description:
        "Checks every isAdmin/isAdminPlayer function that calls getAccessLevel and flags any that are missing required access level strings: admin, moderator, overseer, gm, observer (and their Title-case variants). Covers CLAUDE.md pitfall #43.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Mod folder or Lua file path to audit." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_audit_b42_api_traps",
      description:
        "Audits mod Lua and scripts/characters files for B42 API traps documented in pending truth store (2026-06-03). " +
        "Detects: (1) :hasTrait(string) — throws 'No implementation found' in B42.19; " +
        "(2) :HasTrait( — PascalCase variant absent; " +
        "(3) :getTraits():add( — legacy B41 path disconnected from B42 trait system; " +
        "(4) stale require paths moved in B42 (e.g. 'ISUI/ISCharacterInfoWindow' → 'XpSystem/ISUI/ISCharacterInfoWindow'); " +
        "(5) view:createChildren() before addView/addChild — click-inert tab bug; " +
        "(6) mixed-case CharacterTrait IDs in scripts/characters/*.txt — causes NPE at load. " +
        "(7) module-reference-integrity — Name.X()/Name:X() where Name matches a shared/ subdir module in this mod but is not require()-bound in the calling file (bare global evaluates to nil; truth b42.lua.subdir-modules-not-autoloaded). " +
        "(8) require-missing-return — a file require()'d by this mod has no top-level `return ModuleTable`, so callers get nil and crash with 'attempted index: new of non-table: null' (truth b42.lua.require-must-return-module-table). " +
        "The Java-method presence-guard trap is noted but not auto-detected.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Mod folder or single Lua/scripts file path to audit." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_validate_workshop_versions",
      description:
        "Reads modversion, pzversion, and versionMin from all mod.info files under the target. Flags mismatches between root and 42/ copies, bare versionMin=42 (must be 42.0), and missing modversion fields.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Mod folder or Workshop root path to check." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_audit_mastery_system",
      description:
        "Read-only audit for MasterySystem-style Project Zomboid skill trees. Live grammar: Paths internalTrait ids vs character_trait_definition scripts, getActive ult1 = capstoneId only (no T5 name fallback), sendClientCommand player-first, CharacterTrait+ResourceLocation for Cunning grants, footstep Nutrition weight band 60/80/100, and no player:setEngineFeature. Does not expect obsolete rankNames / Mastery_Skill_BranchRankN ids.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "MasterySystem mod folder or similar skill-tree mod folder to audit." },
        },
        required: ["path"],
      },
    },
    {
      name: "space_truth_search",
      description:
        "Search canonical Project Zomboid modding truths. Defaults to verified truths only; pass status='pending' to inspect proposed discoveries.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Substring to search across truth ids, summaries, details, evidence, and tool names." },
          kind: {
            type: "string",
            enum: TRUTH_KIND_LIST,
          },
          status: { type: "string", enum: ["pending", "verified", "deprecated"], default: "verified" },
          max_results: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        },
      },
    },
    {
      name: "space_truth_get",
      description:
        "Get one canonical or pending PZ modding truth by stable id. Canonical verified/deprecated entries live in truths.json; pending.json is only unpromoted discoveries.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Stable truth id, for example b42.pcall.broken." },
        },
        required: ["id"],
      },
    },
    {
      name: "space_truth_propose",
      description:
        "Propose a new PZ modding truth into Brain/truth/pending.json. Rejects ids that already exist in truths.json. Pending is the unpromoted inbox only — never copy verified or deprecated truths back into pending. Promotion requires APPROVE TRUTH <id>.",
      inputSchema: {
        type: "object",
        properties: {
          entry: {
            type: "object",
            properties: {
              id: { type: "string" },
              kind: { type: "string" },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
              summary: { type: "string" },
              details: { type: "string" },
              pz_versions: { type: "array", items: { type: "string" } },
              evidence: { type: "array", items: { type: "string" } },
              enforced_by: { type: "array", items: { type: "string" } },
              created_by: { type: "string", enum: ["human", "agent", "test-server"], default: "agent" },
            },
            required: ["id", "kind", "confidence", "summary", "evidence"],
          },
        },
        required: ["entry"],
      },
    },
    {
      name: "space_truth_review",
      description:
        "List truths by status. Default status=pending lists only unpromoted discoveries in pending.json (entry count, not file line count). status=verified|deprecated reads truths.json. Leftover pending copies of canonical ids are not approval candidates — run space_truth_audit.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "verified", "deprecated"], default: "pending" },
          kind: {
            type: "string",
            enum: TRUTH_KIND_LIST,
          },
          max_results: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        },
      },
    },
    {
      name: "space_truth_promote",
      description:
        "Human-gated write tool. Promotes a pending truth to canonical verified truth only when approval_text exactly matches APPROVE TRUTH <id>.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          approval_text: { type: "string", description: "Must exactly equal APPROVE TRUTH <id>." },
          required_environments: {
            type: "array",
            items: { type: "string" },
            description: "Environments whose evidence is being asserted. Runtime tokens: \"sp\", \"dedicated\", \"hosted_host\", \"hosted_client\", \"client_to_dedicated\" — evidence text must contain matching runtime_* keyword. Non-runtime tooling token: \"tooling\" — evidence text must contain 'owner-verified', 'upload succeeded', or similar tooling keyword. Tokens may be mixed (e.g. [\"sp\",\"tooling\"]).",
          },
        },
        required: ["id", "approval_text", "required_environments"],
      },
    },
    {
      name: "space_truth_deprecate",
      description:
        "Human-gated write tool. Marks a canonical truth deprecated only when approval_text exactly matches DEPRECATE TRUTH <id>.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          replacement_id: { type: "string" },
          reason: { type: "string" },
          approval_text: { type: "string", description: "Must exactly equal DEPRECATE TRUTH <id>." },
        },
        required: ["id", "reason", "approval_text"],
      },
    },
    {
      name: "space_truth_audit",
      description:
        "Audit the PZ truth registry for malformed entries, duplicate ids within a collection, pending leftovers of already-canonical ids, and unknown enforced_by MCP tool names. pending.json must not contain ids that already exist in truths.json.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "space_generate_mod",
      description:
        "Deterministic local Project Zomboid B42 mod generator. Takes a structured JSON spec (no free-form NL) and writes a workshop-layout folder to output_root/<modId>/. Does not run the release gate.",
      inputSchema: {
        type: "object",
        properties: {
          spec: {
            type: "object",
            description: "Generator spec: modId, archetype, features[], plus optional metadata.",
          },
          output_root: {
            type: "string",
            description: "Directory under the Workshop root. The tool writes output_root/<modId>/.",
          },
        },
        required: ["spec", "output_root"],
      },
    },
    {
      name: "space_headless_probe",
      description:
        "Isolated B42 dedicated (java.awt.headless, no Steam Workshop) under Workshop/_probe/headless-home. Stages PZHeadless + the target mod, never pz-live/pz-test/pz-temp. Default is dry-run (prepare argv + ini). run=true boots GameServer, waits for PZHEADLESS markers + SERVER STARTED, kills the process, and returns the log path for space_analyze_pz_log / the release gate. mode=train keeps the same JVM as a text-world trainer (HavenHeadless_tick.txt). Does not replace SP client probes.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Workshop mod folder to stage (Contents/mods/<id> layout or the mod id folder).",
          },
          run: {
            type: "boolean",
            description: "If true, boot the isolated dedicated. Default false (dry-run / stage only).",
          },
          mode: {
            type: "string",
            enum: ["probe", "train", "both"],
            description: "probe = boot markers then stop. train/both = also keep dumping text ticks for the trainer.",
          },
          timeout_s: {
            type: "number",
            description: "Boot/train timeout seconds. Default 180 probe / 600 train.",
          },
        },
        required: ["path"],
      },
    },
    ...MOD_INDEX_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  ].filter((tool) => !PUBLIC_MODE || !["space_headless_probe", "space_stage_workshop_uploads"].includes(tool.name)),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (PUBLIC_MODE && ["space_headless_probe", "space_stage_workshop_uploads"].includes(name)) {
    return { isError: true, content: [{ type: "text", text: "This local deployment adapter is not included in the public profile. Use your own game testing and publishing workflow." }] };
  }
  if (name === "space_brain_status") {
    return { content: [{ type: "text", text: JSON.stringify({
      version: JSON.parse(await readFile(join(HERE, "package.json"), "utf8")).version,
      ...describeRoots(), truth: await auditTruthStore(TRUTH_ROOT),
      migration: "Run node migrate.mjs --from <previous-Brain-or-package> in the public package. Imports remain pending; conflicts never overwrite canonical records.",
    }, null, 2) }] };
  }

  if (name === "space_search_brain") {
    const query = String(args?.query ?? "").trim();
    const max = Math.min(50, Math.max(1, Number(args?.max_results ?? 10)));
    if (!query) return { content: [{ type: "text", text: "empty query" }], isError: true };

    const needle = query.toLowerCase();
    const files = await walk(BRAIN_ROOT);
    // Imported notes are historical evidence. Keep current guidance ahead of
    // them in bounded search results so old contradictions do not crowd it out.
    files.sort((a, b) => Number(a.includes(`${sep}imports${sep}`)) - Number(b.includes(`${sep}imports${sep}`)));
    const hits = [];
    for (const f of files) {
      const text = await readFile(f, "utf8");
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(needle)) {
          const ctx = lines.slice(Math.max(0, i - 1), i + 2).join("\n");
          hits.push({
            uri: toUri(f),
            line: i + 1,
            context: ctx,
          });
          if (hits.length >= max) break;
        }
      }
      if (hits.length >= max) break;
    }

    if (!hits.length) return { content: [{ type: "text", text: `no matches for ${JSON.stringify(query)}` }] };
    const body = hits
      .map((h) => `${h.uri}:${h.line}\n${h.context}`)
      .join("\n\n---\n\n");
    return { content: [{ type: "text", text: body }] };
  }

  if (name === "space_lookup_method") {
    const q = String(args?.name ?? "").trim().toLowerCase();
    if (!q) return { content: [{ type: "text", text: "empty name" }], isError: true };
    const db = await loadMethodDb();
    const matches = (db.entries ?? []).filter((e) =>
      String(e.method_or_pattern_name ?? "").toLowerCase().includes(q),
    );
    if (!matches.length) return { content: [{ type: "text", text: `no method entries match ${JSON.stringify(q)}` }] };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(matches, null, 2),
        },
      ],
    };
  }

  if (name === "space_lookup_script_block") {
    const q = String(args?.name ?? "").trim().toLowerCase();
    const parameterNeedle = String(args?.parameter ?? "").trim().toLowerCase();
    const full = Boolean(args?.full ?? false);
    if (!q) return { content: [{ type: "text", text: "empty name" }], isError: true };

    const db = await loadScriptBlockDb();
    const matches = Object.entries(db ?? {})
      .filter(([, block]) => block && typeof block === "object")
      .filter(([key, block]) => scriptBlockMatches(key, block, q));

    if (!matches.length) {
      return { content: [{ type: "text", text: `no script block entries match ${JSON.stringify(q)}` }] };
    }

    const payload = full
      ? Object.fromEntries(matches)
      : matches.map(([key, block]) => summarizeScriptBlock(key, block, parameterNeedle));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(payload, null, 2),
        },
      ],
    };
  }

  if (name === "space_truth_search") {
    const result = await searchTruths(TRUTH_ROOT, {
      query: String(args?.query ?? ""),
      kind: args?.kind ? String(args.kind) : undefined,
      status: args?.status ? String(args.status) : undefined,
      max_results: args?.max_results,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "space_truth_get") {
    try {
      const result = await getTruth(TRUTH_ROOT, args?.id);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: err.message }] };
    }
  }

  if (name === "space_truth_propose") {
    try {
      const result = await proposeTruth(TRUTH_ROOT, args?.entry);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              proposed: result,
              promotion_approval_text: `APPROVE TRUTH ${result.id}`,
            }, null, 2),
          },
        ],
      };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: err.message }] };
    }
  }

  if (name === "space_truth_review") {
    const result = await reviewTruths(TRUTH_ROOT, {
      status: args?.status ? String(args.status) : undefined,
      kind: args?.kind ? String(args.kind) : undefined,
      max_results: args?.max_results,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "space_truth_promote") {
    try {
      const result = await promoteTruth(TRUTH_ROOT, args?.id, args?.approval_text, {
        required_environments: args?.required_environments,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: err.message }] };
    }
  }

  if (name === "space_truth_deprecate") {
    try {
      const result = await deprecateTruth(TRUTH_ROOT, args?.id, {
        replacement_id: args?.replacement_id,
        reason: args?.reason,
        approval_text: args?.approval_text,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: err.message }] };
    }
  }

  if (name === "space_truth_audit") {
    const result = await auditTruthStore(TRUTH_ROOT, { validTools: await currentToolNameSet() });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "space_headless_probe") {
    const run = args?.run === true;
    const result = run
      ? await runHeadlessProbe({
          modPath: args?.path,
          mode: args?.mode || "probe",
          timeout_s: args?.timeout_s,
        })
      : await prepareHeadlessProbe({ modPath: args?.path });
    if (run && result.log_path) {
      try {
        result.log_analysis = JSON.parse(await analyzePzLog(result.log_path));
      } catch (err) {
        result.log_analysis_error = String(err && err.message ? err.message : err);
      }
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "space_generate_mod") {
    let outputRoot;
    try {
      outputRoot = validateWorkshopPath(args?.output_root);
    } catch (err) {
      return { content: [{ type: "text", text: JSON.stringify({ ok: false, code: "path_invalid", message: err.message }, null, 2) }], isError: true };
    }
    const result = generateMod(args?.spec, outputRoot);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: result.ok === false,
    };
  }

  if (name === "space_scan_folder") {
    const target = await resolveLocalPath(args?.path);
    const recursive = Boolean(args?.recursive ?? false);
    const maxEntries = Math.min(1000, Math.max(1, Number(args?.max_entries ?? 200)));
    const info = await stat(target);
    if (!info.isDirectory()) return { content: [{ type: "text", text: "path is not a directory" }], isError: true };
    const rows = await collectFolderEntries(target, recursive, maxEntries);
    const summary = {
      root: describePath(target),
      scanned_entries: rows.length,
      directories: rows.filter((row) => row.type === "dir").length,
      files: rows.filter((row) => row.type === "file").length,
      entries: rows,
    };
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
  }

  if (name === "space_list_folder") {
    const target = await resolveLocalPath(args?.path);
    const recursive = Boolean(args?.recursive ?? false);
    const maxEntries = Math.min(1000, Math.max(1, Number(args?.max_entries ?? 100)));
    const info = await stat(target);
    if (!info.isDirectory()) return { content: [{ type: "text", text: "path is not a directory" }], isError: true };
    const rows = await collectFolderEntries(target, recursive, maxEntries);
    return { content: [{ type: "text", text: JSON.stringify({ root: describePath(target), entries: rows }, null, 2) }] };
  }

  if (name === "space_read_text_file") {
    const target = await resolveLocalPath(args?.path);
    const text = await readTextFile(target);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_search_folder") {
    const target = await resolveLocalPath(args?.path);
    const query = String(args?.query ?? "").trim();
    if (!query) return { content: [{ type: "text", text: "empty query" }], isError: true };
    const maxResults = Math.min(100, Math.max(1, Number(args?.max_results ?? 25)));
    const maxFiles = Math.min(5000, Math.max(1, Number(args?.max_files ?? 1000)));
    const info = await stat(target);
    let files = [];
    if (info.isDirectory()) files = await walkTextFiles(target, [], maxFiles);
    else if (info.isFile()) files = [target];
    else return { content: [{ type: "text", text: "path is not a file or directory" }], isError: true };

    const needle = query.toLowerCase();
    const hits = [];
    for (const file of files) {
      let text;
      try {
        text = await readTextFile(file);
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(needle)) {
          hits.push({
            path: describePath(file),
            line: i + 1,
            context: lines.slice(Math.max(0, i - 1), i + 2).join("\n"),
          });
          if (hits.length >= maxResults) break;
        }
      }
      if (hits.length >= maxResults) break;
    }

    if (!hits.length) return { content: [{ type: "text", text: `no matches for ${JSON.stringify(query)}` }] };
    return { content: [{ type: "text", text: JSON.stringify({ searched_files: files.length, hits }, null, 2) }] };
  }

  if (name === "space_validate_lua_syntax") {
    const target = validateWorkshopPath(args?.path);
    const maxFiles = Math.min(500, Math.max(1, Number(args?.max_files ?? 200)));
    const info = await stat(target);
    let files = [];
    if (info.isDirectory()) {
      files = await walkLua(target);
    } else if (info.isFile() && extname(target).toLowerCase() === ".lua") {
      files = [target];
    } else {
      return { content: [{ type: "text", text: "target is not a .lua file or directory" }], isError: true };
    }
    files = files.slice(0, maxFiles);
    const failures = [];
    for (const file of files) {
      const result = await runLuac(file);
      if (!result.ok) {
        failures.push({
          path: relative(WORKSHOP_ROOT, file).split(sep).join("/"),
          error: result.error,
        });
      }
    }
    if (!failures.length) {
      return { content: [{ type: "text", text: `OK: parsed ${files.length} Lua files` }] };
    }
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ checked: files.length, failures }, null, 2) }],
    };
  }

  if (name === "space_audit_biteme_mods") {
    const text = await auditBitemeMods(args?.path, args?.max_findings);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_inspect_mod_layout") {
    const text = await inspectModLayout(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_audit_lua_guards") {
    const text = await auditLuaGuards(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_audit_safe_call") {
    const text = await auditSafeCall(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_audit_translations") {
    const text = await auditTranslations(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_audit_command_contracts") {
    const text = await auditCommandContracts(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_audit_sandbox_schema") {
    const text = await auditSandboxSchema(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_audit_bb_sandbox_menu") {
    const text = await auditBBSandboxMenu(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_stage_workshop_uploads") {
    const result = await stageWorkshopUploads({
      workshopRoot: WORKSHOP_ROOT,
      stagingRoot: WORKSHOP_UPLOAD_STAGING_ROOT,
      mods: Array.isArray(args?.mods) && args.mods.length ? args.mods : DEFAULT_WORKSHOP_MODS,
      changenote: args?.changenote || "",
      mode: args?.mode === "store" ? "store" : "hold",
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "space_audit_text_encoding") {
    const text = await auditTextEncoding(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_audit_runtime_risks") {
    const text = await auditRuntimeRisks(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_analyze_pz_log") {
    const text = await analyzePzLog(args?.path, args?.text);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_production_release_gate") {
    const text = await productionReleaseGate(args?.path, args?.log_path, args?.log_text);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_propose_safe_call_patch") {
    const text = await proposeSafeCallPatch(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_validate_mod_package") {
    const text = await validateModPackage(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_create_pending_mod_fix_patch") {
    const text = await createPendingModFixPatch(args?.path, args?.fix_types);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_inspect_pending_patch") {
    const text = await inspectPendingPatch(args?.patch_id);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_apply_pending_patch") {
    const text = await applyPendingPatch(args?.patch_id, args?.approval_text);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_audit_moddata_usage") {
    const text = await auditModdataUsage(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_audit_network_commands") {
    const text = await auditNetworkCommands(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_audit_event_hooks") {
    const text = await auditEventHooks(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_validate_env_guards") {
    const text = await validateEnvGuards(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_validate_workshop_meta") {
    const text = await validateWorkshopMeta(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_audit_workshop_copy") {
    const text = await formatWorkshopCopyAudit(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_validate_file_structure") {
    const text = await validateFileStructure(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_validate_b42_changes") {
    const text = await validateB42Changes(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_find_bare_gettext") {
    const text = await findBareGettext(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_list_todo_items") {
    const max = Math.min(200, Math.max(1, Number(args?.max_results ?? 50)));
    const text = await listTodoItems(args?.path, max);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_audit_timed_actions") {
    const text = await auditTimedActions(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_audit_isadmin_completeness") {
    const text = await auditIsAdminCompleteness(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_audit_b42_api_traps") {
    const text = await auditB42ApiTraps(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_validate_workshop_versions") {
    const text = await validateWorkshopVersions(args?.path);
    return { content: [{ type: "text", text }] };
  }

  if (name === "space_audit_mastery_system") {
    const text = await auditMasterySystem(args?.path);
    return { content: [{ type: "text", text }] };
  }

  for (const tool of MOD_INDEX_TOOLS) {
    if (name === tool.name) {
      try {
        const result = await tool.handler(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error in ${name}: ${err.message}` }], isError: true };
      }
    }
  }

  return { content: [{ type: "text", text: `unknown tool: ${name}` }], isError: true };
});

if (process.argv[2] === "--headless-probe") {
  const run = process.argv.includes("--run");
  const target = process.argv.find((a, i) => i > 2 && !a.startsWith("--"));
  if (!target) {
    console.error("usage: node server.mjs --headless-probe [--run] <mod-path>");
    process.exit(1);
  }
  const result = run
    ? await runHeadlessProbe({ modPath: target, mode: "probe" })
    : await prepareHeadlessProbe({ modPath: target });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.verdict && result.verdict !== "probe_boot_ok" ? 1 : 0);
}

if (process.argv[2] === "--gate") {
  const target = process.argv[3];
  if (!target) {
    console.error("usage: node server.mjs --gate <mod-path>");
    process.exit(1);
  }
  console.log(await productionReleaseGate(target));
  process.exit(0);
}

if (process.argv[2] === "--audit-mastery") {
  const target = process.argv[3];
  if (!target) {
    console.error("usage: node server.mjs --audit-mastery <mod-path>");
    process.exit(1);
  }
  console.log(await auditMasterySystem(target));
  process.exit(0);
}

if (process.argv[2] === "--audit-commands") {
  const target = process.argv[3];
  if (!target) {
    console.error("usage: node server.mjs --audit-commands <mod-path>");
    process.exit(1);
  }
  console.log(await auditCommandContracts(target));
  process.exit(0);
}

if (process.argv[2] === "--audit-guards") {
  const target = process.argv[3];
  if (!target) {
    console.error("usage: node server.mjs --audit-guards <mod-path>");
    process.exit(1);
  }
  console.log(await auditLuaGuards(target));
  process.exit(0);
}

const transport = new StdioServerTransport();
await server.connect(transport);
