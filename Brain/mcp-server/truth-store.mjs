import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

export const TRUTH_KINDS = new Set([
  "api",
  "event",
  "layout",
  "env_guard",
  "networking",
  "moddata",
  "translation",
  "sandbox",
  "ui",
  "timed_action",
  "trap",
  "pattern",
  "workflow",
  "release_gate",
  "config",
  "mod",
]);
export const TRUTH_KIND_LIST = [...TRUTH_KINDS];
export const TRUTH_STATUSES = new Set(["pending", "verified", "deprecated"]);
export const TRUTH_CONFIDENCES = new Set(["low", "medium", "high"]);
export const TRUTH_CREATORS = new Set(["human", "agent", "test-server"]);
export const RUNTIME_EVIDENCE_ENVIRONMENTS = new Map([
  ["runtime_sp", "sp"],
  ["runtime_hosted_host", "hosted_host"],
  ["runtime_hosted_client", "hosted_client"],
  ["runtime_dedicated", "dedicated"],
  ["runtime_client_to_dedicated", "client_to_dedicated"],
]);

// Keywords that, when found in an evidence item, satisfy a "tooling" environment requirement.
// Covers owner-verified upload/deploy outcomes and Steam API results.
// This path does NOT weaken runtime gates — it is a separate, additive evidence kind.
export const TOOLING_EVIDENCE_KEYWORDS = [
  "owner-verified",
  "tooling_",
  "upload succeeded",
  "upload success",
  "workshop upload",
  "deploy succeeded",
  "deploy success",
  "steam api",
];

function storePaths(root) {
  const base = resolve(root);
  return {
    root: base,
    truths: join(base, "truths.json"),
    pending: join(base, "pending.json"),
    schema: join(base, "schema.json"),
  };
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (err?.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  return [String(value)].filter(Boolean);
}

function normalizeId(id) {
  return String(id ?? "").trim().toLowerCase();
}

function validateEntry(entry, { pending = false } = {}) {
  const errors = [];
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(entry.id ?? "")) errors.push("id must be lowercase dotted/kebab/snake text");
  if (!TRUTH_KINDS.has(entry.kind)) errors.push(`invalid kind: ${entry.kind}`);
  if (!TRUTH_STATUSES.has(entry.status)) errors.push(`invalid status: ${entry.status}`);
  if (pending && entry.status !== "pending") errors.push("pending entries must use status=pending");
  if (!TRUTH_CONFIDENCES.has(entry.confidence)) errors.push(`invalid confidence: ${entry.confidence}`);
  if (!String(entry.summary ?? "").trim()) errors.push("summary is required");
  if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) errors.push("at least one evidence item is required");
  if (!TRUTH_CREATORS.has(entry.created_by)) errors.push(`invalid created_by: ${entry.created_by}`);
  if (!String(entry.created_at ?? "").trim()) errors.push("created_at is required");
  if (!String(entry.updated_at ?? "").trim()) errors.push("updated_at is required");
  return errors;
}

function normalizeEntry(raw, { forceStatus } = {}) {
  const timestamp = nowIso();
  const status = forceStatus ?? raw.status ?? "pending";
  return {
    id: normalizeId(raw.id),
    kind: String(raw.kind ?? "").trim(),
    status,
    confidence: String(raw.confidence ?? "medium").trim(),
    summary: String(raw.summary ?? "").trim(),
    ...(raw.details ? { details: String(raw.details) } : {}),
    pz_versions: normalizeList(raw.pz_versions),
    evidence: normalizeList(raw.evidence),
    enforced_by: normalizeList(raw.enforced_by),
    created_by: String(raw.created_by ?? "agent").trim(),
    created_at: raw.created_at ?? timestamp,
    updated_at: timestamp,
  };
}

function evidenceText(evidence) {
  if (typeof evidence === "string") return evidence;
  if (evidence && typeof evidence === "object") return JSON.stringify(evidence);
  return String(evidence ?? "");
}

function runtimeEvidenceEnvironments(entry) {
  const found = new Set();
  for (const evidence of entry.evidence ?? []) {
    const text = evidenceText(evidence).toLowerCase();
    for (const [evidenceType, environment] of RUNTIME_EVIDENCE_ENVIRONMENTS.entries()) {
      if (text.includes(evidenceType)) found.add(environment);
    }
  }
  return found;
}

function toolingEvidencePresent(entry) {
  for (const evidence of entry.evidence ?? []) {
    const text = evidenceText(evidence).toLowerCase();
    if (TOOLING_EVIDENCE_KEYWORDS.some((kw) => text.includes(kw))) return true;
  }
  return false;
}

