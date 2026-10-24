// Mod corpus tools for the PZ Modding Brain MCP.
// Loaded by server.mjs to expose three tools:
//   space_refresh_mod_index, space_search_mods, space_read_mod_files
//
// Reads/writes mod-index.json (built by build-mod-index.mjs).
// Reads mod files from ../mod-corpus/ (junction to the Steam workshop).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { BRAIN_ROOT, CORPUS_ROOT, HERE } from "./paths.mjs";

const INDEX_PATH = join(HERE, "mod-index.json");
const BUILDER_PATH = join(HERE, "build-mod-index.mjs");

const MAX_FILE_BYTES = 256 * 1024;
const MAX_FILES_PER_READ = 12;

// ---------- index loading ----------

let _cachedIndex = null;
let _cachedAt = 0;

async function loadIndex(forceReload = false) {
  if (!existsSync(INDEX_PATH)) {
    throw new Error(
      `mod-index.json not found. Run 'space_refresh_mod_index' first (or 'node build-mod-index.mjs').`
    );
  }
  const s = await stat(INDEX_PATH);
  if (forceReload || !_cachedIndex || s.mtimeMs > _cachedAt) {
    const raw = await readFile(INDEX_PATH, "utf8");
    _cachedIndex = JSON.parse(raw);
    _cachedAt = s.mtimeMs;
  }
  return _cachedIndex;
}

// ---------- space_refresh_mod_index ----------

async function runIndexBuilder() {
  return new Promise((resolve, reject) => {
    if (!existsSync(BUILDER_PATH)) {
      reject(new Error(`build-mod-index.mjs not found at ${BUILDER_PATH}`));
      return;
    }
    const child = spawn(process.execPath, [BUILDER_PATH], {
      cwd: HERE,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`builder exited ${code}: ${stderr || stdout}`));
    });
  });
}

export async function tool_space_refresh_mod_index() {
  if (!existsSync(CORPUS_ROOT)) {
    return {
      ok: false,
      error: `mod-corpus not found at ${CORPUS_ROOT}. Is the junction set up and E: drive available?`,
    };
  }
  const { stdout } = await runIndexBuilder();
  const idx = await loadIndex(true);
  return {
    ok: true,
    builderOutput: stdout.trim(),
    summary: {
      generatedAt: idx.generatedAt,
      workshopCount: idx.workshopCount,
      modCount: idx.modCount,
      tally: idx.tally,
    },
  };
}

// ---------- space_search_mods ----------

function recordHaystack(r) {
  // Build a single lowercased string to scan for matches.
  const parts = [
    r.modFolderName,
    r.info?.name,
    r.info?.id,
    r.info?.description,
    r.info?.authors,
    ...(r.media?.events ?? []),
    ...(r.media?.recipes ?? []),
    ...(r.media?.items ?? []),
    ...(r.media?.luaSubfolders ?? []),
  ].filter(Boolean);
  return parts.join(" \u241f ").toLowerCase();
}

function scoreRecord(r, terms, haystack) {
  let score = 0;
  for (const t of terms) {
    if (!t) continue;
    // Strong signal: term appears in mod name or id.
    if ((r.info?.name ?? "").toLowerCase().includes(t)) score += 8;
    if ((r.info?.id ?? "").toLowerCase().includes(t)) score += 6;
    // Strong signal: term matches an event hook exactly.
    if ((r.media?.events ?? []).some((e) => e.toLowerCase() === t)) score += 10;
    // Medium: any field substring.
    if (haystack.includes(t)) score += 2;
  }
  return score;
}

