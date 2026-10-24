# LUA MODDING NOTES

> ⚠ **B42.15+ correction:** Any `pcall(...)` or `safeCall(...)` pattern shown below is **deprecated and unsafe.** `pcall` corrupts Kahlua in B42.15+ — do not introduce it in new code. Replace with explicit nil/method guards (`obj and obj.method and obj:method()`). Canonical rule lives in [SKILL.md](../../SKILL.md) principle #16 and [local-conventions.md](../local-conventions.md).

Practical Lua patterns for Project Zomboid B42 modding. Confirmed from source review and testing.

---

## File Placement Rules

| Folder | When to use |
|---|---|
| `media/lua/server/` | Code that must run on the server process. Also runs in SP and hosted-host. |
| `media/lua/client/` | Code that runs on any human-facing game process (SP, hosted-host, remote client). |
| `media/lua/shared/` | Code loaded on both sides. Use for constants, MODULE_ID, shared utilities. |

Never put server logic in a shared file. Never put UI logic in a server file.

---

## Environment Guards

```lua
-- TOP of every server file
if isClient() then return end

-- TOP of every client file
if isServer() then return end

-- Shared files: no guard — they must load everywhere
```

Three-state truth table:

| Environment | isServer() | isClient() |
|---|---|---|
| Singleplayer | false | false |
| Hosted-host | false | false |
| Hosted-remote | true (wait — no) | true |
| Dedicated server | true | false |
| Dedi client | false | true |

> **Critical:** Hosted-host is `isServer()=false, isClient()=false` — same as singleplayer. Never use `if not isServer() then return end` in a server file. It silently disables the file in SP and hosted-host.

---

## Module Pattern

Every file should use a module table:

```lua
local MyModule = {}

function MyModule.doThing()
    -- ...
end

Events.OnGameStart.Add(function()
    MyModule.doThing()
end)

return MyModule
```

---

## Nil/Method Guard Pattern

Do not use `pcall` or a `safeCall` wrapper in B42.15+. Guard every external
object and method before calling it:

```lua
local function getAccessLevel(player)
    if not player then return "" end
    if not player.getAccessLevel then return "" end
    return player:getAccessLevel() or ""
end

Events.EveryOneMinute.Add(function()
    if MyModule and MyModule.tick then
        MyModule.tick()
    end
end)
```

Run `<local-path> -p` plus
`scripts/kahlua_compat_guard.py` on edited Lua files before shipping. PZ runs
Kahlua (Lua 5.1-class); Lua 5.5/`luac55` is not a valid gate. The Brain MCP
exposes this syntax check as `space_validate_lua_syntax`.

---

## Logging Pattern

```lua
local function logLine(level, msg)
    print(string.format("[MyMod][%s] %s", level, tostring(msg)))
end

-- Usage:
logLine("INFO", "Module initialized")
logLine("WARN", "Unexpected nil value for playerID")
logLine("ERROR", "Failed to load store: " .. tostring(err))
```

---

## Event Name Reference (B42 Verified)

### Tickers (no "On" prefix)
- `EveryOneMinute`
- `EveryTenMinutes`
- `EveryHours`
- `EveryDays`

### Lifecycle
- `OnGameStart` — fires on clients. NOT for server ModData bootstrap.
- `OnInitGlobalModData(newGame)` — server bootstrap hook. Safe to call `ModData.getOrCreate()` here.
- `OnCreatePlayer(playerIndex, player)` — fires when a player character is created
- `OnPlayerDeath(player)` — fires when a player dies

### Networking
- `OnClientCommand(module, command, player, args)` — server-side; receives from client
- `OnServerCommand(module, command, args)` — client-side; receives from server

### World/Object
- `OnObjectAdded(object)` — fires when an object is added to the world
- `OnObjectRemoved(object)` — fires when an object is removed

### Chat
- `OnChatWindowInit` — fires once when chat panel is initialized (safe to hook chat)
- `OnChatMessage(chatType, author, text)` — fires on every chat message received

### Input
- `OnKeyPressed(key)` — fires on key down (use `Keyboard.isKeyDown(key)` for held)
- `OnKeyReleased(key)` — fires on key up
- `OnMouseDown(x, y)` — fires on left click

---

## Custom Events

Declare custom events so they can be fired and listened to across files:

