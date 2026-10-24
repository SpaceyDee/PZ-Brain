# B42 High-Value Methods — Quick Reference

> ⚠ **B42.15+ correction:** Any `pcall(...)` or `safeCall(...)` pattern shown below is **deprecated and unsafe.** `pcall` corrupts Kahlua in B42.15+ — do not introduce it in new code. Replace with explicit nil/method guards (`obj and obj.method and obj:method()`). Canonical rule lives in [SKILL.md](../../SKILL.md) principle #16 and [local-conventions.md](../local-conventions.md).

The most important B42 hooks, classes, and methods future agents should reference when working on CSR.

---

## TOP 20 METHODS & HOOKS

### 1. Events.OnGameStart.Add(fn)
**Use for:** All initialization, monkey-patching, deferred setup
**Critical rule:** ALL monkey-patches must go here, never at file level

### 2. Events.OnFillWorldObjectContextMenu.Add(fn)
**Signature:** `function(playerNum, context, worldobjects, test)`
**Use for:** Adding right-click options to world objects
**Check:** `if test then return end` to skip preview mode

### 3. Events.OnFillInventoryObjectContextMenu.Add(fn)
**Signature:** `function(playerNum, context, items)`
**Use for:** Adding right-click options to inventory items

### 4. ISBaseTimedAction:derive("ClassName")
**Use for:** Creating custom player actions
**Required methods:** `isValid()`, `perform()`, `new()`
**Critical:** Always call `ISBaseTimedAction.perform(self)` at end of perform()

### 5. ISTimedActionQueue.add(action)
**Use for:** Queuing actions for player execution
**Critical:** Queue is FIFO. Add transfers BEFORE dependent actions.
**NEVER:** Wrap in pcall() (corrupts Kahlua on B42.15+)

### 6. ISInventoryPaneContextMenu.transferIfNeeded(player, item)
**Use for:** Moving item to player inventory before an action
**Preferred over:** ISInventoryTransferAction:new() for context menu flows

### 7. sendClientCommand(player, module, command, args)
**Use for:** Client → Server communication in MP
**Guard:** `if isClient() then sendClientCommand(...) end`
**Args:** PRIMITIVES ONLY (numbers, strings, booleans)

### 8. sendServerCommand(player, module, command, args)
**Use for:** Server → specific client response
**Broadcast variant:** `sendServerCommand(module, command, args)` (no player = all clients)

### 9. getCell():getGridSquare(x, y, z)
**Use for:** Looking up world squares from coordinates
**Critical:** ALWAYS nil-check result. Square may be unloaded.
**Server-side:** Validate coordinates are numbers first.

### 10. obj:getObjectIndex()
**Use for:** Identifying object position on a square for server resolution
**Warning:** Index can change if objects are added/removed from the square

### 11. square:transmitRemoveItemFromSquare(obj)
**Use for:** Removing world objects with MP sync
**Required:** Must be called for other clients to see the removal

### 12. player:getInventory()
**Use for:** Accessing player's main inventory container
**Common methods:** FindAndReturn, AddItem, DoRemoveItem, contains, getItems

### 13. vehicle:transmitPartDoor(part)
**Use for:** Syncing vehicle door state changes to all clients
**Call after:** toggleLockedDoor()

### 14. SandboxVars.CommonSenseReborn
**Use for:** Reading server sandbox configuration
**Pattern:** `SandboxVars and SandboxVars.CommonSenseReborn or {}`

### 15. ModData.getOrCreate(key)
**Use for:** Persistent server-side data storage (survives restarts)
**Init in:** Events.OnInitGlobalModData.Add()
**CSR Status:** NOT VERIFIED whether CSR uses GlobalModData.getOrCreate() — vehicle and safehouse state is stored on vehicle/safehouse objects directly, not a global store. Check `CSR_Claims/CSR_ClaimRegistry.lua` for current approach.

### 16. player:getModData()
**Use for:** Persistent per-player data (survives disconnects)
**Restore in:** Events.OnCreatePlayer.Add()
**CSR Status (UPDATED):** NOW USED — `CSR_VehicleClaim.lua` stores vehicle ownership in `vehicle:getModData()`. `CSR_PlayerPrefs.lua` stores per-player settings in `player:getModData()`. `CSR_SafehouseOutline.lua` stores overlay toggle in `player:getModData()`.

UPDATED NOTE: Earlier versions of this entry said "NOT YET USED." As of v1.3+ ModData is used for vehicle claims and player preferences. Seatbelt state persistence may still be missing — verify.

### 17. Explicit nil/method guards
**Use for:** Safely calling methods that may be nil or unavailable in a given B42 context
**Never use:** `pcall` / `safeCall` in B42.15+; Java exceptions propagate and can corrupt Kahlua
**Pattern:** `local result = obj and obj.method and obj:method() or nil`

### 18. instanceof(obj, "ClassName")
**Use for:** Java type checking on PZ objects
**Common:** `instanceof(item, "InventoryItem")`, `instanceof(obj, "IsoThumpable")`

### 19. getSpecificPlayer(playerNum)
**Use for:** Getting player object from player index (splitscreen-safe)
**In callbacks:** `local player = getSpecificPlayer(playerNum)`

