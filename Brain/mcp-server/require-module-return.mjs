/**
 * Detect PZ Lua modules that are require()'d but never return a table.
 *
 * Symptom: attempted index: new of non-table: null
 * Cause: local M = require("...") is nil when the target file has no top-level
 *        `return ModuleTable` (env-guard `if isServer() then return end` does not count).
 */

/**
 * True when the file has an unindented module export return.
 * Indented returns (inside functions) are ignored.
 * Same-line env guards (`if isServer() then return end`) are ignored.
 */
export function hasTopLevelModuleReturn(text) {
  if (typeof text !== "string" || text.length === 0) return false;
  const withoutBlock = text.replace(/--\[\[[\s\S]*?\]\]/g, "\n");
  const lines = withoutBlock.split(/\r?\n/);
  for (const line of lines) {
    const stripped = line.replace(/--.*$/, "");
    if (/^\s/.test(stripped) && stripped.trim() !== "") continue; // indented → not module export
    const code = stripped.trim();
    if (!code) continue;
    if (/^if\s+is(?:Server|Client)\s*\(\s*\)\s+then\s+return\s+end$/.test(code)) continue;
    if (/^return\s+[A-Za-z_][\w.]*\s*$/.test(code)) return true;
    if (/^return\s*\{/.test(code)) return true;
  }
  return false;
}

/**
 * Collect require() path strings from Lua source (string-literal forms only).
 */
export function collectRequirePaths(text) {
  const paths = new Set();
  if (typeof text !== "string") return paths;
  const withoutBlock = text.replace(/--\[\[[\s\S]*?\]\]/g, "\n");
  for (const line of withoutBlock.split(/\r?\n/)) {
    const code = line.replace(/--.*$/, "");
    for (const match of code.matchAll(
      /\brequire\s*(?:\(\s*)?["']([^"']+)["']/g,
    )) {
      const raw = String(match[1] || "").trim().replace(/\\/g, "/");
      if (raw) paths.add(raw);
    }
  }
  return paths;
}

/**
 * Map publishable Lua files under a mod to require-able path keys.
 * Keys are relative to media/lua/(client|server|shared)/ without .lua.
 * Example: HavenFollowBuddy/HFB_ActionBroker
 */
export function buildRequirePathIndex(luaFiles) {
  const index = new Map(); // requirePath -> absolute file
  for (const file of luaFiles) {
    const norm = String(file).replace(/\\/g, "/");
    const m = norm.match(/\/media\/lua\/(?:client|server|shared)\/(.+)\.lua$/i);
    if (!m) continue;
    const reqPath = m[1];
    index.set(reqPath, file);
    // Also allow basename-only lookups when unambiguous? Skip — too noisy.
  }
  return index;
}

/**
 * Audit: every in-mod file that another in-mod file require()s must export via return.
 *
 * @param {Array<{path: string, text: string}>} luaSources
 * @returns {Array<object>} findings (same shape as addRisk entries, without push)
 */
export function findRequireMissingReturns(luaSources) {
  const findings = [];
  const files = luaSources.map((s) => s.path);
  const index = buildRequirePathIndex(files);
  const textByPath = new Map(luaSources.map((s) => [s.path, s.text]));

  const requiredTargets = new Map(); // absPath -> { reqPath, from: Set<relCaller> }
  for (const source of luaSources) {
    for (const reqPath of collectRequirePaths(source.text)) {
      const target = index.get(reqPath);
      if (!target) continue; // outside this mod / unresolved
      if (target === source.path) continue;
      let entry = requiredTargets.get(target);
      if (!entry) {
        entry = { reqPath, from: new Set() };
        requiredTargets.set(target, entry);
      }
      entry.from.add(source.path);
    }
  }

  for (const [target, meta] of requiredTargets) {
    const text = textByPath.get(target) || "";
    if (hasTopLevelModuleReturn(text)) continue;
    const callers = [...meta.from].slice(0, 3).join(", ");
    findings.push({
      severity: "high",
      path: target,
      line: 1,
      rule: "require_missing_return",
      issue:
        `Module is require()'d as "${meta.reqPath}" but has no top-level \`return ModuleTable\` — ` +
        `callers get nil (attempted index: new of non-table: null). Referenced from: ${callers}`,
      recommendation:
        `End ${meta.reqPath}.lua with: return <ModuleTable>  (env-guard \`if isServer() then return end\` does not count)`,
      evidence: "b42.lua.require-must-return-module-table",
    });
  }

  return findings;
}
