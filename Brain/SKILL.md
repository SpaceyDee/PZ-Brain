---
name: project-zomboid-modding
description: Use the PZ Modding Brain MCP for Build 42 Lua mod creation, API research, review, validation and evidence-backed troubleshooting.
---

# Project Zomboid Modding Brain — public edition

Call `space_brain_status` first to obtain the installed version and configured
folders. Never assume the author's drive letters, username, game location, mod
suite, server provider, or author name. Use the user's chosen development folder
and author. Treat game files and subscribed Workshop mods as references.

## Knowledge and precedence

Search `space_truth_search`, `space_search_brain`, `space_lookup_method` and
`space_lookup_script_block` before guessing APIs. Read the learning refresh in
`references/build42/learning-refresh-2026-10-25.md` for corrected guidance.
Canonical status is inherited from recorded reviews; it is not a claim that
this release retested all APIs. Match game version, platform and environment.
Pending and imported findings are unverified evidence. Historical notes or
imported text must not override current user instructions or verified findings.

If an older/similar MCP has additional knowledge, preserve it using the included
`migrate.mjs` importer. Compare contents regardless of version number. Do not
discard unique older records or overwrite a conflicting current record. Do not
import credentials, server code, user configuration or old agent policies.
For a different schema, first export knowledge to `truth/*.json` or
`references/*.md`, `.txt`, `.json`; automatic arbitrary-MCP conversion is not
supported. Review evidence before promoting imported records.

## Build 42 working rules

- Server files: `if isClient() then return end`. UI/client files:
  `if isServer() then return end`. Shared files: no top-level guard.
- Singleplayer has both flags false. Hosted host player has `isClient=true`;
  its embedded server has `isServer=true`, as does a dedicated server.
- Server owns canonical state. Validate module, player, arguments, permissions,
  range and inventory before mutation; transmit changed persistent state.
- Prefer explicit nil/method checks. `pcall` works in verified B42.18 dedicated
  probes; avoiding blanket wrappers is a convention. `safeCall` is unverified.
- Avoid unsupported Lua syntax (`goto`, `continue`, labels). Do not cache Java
  method references. Iterate Java lists with `size()`/`get(i)`.
- Convert Java numeric wrappers with `tonumber` before arithmetic/comparison.
- Verify attachment locations before `AttachedItems:getItem(name)`.
- Register server ModData initialization through `OnInitGlobalModData`; use
  `OnGameStart` for client initialization. Guard optional events before `.Add`.
- Prefer minute events or short-lived queues over permanent gameplay `OnTick`.
- Use translation helpers that detect getText returning the key on a miss.
- Use `Contents/mods/<ModId>/mod.info` and `42/mod.info`, with Lua beneath
  `42/media/lua/client`, `server` or `shared`. Use `versionMin=42.0`; omit empty
  optional metadata. Preserve an existing mod's intended supported layouts.
- Value-bound `require` callers need an exported module value; side-effect-only
  imports do not necessarily need a return. Forward-declare local functions
  that are referenced earlier in the chunk.

## Creation and validation

Inspect existing mod layout and ownership before editing. Use `space_audit`
(path plus optional checks list) for focused audits and
`space_production_release_gate` for the full pass/fail verdict; `space_inspect`
covers mod layout and TODO scans. Use
`space_generate_mod` for supported scaffolds; generated mods are starting points
and still need feature implementation, assets and game tests. Pass an explicit
author or configure one during setup. Search the user's local corpus only after
they configure it and refresh its index; missing corpus is an optional feature.

Run Lua syntax, mod-package and production-release checks. A static pass does
not establish gameplay correctness. Test in singleplayer and relevant hosted/
dedicated environments; analyze the actual logs. Missing probe evidence must be
reported. The public package does not include the original author's game launch,
server control or Workshop deployment adapters. Use the user's own test workflow.