### 20. luautils.walkToContainer(container, playerNum)
**Use for:** Creating a walk action to reach a container
**Pattern:** Queue this before transfer/interaction actions

---

## HANDWEAPON API (JavaDocs-Confirmed)

Source: [HandWeapon JavaDocs](https://projectzomboid.com/modding/zombie/inventory/types/HandWeapon.html)

```lua
-- Type checks
instanceof(item, "HandWeapon")          -- true for all weapons

-- Firearm classification
weapon:isAimedFirearm()                 -- bool: aimed firearm (pistols, rifles, etc.)
weapon:isAimedHandWeapon()              -- bool: aimed melee (not a firearm)

-- Projectile and hit counts
weapon:getProjectileCount()             -- int: bullets per shot
weapon:setProjectileCount(n)            -- set bullets per shot (for dual-pistol fakery)
weapon:getMaxHitCount()                 -- int: max simultaneous melee hits
weapon:setMaxHitCount(n)               -- set max hits

-- Categories
weapon:getCategories()                  -- returns category list
weapon:setCategories(...)               -- set categories

-- Animation check (CSR-confirmed in B42.17)
weapon:getSwingAnim()                   -- string: e.g. "Stab" — used to guard dual wield
```

**Key patterns:**
- `isAimedFirearm()` distinguishes pistols/rifles from melee; CSR uses this to skip dual wield for ranged primary
- `getSwingAnim() == "Stab"` is an early-exit guard in CSR's dual wield validation — stab animations conflict with left-hand attack timing
- `setProjectileCount()` is the mechanism for a "dual pistol single item" — one weapon, two bullets per shot

---

## QUICK LOOKUP TABLE

| Need To... | Use This |
|------------|----------|
| Add context menu option | `context:addOption(text, player, callback, args)` |
| Make option unavailable | `option.notAvailable = true` |
| Add tooltip to option | `option.toolTip = ISToolTip:new()` |
| Create submenu | `ISContextMenu:getNew(context)` + `context:addSubMenu()` |
| Queue timed action | `ISTimedActionQueue.add(MyAction:new(...))` |
| Transfer item to player | `ISInventoryPaneContextMenu.transferIfNeeded(player, item)` |
| Check item in inventory | `player:getInventory():contains(item)` |
| Find item by type | `player:getInventory():FindAndReturn("Base.Crowbar")` |
| Add item server-side | `player:getInventory():AddItem("Base.ItemType")` |
| Remove item server-side | `container:DoRemoveItem(item)` |
| Get world square | `getCell():getGridSquare(x, y, z)` |
| Get objects on square | `square:getObjects()` (use `:size()` and `:get(i)`) |
| Check if on server | `isServer()` |
| Check if on client | `isClient()` |
| Send to server | `sendClientCommand(player, mod, cmd, {data})` |
| Send to client | `sendServerCommand(player, mod, cmd, {data})` |
| Save server data | `ModData.getOrCreate("key")` |
| Save player data | `player:getModData().key = value` |
| Check player distance | `player:DistToSquared(x, y)` |
| Get vehicle part | `vehicle:getPartById("Engine")` |
| Check sandbox option | `SandboxVars.CommonSenseReborn.OptionName` |
| Safe method call | `pcall(function() return obj:riskyMethod() end)` |
| Derive timed action | `MyAction = ISBaseTimedAction:derive("MyAction")` |
| Derive UI panel | `MyPanel = ISPanel:derive("MyPanel")` |
| Monkey-patch safely | store original → guard flag → wrap → OnGameStart |

---

## CSR-SPECIFIC GLOBAL MODULE LOCATIONS

| Module | File | Available In |
|--------|------|-------------|
| CSR_Utils | shared/CSR_Utils.lua | client, server, shared |
| CSR_FeatureFlags | shared/CSR_FeatureFlags.lua | client, server, shared |
| CSR_Config | shared/CSR_Config.lua | client, server, shared |
| CSR_Standpipe | shared/CSR_Standpipe.lua | client, server, shared |
| CSR_KnowledgeData | shared/CSR_KnowledgeData.lua | client, server, shared |

---

## B42 VERSION DIFFERENCES TO WATCH

| Version | Change | Impact |
|---------|--------|--------|
| B42.13 | Fluid container API changes | Standpipe pcall patterns |
| B42.14 | Plumbing system updates | WaterPipes community fix needed |
| B42.15 | Java RuntimeException in pcall corrupts Kahlua | Never pcall ISTimedActionQueue.add |
| B42.15+ | Clothing system changes | JeevesPatches VanillaClothingFix |
| **B42.17** | **`IsoCell:getObjectList()` → `IsoCell:getObjectListForLua()` for Lua-facing global object iteration** | **All zombie/world-object scans must use new method. `cell:getZombieList()` no longer in vanilla workflows. Use `instanceof(obj,"IsoZombie")` filter instead.** |

VERIFIED FOR B42.17: IsoCell entity iteration API change is confirmed from build record 2026-04-20_B42.17_v1.5.2. CSR patched 7 files in v1.5.2 to apply compatibility wrapper pattern.