```lua
-- In a shared file, at top level (not inside a function):
LuaEventManager.AddEvent("OnMyModStateChanged")

-- Fire it:
Events.OnMyModStateChanged.Trigger(data)

-- Listen:
Events.OnMyModStateChanged.Add(function(data)
    -- handle
end)
```

---

## Avoiding Double Registration

Register event handlers only once. Use a module-level flag:

```lua
local initialized = false

local function init()
    if initialized then return end
    initialized = true

    Events.EveryOneMinute.Add(myTickHandler)
    Events.OnClientCommand.Add(myCommandHandler)
end

Events.OnGameStart.Add(init)
```

---

## Accessing Players

```lua
-- Singleplayer / hosted-host
local player = getPlayer()

-- By player index (multiplayer)
local player = getSpecificPlayer(0)  -- local player index

-- From OnClientCommand (server side) — AUTHORITATIVE
Events.OnClientCommand.Add(function(module, command, player, args)
    -- 'player' here is the server-verified IsoPlayer — use this, not args.playerID
end)
```

---

## Player ModData

```lua
local modData = player:getModData()
modData.myKey = "value"
-- No transmit needed — player ModData is saved with the player, not synced via ModData API
```

---

## Item ModData

```lua
local item = player:getInventory():getFirstType("Base.Hammer")
if item then
    local md = item:getModData()
    md.uses = (md.uses or 0) + 1
end
```

---

## Nil Safety Patterns

```lua
-- Chained nil checks
local name = player and player:getUsername() or "unknown"

-- Table default
local store = ModData.getOrCreate("MyMod")
store.count = store.count or 0

-- Nested nil
local level = store.players and store.players[username] and store.players[username].level or 0
```

---

## String Utilities

```lua
-- Split a command string into tokens (chat commands)
local function splitArgs(text)
    local args = {}
    for word in text:gmatch("%S+") do
        table.insert(args, word)
    end
    return args
end

-- Example: "/give hammer 2" → {"/give", "hammer", "2"}
local parts = splitArgs(inputText)
local cmd = parts[1]
local itemId = parts[2]
local count = tonumber(parts[3]) or 1
```

---

## Table Utilities

```lua
-- Check if value exists in table
local function tableContains(t, value)
    for _, v in ipairs(t) do
        if v == value then return true end
    end
    return false
end

-- Count table entries (for non-sequential tables)
local function tableSize(t)
    local n = 0
    for _ in pairs(t) do n = n + 1 end
    return n
end
```

---

## Timers and Delays

PZ has no native setTimeout. Use event ticks:

```lua
local tickCount = 0
local TARGET_TICKS = 5

local function onTick()
    tickCount = tickCount + 1
    if tickCount >= TARGET_TICKS then
        Events.OnTick.Remove(onTick)
        -- do deferred work here
    end
end

Events.OnTick.Add(onTick)
```

> OnTick fires every frame. For anything >1 second, prefer `EveryOneMinute` or `EveryTenMinutes` to avoid per-frame cost.

---

## Require Pattern

```lua
-- Load a shared module
local SharedUtils = require("shared/MyMod_SharedUtils")

-- In the shared file:
local SharedUtils = {}
-- ... define functions ...
return SharedUtils
```

> Paths in `require()` are relative to `media/lua/`. File must use `return` at end.

---

## Access Level Checks

```lua
local function isAdmin(player)
    local level = player:getAccessLevel()
    return level == "Admin" or level == "Moderator"
end

-- Full access level values (case-sensitive):
-- "Admin", "Moderator", "Overseer", "GM", "Observer", ""
-- Note: "Admin" and "Moderator" capitalized, others vary.
```

---

## Common Mistakes

| Mistake | Correct Pattern |
|---|---|
| `if not isServer() then return end` in server file | `if isClient() then return end` |
| `OnEveryOneMinute` | `EveryOneMinute` |
| `OnEveryTenMinutes` | `EveryTenMinutes` |
| Trusting `args.username` for player identity | Use `player` param from `OnClientCommand` |
| Registering events inside a function called multiple times | Use init guard flag |
| `sendGlobalModData()` | `ModData.transmit(key)` (B42 verified) |
| Reading ModData before `OnInitGlobalModData` | Wait for the event |
