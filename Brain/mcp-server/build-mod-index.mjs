#!/usr/bin/env node
// Builds an index of the mod corpus for searchable reference.
// Output: mcp-server/mod-index.json
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { BRAIN_ROOT, CORPUS_ROOT, HERE } from "./paths.mjs";

const INDEX_PATH = join(HERE, "mod-index.json");

const MAX_LUA_SCAN_BYTES = 256 * 1024; // skip huge files
const EVENT_REGEX = /Events\.(\w+)\.Add/g;
const RECIPE_REGEX = /recipe\s+([A-Za-z0-9_]+)\s*{/gi;
const ITEM_REGEX = /^\s*item\s+([A-Za-z0-9_]+)/gim;

async function parseModInfo(path) {
  try {
    const text = await readFile(path, "utf8");
    const fields = {};
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([^=]+?)\s*=\s*(.*?)\s*$/);
      if (m) fields[m[1].toLowerCase()] = m[2];
    }
    return fields;
  } catch {
    return null;
  }
}

async function scanLuaForSignals(luaDir) {
  const events = new Set();
  const files = [];
  async function walk(d) {
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = join(d, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile() && e.name.endsWith(".lua")) {
        files.push(full);
        let s;
        try { s = await stat(full); } catch { continue; }
        if (s.size > MAX_LUA_SCAN_BYTES) continue;
        let text;
        try { text = await readFile(full, "utf8"); } catch { continue; }
        let m;
        EVENT_REGEX.lastIndex = 0;
        while ((m = EVENT_REGEX.exec(text)) !== null) events.add(m[1]);
      }
    }
  }
  await walk(luaDir);
  return { events: [...events].sort(), luaFileCount: files.length };
}

async function scanScriptsForSignals(scriptsDir) {
  const recipes = new Set();
  const items = new Set();
  async function walk(d) {
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = join(d, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile() && e.name.endsWith(".txt")) {
        let text;
        try { text = await readFile(full, "utf8"); } catch { continue; }
        let m;
        RECIPE_REGEX.lastIndex = 0;
        while ((m = RECIPE_REGEX.exec(text)) !== null) recipes.add(m[1]);
        ITEM_REGEX.lastIndex = 0;
        while ((m = ITEM_REGEX.exec(text)) !== null) items.add(m[1]);
      }
    }
  }
  await walk(scriptsDir);
  return { recipes: [...recipes].sort(), items: [...items].sort() };
}

async function summariseMedia(versionRoot) {
  const mediaDir = join(versionRoot, "media");
  if (!existsSync(mediaDir)) return null;
  const summary = { hasLua: false, hasScripts: false, hasUI: false, hasTextures: false, luaSubfolders: [] };
  const luaDir = join(mediaDir, "lua");
  if (existsSync(luaDir)) {
    summary.hasLua = true;
    try {
      const entries = await readdir(luaDir, { withFileTypes: true });
      summary.luaSubfolders = entries.filter(e => e.isDirectory()).map(e => e.name);
      const luaScan = await scanLuaForSignals(luaDir);
      summary.events = luaScan.events;
      summary.luaFileCount = luaScan.luaFileCount;
    } catch {}
  }
  const scriptsDir = join(mediaDir, "scripts");
  if (existsSync(scriptsDir)) {
    summary.hasScripts = true;
    try {
      const scan = await scanScriptsForSignals(scriptsDir);
      summary.recipes = scan.recipes;
      summary.items = scan.items;
    } catch {}
  }
  summary.hasUI = existsSync(join(mediaDir, "ui"));
  summary.hasTextures = existsSync(join(mediaDir, "textures"));
  return summary;
}