function requireRuntimeEvidence(entry, requiredEnvironments) {
  const required = normalizeList(requiredEnvironments);
  if (!required.length) {
    throw new Error("required_environments are required for verified promotion");
  }
  const runtimeRequired = required.filter((e) => e !== "tooling");
  const toolingRequired = required.includes("tooling");
  if (toolingRequired && !toolingEvidencePresent(entry)) {
    throw new Error(
      "missing tooling evidence: add 'owner-verified' or 'upload succeeded' evidence to support tooling promotion",
    );
  }
  if (runtimeRequired.length) {
    const found = runtimeEvidenceEnvironments(entry);
    const missing = runtimeRequired.filter((environment) => !found.has(environment));
    if (missing.length) {
      throw new Error(`missing runtime evidence for environments: ${missing.join(", ")}`);
    }
  }
}

export async function loadTruthStore(root) {
  const paths = storePaths(root);
  const truthsDoc = await readJson(paths.truths, { version: 1, truths: [] });
  const pendingDoc = await readJson(paths.pending, { version: 1, pending: [] });
  return {
    paths,
    truthsDoc: { version: truthsDoc.version ?? 1, truths: Array.isArray(truthsDoc.truths) ? truthsDoc.truths : [] },
    pendingDoc: { version: pendingDoc.version ?? 1, pending: Array.isArray(pendingDoc.pending) ? pendingDoc.pending : [] },
  };
}

async function saveTruths(root, truths) {
  await writeJson(storePaths(root).truths, { version: 1, truths });
}

async function savePending(root, pending) {
  await writeJson(storePaths(root).pending, { version: 1, pending });
}

function entryMatches(entry, { query = "", kind, status } = {}) {
  if (kind && entry.kind !== kind) return false;
  if (status && entry.status !== status) return false;
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    entry.id,
    entry.kind,
    entry.status,
    entry.confidence,
    entry.summary,
    entry.details,
    ...(entry.pz_versions ?? []),
    ...(entry.evidence ?? []),
    ...(entry.enforced_by ?? []),
  ].join("\n").toLowerCase();
  return haystack.includes(needle);
}

function scoreEntry(entry, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return 0;
  if (entry.id === needle) return 100;
  if (entry.id.includes(needle)) return 80;
  if (String(entry.summary ?? "").toLowerCase().includes(needle)) return 60;
  return 10;
}

export async function searchTruths(root, opts = {}) {
  const max = Math.min(100, Math.max(1, Number(opts.max_results ?? 25)));
  const { truthsDoc, pendingDoc } = await loadTruthStore(root);
  const status = opts.status ? String(opts.status) : "verified";
  const source = status === "pending" ? pendingDoc.pending : truthsDoc.truths;
  const entries = source
    .filter((entry) => entryMatches(entry, { query: opts.query, kind: opts.kind, status }))
    .sort((a, b) => scoreEntry(b, opts.query) - scoreEntry(a, opts.query) || a.id.localeCompare(b.id))
    .slice(0, max);
  return { status, count: entries.length, entries };
}

export async function getTruth(root, id) {
  const target = normalizeId(id);
  const { truthsDoc, pendingDoc } = await loadTruthStore(root);
  const found = [...truthsDoc.truths, ...pendingDoc.pending].find((entry) => entry.id === target);
  if (!found) throw new Error(`truth not found: ${target}`);
  return found;
}

export async function proposeTruth(root, rawEntry) {
  if (String(rawEntry?.status ?? "").trim() === "verified") {
    throw new Error("direct verified writes are blocked; propose pending and promote with runtime evidence");
  }
  const entry = normalizeEntry(rawEntry ?? {}, { forceStatus: "pending" });
  const errors = validateEntry(entry, { pending: true });
  if (errors.length) throw new Error(`invalid pending truth: ${errors.join("; ")}`);
  const { truthsDoc, pendingDoc } = await loadTruthStore(root);
  if (truthsDoc.truths.some((truth) => truth.id === entry.id)) throw new Error(`canonical truth already exists: ${entry.id}`);
  const pending = pendingDoc.pending.filter((truth) => truth.id !== entry.id);
  pending.push(entry);
  await savePending(root, pending);
  return entry;
}

export async function reviewTruths(root, opts = {}) {
  const status = String(opts.status ?? "pending");
  const max = Math.min(100, Math.max(1, Number(opts.max_results ?? 50)));
  const { truthsDoc, pendingDoc } = await loadTruthStore(root);
  const source = status === "pending" ? pendingDoc.pending : truthsDoc.truths;
  const filtered = source.filter((entry) => entryMatches(entry, { kind: opts.kind, status }));
  const entries = filtered.slice(0, max);
  return { status, count: entries.length, total: filtered.length, entries };
}

