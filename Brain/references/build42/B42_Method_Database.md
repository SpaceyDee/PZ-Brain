# B42 Method Database — Human-Readable Reference

> ⚠ **B42.15+ correction:** Any `pcall(...)` or `safeCall(...)` pattern shown below is **deprecated and unsafe.** `pcall` corrupts Kahlua in B42.15+ — do not introduce it in new code. Replace with explicit nil/method guards (`obj and obj.method and obj:method()`). Canonical rule lives in [SKILL.md](../../SKILL.md) principle #16 and [local-conventions.md](../local-conventions.md).

## Table of Contents

1. [Events](#events)
2. [IS Classes](#is-classes)
3. [Timed Action System](#timed-action-system)
4. [Context Menu System](#context-menu-system)
5. [Inventory & Container Methods](#inventory--container-methods)
6. [World Object & Square Methods](#world-object--square-methods)
7. [Vehicle Methods](#vehicle-methods)
8. [Client/Server Communication](#clientserver-communication)
9. [UI Patterns](#ui-patterns)
10. [Monkey-Patching Patterns](#monkey-patching-patterns)
11. [Sandbox & Configuration](#sandbox--configuration)
12. [Persistence & ModData](#persistence--moddata)
13. [Safety & Defensive Patterns](#safety--defensive-patterns)
14. [File Structure Patterns](#file-structure-patterns)
15. [Multiplayer & Sync Patterns](#multiplayer--sync-patterns)

---

## Latest Patch Additions - Recorded 2026-05-11

These entries come from the latest PZ patch notes and are also present in `B42_Method_Database.json` for `space_lookup_method`.

| Method / Pattern | Category | Notes |
|---|---|---|
| `CraftRecipe:getModTags` | Crafting API | Inspect mod recipe tags. Nil-check for older B42 builds. |
| `CraftRecipe:setTags` | Crafting API | Set recipe tags through the public recipe API. Test MP craft sync. |
| `InputScript:getItems` | Crafting API | Inspect items declared by an input script without text parsing. |
| `Events.SyncFactionServer.Add` | Event | Server faction change hook: `(factionName, isRemove)`. |
| `Trait.Texture` | Script field | Trait scripts can define a texture path. |
| `ItemTag.FITS_CLOTHING_RACK` | Item tag | Restored clothing rack compatibility tag. |
| `IsoZombie:doCrawlerSpeed(zombieSpeed)` | Zombie API | Public zombie speed method. Server should own changes in MP. |
| `IsoZombie:doSprinter()` | Zombie API | Public zombie speed method. |
| `IsoZombie:doFastShambler()` | Zombie API | Public zombie speed method. |
| `IsoZombie:doFakeShambler()` | Zombie API | Public zombie speed method. |
| `IsoZombie:doShambler()` | Zombie API | Public zombie speed method. |
| `IsoZombie:getSpeedType()` | Zombie API | Read current zombie speed type. |
| `getFileWriter returns nil on invalid initialization` | I/O safety | Guard file writers before `:write()` / `:close()`. |
| `DisableSafehouseWhenOwnerConnected` | MP config | Replaces `DisableSafehouseWhenPlayerConnected`. |
| `AutoCreateUserInWhiteList removed` | MP config | Do not generate or document this option. |

---

## Events

### Registration Pattern
```lua
Events.EventName.Add(handlerFunction)
Events.EventName.Remove(handlerFunction)
```

---

> **B42.17 CORRECTION — Entity Iteration (VERIFIED)**
> The events table below references `cell:getZombieList()` in older CSR notes.
> **This method is no longer used in B42.17 vanilla Lua workflows.**
> The correct B42.17 pattern for zombie/object iteration is:
> ```lua
> local objects = (cell.getObjectListForLua and cell:getObjectListForLua())
>              or (cell.getObjectList and cell:getObjectList())
> for i = 0, objects:size() - 1 do
>     local obj = objects:get(i)
>     if obj and instanceof(obj, "IsoZombie") then ...
> ```
> CSR patched 7 files for this change in v1.5.2 (build record: 2026-04-20_B42.17_v1.5.2).

---

### Commonly Used Events (with frequency across reference mods)

| Event | Category | When It Fires | Used By (CSR) | Used By (Ref Mods) |
|-------|----------|---------------|---------------|---------------------|
| `Events.OnGameStart` | Lifecycle | Game world loaded, safe to access globals | 15+ files | All mods |
| `Events.OnFillWorldObjectContextMenu` | UI | Right-click world object | CSR_ContextMenu | STA_PryOpen, WaterPipes, PlumbWorkaround |
| `Events.OnFillInventoryObjectContextMenu` | UI | Right-click inventory item | CSR_ContextMenu, CSR_EatAllStack, CSR_ProximityLoot | SinkCleanRags |
| `Events.OnKeyPressed` | Input | Keyboard key pressed | CSR_QuickSit, CSR_SeatbeltSystem | VehicleSafety, Ladders |
| `Events.OnCreatePlayer` | Lifecycle | Player object created (including splitscreen) | CSR_SeatbeltSystem, CSR_UtilityHud | VehicleSafety, CleanHotBar |
| `Events.OnPlayerUpdate` | Tick | Every player update tick | CSR_WalkingActions | JeevesQoL SafeLogin |
| `Events.OnTick` | Tick | Every game tick | CSR_PlayerMapTracker, CSR_ZombieDensityOverlay | — |
| `Events.OnTickEvenPaused` | Tick | Even when paused | CSR_PlayerMapTracker, CSR_ZombieDensityOverlay | — |
| `Events.OnClientCommand` | Network | Server receives client command | CSR_ServerCommands | JeevesClaims, WaterPipes, SaucedCarts |
| `Events.OnServerCommand` | Network | Client receives server command | CSR_ServerResponses | JeevesClaims, BodyCountRewards |
| `Events.OnEnterVehicle` | Vehicle | Player enters vehicle | CSR_SeatbeltSystem | VehicleSafety |
| `Events.OnExitVehicle` | Vehicle | Player exits vehicle | CSR_SeatbeltSystem | VehicleSafety |
| `Events.OnPlayerDeath` | Lifecycle | Player dies | CSR_SeatbeltSystem | — |
| `Events.OnPostUIDraw` | Render | After UI rendering | CSR_SeatbeltSystem | — |
| `Events.OnResolutionChange` | UI | Screen resolution changed | CSR_SoundCues, CSR_UtilityHud | — |
| `Events.OnWorldSound` | Audio | World sound emitted | CSR_SoundCues | — |
| `Events.EveryOneMinute` | Timer | Every in-game minute | CSR_GroundCleanup (server) | — |
| `Events.OnInitWorld` | Lifecycle | World initialization | CSR_FlashlightAttachmentAdjust | — |
| `Events.OnGameBoot` | Lifecycle | Very early startup | CSR_ClothingRepairPatch | — |
| `Events.OnWaterAmountChange` | World | Water level changes | CSR_StandpipeMapObjects | WaterPipes |
| `Events.OnPlayerDropItem` | Inventory | Item dropped on ground | CSR_GroundCleanup (server) | — |
| `Events.OnInitGlobalModData` | Persistence | ModData loaded | NOT VERIFIED if CSR uses this | JeevesClaims |

### Event Registration Best Practices
- **Always register in file scope** (not inside functions) OR inside `Events.OnGameStart.Add()`
- **Guard before registering:** `if Events and Events.OnGameStart then Events.OnGameStart.Add(fn) end`
- **For monkey-patches:** Always defer to OnGameStart so vanilla classes exist
- **For splitscreen:** OnCreatePlayer fires per player (0-3), handle all

---

## IS Classes

### Core Inheritance Chain
```
ISBaseObject
├── ISBaseTimedAction
│   ├── ISInventoryTransferAction
│   ├── ISEatFoodAction
│   ├── ISWearClothing
│   ├── ISUnequipAction
│   ├── ISCraftAction
│   ├── ISHandcraftAction
│   ├── ISHotwireVehicle (CSR_ImprovisedHotwireAction extends this)
│   └── [Custom CSR actions derive from ISBaseTimedAction]
├── ISPanel
│   ├── ISButton
│   ├── ISTextEntryBox
│   ├── ISToolTip
│   └── [Custom CSR panels derive from ISPanel]
├── ISContextMenu
└── ISTimedActionQueue (static utility)
```

### Key ISPanel Methods (for UI)
| Method | Phase | Purpose |
|--------|-------|---------|
| `:derive("ClassName")` | Definition | Create subclass |
| `:new(x, y, w, h)` | Construction | Create instance |
| `:initialise()` | Init | Called after construction |
| `:createChildren()` | Init | Create child widgets |
| `:prerender()` | Render | Draw background/frame |
| `:render()` | Render | Draw content |
| `:update()` | Tick | Per-frame logic |
| `:onMouseDown(x, y)` | Input | Mouse click |
| `:setVisible(bool)` | Display | Show/hide |
| `:addToUIManager()` | Display | Register with UI system |
| `:removeFromUIManager()` | Display | Unregister |

---

## Timed Action System

### Creating a Custom Timed Action
```lua
-- MUST be at file level, not inside a function
MyAction = ISBaseTimedAction:derive("MyAction")

function MyAction:isValid()
    -- Return false to cancel the action
    return self.character and not self.character:isDead()
end

function MyAction:start()
    -- Called when action begins (optional)
    self:setActionAnim("Loot")
end

function MyAction:update()
    -- Called every tick while running (optional)
end

function MyAction:stop()
    -- Called when action is interrupted (optional)
    ISBaseTimedAction.stop(self)
end

function MyAction:perform()
    -- Called when action completes successfully
    -- DO your thing here
    ISBaseTimedAction.perform(self) -- MUST call parent
end

function MyAction:new(character, target, tool)
    local o = ISBaseTimedAction.new(self, character)
    o.target = target  -- Store as PRIMITIVES for MP safety (see below)
    o.tool = tool
    o.maxTime = CSR_Config.BASE_PRY_TIME
    o.stopOnWalk = true
    o.stopOnRun = true
    return o
end
```

### MP-Safe Timed Action Pattern (from SaucedCarts)
```lua
-- CRITICAL: Store primitives, not object references
function MyAction:new(character, squareX, squareY, squareZ, targetId)
    local o = ISBaseTimedAction.new(self, character)
    o.squareX = squareX  -- number, not IsoGridSquare
    o.squareY = squareY
    o.squareZ = squareZ
    o.targetId = targetId  -- string/number, not IsoObject
    o.maxTime = 100
    return o
end

function MyAction:perform()
    -- Re-resolve from primitives at perform time
    local square = getCell():getGridSquare(self.squareX, self.squareY, self.squareZ)
    local target = findObjectOnSquare(square, self.targetId)
    if target then
        -- ... do thing
    end
    ISBaseTimedAction.perform(self)
end
```

### Queuing Actions
```lua
ISTimedActionQueue.add(MyAction:new(player, ...))
-- Actions are FIFO — add transfer first, then dependent action
```

### CSR Pattern: queueActionAfterTransfers
```lua
-- Transfer item to player inventory first, then queue the real action
ISInventoryPaneContextMenu.transferIfNeeded(player, item)
ISTimedActionQueue.add(MyAction:new(player, item))
```

---

## Context Menu System

### World Object Context Menu
```lua
function MyMod.onFillWorldObjectContextMenu(playerNum, context, worldobjects, test)
    if test then return end  -- Don't add options during test/preview mode
    local player = getSpecificPlayer(playerNum)
    if not player then return end

    -- Walk worldobjects to find targets
    for _, obj in ipairs(worldobjects) do
        local square = obj:getSquare()
        if square then
            -- Add options
            local option = context:addOption("My Action", player, MyMod.doAction, obj)
            -- Optionally make unavailable:
            -- option.notAvailable = true
            -- option.toolTip = ISToolTip:new()
            -- option.toolTip.description = "Reason why unavailable"
        end
    end
end

Events.OnFillWorldObjectContextMenu.Add(MyMod.onFillWorldObjectContextMenu)
```

### Inventory Context Menu
```lua
function MyMod.onFillInventoryMenu(playerNum, context, items)
    local player = getSpecificPlayer(playerNum)
    for _, v in ipairs(items) do
        local item = v  -- or v.items[1] for stacked items
        if instanceof(item, "InventoryItem") then
            context:addOption("Do Thing", player, MyMod.doThing, item)
        end
    end
end

Events.OnFillInventoryObjectContextMenu.Add(MyMod.onFillInventoryMenu)
```

### Submenu Pattern (from SinkCleanRags, STA_PryOpen)
```lua
local mainOption = context:addOption("Category Name")
local subMenu = ISContextMenu:getNew(context)
context:addSubMenu(mainOption, subMenu)
subMenu:addOption("Sub Item 1", player, handler1, args)
subMenu:addOption("Sub Item 2", player, handler2, args)
```

### Tooltip on Option (from STA_PryOpen)
```lua
local option = context:addOption("Pry Open", ...)
local tooltip = ISToolTip:new()
tooltip:setName("Pry Open")
tooltip.description = " <RGB:0.8,1.0,0.8> Success chance: 75% <LINE>"
    .. " <RGB:1.0,0.8,0.8> Tool damage: High"
option.toolTip = tooltip
```

---

## Inventory & Container Methods

### Player Inventory
| Method | Returns | Description |
|--------|---------|-------------|
| `player:getInventory()` | ItemContainer | Player's main inventory |
| `inv:getItems()` | ArrayList | All items in container |
| `inv:FindAndReturn(type)` | InventoryItem or nil | Find first item of type |
| `inv:contains(item)` | boolean | Check if item exists |
| `inv:AddItem(typeString)` | InventoryItem | Create and add item |
| `inv:DoRemoveItem(item)` | void | Remove specific item |
| `inv:getItemCountRecurse(type)` | number | Count items recursively |
| `inv:getSomeTypeRecurse(type, count)` | ArrayList | Get N items of type |
| `item:getContainer()` | ItemContainer | Container holding this item |
| `item:isWorn()` | boolean | Is item currently worn |

### Container Transfer
```lua
-- PREFERRED (vanilla pattern, safe):
ISInventoryPaneContextMenu.transferIfNeeded(player, item)

-- DIRECT (used in CSR_TransferAmount):
ISInventoryTransferAction:new(player, item, sourceContainer, destContainer)

-- OUTDATED/RISKY (used in CSR_ProximityLoot):
ISInventoryTransferUtil.newInventoryTransferAction(player, item, src, dest)
```

### Walk-to-Container Pattern
```lua
if luautils.haveToBeTransfered(player, item) then
    ISTimedActionQueue.add(luautils.walkToContainer(item:getContainer(), playerNum))
end
```

---

## World Object & Square Methods

### Square Access
| Method | Returns | Description |
|--------|---------|-------------|
| `getCell()` | IsoCell | Current game cell |
| `cell:getGridSquare(x, y, z)` | IsoGridSquare or nil | Get square at coords |
| `obj:getSquare()` | IsoGridSquare | Square containing object |
| `square:getObjects()` | ArrayList | All objects on square |
| `square:getBuilding()` | IsoBuilding or nil | Building containing square |
| `player:getSquare()` | IsoGridSquare | Player's current square |
| `player:getBuilding()` | IsoBuilding or nil | Player's current building |

### Object Index (Sync-Sensitive)
```lua
local index = obj:getObjectIndex()  -- Position in square's object list
-- Used for server-side object resolution from client coordinates
-- CRITICAL: Object indices can change if objects are added/removed
```

### Object Manipulation on Squares
```lua
-- Remove from square (sync to clients):
square:transmitRemoveItemFromSquare(obj)

-- Add to square at specific index:
square:AddTileObject(newObj, index)

-- Transmit object addition:
square:transmitAddObjectToSquare(obj, -1)

-- Standard iteration:
for i = 0, square:getObjects():size() - 1 do
    local obj = square:getObjects():get(i)
end
```

### Fluid Container (B42 Standpipe/Plumbing)

> **Corrected 2026-10-25:** `pcall` works in verified B42.18 dedicated probes. Prefer nil/type guards by convention; `safeCall` is separately unverified.

```lua
-- These APIs are unstable — guard with nil checks, never pcall:
local amount    = obj and obj.getFluidAmount    and obj:getFluidAmount()    or 0
local container = obj and obj.getFluidContainer and obj:getFluidContainer() or nil
if container then
    local cap = container.getCapacity and container:getCapacity() or 0
    if container.setInputLocked then container:setInputLocked(false) end
end
if obj and obj.sync then obj:sync() end
if obj and obj.setTaintedWater then obj:setTaintedWater(false) end
```

---

## Vehicle Methods

### Vehicle Access
| Method | Returns | Description |
|--------|---------|-------------|
| `vehicle:getPartCount()` | number | Total parts |
| `vehicle:getPartByIndex(i)` | VehiclePart | Part at index |
| `vehicle:getPartById("Engine")` | VehiclePart | Part by ID string |
| `vehicle:getUseablePart(player)` | VehiclePart | Closest usable part |
| `vehicle:getClosestWindow(player)` | VehiclePart | Nearest window |
| `vehicle:getAreaCenter(areaName)` | x,y,z | Center of part area |
| `vehicle:getId()` | number | Vehicle unique ID |

### Vehicle State
| Method | Returns | Description |
|--------|---------|-------------|
| `vehicle:isHotwired()` | boolean | Is hotwired |
| `vehicle:isEngineStarted()` | boolean | Engine started |
| `vehicle:isEngineRunning()` | boolean | Engine running |
| `vehicle:isKeysInIgnition()` | boolean | Keys present |
| `vehicle:getBatteryCharge()` | number | Battery level |
| `vehicle:isDriver(character)` | boolean | Is player driving |
| `vehicle:getKeyId()` | number | Key ID |

### Vehicle Engine — Read
| Method | Returns | Description |
|--------|---------|-------------|
| `vehicle:getEnginePower()` | number | Current engine power value |
| `vehicle:getEngineQuality()` | number (0-100) | Engine quality (affects start chance, performance) |
| `vehicle:getEngineLoudness()` | number | Engine loudness |
| `vehicle:getMaxSpeed()` | number | Max speed (km/h) |
| `vehicle:getCurrentSpeedKmHour()` | number | Current speed (km/h) |
| `vehicle:getEngineSpeed()` | number | Current RPM |
| `vehicle:getTransmissionNumber()` | number | Current gear index |
| `vehicle:getScript():getMass()` | number | Vehicle script mass |
| `vehicle:getScript():getGearRatioCount()` | number | Number of gears |

### Vehicle Engine — Write (Server-Authoritative)
```lua
-- Modify engine power, loudness, and quality at runtime.
-- All three params must be supplied; pass existing values for params you aren't changing.
-- MUST call transmitEngine() immediately after to sync to all clients.
local q = vehicle:getEngineQuality()
local l = vehicle:getEngineLoudness()
local p = vehicle:getEnginePower()
vehicle:setEngineFeature(q, l, p + 500)   -- boost power by 500
vehicle:transmitEngine()                   -- required sync call

-- To revert: store old values in ModData before boosting, restore on revert.
```

**Verified in:** StandardizedVehicleUpgrades3Core (Workshop 3403490889), `SVUC_ATATuning2.lua` line 217.

### Fuel Consumption Override
```lua
-- Wrap the vanilla GasTank update function server-side to modify consumption rate.
-- SVU3 pattern: runs on every fuel-tick when engine is running.
local old_gas_tank = Vehicles.Update.GasTank
function Vehicles.Update.GasTank(vehicle, part, elapsedMinutes)
    old_gas_tank(vehicle, part, elapsedMinutes)
    -- Then read/modify part:getContainerContentAmount() and call
    -- part:setContainerContentAmount(newAmount, false, true)
    -- vehicle:transmitPartModData(part)
end
```

### Vehicle Part — Model & Condition
```lua
part:setModelVisible("modelName", true/false)  -- show/hide a named model on the part
part:setCondition(0-100)                        -- set part condition
vehicle:transmitPartCondition(part)             -- sync condition to clients
vehicle:transmitPartModData(part)              -- sync part ModData to clients
vehicle:transmitPartItem(part)                 -- sync part inventory item
vehicle:transmitModData()                      -- sync vehicle-level ModData
vehicle:doDamageOverlay()                      -- refresh damage visual overlay
```

### Vehicle Modification (Sync-Sensitive)
```lua
vehicle:toggleLockedDoor(part, character, false)  -- Unlock door
vehicle:setAnyDoorLocked(false)                   -- Unlock all doors
vehicle:transmitPartDoor(part)                     -- Sync door state to server
vehicle:transmitPartWindow(part)                  -- Sync window state
vehicle:sendVars()                                -- Broadcast full state (server only!)
vehicle:tryHotwire(electricalLevel)               -- Attempt hotwire
```

### Vehicle Script-Level Override (DoVehicleParam pattern)
```lua
-- Modify a vehicle's script definition at load time (shared file, OnGameBoot or early load).
-- Used by SVU3 to set armor templates, horn sounds, etc.
local function DoVehicleParam(vehicle, param, module)
    module = module or "Base"
    local vehicleScript = ScriptManager.instance:getVehicle(module .. "." .. vehicle)
    if not vehicleScript then return end
    vehicleScript:Load(vehicle, "{" .. param .. "}")
end
-- Example: DoVehicleParam("VehicleName", "template! = ArmorHeavy,")
```

### Vehicle Device Data (Radios)
```lua
local part = vehicle:getPartByIndex(i)
local deviceData = part:getDeviceData()      -- Radio/device data
local invItem = part:getInventoryItem()       -- Physical item
```

---

## Client/Server Communication

### Client → Server
```lua
-- In client code (timed action perform() or context handler):
if isClient() then
    sendClientCommand(player, "ModuleName", "CommandName", {
        x = target:getSquare():getX(),
        y = target:getSquare():getY(),
        z = target:getSquare():getZ(),
        objectIndex = target:getObjectIndex(),
        -- Include PRIMITIVES only, never Java objects
    })
end
```

### Server → Client (targeted)
```lua
-- In server command handler:
sendServerCommand(player, "ModuleName", "ResponseName", {
    success = true,
    message = "Result text"
})
```

### Server → All Clients (broadcast)
```lua
sendServerCommand("ModuleName", "BroadcastName", { data = value })
```

### Server Command Handler
```lua
-- server/MyMod_Server.lua
local function onClientCommand(module, command, player, args)
    if module ~= "MyModuleName" then return end

    if command == "DoThing" then
        -- VALIDATE everything from args (client data is untrusted)
        if type(args.x) ~= "number" then return end
        if type(args.y) ~= "number" then return end

        local square = getCell():getGridSquare(args.x, args.y, args.z)
        if not square then return end

        -- Check distance (security)
        if player:DistToSquared(args.x, args.y) > MAX_DIST_SQ then return end

        -- Do server-side work
        -- ...

        -- Respond to client
        sendServerCommand(player, "MyModuleName", "ThingDone", { success = true })
    end
end

Events.OnClientCommand.Add(onClientCommand)
```

---

## UI Patterns

### ISPanel Derivation
```lua
local MyPanel = ISPanel:derive("MyPanelName")

function MyPanel:initialise()
    ISPanel.initialise(self)
end

function MyPanel:createChildren()
    ISPanel.createChildren(self)
    self.closeBtn = ISButton:new(x, y, w, h, "Close", self, self.onClose)
    self.closeBtn:initialise()
    self.closeBtn:instantiate()
    self:addChild(self.closeBtn)
end

function MyPanel:prerender()
    ISPanel.prerender(self)
    self:drawRect(0, 0, self.width, self.height, 0.8, 0, 0, 0) -- bg
end

function MyPanel:new(x, y, w, h)
    local o = ISPanel:new(x, y, w, h)
    setmetatable(o, self)
    self.__index = self
    o.backgroundColor = { r = 0, g = 0, b = 0, a = 0.8 }
    return o
end
```

### Font Metrics (from JeevesQoL)
```lua
local font = UIFont.Small
local tm = getTextManager()
local textW = tm:MeasureStringX(font, "text")
local textH = tm:getFontHeight(font)
```

---

## Monkey-Patching Patterns

### Safe Monkey-Patch (All Reference Mods)
```lua
-- ALWAYS inside Events.OnGameStart.Add or at file level with guard:
local function initMyPatch()
    if not ISTargetClass then return end
    if ISTargetClass.__mymod_patched then return end  -- GUARD FLAG
    ISTargetClass.__mymod_patched = true

    local original = ISTargetClass.targetMethod
    ISTargetClass.targetMethod = function(self, ...)
        -- Pre-hook logic
        local result = original(self, ...)
        -- Post-hook logic
        return result
    end
end

Events.OnGameStart.Add(initMyPatch)
```

### CSR Monkey-Patch Guard Pattern
```lua
-- Used in CSR_VehicleHotwire, CSR_WalkingActions, etc.
if not ISTargetClass or not ISTargetClass.method or ISTargetClass.__csr_feature_patched then
    return
end
ISTargetClass.__csr_feature_patched = true
```

### UIWW pcall(require) Pattern (DEPRECATED — Do Not Use)

> **Corrected 2026-10-25:** `pcall` works in verified B42.18 dedicated probes. Prefer normal `require` and explicit class checks; avoid wrappers that hide missing dependencies.

```lua
-- WRONG (B41-era pattern — pcall crashes Kahlua in B42.15+):
-- pcall(require, "TimedActions/ISTargetAction")

-- CORRECT (B42 pattern — require at file top, nil-guard the result):
require "TimedActions/ISTargetAction"
local function patchSomething()
    local klass = _G and _G.ISTargetAction
    if not klass or type(klass.new) ~= "function" then return end
    if klass.__patched then return end
    -- ... apply patch ...
    klass.__patched = true
end
```

---

## Sandbox & Configuration

### Sandbox Variable Access
```lua
-- Standard CSR pattern:
local function sandbox()
    return SandboxVars and SandboxVars.CommonSenseReborn or {}
end

-- Check a flag:
if sandbox().EnablePrySystem == true then ... end

-- Get numeric value:
local mult = sandbox().PrySuccessMultiplier or 1.0
```

### Type-Safe Getter Pattern (from STA_PryOpen)
```lua
function Utils.getSandboxBool(mod, key, default)
    if SandboxVars and SandboxVars[mod] then
        local v = SandboxVars[mod][key]
        if type(v) == "boolean" then return v end
    end
    return default
end
```

### sandbox-options.txt Format
```
option CommonSenseReborn.EnablePrySystem
{
    type = boolean, default = true,
    page = CommonSenseReborn,
}
```

---

## Persistence & ModData

### Server-Side ModData (from JeevesClaims)
```lua
-- In server code:
local function onInitGlobalModData()
    MyMod.data = ModData.getOrCreate("MyMod_SaveKey")
    if not MyMod.data.initialized then
        MyMod.data.initialized = true
        MyMod.data.entries = {}
    end
end
Events.OnInitGlobalModData.Add(onInitGlobalModData)
```

### Per-Player ModData (from VehicleSafety)
```lua
player:getModData().MyMod_setting = value

-- Restored on Events.OnCreatePlayer
local function onCreatePlayer(playerIndex, playerObj)
    local data = playerObj:getModData()
    if data.MyMod_setting == nil then
        data.MyMod_setting = true  -- default
    end
end
```

### CSR Pattern (No ModData)
CSR currently does NOT use ModData.getOrCreate() for persistence.
State is managed through SandboxVars and runtime variables only.

---

## Safety & Defensive Patterns

### Explicit Java Method Guard
```lua
function guardedCall(obj, methodName, ...)
    if obj == nil then return nil end
    local method = obj[methodName]
    if type(method) ~= "function" then return nil end
    return method(obj, ...)
end
```

### Explicit Guards for Unstable APIs
```lua
-- GOOD: guard object and method before calling
local result = nil
if obj and obj.someUnstableMethod then
    result = obj:someUnstableMethod()
end

-- BAD: pcall cannot catch Java NPEs and is unsafe in B42.15+
-- pcall(function() return obj:someUnstableMethod() end)
```

### isServer/isClient Guards
```lua
-- In shared code that accesses client-only APIs:
if not isServer() then
    local moodles = player:getMoodles()
    -- safe to access moodle levels
end

-- In server-only files:
if not isServer() then return end  -- File-level guard

-- In client-only operations from shared code:
if isClient() then
    sendClientCommand(...)
end
```

### Distance Validation (Security)
```lua
-- Always check distance server-side before processing client commands:
if player:DistToSquared(args.x, args.y) > MAX_DISTANCE * MAX_DISTANCE then
    return  -- Player too far, reject command
end
```

---

## File Structure Patterns

### PZ Mod Load Order
1. `shared/` loads first (alphabetical within)
2. `client/` loads second (alphabetical within)
3. Within `client/`, subfolders load alphabetically: `ContextMenus/` → `Hotbar/` → `TimedActions/`
4. Shared code CANNOT require client code

### CSR Structure
- `shared/` — Config, utils, feature flags, data
- `server/` — Command handlers, cleanup, map objects
- `client/` — Features, UI, timed actions
- All inter-module communication via events or client/server commands

### Version-Specific Folders (from Reference Mods)
Many mods maintain multiple version folders:
```
MyMod/
├── 42/          -- Base B42
├── 42.13/       -- B42.13-specific
├── 42.15/       -- B42.15-specific
└── common/      -- Shared across versions
```
CSR uses a single `42/` folder — simpler but less version-resilient.

---

## Multiplayer & Sync Patterns

### Client-Server Authority Model
- **Client** performs animations, UI, and queues timed actions
- **Server** validates and executes state changes
- Client sends commands with PRIMITIVE data (coordinates, IDs, types)
- Server re-resolves objects from primitives and validates before acting

### Sync-Sensitive Operations
| Operation | Must Do | Risk If Wrong |
|-----------|---------|---------------|
| Remove object from square | `square:transmitRemoveItemFromSquare()` | Object visible to other clients |
| Add object to square | `square:transmitAddObjectToSquare()` | Invisible to other clients |
| Modify vehicle state | `vehicle:transmitPartDoor/Window()` | Desync |
| Modify inventory | Server-side `AddItem/DoRemoveItem` | Item duplication |
| Object replacement | Preserve `getObjectIndex()` | Wrong object modified |

### Anti-Patterns (Multiplayer)
1. **Storing Java object references in closures** — Object may be GC'd or invalid by callback time
2. **Client-side inventory modification** — Must go through server in MP
3. **Not checking isClient() before sendClientCommand** — Crashes in SP
4. **Using getSquare() result without nil check** — Square may be unloaded
5. **Trusting client-supplied data on server** — Must validate all args

---

## Notable Examples from External Mods

### SaucedCarts Network.lua — Gold Standard MP Networking
- Test mode support for unit testing without actual MP
- All state stored as primitives (squareX/Y/Z, cartId)
- Container restrictions via ItemContainer.isItemAllowed hook with pcall safety
- Broadcast vs targeted server commands

### JeevesClaims — ModData Persistence
- ModData.getOrCreate() on OnInitGlobalModData
- Vehicle registry, respawn table
- Safehouse door locking via key ID iteration

### JeevesPatches GGS_TimedActionGuard — B42.15 Fix
- Removed pcall wrapper from ISTimedActionQueue.add()
- Java RuntimeException corrupts Kahlua stack when caught by pcall
- Character resolution guard as safe alternative

### UIWW — Walking Action Patching
- pcall(require) only at OnGameStart time (not gameplay)
- Guard flags on every patched class
- Multiple classes patched in sequence from single init function

### VehicleSafety — Seatbelt Implementation
- Per-player ModData for seatbelt state
- Splitscreen-safe (iterates players 0-3)
- Sandbox-driven thresholds with defaults

---

## Weapon Item Script Fields (B42)

Learned from debugging a custom melee weapon (push-only animation, missing back-slot, wrong model orientation).

### B42 Item Script — Mandatory Namespace

All `Categories` values require the `base:` prefix in B42:
```
Categories = base:blunt    -- CORRECT
Categories = Blunt         -- WRONG — silently ignored or errors
```

### Animation Mode — Match TwoHandWeapon to Anim Set

The engine cannot resolve an attack node when the hand-count declaration and the animation set are mismatched. You MUST match them:

| `TwoHandWeapon` | `IdleAnim` | `RunAnim` | Result |
|---|---|---|---|
| `TRUE` | `Idle_Weapon2` | `Run_Weapon2` | Two-handed swing (bat, plank) |
| `FALSE` | `Idle_Weapon` | `Run_Weapon` | One-handed swing (knife, pistol) |
| `FALSE` + `Idle_Weapon2` + `Run_Weapon2` | — | — | **Push-only, no attack node** |

### AttachmentType — Back Slot System

`AttachmentType` on an item controls which clothing-provided slot it fits into. Without it the item cannot be placed in any hotbar back slot.

```
AttachmentType = Shovel     -- bat, plank, stick, shovel (most 2H melee)
AttachmentType = BigWeapon  -- heavy modded weapons
AttachmentType = BigBlade   -- sword, sledgehammer
AttachmentType = Rifle      -- firearms
AttachmentType = Sword
AttachmentType = Racket
AttachmentType = Guitar
AttachmentType = Pan
AttachmentType = Saucepan
```

`AttachmentsProvided` on clothing defines which slots that clothing creates. `AttachmentBack` does NOT exist in B42 (it was a B41 field).

`item:getAttachmentsProvided()` was removed in B42.18 — do not call it.

### Model Orientation Fix (Without Re-exporting FBX)

Adjust grip rotation via an `attachment` block in the model script definition:
```
model MyWeapon {
    mesh = weapons/2handed/MyWeaponMesh,
    attachment Bip01_Prop1 { offset = 0.0 0.0 0.0, rotate = 0.0 0.0 180.0, }
    attachment world { offset = 0.0 0.0 0.0, rotate = 0.0 0.0 0.0, }
}
```
- `Bip01_Prop1` — primary hand grip (rotate to fix upside-down or backwards orientation)
- `Bip01_Prop2` — off-hand grip
- `world` — ground drop orientation
- Try each axis (X/Y/Z) to find the correct rotation; 90/180/270 degree increments cover most cases.

### Canonical Vanilla Bat Reference

From the verified B42 vanilla script:
```
item BaseballBat {
    ItemType = base:weapon,
    AttachmentType = Shovel,
    TwoHandWeapon = true,
    SubCategory = Swinging,
    Categories = base:blunt,
    SwingAnim = Bat,
    IdleAnim = Idle_Weapon2,
    RunAnim = Run_Weapon2,
}
```
