# PZ API Reference (Build 42)

API surface used by mods in this workshop, with signatures pulled from `<local-path>`. This is a working reference, not exhaustive — when in doubt, open the source file.

## Globals (Lua → Java bindings)

These are exposed by the engine, not declared in Lua source. Treat them as built-ins.

| Function | Returns | Notes |
|---|---|---|
| `getPlayer()` | IsoPlayer or nil | Local primary player. Nil during connect/disconnect/menu. |
| `getSpecificPlayer(idx)` | IsoPlayer or nil | Resolve a player index (0-based) to the object. Used in split-screen and context menu callbacks. |
| `getOnlinePlayers()` | ArrayList<IsoPlayer> | Server-side: all connected players. Use `:size()` and `:get(i)`. |
| `getPlayerByOnlineID(id)` | IsoPlayer or nil | Resolve by online ID. |
| `isClient()` | boolean | True on remote connected clients **and on the hosted-host PLAYER process** (verified truth `b42.env.hosted-host-player-isclient-true` — corrected 2026-05-31). False on solo, dedicated server, and the embedded coop-server process. |
| `isServer()` | boolean | True on a dedicated server process **and on the embedded coop-server process of a hosted game** (verified truth `b42.env.embedded-coop-server-iscoophost-false` — corrected 2026-05-31). False on solo, hosted-host player, and remote clients. |
| `isCoopHost()` | boolean | True on the host player of a hosted multiplayer game. |
| `isSinglePlayer()` | boolean | True in solo. |
| `getCore()` | Core | Engine singleton — screen size, options, fonts. |
| `getCell()` | IsoCell | World cell. |
| `getGameTime()` | GameTime | World time, day length, etc. |
| `getTimestamp()` | int | Real-world unix timestamp. |
| `getServerOptions()` | ServerOptions | Server-side config snapshot. |
| `getActivatedMods()` | ArrayList<String> | Currently loaded mod IDs. |
| `getSandboxOptions()` | SandboxOptions | Sandbox manager — used by `initSandboxVars`. |
| `getFileWriter(name, append, force)` | LuaFileWriter or nil | Append-mode log writer. Latest B42 patch notes say invalid writer initialization now returns nil/null. Guard before `:write()`/`:close()` and always close after successful writes. |
| `getFileReader(name, internal)` | LuaFileReader | Read mod-local or game files. |
| `getCurrentUserSteamID()` | string | Steam ID of local player. |
| `triggerEvent(name, ...)` | — | Manually fire an event. |

## `Events`

`Events.<Name>.Add(fn)`, `Events.<Name>.Remove(fn)`, `Events.<Name>.trigger(args...)`. Custom events declared via `LuaEventManager.AddEvent("<Name>")`. See [events-catalog.md](events-catalog.md) for the full ~163-event catalog.

## `ModData`

The single durable store for mod state. Server-side `ModData` is global to the world and survives restarts.

| Method | Notes |
|---|---|
| `ModData.getOrCreate(key)` | Returns the table, lazy-creating it. Most common entry point. |
| `ModData.get(key)` | Returns the table or nil. No create. |
| `ModData.exists(key)` | Boolean. |
| `ModData.add(key, table)` | Replace or insert. |
| `ModData.remove(key)` | Delete. |
| `ModData.transmit(key)` | **Server → all clients.** Push current value. Call after structural mutations the UI needs to see. |
| `ModData.request(key)` | **Client → server.** Ask the server to push the current value back. Used on connect or before opening a UI. |

Per-player ModData (different from the global store): `player:getModData()` returns a Lua table that lives on the IsoPlayer. Used by PZ itself for things like fishing rod state. Persists across save/load and reconnect. **Note:** on a dedicated server, `player:transmitModData()` REPLACES the client's player ModData table with the server's snapshot, wiping keys other client-side mods store there. PZ persists server-side player ModData automatically — only call `transmitModData()` when the client genuinely needs to see the change.

Per-item ModData: `item:getModData()` likewise — used for things like attached lures. Use `syncItemModData(player, item)` to push item ModData changes to the client.

Don't store function values, userdata, or non-serializable references. Tables, strings, numbers, booleans, and nested tables only.

## B42.17-Specific API Notes

### `getObjectById` — Broken in B42.17

`getObjectById(id)` does not reliably return `IsoZombie` objects in B42.17. Use `getObjectListForLua()` with an `instanceof` filter:

