// Portable path roots for the PZ Modding Brain MCP.
// Resolution order for each root: env var -> pz-brain.config.json -> layout defaults.
// The live Workshop checkout keeps working with no config file.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const CONFIG_PATH = resolve(process.env.PZ_BRAIN_CONFIG || join(HERE, "pz-brain.config.json"));

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("expected a JSON object");
    return parsed;
  } catch (err) {
    throw new Error(`Invalid Brain configuration ${CONFIG_PATH}: ${err.message}`);
  }
}

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return candidates.find(Boolean) || "";
}

function whichOnPath(names) {
  const pathEnv = process.env.PATH || process.env.Path || "";
  const dirs = pathEnv.split(process.platform === "win32" ? ";" : ":");
  const extensions = process.platform === "win32" ? ["", ".exe"] : [""];
  for (const name of names) {
    for (const dir of dirs) {
      if (!dir) continue;
      for (const ext of extensions) {
        const candidate = join(dir, name + ext);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return "";
}

const cfg = loadConfig();
export const PUBLIC_MODE = existsSync(join(HERE, "public-release.json"));
export const DEFAULT_AUTHOR = cfg.author || (PUBLIC_MODE ? "Mod Author" : "Mr Space Cadet");
const configuredPath = (value) => value ? resolve(dirname(CONFIG_PATH), value) : "";
const luacName = process.platform === "win32" ? "luac.exe" : "luac";

export const BRAIN_ROOT = resolve(
  process.env.PZ_BRAIN_ROOT || configuredPath(cfg.brainRoot) || join(HERE, ".."),
);

export const WORKSHOP_ROOT = resolve(
  process.env.PZ_WORKSHOP_ROOT || configuredPath(cfg.workshopRoot) || join(BRAIN_ROOT, ".."),
);

export const LUAC_PATH = resolve(
  process.env.PZ_LUAC_PATH ||
    configuredPath(cfg.luacPath) ||
    firstExisting([
      join(HERE, "vendor", "lua-5.1.5", luacName),
      join(BRAIN_ROOT, "..", "vendor", "lua-5.1.5", luacName),
      join(WORKSHOP_ROOT, "_tooling", "lua-5.1.5", luacName),
      join(WORKSHOP_ROOT, "lua-5.1.5", luacName),
      whichOnPath(["luac5.1", "luac"]),
    ]),
);

export const PENDING_PATCH_DIR = join(HERE, "pending-patches");
export const BACKUP_ROOT = join(HERE, "backups");
export const TRUTH_ROOT = join(BRAIN_ROOT, "truth");
export const WORKSHOP_UPLOAD_STAGING_ROOT = join(WORKSHOP_ROOT, "_workshop-upload-staging");
export const CORPUS_ROOT = resolve(process.env.PZ_CORPUS_ROOT || configuredPath(cfg.corpusRoot) || join(BRAIN_ROOT, "mod-corpus"));
export const GAME_ROOT = configuredPath(process.env.PZ_GAME_ROOT || cfg.gameRoot);
export const USER_DATA_ROOT = configuredPath(process.env.PZ_USER_DATA_ROOT || cfg.userDataRoot);
export const SERVER_ROOT = configuredPath(process.env.PZ_SERVER_ROOT || cfg.serverRoot);

export function describeRoots() {
  return {
    here: HERE,
    configPath: CONFIG_PATH,
    configLoaded: existsSync(CONFIG_PATH),
    brainRoot: BRAIN_ROOT,
    workshopRoot: WORKSHOP_ROOT,
    corpusRoot: CORPUS_ROOT,
    gameRoot: GAME_ROOT,
    userDataRoot: USER_DATA_ROOT,
    serverRoot: SERVER_ROOT,
    author: DEFAULT_AUTHOR,
    publicMode: PUBLIC_MODE,
    luacPath: LUAC_PATH,
    luacPresent: Boolean(LUAC_PATH && existsSync(LUAC_PATH)),
  };
}
