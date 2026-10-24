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
