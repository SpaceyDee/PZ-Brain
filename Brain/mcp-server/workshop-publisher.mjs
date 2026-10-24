import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_WORKSHOP_MODS = [
  "BB Common Sense Admin Tools",
  "BB Common Sense Containers",
  "BB Common Sense Core",
  "BB Common Sense Crafting",
  "BB Common Sense Medical",
  "BB Common Sense Survival",
  "BB Common Sense Vehicles",
  "BB Common Sense Compatibility Patch",
  "BitemeAdminTools",
];

function nowBatchId() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function safeRelPath(root, rawPath) {
  const abs = resolve(root, rawPath);
  if (abs !== root && !abs.startsWith(root + "\\")) {
    throw new Error(`path is outside workshop root: ${rawPath}`);
  }
  return abs;
}

export function parseWorkshopTxt(text) {
  const data = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    data[match[1]] = match[2];
  }
  return data;
}

function quoteVdf(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n");
}

function visibilityToVdf(value) {
  const normalized = String(value ?? "public").trim().toLowerCase();
  if (normalized === "public") return "0";
  if (normalized === "friends") return "1";
  if (normalized === "private") return "2";
  if (normalized === "hidden" || normalized === "unlisted") return "2";
  return "2";
}

function buildVdf(item) {
  return [
    '"workshopitem"',
    "{",
    `    "appid" "108600"`,
    `    "publishedfileid" "${quoteVdf(item.id || "0")}"`,
    `    "contentfolder" "${quoteVdf(item.contentfolder)}"`,
    `    "previewfile" "${quoteVdf(item.previewfile)}"`,
    `    "visibility" "${visibilityToVdf(item.visibility)}"`,
    `    "title" "${quoteVdf(item.title)}"`,
    `    "description" "${quoteVdf(item.description)}"`,
    `    "changenote" "${quoteVdf(item.changenote)}"`,
    "}",
    "",
  ].join("\n");
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function inspectMod(root, modPath, changenote) {
  const abs = safeRelPath(root, modPath);
  const workshopTxt = join(abs, "workshop.txt");
  const preview = join(abs, "preview.png");
  const contentsMods = join(abs, "Contents", "mods");
  const wt = parseWorkshopTxt(await readFile(workshopTxt, "utf8"));
  const missing = [];
  if (!await exists(workshopTxt)) missing.push("workshop.txt");
  if (!await exists(preview)) missing.push("preview.png");
  if (!await exists(contentsMods)) missing.push("Contents/mods");
  if (!wt.id) missing.push("workshop.txt id=");
  if (!wt.title) missing.push("workshop.txt title=");
  if (!wt.description) missing.push("workshop.txt description=");
  if (!wt.changenote) missing.push("workshop.txt changenote=");

  return {
    folder: modPath,
    abs,
    basename: basename(abs),
    id: wt.id ?? "",
    title: wt.title ?? basename(abs),
    description: wt.description ?? "",
    visibility: wt.visibility ?? "hidden",
    changenote: String(changenote || wt.changenote || "").trim(),
    contentfolder: contentsMods,
    previewfile: preview,
    workshop_txt: workshopTxt,
    missing,
  };
}

export async function stageWorkshopUploads({
  workshopRoot,
  stagingRoot,
  mods = DEFAULT_WORKSHOP_MODS,
  changenote = "",
  mode = "hold",
} = {}) {
  if (!workshopRoot) throw new Error("workshopRoot is required");
  if (!stagingRoot) throw new Error("stagingRoot is required");
  const normalizedMode = mode === "store" ? "store" : "hold";
  const batchId = `workshop-${nowBatchId()}`;
  const batchDir = join(stagingRoot, batchId);
  await mkdir(batchDir, { recursive: true });

  const items = [];
  for (const mod of mods) {
    const item = await inspectMod(workshopRoot, mod, changenote);
    const safeName = item.basename.replace(/[^A-Za-z0-9_.-]+/g, "_");
    item.vdf_path = join(batchDir, `${safeName}.vdf`);
    item.ok_to_upload = item.missing.length === 0;
    await writeFile(item.vdf_path, buildVdf(item), "utf8");
    items.push(item);
  }

  const manifest = {
    batch_id: batchId,
    mode: normalizedMode,
    created_at: new Date().toISOString(),
    approval_text: normalizedMode === "hold" ? `APPROVE WORKSHOP UPLOAD ${batchId}` : null,
    steamcmd_command_template: "steamcmd +login <username> +workshop_build_item <vdf_path> +quit",
    items: items.map((item) => ({
      folder: item.folder,
      workshop_id: item.id,
      title: item.title,
      visibility: item.visibility,
      contentfolder: item.contentfolder,
      previewfile: item.previewfile,
      vdf_path: item.vdf_path,
      ok_to_upload: item.ok_to_upload,
      missing: item.missing,
    })),
  };

  const manifestPath = join(batchDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return {
    batch_id: batchId,
    batch_dir: batchDir,
    manifest_path: manifestPath,
    mode: normalizedMode,
    approval_text: manifest.approval_text,
    items: manifest.items,
    ready_count: manifest.items.filter((item) => item.ok_to_upload).length,
    blocked_count: manifest.items.filter((item) => !item.ok_to_upload).length,
  };
}

export { DEFAULT_WORKSHOP_MODS };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const workshopRoot = resolve(process.cwd());
  const stagingRoot = join(workshopRoot, "_workshop-upload-staging");
  const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
  const noteArg = process.argv.find((arg) => arg.startsWith("--changenote="));
  const modsArg = process.argv.find((arg) => arg.startsWith("--mods="));
  const mode = modeArg ? modeArg.slice("--mode=".length) : "hold";
  const changenote = noteArg ? noteArg.slice("--changenote=".length) : "";
  const mods = modsArg
    ? modsArg.slice("--mods=".length).split("|").map((item) => item.trim()).filter(Boolean)
    : DEFAULT_WORKSHOP_MODS;
  const result = await stageWorkshopUploads({ workshopRoot, stagingRoot, mode, changenote, mods });
  console.log(JSON.stringify(result, null, 2));
}