```lua
-- WRONG (broken in B42.17):
local zombie = getObjectById(id)

-- CORRECT:
local function getZombieFromID(id)
    for _, obj in ipairs(getObjectListForLua()) do
        if instanceof(obj, "IsoZombie") and obj:getOnlineID() == id then
            return obj
        end
    end
    return nil
end
-- Use getOnlineID() in MP, getID() in SP
```

Confirmed by CSR `CSR_DualWieldUtils.lua` — explicitly labeled as "B42.17 fix replacing broken `getObjectById`".

### Event Registration Safety — Nil-Guard Removed Events

B42 removed several events that existed in B41. Calling `.Add()` on a nil event crashes on load with "attempted index: Add of non-table: null". Always nil-guard event registration for non-core events:

```lua
-- WRONG — crashes if the event was removed:
Events.OnFillVehicleMenu.Add(myHandler)

-- CORRECT:
if Events.OnFillVehicleMenu then
    Events.OnFillVehicleMenu.Add(myHandler)
end
```

**Known removed events in B42:** `OnFillVehicleMenu` (vehicle context menus now go through `OnFillWorldObjectContextMenu` — detect vehicles via `square:getVehicleContainer()`).

### Player Traits API — B42 Safety Pattern

`player:getTraits()` may not exist or may return nil during early lifecycle events (`OnCreatePlayer`). The safe pattern:

```lua
local function hasTrait(playerObj, traitName)
    if not playerObj then return false end
    local traits
    if playerObj.getTraits then
        traits = playerObj:getTraits()
    elseif playerObj.getDescriptor then
        local desc = playerObj:getDescriptor()
        if desc and desc.getTraits then
            traits = desc:getTraits()
        end
    end
    if not traits or not traits.contains then return false end
    return traits:contains(traitName)
end
```

### `OnCreatePlayer` — B42 Signature and Safety

```lua
-- B42 signature: (playerNum, playerObj)
-- playerObj MAY be nil or partially initialized in MP
local function onCreatePlayer(playerNum, playerObj)
    if not playerObj then
        if playerNum and getSpecificPlayer then
            playerObj = getSpecificPlayer(playerNum)
        end
    end
    if not playerObj then return end
    if not playerObj.getModData then return end
    local modData = playerObj:getModData()
    if not modData then return end
end
Events.OnCreatePlayer.Add(onCreatePlayer)
```

### `ISEquipWeaponAction:complete()` — Do Not Wrap for Off-Hand Logic

Wrapping `ISEquipWeaponAction:complete()` to re-apply an off-hand item creates a feedback loop with vanilla's reciprocal handgun-slot logic. Players can no longer equip primary-hand pistols. Use `ISEquipWeaponAction.perform` instead, and use `Events.OnPlayerAttackFinished` for post-attack off-hand restore. Confirmed by CSR v1.8.18 — the `complete()` wrapper was removed entirely after this bug was discovered.

## Networking

```lua
-- Client → Server
sendClientCommand(MODULE_ID, "doThing", { ... })
sendClientCommand(player, MODULE_ID, "doThing", { ... })   -- explicit-player form

-- Server → Client(s)
sendServerCommand(player, MODULE_ID, "didThing", { ... })  -- one player
sendServerCommand(MODULE_ID, "didThing", { ... })          -- broadcast (no player arg)
```

Receive with `Events.OnClientCommand.Add(fn(module, command, player, args))` on the server, `Events.OnServerCommand.Add(fn(module, command, args))` on the client.

PZ's own routers in `media/lua/server/ClientCommands.lua` and `media/lua/client/ServerCommands.lua` use the `Commands.<group>.<command> = function(args)` table-of-functions pattern. The user mods in this workshop use `if module ~= MODULE_ID then return end` then a flat dispatch — both work.

**Folder-vs-filename gotcha:** `ServerCommands.lua` lives in `client/` (handles incoming server→client commands; runs on client). `ClientCommands.lua` lives in `server/` (handles incoming client→server; runs on server). The filename describes the **sender**, the folder describes the **receiver**.

## ISChat (`media/lua/client/Chat/ISChat.lua`)

`ISChat = ISCollapsableWindow:derive("ISChat")`. The instance is `ISChat.instance`.

Static fields:

