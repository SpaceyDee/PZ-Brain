# 0.2.1 — 2026-10-25

- MCP token-usage reduction: public tool count 51 → 29; tools/list payload
  ~33.5KB → ~15.4KB.
- Consolidated 23 single-purpose audit/validate tools into `space_audit`
  (path + checks enum); merged mod layout and TODO scans into `space_inspect`.
- Trimmed verbose tool descriptions; detection detail stays discoverable via
  the truth store.
- Author-personal tools (biteme mods, BB sandbox menu, MasterySystem) hidden
  from the public profile; their checks return a clear public-profile error.
  Legacy enforced_by tool names remain valid in truth records.
- `space_truth_search`/`space_truth_review` return id, kind, status, confidence
  and summary only; `space_truth_get` remains the path to full details.
- Compact JSON responses for lookups and truth tools (no pretty-printing).
- `space_lookup_script_block` caps matches at 25 with 10 parameters per block
  by default; parameter descriptions appear only with a parameter filter.
- `space_brain_status` drops the static migration banner; resources list is
  capped at 25 non-import files.
- SKILL.md tool guidance updated to the new entry points.

# 0.2.0 — 2026-10-25

- First explicitly filtered public distribution; original package was 0.1.0.
- Version reported by MCP initialize and `space_brain_status` from package.json.
- Per-machine setup detects Steam library paths and configures independent mod,
  game, Workshop corpus, user-data, server and Lua compiler locations.
- Generic public author defaults; local source keeps its existing author.
- Older knowledge imports preserve provenance, conflicts and unique references;
  imports remain pending and repeated imports are idempotent.
- Corrected stale pcall and hosted-host environment guidance; added a dated
  summary of recorded recent findings without promoting unverified observations.
- Public file selection, private-path redaction, leakage checks, file hashes,
  locked dependencies and an MCP diagnostic for fresh installations.
- Public profile excludes workstation-specific probe and publishing adapters.
- Resource reads validate resolved paths and exclude MCP config/internal files.

Knowledge schema remains version 1. MCP package version and game version are
separate: see each record's pz_versions and evidence before relying on it.
