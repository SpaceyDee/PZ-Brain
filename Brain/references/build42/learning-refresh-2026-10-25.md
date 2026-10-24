# Brain knowledge refresh — 2026-10-25

This refresh reconciles recorded discoveries; it is not a new game runtime test.
The structured registry is the source for evidence, game versions and status.
Search verified truths first. Pending discoveries remain hypotheses or scoped
observations until their evidence has been reviewed. A later package version
does not make every claim valid on every later Project Zomboid build.

## Corrected verified guidance

- `b42.pcall.broken` is a historical ID whose current verified conclusion is
  that `pcall` works on B42.18 dedicated (T30/T32/T34). Avoiding blanket wrappers
  is a project convention. `safeCall` has not been separately verified.
- `b42.env.hosted-host-player-isclient-true`: hosted play has a host player
  process (`isClient=true`, `isServer=false`) and an embedded server process
  (`isClient=false`, `isServer=true`). Both-false identifies singleplayer.
  The embedded server cannot be distinguished from dedicated using these two
  flags. Server file guard: `if isClient() then return end`; UI file guard:
  `if isServer() then return end`; shared files have no top-level guard.

## Recent discoveries retained for review

The pending registry contains the detailed evidence behind these observations:

- Inner `not isClient()` guards can skip network sends in singleplayer; that
  does not justify a negative guard at the top of a client file.
- Command auditing must recognize both three-argument and player-first
  four-argument `sendClientCommand` forms.
- Vehicle engine-loudness methods cannot control player footsteps. Additional
  world-sound pings are separate from the engine's original footstep sound.
- Nutrition weight is distinct from carried inventory weight. The 60/80/100
  clamp is a particular mod's balancing choice, not a universal engine limit.
- Value-bound `require` callers need an export from their target Lua module.
  Side-effect-only `require` files need not all return tables. See
  `b42.lua.require-must-return-module-table` for the observed failure.
- Lua local functions referenced before declaration need a forward declaration;
  this follows Lua lexical scoping and is not exclusive to B42.
- Friendly NPCs represented by `IsoZombie` can contaminate hostile scans unless
  ally identity is filtered at the scan source.
- NPC `Hit` calls and `addZombiesInOutfit` overloads need verification against
  the installed game version; third-party source is evidence, not an API guarantee.
- On the recorded B42.21 Linux client, `.jsonl` failed through `getFileWriter`
  while the `.txt` trace succeeded. Preserve this as a build/platform observation;
  it does not prove every other extension works on every environment.
- The release gate requires runtime log evidence for PASS. Static checks alone
  cannot establish gameplay behavior or multiplayer correctness.
- Mastery capstone selection must not fall back to a colliding specialization
  name. This is mod-specific, not a general PZ engine rule.

## Carrying knowledge forward

Public Brain 0.2.0 includes canonical and pending records with their status.
The public importer compares content rather than assuming a higher version has
more knowledge. Unique older records become pending entries, conflicts preserve
both claims, and extra references become searchable imported evidence. It never
executes old MCP code or copies its credentials, configuration or agent policy.
Review imported evidence against the installed game version before promotion.
