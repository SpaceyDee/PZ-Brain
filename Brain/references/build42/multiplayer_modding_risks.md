# MULTIPLAYER MODDING RISKS

Specific risks that apply when developing PZ mods for multiplayer servers. Each entry is a real failure mode.

---

## Risk 1 — Wrong Environment Guard (Severity: High)

**What happens:** Using `if not isServer() then return end` in a server file silently disables it in singleplayer and hosted-host. No error. Just nothing works.

**Cause:** Misunderstanding the three-state model. Hosted-host has `isServer()=false`.

**Fix:** Server files use `if isClient() then return end`. Client files use `if isServer() then return end`.

---

## Risk 2 — Trusting Client Identity (Severity: Critical)

**What happens:** Server code uses `args.username` to decide who is acting. A malicious client sends a different username in `args` and impersonates an admin.

**Fix:** Always use the `player` parameter from `Events.OnClientCommand` — it is the authoritative server-resolved IsoPlayer. Never trust `args.username`, `args.playerID`, or `args.steamID`.

---

## Risk 3 — Missing ModData Transmit (Severity: Medium)

**What happens:** Server mutates ModData but forgets to call `ModData.transmit(key)`. Client shows stale data. No error. Users report "the feature doesn't work."

**Fix:** Call `ModData.transmit(MODULE_ID)` after every structural mutation that the client UI needs to see.

---

## Risk 4 — No Reconnect Sync Path (Severity: Medium)

**What happens:** A player reconnects after the server has updated state. Client still shows old state because nobody pushed the new state to the rejoining player.

**Fix:** On `Events.OnGameStart` (client), call `ModData.request(MODULE_ID)` to pull current state from server.

---

## Risk 5 — MODULE_ID Mismatch (Severity: High)

**What happens:** Server file has `MODULE_ID = "MyMod"`. Client file has `MODULE_ID = "Mymod"` (lowercase m). Every command silently drops. No error.

**Fix:** Define `MODULE_ID` in a shared file and require it on both sides, or manually ensure exact string match.

---

## Risk 6 — State Desync on Simultaneous Actions (Severity: Medium)

**What happens:** Two clients send the same command at the same time. Server processes them sequentially, but both clients update their local UI immediately, creating a race between the local prediction and the actual server result.

**Fix:** For economy/inventory changes, do not update client state until the server confirmation arrives via `sendServerCommand`. Never trust client-side predictions for authoritative state.

---

## Risk 7 — Save Compatibility Break (Severity: High)

**What happens:** A mod update removes a ModData key, renames a command string, changes an item ID, or restructures stored data. Players who had the old save now get nil access errors or broken state.

**Fix:** Add migration code that checks `store.version` and upgrades old data structures. Increment the `version` field. Warn in changelog when save format changes.

---

## Risk 8 — Large ModData Transmit (Severity: Low–Medium)

**What happens:** `ModData.transmit()` is called on a very large table (hundreds of entries). This serializes and sends the entire table at once. On active servers with many players, this can cause visible lag spikes.

**Fix:** Use `sendServerCommand` for targeted small updates. Reserve `ModData.transmit()` for initial sync or when a full state push is genuinely needed.

---

## Risk 9 — Event Handler Double Registration (Severity: Medium)

**What happens:** A function that registers an event handler (e.g., `Events.OnClientCommand.Add(fn)`) runs twice — perhaps from a reload or two separate init paths. The handler is now registered twice. Every command is processed twice. Actions may be doubled.

**Fix:** Use a module-level boolean flag to guard init functions. E.g. `if chatHookInstalled then return end`.

---

## Risk 10 — Broadcast Leaking Private State (Severity: High)

**What happens:** An admin action or player-specific state is sent via `sendServerCommand(MODULE_ID, "sync", state)` (broadcast form) instead of `sendServerCommand(player, MODULE_ID, "sync", state)` (targeted form). All players receive another player's private data.

**Fix:** Use the player-targeted form for any data that is specific to one player. Use broadcast only for truly global state (server announcements, world-state changes visible to everyone).

---

## Risk 11 — Workshop Update Breaks Live Servers (Severity: High)

**What happens:** A Workshop update is pushed while a server is running. Players on that server may have a different version from the server. This can cause command handler mismatches, item ID conflicts, or save format incompatibilities.

**Fix:** Coordinate Workshop updates with server restarts. Test for backward compatibility when the change is not breaking. Increment version numbers so mismatches are identifiable.

---

## Risk 12 — Blanket wrappers can hide runtime failures

**Corrected 2026-10-25:** `pcall` works in verified B42.18 dedicated probes (T30/T32/T34). The older claim that it always breaks Kahlua was disproven. `safeCall` has not been separately verified.

**Risk:** A wrapper that swallows an error can hide a missing effect or produce misleading probe evidence even when the wrapper works correctly.

**Convention:** Prefer explicit nil/type guards and visible errors:

```lua
-- Avoid blanket wrappers by convention; pcall itself is functional
local ok, val = pcall(function() return player:getX() end)

-- CORRECT
local val = player and player.getX and player:getX() or 0
```

---

## Risk 13 — Nested Tables in Command Args Silently Stripped (Severity: High)

**What happens:** `sendClientCommand` and `sendServerCommand` args that contain nested tables silently lose those nested values in transit. The outer table arrives intact, but all nested table values are nil or absent. No error is logged.

**Cause:** The PZ network serialization for mod commands only supports a flat table of primitives (strings, numbers, booleans). Nested tables are silently dropped.

**Fix:** Only use primitives in command args. Encode complex data as flat fields:

```lua
-- WRONG — nested table dropped in transit
sendClientCommand(MODULE_ID, "doThing", { pos = { x=10, y=20, z=0 } })

-- CORRECT — flat primitives only
sendClientCommand(MODULE_ID, "doThing", { posX=10, posY=20, posZ=0 })

-- Arrays: encode as comma-separated strings
sendClientCommand(MODULE_ID, "setItems", { items = "item1,item2,item3" })
```
