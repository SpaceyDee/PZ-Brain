# B42 Globals API Reference

> ⚠ **B42.15+ correction:** Any `pcall(...)` or `safeCall(...)` pattern shown below is **deprecated and unsafe.** `pcall` corrupts Kahlua in B42.15+ — do not introduce it in new code. Replace with explicit nil/method guards (`obj and obj.method and obj:method()`). Canonical rule lives in [SKILL.md](../../SKILL.md) principle #16 and [local-conventions.md](../local-conventions.md).

**Source:** `references/pz-api.md` from Brain skill file (sourced from `<local-path>`)
**Status:** VERIFIED — pulled from actual PZ game source

These are Lua → Java engine bindings exposed as global functions. They are not declared in any Lua file — they are built-ins provided by the engine.

---

## Player Accessors

| Function | Returns | Notes |
|---|---|---|
| `getPlayer()` | IsoPlayer or nil | Local primary player. **Nil during connect/disconnect/menu** - always nil-check before use. |
| `getSpecificPlayer(idx)` | IsoPlayer or nil | Resolve a player index (0-based) to the IsoPlayer object. Used in split-screen and context menu callbacks where only an index is given. |
| `getOnlinePlayers()` | ArrayList\<IsoPlayer\> | Server-side: all connected players. Nil-check first, then iterate with `:size()` and `:get(i)`. |
| `getPlayerByOnlineID(id)` | IsoPlayer or nil | Resolve a player by their online ID. |

---

## Environment / Context Checks

| Function | Returns | Notes |
|---|---|---|
| `isClient()` | boolean | True **only** on remote connected clients. Never on solo, hosted-host, or dedicated server. |
| `isServer()` | boolean | True **only** on a pure dedicated server process. |
| `isCoopHost()` | boolean | True on the host player of a hosted multiplayer game. Note: `isServer()` and `isClient()` are both false for this player — see `B42_Environment_Guards.md`. |
| `isSinglePlayer()` | boolean | True in solo play (not hosted, not dedicated). Built-in; prefer this over `not isServer() and not isClient()` for clarity. |
| `isMultiplayer()` | boolean | True in any multiplayer context (hosted or dedicated). |

---

## Engine Singletons

| Function | Returns | Notes |
|---|---|---|
| `getCore()` | Core | Engine singleton. Use for screen dimensions (`getCore():getScreenWidth()`, `:getScreenHeight()`), options, fonts. |
| `getCell()` | IsoCell | World cell. World-bound — nil before world loads. |
| `getGameTime()` | GameTime | World time singleton. Day length, in-game time, etc. |
| `getServerOptions()` | ServerOptions | Server-side config snapshot. Server-only. |
| `getSandboxOptions()` | SandboxOptions | Sandbox manager. Used internally by `initSandboxVars`. Access mod sandbox values via `SandboxVars.<ModId>.<Setting>` instead. |
| `getActivatedMods()` | ArrayList\<String\> | Currently loaded mod IDs. Use for soft dependency probing as an alternative to global checks. |
| `getTimestamp()` | int | Real-world unix timestamp from the engine. Prefer `os.time()` in Lua context; use this when in Java callback context. |

---

## File I/O

| Function | Returns | Notes |
|---|---|---|
| `getFileWriter(name, append, force)` | LuaFileWriter or nil | Append-mode log writer. `append=true, force=false` is the standard form. Latest B42 patch notes say file writers now return nil/null when initialized incorrectly, so always guard before `:write()`/`:close()`. **Always call `:close()` after each successful write.** Logs go to `%USERPROFILE%\Zomboid\Logs\<date>_<time>\`. |
| `getFileReader(name, internal)` | LuaFileReader | Read mod-local or game files. `internal=false` for mod files, `internal=true` for game-internal paths. |

---

## Steam / Auth

| Function | Returns | Notes |
|---|---|---|
| `getCurrentUserSteamID()` | string | Steam ID of the local player. Client-side only. |

---

## Misc

| Function | Returns | Notes |
|---|---|---|
| `triggerEvent(name, ...)` | — | Manually fire an event by name. Same as `Events.<Name>.trigger(...)`. |

---

## IsoPlayer Access Patterns

```lua
-- Solo / local player
local player = getPlayer()

-- By player index (context menu callbacks, split-screen)
-- IMPORTANT: onFillWorldObjectContextMenu gives you playerIdx, not the player object
local player = getSpecificPlayer(playerIdx)

-- Server-side: iterate all players
local players = getOnlinePlayers()
for i = 0, players:size() - 1 do
    local p = players:get(i)
    -- ...
end
```

---

## Access Level Values

`player:getAccessLevel()` returns a string. The complete set of real values from PZ source:

| Value | Meaning |
|---|---|
| `"Admin"` / `"admin"` | Full admin. PZ has historically returned both casing variants. |
| `"Moderator"` / `"moderator"` | Moderator. Same casing inconsistency. |
| `"Overseer"` | Overseer role. |
| `"GM"` | Game master. |
| `"Observer"` | Observer (spectator). |
| `""` | Default player — no elevated permissions. |

Always check both casings for Admin and Moderator:
```lua
local function isAdmin(player)
    if not player then return false end
    if not player.getAccessLevel then return false end
    local level = player:getAccessLevel()
    if not level then return false end
    return level == "admin" or level == "Admin"
        or level == "moderator" or level == "Moderator"
end
```

For solo play, `isSinglePlayer()` is true — treat the local player as admin in UI gates without calling `getAccessLevel()`.

---

## `SandboxVars`

`SandboxVars.<ModId>.<Setting>` — populated at world load by `getSandboxOptions():initSandboxVars()` from `media/lua/shared/Sandbox/SandboxVars.lua`. Sandbox preset files (`Apocalypse.lua`, `Outbreak.lua`, `Rising.lua`, `SixMonthsLater.lua`, `Extinction.lua`) are PZ-internal — mods declare their own options in `media/sandbox-options.txt`. Use `SandboxVars` for **first-init defaults only**; live config should come from `ModData`.

---

## `LuaEventManager` — Custom Events

```lua
-- Declare a custom event (call once, in shared or appropriate file)
LuaEventManager.AddEvent("MyModEvent")

-- Subscribe
Events.MyModEvent.Add(function(arg1, arg2)
    -- ...
end)

-- Trigger
Events.MyModEvent.trigger(someArg, anotherArg)
```

PZ itself uses this for many events: `OnExitVehicle`, `OnSwitchVehicleSeat`, `OnUseVehicle`, `OnVehicleHorn`, all `OnSteam*` events, `OnDesignationZoneUpdatedNetwork`, and others. These are indistinguishable from "core" events once declared — same subscription and trigger API.

---

## See Also

- `B42_Environment_Guards.md` — isServer()/isClient() truth table
- `B42_Lua_Events_Official.md` — full event catalog
- `B42_ISUI_Components.md` — ISButton, ISScrollingListBox, ISTextEntryBox, ISContextMenu
- `B42_IsoPlayer_API.md` — IsoPlayer methods