async function indexOneMod(workshopId, workshopPath) {
  const modsRoot = join(workshopPath, "mods");
  if (!existsSync(modsRoot)) {
    return [{ workshopId, error: "no mods/ subfolder" }];
  }
  let modDirs;
  try { modDirs = await readdir(modsRoot, { withFileTypes: true }); }
  catch (err) { return [{ workshopId, error: `readdir failed: ${err.message}` }]; }

  const results = [];
  for (const modDir of modDirs) {
    if (!modDir.isDirectory()) continue;
    const modPath = join(modsRoot, modDir.name);
    let versionDirs = [];
    try {
      versionDirs = (await readdir(modPath, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {}
    const b42VersionFolder = versionDirs
      .filter((name) => /^42(?:\.\d+)?$/.test(name))
      .sort((a, b) => {
        const an = Number(a.replace(/^42\.?/, "") || 0);
        const bn = Number(b.replace(/^42\.?/, "") || 0);
        return bn - an;
      })[0] ?? null;
    const has42 = Boolean(b42VersionFolder);
    const has41 = existsSync(join(modPath, "41"));
    const hasLegacyMedia = existsSync(join(modPath, "media")) && !has42 && !has41;

    let b42_status;
    if (has42) b42_status = "supported";
    else if (has41 && !has42) b42_status = "b41_only";
    else if (hasLegacyMedia) b42_status = "legacy_b41";
    else b42_status = "unknown";

    // Prefer 42/mod.info, fall back to root mod.info
    let modInfoPath = b42VersionFolder ? join(modPath, b42VersionFolder, "mod.info") : join(modPath, "42", "mod.info");
    if (!existsSync(modInfoPath)) modInfoPath = join(modPath, "mod.info");
    const modInfo = existsSync(modInfoPath) ? await parseModInfo(modInfoPath) : null;

    const versionRoot = has42 ? join(modPath, b42VersionFolder) : modPath;
    const media = await summariseMedia(versionRoot);

    results.push({
      workshopId,
      modFolderName: modDir.name,
      modInfoPath: modInfoPath.replace(BRAIN_ROOT, "<brain>"),
      b42_status,
      hasB41Folder: has41,
      hasB42Folder: has42,
      b42VersionFolder,
      info: modInfo,
      media,
    });
  }
  return results;
}

async function main() {
  if (!existsSync(CORPUS_ROOT)) {
    console.error(`[index] mod-corpus not found at ${CORPUS_ROOT}`);
    process.exit(1);
  }
  const t0 = Date.now();
  let workshopDirs;
  try { workshopDirs = await readdir(CORPUS_ROOT, { withFileTypes: true }); }
  catch (err) { console.error(`[index] cannot read corpus: ${err.message}`); process.exit(1); }

  const records = [];
  let errored = 0;
  for (const d of workshopDirs) {
    if (!d.isDirectory()) continue;
    try {
      const rs = await indexOneMod(d.name, join(CORPUS_ROOT, d.name));
      records.push(...rs);
    } catch (err) {
      errored++;
      records.push({ workshopId: d.name, error: err.message });
    }
  }

  // Tally
  const tally = { total: records.length, supported: 0, b41_only: 0, legacy_b41: 0, unknown: 0, errored };
  for (const r of records) {
    if (r.error) continue;
    tally[r.b42_status] = (tally[r.b42_status] ?? 0) + 1;
  }

  const out = {
    generatedAt: new Date().toISOString(),
    corpusPath: CORPUS_ROOT.replace(BRAIN_ROOT, "<brain>"),
    workshopCount: workshopDirs.filter(d => d.isDirectory()).length,
    modCount: records.length,
    tally,
    records,
  };

  const { writeFile } = await import("node:fs/promises");
  await writeFile(INDEX_PATH, JSON.stringify(out, null, 2), "utf8");
  const ms = Date.now() - t0;
  console.log(`[index] ${tally.total} mods indexed in ${ms}ms`);
  console.log(`[index]   B42 supported : ${tally.supported}`);
  console.log(`[index]   B41-only      : ${tally.b41_only}`);
  console.log(`[index]   Legacy (B41?) : ${tally.legacy_b41}`);
  console.log(`[index]   Unknown       : ${tally.unknown}`);
  console.log(`[index]   Errored       : ${tally.errored}`);
  console.log(`[index] wrote ${INDEX_PATH}`);
}

main().catch(err => { console.error("[index] fatal:", err); process.exit(1); });