| Field | Notes |
|---|---|
| `ISChat.instance` | Singleton chat window. |
| `ISChat.maxLine` | 50. |
| `ISChat.focused` | True when text entry has focus. |
| `ISChat.allChatStreams` | Array of stream descriptors `{name, command, shortCommand, tabID}`. |
| `ISChat.defaultTabStream` | Per-tab default stream. |

Instance fields used by hooks:

| Field | Type | Notes |
|---|---|---|
| `self.textEntry` | ISTextEntryBox | Current input box. `:getText()` / `:setText("")`. |
| `self.tabCnt` | int | Tab count. |
| `self.tabs` | array | Tab list. |
| `self.currentTabID` | int | Active tab. |
| `self.chatText` | ISChatText | Current text panel. |

Key methods:

| Method | Notes |
|---|---|
| `ISChat.createChat()` | Bound to `Events.OnGameStart`. Creates `ISChat.instance`. |
| `ISChat.initChat` | Bound to `Events.OnChatWindowInit`. Resets tabs. |
| `ISChat:sendMessage(...)` | Sends current text-entry contents. **The override target for slash command interception** — see HavenSafeZonesClient.lua line 234. |
| `ISChat:close()` | Hide. |
| `ISChat:collapse()` | Collapse to title bar. |
| `ISChat:pin()` | Toggle pin state. |
| `ISChat:onGearButtonClick()` | Settings menu. |
| `ISChat:createTab()` | Add a tab. |

The slash command interception pattern: replace `ISChat.sendMessage` with a wrapper that reads `self.textEntry:getText()`, checks for your `/cmd`, clears the entry and returns if matched, otherwise calls the original `sendMessage` with the captured `self` and varargs.

## ISCollapsableWindow (`media/lua/client/ISUI/ISCollapsableWindow.lua`)

`ISCollapsableWindow = ISPanel:derive("ISCollapsableWindow")`. Standard window base for admin panels, hubs, dialogs.

Lifecycle methods:

| Method | When called | Override pattern |
|---|---|---|
| `:new(x, y, w, h)` | construction | `local o = ISCollapsableWindow.new(self, x, y, w, h); ...; return o` |
| `:initialise()` | after new | `ISCollapsableWindow.initialise(self); ...` |
| `:createChildren()` | after initialise | `ISCollapsableWindow.createChildren(self); ...` build children, `:initialise()` + `:addChild(...)` each |
| `:prerender()` | per frame | Optional; cheap state read |
| `:render()` | per frame | Optional; draw |
| `:close()` | dismissed | `ISCollapsableWindow.close(self); instance = nil` |

Setters/state methods:

| Method | Notes |
|---|---|
| `:setTitle(title)` / `:getTitle()` | Title bar text. |
| `:setResizable(bool)` | Toggle corner resize widget. |
| `:setDrawFrame(bool)` | Toggle all chrome (close, pin, collapse). For chrome-less windows. |
| `:setInfo(text)` / `:onInfo()` | Info button + popup. |
| `:collapse()` / `:uncollapse()` | Hide everything but the title bar. |
| `:pin()` | Toggle pin (no auto-fade). |
| `:RestoreLayout(name, layout)` / `:SaveLayout(name, layout)` | Persist position/size via `ISLayoutManager`. |
| `:titleBarHeight()` | Pixel height of title bar (font-size dependent). |
| `:resizeWidgetHeight()` | Pixel size of resize handles. |
| `:addView(view)` / `:getViews()` | View management. |

Defaults set on construction: `borderColor = {r=0.4, g=0.4, b=0.4, a=1}`, `backgroundColor = {r=0, g=0, b=0, a=0.8}`, `pin = true`, `resizable = true`, `drawFrame = true`. Override what you need in `:new`.

## ISPanel (`media/lua/client/ISUI/ISPanel.lua`)

`ISPanel = ISUIElement:derive("ISPanel")`. The base for HUDs and overlays.

Lifecycle methods:

| Method | Notes |
|---|---|
| `:new(x, y, w, h)` | Construct. |
| `:initialise()` | `ISUIElement.initialise(self)`. |
| `:noBackground()` | Set `self.background = false`. |
| `:close()` | `:setVisible(false)`. |
| `:prerender()` | Default draws background rect + border. |
| `:onMouseUp` / `:onMouseUpOutside` | Drag handlers. **Built-in.** |
| `:onMouseDown` / `:onMouseMove` / `:onMouseMoveOutside` | Drag handlers. **Built-in.** |