export async function tool_space_search_mods(args) {
  const {
    query,
    only_b42 = true,
    limit = 10,
    require_events,
    require_recipes,
    require_items,
  } = args ?? {};

  if (!query || typeof query !== "string") {
    return { ok: false, error: "query (string) is required" };
  }

  const idx = await loadIndex();
  const terms = query
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const eligible = idx.records.filter((r) => {
    if (r.error) return false;
    if (only_b42 && r.b42_status !== "supported") return false;
    if (require_events && !(r.media?.events?.length > 0)) return false;
    if (require_recipes && !(r.media?.recipes?.length > 0)) return false;
    if (require_items && !(r.media?.items?.length > 0)) return false;
    return true;
  });

  const scored = eligible
    .map((r) => ({ r, score: scoreRecord(r, terms, recordHaystack(r)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(50, limit)));

  return {
    ok: true,
    query,
    only_b42,
    totalEligible: eligible.length,
    matchCount: scored.length,
    results: scored.map(({ r, score }) => ({
      score,
      workshopId: r.workshopId,
      modFolderName: r.modFolderName,
      name: r.info?.name,
      id: r.info?.id,
      authors: r.info?.authors,
      pzversion: r.info?.pzversion,
      description: r.info?.description,
      b42_status: r.b42_status,
      luaSubfolders: r.media?.luaSubfolders ?? [],
      luaFileCount: r.media?.luaFileCount ?? 0,
      events: r.media?.events ?? [],
      recipes: r.media?.recipes ?? [],
      itemCount: r.media?.items?.length ?? 0,
    })),
  };
}

// ---------- space_read_mod_files ----------

function safeJoinUnderCorpus(...segments) {
  const candidate = join(CORPUS_ROOT, ...segments);
  const rel = relative(CORPUS_ROOT, candidate);
  if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
    throw new Error("path escapes mod-corpus");
  }
  return candidate;
}

function matchesPattern(filename, pattern) {
  if (!pattern) return true;
  // Very small glob: '*' matches anything, otherwise substring.
  if (pattern.includes("*")) {
    const re = new RegExp(
      "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
      "i"
    );
    return re.test(filename);
  }
  return filename.toLowerCase().includes(pattern.toLowerCase());
}

async function collectFiles(root, pattern, max) {
  const out = [];
  async function walk(d) {
    if (out.length >= max) return;
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= max) break;
      if (e.name.startsWith(".")) continue;
      const full = join(d, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile() && matchesPattern(e.name, pattern)) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}

export async function tool_space_read_mod_files(args) {
  const {
    workshopId,
    modFolderName,
    path_pattern,
    max_files = 6,
    max_bytes_per_file = MAX_FILE_BYTES,
  } = args ?? {};

  if (!workshopId || !modFolderName) {
    return { ok: false, error: "workshopId and modFolderName are required" };
  }

  let modRoot;
  try {
    modRoot = safeJoinUnderCorpus(workshopId, "mods", modFolderName);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  if (!existsSync(modRoot)) {
    return {
      ok: false,
      error: `mod not found: ${workshopId}/mods/${modFolderName}. Is the index stale? Try space_refresh_mod_index.`,
    };
  }

  // Prefer the 42/ subfolder if present, else read from mod root.
  const versionRoot = existsSync(join(modRoot, "42")) ? join(modRoot, "42") : modRoot;

  const cap = Math.max(1, Math.min(MAX_FILES_PER_READ, max_files));
  const files = await collectFiles(versionRoot, path_pattern, cap);

  const results = [];
  for (const f of files) {
    let content = null;
    let truncated = false;
    let bytes = 0;
    try {
      const s = await stat(f);
      bytes = s.size;
      if (s.size > max_bytes_per_file) {
        const buf = await readFile(f);
        content = buf.subarray(0, max_bytes_per_file).toString("utf8");
        truncated = true;
      } else {
        content = await readFile(f, "utf8");
      }
    } catch (err) {
      results.push({ path: relative(CORPUS_ROOT, f), error: err.message });
      continue;
    }
    results.push({
      path: relative(CORPUS_ROOT, f).replaceAll("\\", "/"),
      bytes,
      truncated,
      content,
    });
  }

  return {
    ok: true,
    workshopId,
    modFolderName,
    versionRoot: relative(CORPUS_ROOT, versionRoot).replaceAll("\\", "/"),
    matched: files.length,
    cap,
    pattern: path_pattern ?? "(all files)",
    files: results,
  };
}

// ---------- schemas for tool registration ----------

export const MOD_INDEX_TOOLS = [
  {
    name: "space_refresh_mod_index",
    description:
      "Re-scan the mod-corpus folder and rebuild mod-index.json. Use this when the user says they've installed/updated mods, or when space_search_mods returns stale results. Returns counts of B42-supported, legacy, and unknown mods.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: tool_space_refresh_mod_index,
  },
  {
    name: "space_search_mods",
    description:
      "Search the indexed PZ mod corpus for working examples. Use this BEFORE writing new mod code to find real B42 mods that already solve a similar problem. Searches mod names, IDs, descriptions, authors, hooked events, recipes, and items. Returns ranked matches with metadata. To then read a matching mod's actual source, call space_read_mod_files with the workshopId and modFolderName from a result.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search terms. Space-separated. Examples: 'OnPlayerUpdate backpack', 'recipe crafting', 'TimedAction'.",
        },
        only_b42: {
          type: "boolean",
          description: "Restrict to B42-supported mods (has a 42/ subfolder). Default true.",
          default: true,
        },
        limit: {
          type: "integer",
          description: "Max results to return (1-50). Default 10.",
          default: 10,
        },
        require_events: {
          type: "boolean",
          description: "Only return mods that hook at least one Events.* callback.",
        },
        require_recipes: {
          type: "boolean",
          description: "Only return mods that define at least one recipe.",
        },
        require_items: {
          type: "boolean",
          description: "Only return mods that define at least one item.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: tool_space_search_mods,
  },
  {
    name: "space_read_mod_files",
    description:
      "Read source files from a specific mod in the corpus, to study how it implements a feature. Always called AFTER space_search_mods to drill into a promising match. Returns up to max_files file contents (default 6, hard cap 12). Prefers the mod's 42/ subfolder if present. Use path_pattern to narrow to relevant files (e.g. '*.lua', 'items.txt', 'Recipe*').",
    inputSchema: {
      type: "object",
      properties: {
        workshopId: {
          type: "string",
          description: "Workshop ID folder name, e.g. '2335368829'. Get this from space_search_mods results.",
        },
        modFolderName: {
          type: "string",
          description:
            "Mod folder name inside the workshop folder's mods/ directory, e.g. 'Authentic Z - Backpacks+'. Get this from space_search_mods results.",
        },
        path_pattern: {
          type: "string",
          description:
            "Optional file name pattern. Supports '*' wildcards or plain substring. Examples: '*.lua', 'mod.info', 'Recipe*.txt'.",
        },
        max_files: {
          type: "integer",
          description: "Max files to return (1-12). Default 6.",
          default: 6,
        },
        max_bytes_per_file: {
          type: "integer",
          description: "Max bytes per file; larger files are truncated. Default 262144.",
          default: 262144,
        },
      },
      required: ["workshopId", "modFolderName"],
      additionalProperties: false,
    },
    handler: tool_space_read_mod_files,
  },
];