export async function promoteTruth(root, id, approvalText, opts = {}) {
  const target = normalizeId(id);
  const expected = `APPROVE TRUTH ${target}`;
  if (approvalText !== expected) throw new Error(`approval_text must exactly equal: ${expected}`);
  const { truthsDoc, pendingDoc } = await loadTruthStore(root);
  const idx = pendingDoc.pending.findIndex((entry) => entry.id === target);
  if (idx === -1) throw new Error(`pending truth not found: ${target}`);
  if (truthsDoc.truths.some((entry) => entry.id === target)) throw new Error(`canonical truth already exists: ${target}`);
  requireRuntimeEvidence(pendingDoc.pending[idx], opts.required_environments);
  const entry = { ...pendingDoc.pending[idx], status: "verified", updated_at: nowIso() };
  const errors = validateEntry(entry);
  if (errors.length) throw new Error(`invalid promoted truth: ${errors.join("; ")}`);
  const pending = pendingDoc.pending.filter((truth) => truth.id !== target);
  const supersedes = new Set(normalizeList(opts.supersedes).map(normalizeId));
  const truths = [
    ...truthsDoc.truths.map((truth) => {
      if (!supersedes.has(truth.id)) return truth;
      return {
        ...truth,
        status: "deprecated",
        updated_at: nowIso(),
        deprecation: {
          reason: `superseded by ${entry.id}`,
          replacement_id: entry.id,
          deprecated_at: nowIso(),
        },
      };
    }),
    entry,
  ].sort((a, b) => a.id.localeCompare(b.id));
  await savePending(root, pending);
  await saveTruths(root, truths);
  return entry;
}

export async function deprecateTruth(root, id, opts = {}) {
  const target = normalizeId(id);
  const expected = `DEPRECATE TRUTH ${target}`;
  if (opts.approval_text !== expected) throw new Error(`approval_text must exactly equal: ${expected}`);
  const reason = String(opts.reason ?? "").trim();
  if (!reason) throw new Error("reason is required");
  const { truthsDoc } = await loadTruthStore(root);
  const idx = truthsDoc.truths.findIndex((entry) => entry.id === target);
  if (idx === -1) throw new Error(`canonical truth not found: ${target}`);
  const updated = {
    ...truthsDoc.truths[idx],
    status: "deprecated",
    updated_at: nowIso(),
    deprecation: {
      reason,
      replacement_id: opts.replacement_id ? normalizeId(opts.replacement_id) : "",
      deprecated_at: nowIso(),
    },
  };
  const truths = truthsDoc.truths.map((entry, entryIdx) => (entryIdx === idx ? updated : entry));
  await saveTruths(root, truths);
  return updated;
}

function isLocalBrainEvidence(evidence) {
  return /^Brain[\\/]/.test(evidence);
}

export function looksLikeMcpToolName(name) {
  return /^space_[a-z0-9_]+$/.test(String(name ?? "")) || /^list_[a-z0-9_]+$/.test(String(name ?? ""));
}

export async function auditTruthStore(root, opts = {}) {
  const { truthsDoc, pendingDoc, paths } = await loadTruthStore(root);
  const errors = [];
  const warnings = [];
  const canonicalById = new Map();
  const seenPending = new Set();

  const checkEvidenceAndTools = (entry) => {
    for (const evidence of entry.evidence ?? []) {
      if (isLocalBrainEvidence(evidence)) {
        const abs = resolve(paths.root, "..", evidence.replace(/^Brain[\\/]/, ""));
        const rel = relative(resolve(paths.root, ".."), abs).split(sep).join("/");
        if (rel.startsWith("..")) errors.push(`${entry.id}: evidence escapes Brain root: ${evidence}`);
      }
    }
    if (opts.validTools instanceof Set) {
      for (const tool of entry.enforced_by ?? []) {
        if (!looksLikeMcpToolName(tool)) continue;
        if (!opts.validTools.has(tool)) warnings.push(`${entry.id}: unknown enforced_by tool: ${tool}`);
      }
    }
  };

  for (const entry of truthsDoc.truths) {
    for (const err of validateEntry(entry, { pending: false })) {
      errors.push(`truths:${entry.id || "(missing-id)"}: ${err}`);
    }
    if (canonicalById.has(entry.id)) errors.push(`duplicate canonical id: ${entry.id}`);
    canonicalById.set(entry.id, entry);
    checkEvidenceAndTools(entry);
  }

  for (const entry of pendingDoc.pending) {
    for (const err of validateEntry(entry, { pending: true })) {
      errors.push(`pending:${entry.id || "(missing-id)"}: ${err}`);
    }
    if (seenPending.has(entry.id)) errors.push(`duplicate pending id: ${entry.id}`);
    seenPending.add(entry.id);
    const canonical = canonicalById.get(entry.id);
    if (canonical) {
      warnings.push(
        `pending leftover: ${entry.id} is already ${canonical.status} in truths.json — drop it; it is not an approval candidate`,
      );
    }
    checkEvidenceAndTools(entry);
  }

  return {
    canonical: truthsDoc.truths.length,
    pending: pendingDoc.pending.length,
    errors,
    warnings,
  };
}