Drag is automatic: set `self.moveWithMouse = true` and the panel can be dragged by the user. No custom mouse handlers needed for most HUDs. To persist position, override `:onMouseUp` and write `self.x, self.y` to `ModData`.

## ISButton (`media/lua/client/ISUI/ISButton.lua`)

Standard button. Constructor: `ISButton:new(x, y, w, h, title, target, onclick)` — `target` and any trailing `args...` are passed to `onclick(target, button, args...)`.

| Method | Notes |
|---|---|
| `:setImage(texture)` | Icon button. |
| `:setTextureColor(color)` | Tint icon. |
| `:forceImageSize(w, h)` | Override image dimensions. |
| `:setOverlayText(text)` | Text on top of image. |
| `:setFont(font)` | Font enum (`UIFont.Small`, `UIFont.Medium`, `UIFont.Large`). |
| `:setTitle(title)` / `:getTitle()` | Button label. |
| `:setOnMouseOverFunction(fn)` | Hover-in callback. |
| `:setOnMouseOutFunction(fn)` | Hover-out callback. |
| `:setDisplayBackground(bool)` | Toggle background draw. |
| `:setVisible(bool)` | Show/hide. |
| `:forceClick()` | Programmatic click. |

Styling fields: `self.borderColor = {r,g,b,a}`, `self.backgroundColor = {r,g,b,a}`, `self.backgroundColorMouseOver = {r,g,b,a}`, `self.textColor = {r,g,b,a}`. Set after `:initialise()`.

### Custom `onMouseDown` on an ISButton MUST chain to super

ISButton uses an internal `pressed` flag to gate click dispatch in
`onMouseUp`. If you derive an ISButton and override `onMouseDown` (e.g. for
draggable button HUDs) **without chaining to `ISButton.onMouseDown`**, the
flag never gets set and the registered onclick callback **never fires** —
silently. No error, button still highlights on hover, but clicks do
nothing. Verified the hard way against `BitemeModSuite` `LauncherButton`
during B42.17 testing.

```lua
function MyButton:onMouseDown(x, y)
    -- ... custom logic ...
    return ISButton.onMouseDown(self, x, y)   -- REQUIRED
end
```

### Draggable button — canonical pattern

To make a launcher button the user can drag with the mouse AND click to
fire its action:

```lua
function LauncherButton:new(x, y)
    local o = ISButton.new(self, x, y, 64, 32, "BMS",
                           BitemeModSuiteUI, BitemeModSuiteUI.onLauncherClicked)
    -- Engine handles drag movement; we only need to detect drag-vs-click
    -- and persist position. Custom dx/dy math fights ISButton's click
    -- state machine, do NOT roll your own setX/setY in onMouseMove.
    o.moveWithMouse = true
    return o
end

function LauncherButton:onMouseDown(x, y)
    self.dragStartX = self:getX()
    self.dragStartY = self:getY()
    return ISButton.onMouseDown(self, x, y)
end

function LauncherButton:onMouseUp(x, y)
    local startX = self.dragStartX or self:getX()
    local startY = self.dragStartY or self:getY()
    self.dragStartX = nil; self.dragStartY = nil
    local moved = math.abs(self:getX() - startX) + math.abs(self:getY() - startY)
    if moved > 3 then
        -- Real drag — persist new position, suppress click dispatch.
        local cfg = getSuiteConfig()
        if cfg then
            cfg.ui = cfg.ui or {}
            cfg.ui.launcherX = self:getX()
            cfg.ui.launcherY = self:getY()
        end
        return true
    end
    return ISButton.onMouseUp(self, x, y)
end
```

Threshold of 3 px on combined Manhattan delta works well in practice. Use
**element position delta** (`self:getX() - startX`), not mouse coord delta —
mouse-relative coords don't change when `moveWithMouse` is moving the
element. See `BitemeModSuite/.../zz_BitemeSuiteHubUI.lua` `LauncherButton`.

## ISContextMenu (`media/lua/client/ISUI/ISContextMenu.lua`)

The right-click menu. Received as the `context` arg in `OnFillWorldObjectContextMenu(playerIdx, context, worldobjects, test)` and `OnFillInventoryObjectContextMenu(playerIdx, context, items)`.

Main methods:

| Method | Notes |
|---|---|
| `:addOption(name, target, onclick, args...)` | Add an entry. `target` and trailing args are passed back to `onclick(target, button, args...)`. |
| `:getNew(parent)` | Create a submenu attached to `parent`. |
| `:hideSelf()` / `:hideAndChildren()` / `:hideSelfAndChildren2()` | Dismiss. |
| `:closeAll()` | Close every open context menu. |
| `:isAnyVisible()` | Check if any context menu is open. |

## ISScrollingListBox (`media/lua/client/ISUI/ISScrollingListBox.lua`)

Vertical list with scroll bar. Constructor: `ISScrollingListBox:new(x, y, w, h)`.

| Method | Notes |
|---|---|
| `:addItem(name, item, tooltip)` | Append entry. |
| `:insertItem(index, name, item)` | Insert at index. |
| `:addUniqueItem(name, item, tooltip)` | Skip if already present. |
| `:contains(itemText)` | Membership check by display name. |
| `:removeItem(itemText)` / `:removeItemByIndex(idx)` | Remove. |
| `:removeMatchingItems(pattern)` | Remove by match. |
| `:removeFirst()` | Pop head. |
| `:rowAt(x, y)` | Resolve mouse coords to row index. |
| `:topOfItem(index)` | Scroll Y of an item. |
| `:prevVisibleIndex(idx)` / `:nextVisibleItem(idx)` | Navigate visible rows. |

Override `:doDrawItem(y, item, alt)` to customize per-row rendering. Item objects are accessed via `self.items[i].item`.

## ISTextEntryBox (`media/lua/client/ISUI/ISTextEntryBox.lua`)

Single-line or multi-line text input. Constructor: `ISTextEntryBox:new(text, x, y, w, h)`.

| Method | Notes |
|---|---|
| `:getText()` / `:setText(str)` | Read/write the value. |
| `:setEditable(bool)` / `:isEditable()` | |
| `:setSelectable(bool)` / `:isSelectable()` | |
| `:setMultipleLine(bool)` / `:isMultipleLine()` | |
| `:setMaxLines(n)` / `:getMaxLines()` | |
| `:setClearButton(bool)` | Add an X to clear. |
| `:setOnlyNumbers(bool)` | Numeric input filter. |
| `:setOnlyText(bool)` | Letters-only filter. |
| `:setFont(font)` | UIFont enum. |
| `:onCommandEntered()` | Override to handle Enter key. |
| `:onTextChange()` | Override to react to typing. |
| `:onLostFocus()` | Override for blur. |
| `:ignoreFirstInput()` | Suppress first key (used when opening modally). |

## ISLabel, ISTickBox, ISComboBox

Standard widgets. Constructors:

```lua
ISLabel:new(x, y, h, text, r, g, b, a, font, alignedRight)
ISTickBox:new(x, y, w, h, name, target, onchange)
ISComboBox:new(x, y, w, h, target, onchange)
```

`:initialise()` and `:addChild(...)` after.

## Sandbox

`SandboxVars.<ModId>.<Setting>` — populated by `getSandboxOptions():initSandboxVars()` in `media/lua/shared/Sandbox/SandboxVars.lua`. Sandbox preset value-level files (`Apocalypse.lua`, `Outbreak.lua`, `Rising.lua`, `SixMonthsLater.lua`, `Extinction.lua`) live in the same folder and are PZ-internal — mods declare their own options via `media/sandbox-options.txt`.

## Permissions

`player:getAccessLevel()` returns a string. Real values: `"Admin"`, `"Moderator"`, `"Overseer"`, `"GM"`, `"Observer"`, `""` (default). The user mods accept the lowercase variants too because PZ has historically capitalized inconsistently:

```lua
return level == "admin" or level == "Admin"
    or level == "moderator" or level == "Moderator"
```

For solo play, `isSinglePlayer()` is true and the local human is the only player — treat as admin in UI gates.

## Logging

```lua
local writer = getFileWriter(<ModId> .. ".txt", true, false)
if writer then
    writer:write("[" .. os.date("%Y-%m-%d %H:%M:%S") .. "] " .. text .. "\n")
    writer:close()
end
```

Logs land in `<user>/Zomboid/Logs/<date>_<time>/`. There's also `print(...)` to stdout — captured in `console.txt` next to the log directory.
