# KNOWN PROBLEM PATTERNS

Recurring failure modes in PZ B42 mod development. Each entry is a real pattern seen in this or similar mods. Use this file to diagnose bugs quickly.

---

## Pattern 0 — Vanilla `AntiCheatHitShortDistance` ClassCastException is NOT a mod bug

**Symptom:** Log floods with:
```
ERROR: General  at GameServer.mainLoopDealWithNetData > Error with packet of type: ZombieHitThumpable
java.lang.ClassCastException: class zombie.network.packets.hit.ZombieHitThumpablePacket
    cannot be cast to class zombie.network.anticheats.AntiCheatHitShortDistance$IAntiCheat
        at zombie.network.anticheats.AntiCheatHitShortDistance.validate(AntiCheatHitShortDistance.java:17)
```

**Cause:** Vanilla PZ B42 anti-cheat bug — `AntiCheatHitShortDistance.validate` casts incoming packets to its `IAntiCheat` interface, but `ZombieHitThumpablePacket` does not implement that interface. Every zombie-thumps-a-wall packet throws. Verified in B42.17. Reported on the PZ tracker; not fixed by TIS at time of writing.

**Diagnosis:** Stack trace is **entirely inside `zombie.network.*`** — no Lua frames, no mod frames. Packet type is `ZombieHitThumpable`. That's vanilla code.

**Fix:** None on the mod side. The spam does not corrupt gameplay or saves; only bloats the log. When diagnosing other issues, filter with `grep -v ZombieHitThumpable` or `Select-String -NotMatch "ZombieHitThumpable"`. A server-config option exists to disable that specific anti-cheat (`AntiCheatProtectionType7` or similar in `<server>.ini`) which silences it.

---

## Pattern 1 — Silent No-Op from Wrong Environment Guard

**Symptom:** Feature works in multiplayer but not singleplayer (or vice versa). No error in logs. Just nothing happens.

**Cause:** Server file uses `if not isServer() then return end`. In singleplayer and hosted-host, `isServer()=false`, so the guard fires and the entire file is silently skipped.

**Diagnosis:** Add `print("[MyMod] server file loaded")` at the top of the server file, before the guard. If you don't see it in SP, the guard is the problem.

**Fix:** `if isClient() then return end` — this is always correct for server files.

---

## Pattern 2 — Command Never Arrives at Server

**Symptom:** Client sends `sendClientCommand(MODULE_ID, "doThing", args)`. Server handler never fires. No error.

**Likely causes (in order of frequency):**
1. `MODULE_ID` string is different between client and server (case mismatch, typo, defined in different files)
2. Server handler registered under wrong module string: `Events.OnClientCommand.Add(handler)` but handler checks `if module ~= "MyMod" then return end` and the string doesn't match
3. Server file not loaded (wrong environment guard, see Pattern 1)
4. Handler registered after the command was already sent (timing issue at game start)

**Diagnosis:** In the server `OnClientCommand` handler, add a top-level log before any filtering:
```lua
Events.OnClientCommand.Add(function(module, command, player, args)
    print("[MyMod] OnClientCommand fired: module=" .. tostring(module) .. " command=" .. tostring(command))
end)
```
If this never prints, the file isn't loaded. If it prints but module doesn't match, you have a MODULE_ID mismatch.

---

## Pattern 3 — ModData Change Not Visible on Client

**Symptom:** Server updates a value in GlobalModData. Client still shows old value. No error. Users report "feature doesn't work."

**Cause:** `ModData.transmit(key)` not called after mutation.

**Fix:**
```lua
local store = ModData.getOrCreate("MyMod")
store.someValue = newValue
ModData.transmit("MyMod")  -- required — without this, clients never see the update
```

---

## Pattern 4 — Stale State After Reconnect

**Symptom:** Player leaves and rejoins. UI shows old data or missing data. Other players' UI is correct.

**Cause:** Server pushed updates while this player was disconnected. On reconnect, nobody sends them the current state.

**Fix:** In a client file, on `OnGameStart`, request current state:
```lua
Events.OnGameStart.Add(function()
    ModData.request("MyMod")
end)
```

---

## Pattern 5 — Event Handler Fires Twice

**Symptom:** An action happens twice, or a counter increments by 2 instead of 1. No error.

**Cause:** An event handler was registered twice. This happens when:
- An init function is called from two different hooks
- A file is `require()`d in two different places
- Hot reload during development re-runs the registration

**Diagnosis:** Add a counter at the event handler level and log it. If it prints twice per expected trigger, double registration is the cause.

**Fix:**
```lua
local initialized = false
local function init()
    if initialized then return end
    initialized = true
    Events.EveryOneMinute.Add(myHandler)
end
```

---

## Pattern 6 — nil Access on Old Save

**Symptom:** After a mod update, existing saves throw errors like `attempt to index a nil value (field 'players')` or `attempt to perform arithmetic on a nil value`.

**Cause:** An old save has ModData structure from a previous version. New code expects a field that didn't exist when the save was created.

**Fix:** Always nil-default fields before using them:
```lua
local store = ModData.getOrCreate("MyMod")
store.players = store.players or {}
store.version = store.version or 1

-- For version migrations:
if store.version < 2 then
    store.newField = store.newField or defaultValue
    store.version = 2
end
```

---

## Pattern 7 — UI Not Opening / Showing Blank

**Symptom:** Calling the function that should open a UI panel does nothing, or the panel opens but is empty.

**Common causes:**
1. `createChildren()` not called or throws an error before completing — panel exists but has no children
2. `initialise()` not called before `addToUIManager()`
3. Panel positioned off-screen (x/y negative, or larger than screen resolution)
4. Singleton check returns early because `instance` variable is non-nil but the window was closed without nulling `instance`

**Diagnosis:** Check if `instance` variable is non-nil when you expect the panel to be closed. Add `print()` at the start of `createChildren()` to see if it runs.

**Fix for singleton stale instance:**
```lua
function MyPanel:close()
    ISCollapsableWindow.close(self)
    MyPanel.instance = nil  -- must nil here
end
```

---

## Pattern 8 — Context Menu Entry Missing

**Symptom:** Right-clicking a player, item, or object doesn't show the expected menu option.

**Common causes:**
1. Condition in the `test` parameter returns false — the entry is filtered out before display
2. `OnFillWorldObjectContextMenu` used instead of the correct event for the target type
3. Player index passed incorrectly — `playerIndex` (number) vs `getSpecificPlayer(playerIndex)` (IsoPlayer object)
4. Event not registered (timing issue or wrong file)

**Diagnosis:** Remove the `test` parameter temporarily to confirm the entry shows. Then reintroduce the test logic.

---

## Pattern 9 — ISChat Hook Fires Before Chat is Ready

**Symptom:** Error like `attempt to index a nil value (global 'ISChat')` when trying to hook into chat on game start.

**Cause:** `ISChat` panel is not yet initialized when `OnGameStart` fires in some environments.

**Fix:** Use `OnChatWindowInit` event instead:
```lua
Events.OnChatWindowInit.Add(function()
    -- safe to hook ISChat here
    local originalFn = ISChat.onCommandEntered
    ISChat.onCommandEntered = function(self)
        -- your hook
        originalFn(self)
    end
end)
```

---

## Pattern 10 — Broadcast Sends Private Data to All Players

**Symptom:** Player A sees Player B's private stats, inventory, or admin data in their UI.

**Cause:** `sendServerCommand(MODULE_ID, "sync", data)` (broadcast form) used instead of `sendServerCommand(player, MODULE_ID, "sync", data)` (targeted form).

**Fix:** Always use the targeted form for player-specific data:
```lua
-- WRONG: sends to all clients
sendServerCommand(MODULE_ID, "syncPlayer", playerData)

-- CORRECT: sends only to the specific player
sendServerCommand(targetPlayer, MODULE_ID, "syncPlayer", playerData)
```

---

## Pattern 11 — Workshop ID Corrupted After Re-upload

**Symptom:** Existing subscribers no longer receive updates. A second Workshop entry appeared. Some players are on old version, some on new.

**Cause:** `workshop.txt` `id=` field was blank or incorrect when the mod was re-uploaded to Workshop. Steam created a new entry.

**Fix:** This cannot be undone cleanly. Options:
1. Delete the new (incorrect) Workshop entry and re-upload with the correct `id=`
2. Migrate all subscribers to the new entry (announce, deprecate old entry)

**Prevention:** Commit `workshop.txt` with the correct `id=` immediately after first publish. Never let it be blank again.

---

## Pattern 12 — Recipe Not Appearing in Crafting Menu

**Symptom:** A custom recipe was added but doesn't appear when the player has all required items.

**Common causes:**
1. `SkillRequired` perk name misspelled or wrong capitalization (perk names are case-sensitive in scripts)
2. `Result` item ID references a non-existent item
3. `NeedToBeLearn` is true but the recipe book is not obtainable
4. Module name in `recipe` block doesn't match the scripts file's `module` declaration
5. `versionMin` mismatch — recipe uses B42-only syntax but is being tested on B41

**Diagnosis:** Check `console.txt` for script parse errors. A bad recipe often logs an error on game load.

---

## Pattern 13 — Loot Not Spawning

**Symptom:** A custom item added to a loot table via `OnPreDistributionMerge` never appears in the game world.

**Common causes:**
1. Hook used `OnPostDistributionMerge` (does not exist — correct is `OnPreDistributionMerge`)
2. Container name typo — `ProceduralDistributions.list["PoliceDesk"]` vs the actual key in PZ's tables
3. `rolls` value too low for the rarity desired (1 roll at 0.001 chance rarely fires)
4. Item registered in wrong distribution system (SuburbsDistributions key vs ProceduralDistributions key)

**Diagnosis:** Add a debug print in your distribution hook to confirm it fires. Then temporarily set rarity to 100 to confirm the item itself spawns correctly.

---

## Pattern 14 — `require()` Fails Silently

**Symptom:** A required module's functions are nil. Errors like:
- `attempt to call a nil value (field 'someFunction')`
- `attempted index: new of non-table: null` (e.g. `HFB_ActionBroker.new()` when `local HFB_ActionBroker = require(...)` got nil)

**Cause:** The required file exists but doesn't `return` the module table at the end, or the path passed to `require()` is wrong. Top-level env guards (`if isServer() then return end`) do **not** count as a module export.

**Fix:**
```lua
-- Required file MUST end with:
return MyModule

-- require() path is relative to media/lua/:
local utils = require("shared/MyMod_Utils")
-- This loads media/lua/shared/MyMod_Utils.lua
```

**Enforced by:** `space_audit_b42_api_traps` rule `require_missing_return` (and production release gate).

---

## Pattern 15 — Performance Spike on Player Join

**Symptom:** Server hitches when a player connects. Logs show the spike correlates with ModData operations.

**Cause:** `ModData.transmit()` is called with a very large table on player join. The entire table serializes and sends at once.

**Fix:** Use targeted `sendServerCommand` for join sync instead of `ModData.transmit()`:
```lua
Events.OnClientCommand.Add(function(module, command, player, args)
    if module == MODULE_ID and command == "requestSync" then
        -- send only what this player needs
        local playerData = getPlayerSubset(player:getUsername())
        sendServerCommand(player, MODULE_ID, "syncResponse", playerData)
    end
end)
```

---

## Pattern 16 — `getObjectById` Returns nil in B42.17

**Symptom:** Code that looks up a zombie or object by ID returns nil after upgrading to B42.17, even though the object exists. Error: `attempt to index a nil value` on lines that previously worked.

**Cause:** `getObjectById(id)` is broken in B42.17. It does not reliably return IsoZombie objects.

**Fix:** Use `getObjectListForLua()` with an `instanceof` filter:
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

-- ID selection:
-- MP: use zombie:getOnlineID()
-- SP: use zombie:getID()
```

**Confirmed by:** CSR `CSR_DualWieldUtils.lua` — comment explicitly states "B42.17 fix replacing broken `getObjectById`".

---

## Pattern 17 — `ISEquipWeaponAction:complete()` Wrapper Creates Feedback Loop

**Symptom:** After wrapping `ISEquipWeaponAction:complete()` to re-apply an off-hand item, players can no longer equip primary-hand pistols. Every time they try to equip a pistol, the engine bounces it back.

**Cause:** Vanilla has reciprocal handgun-slot logic — when you equip a pistol, the engine may clear the secondary slot. If `complete()` is wrapped to immediately re-equip the off-hand pistol, this creates a loop: vanilla clears secondary → wrapper re-equips → vanilla sees a new secondary and re-evaluates primary → etc.

**Fix:** Do NOT wrap `ISEquipWeaponAction:complete()` for off-hand logic. Instead:
1. Wrap `ISEquipWeaponAction.perform` (not `complete`)
2. Add early-exit when a handgun is already held in the primary hand
3. Use `Events.OnPlayerAttackFinished` for post-attack off-hand restore

**Confirmed by:** CSR v1.8.18 — `ISEquipWeaponAction:complete()` wrapper was removed entirely after this bug was discovered.

---

## Pattern 18 — Recipe sync NPE on null `Recipe.getResult()` (B41 recipecode references)

**Symptom:** Client crashes during world load with:
```
ERROR: Network > GameClient.gameLoadingDealWithNetData> Exception thrown
java.lang.NullPointerException: Cannot invoke "zombie.scripting.objects.Recipe$Result.getType()"
    because the return value of "zombie.scripting.objects.Recipe.getResult()" is null
        at RecipePacket.calculateChecksum(RecipePacket.java:157)
```

**Cause:** A legacy `recipe` block on the server has its Result set to null. PZ B42's server→client recipe sync (`RecipePacket.calculateChecksum`) iterates every loaded recipe and calls `getResult().getType()` on each — one null Result crashes the whole packet for every joining client.

The usual underlying cause is B41-era recipes referencing things that no longer exist in B42:

- `[Recipe.GetItemTypes.Liquor]`, `[Recipe.GetItemTypes.Scissors]`, etc. — these getters lived in B41's `recipecode.lua` global, which is gone in B42. `require "recipecode"` fails silently.
- Vanilla item names that were renamed (`Base.Stone` → `Base.Stone2`, etc., see Pattern 20).
- Custom items referenced by a recipe but never actually defined in the mod's own `media/scripts/` (Result item missing).

When PZ can't fully resolve a recipe's parts, it may keep the recipe registered but leave Result null — hence the NPE on the next client recipe sync.

**Diagnosis:**

1. On the server, look at the newest `*DebugLog-server.txt` for `WARN : Recipe` lines like `at RecipeManager.resolveItemModuleDotType> ERROR: can't find recipe source "X" in recipe "Y"`. Those tell you which recipes are partially broken.
2. On the server, grep for `Lua\(\(MOD:...\)\).*Exception thrown` near load time — files using B41 `Recipe.OnCreate.X = ...` / `Recipe.OnTest.X = ...` throw *"attempted index of non-table"* at Lua load because the table is nil.
3. Client-side, the only signal you get is the bare `RecipePacket.calculateChecksum` NPE above — no specific recipe name.

**Fix:**

1. Prepend a shim to every Lua file that touches `Recipe.OnCreate`, `Recipe.OnTest`, or `Recipe.GetItemTypes`:
```lua
Recipe = Recipe or {}
Recipe.OnCreate = Recipe.OnCreate or {}
Recipe.OnTest = Recipe.OnTest or {}
Recipe.GetItemTypes = Recipe.GetItemTypes or {}
```
2. Replace `[Recipe.GetItemTypes.X]` ingredient brackets with explicit item-OR lists, re-implement the getters in your own shared Lua, or migrate the recipe to B42's `craftRecipe` format.
3. Update renamed item references (see Pattern 20).

**Confirmed by:** BB Common Sense reintegration session 2026-05-15. Bindle, FAO, and NatWpns content from the Braven catalogue all hit this on first import to a B42.18 server. Quarantining the broken recipes immediately fixed the join crash; applying the shim and item renames let them go back in cleanly.

---

## Pattern 19 — Steam Workshop hidden-item NPE on dedicated server startup

**Symptom:** Dedicated server fails to start. Log shows:
```
LOG  : General > Workshop: onItemNotDownloaded itemID=<id> result=15
LOG  : General > Workshop: item state DownloadPending -> Fail ID=<id>
Exception in thread "main" java.lang.NullPointerException
    at java.io.File.<init>(Unknown Source)
    at zombie.ZomboidFileSystem.deleteDirectory(ZomboidFileSystem.java:1478)
    at zombie.network.GameServerWorkshopItems.Install(GameServerWorkshopItems.java:248)
    at zombie.network.GameServer.main(GameServer.java:736)
```

**Cause:** Steam returns `result=15` (k_EResultAccessDenied) when the server's Steam account cannot download a Workshop item — almost always because the item is set to **hidden / private visibility** on the Workshop side. When Steam reports the failure, PZ's `GameServer.Install` tries to clean up the (never-created) download directory via `deleteDirectory`, which receives a null path and NPEs. The cleanup path doesn't null-check the file argument — engine bug.

**Diagnosis:** The two log lines `onItemNotDownloaded ... result=15` and `Workshop: item state DownloadPending -> Fail` immediately preceding the NPE are the smoking gun. Any Workshop ID listed in `WorkshopItems=` that doesn't resolve produces this — hidden visibility is the most common reason on test servers where the author has uploaded but not yet published.

**Fix options:**

1. **Don't reference hidden items via `WorkshopItems=`.** For dev/test, install the mod locally under `<cachedir>/mods/<ModId>/` (the world-side mods folder) and only list its Mod ID in `Mods=`. PZ loads it from disk without Steam involvement.
2. **Flip the Workshop item visibility to public.** The PZ engine bug still exists, but the trigger goes away once Steam can download.
3. **Add the server's Steam account as a viewer/contributor to the hidden item.** Workshop permissions can grant download access to specific accounts. Brittle — still relies on the buggy cleanup path.

**Recommended:** Option 1 for any test server. Hidden Workshop items aren't a stable distribution channel; treat them as authoring drafts only.

**Confirmed by:** BB Common Sense suite push to pz-test 2026-05-15. Seven newly-uploaded hidden Workshop IDs in `WorkshopItems=` crashed the server on every start until the IDs were stripped from the ini and the mods installed locally under `<world>/mods/` instead.

---

## Pattern 20 — Vanilla item renames in B42 (Stone, TreeBranch, WoodenStick → `*2`)

**Symptom:** Recipes ported from a B41-era mod log:
```
WARN : Recipe ... at RecipeManager.resolveItemModuleDotType
    > ERROR: can't find recipe source "Stone" in recipe "Weaponize-Stone"
```
or Lua at runtime: `local item = ScriptManager.instance:getItem("Base.Stone")` returns nil.

**Cause:** B42's weapon-system rework renamed several common materials. The B41 names no longer exist in `runtime/media/scripts/`:

| B41 | B42 |
|---|---|
| `Base.Stone` | `Base.Stone2` |
| `Base.TreeBranch` | `Base.TreeBranch2` |
| `Base.WoodenStick` | `Base.WoodenStick2` |

`SharpedStone` and `Plank` remained unchanged. Other items may follow the same pattern — diff the source mod's referenced item names against `runtime/media/scripts/generated/items/` before porting.

**Fix:** Search-and-replace across the affected mod's recipe `.txt` files and any `ScriptManager.instance:getItem(...)` Lua calls. Verify each replacement by grepping vanilla scripts for the proposed new name before committing.

**Confirmed by:** BB Common Sense Crafting reintegration 2026-05-15. `BB_Bindle_Recipes.txt`, `BB_NatWpns_Recipes.txt`, and `BB_NatWpns_ItemModCode.lua` all referenced the B41 names; recipes were logged as unresolvable until the renames landed.

---

## Pattern 21 — Legacy `item` block uses `Type =`, not `ItemType =`

**Symptom:** An item declared in `media/scripts/*.txt` silently fails to load properly, or behaves as the wrong type. No clear error in logs.

**Cause:** Confusion between two different B42 scripting surfaces:

- **Legacy `item Foo { ... }` blocks** use `Type = Normal` (also `Drainable`, `Container`, `Weapon`, `Food`, `Clothing`, etc.). This is the long-standing PZ item script format.
- **Entity-component scripts** (B42's newer entity system, `entity Foo { component ItemSpawner { ... } }`) use `ItemType = base:normal` — a different syntax in a different surface.

Pasting `ItemType = base:normal` into a legacy `item` block leaves the item without a usable `Type` field. PZ may default it, ignore the line, or end up with a partially-loaded item.

**Fix:** Inside a legacy `item Foo { ... }` block, always use `Type = Normal` (or the appropriate type keyword). Reserve `ItemType = base:normal` for actual `entity` blocks with the modern component system.

**Confirmed by:** BB Common Sense Compatibility Patch initial draft 2026-05-15 — the CSR stub items were originally written with `ItemType = base:normal` and produced unclear load behaviour until corrected to `Type = Normal`.

---

## Pattern 22 - Missing event tables on dedicated server (`Events.EveryTenSeconds`)

**Symptom:** Dedicated server startup logs:
```
ERROR: General ... at KahluaThread.flushErrorMessage
attempted index: Add of non-table: null
Lua((MOD:Natural Disasters)).NaturalDisasters_Earthquake.lua> Exception thrown
```

The line may point near an `Events.<Name>.Add(...)` call after Workshop/source
line-number drift.

**Cause:** Some event tables are not present on the dedicated B42 runtime even
when their names sound valid. `Events.EveryTenSeconds` was observed as nil/null
on pz-test B42.18. Directly indexing `.Add` crashes module load.

**Diagnosis:** Search the failing Lua file for unguarded event registrations:
```lua
Events.SomeEvent.Add(handler)
```
If the stack says `attempted index: Add of non-table: null`, the event table
itself is missing, not the handler.

**Fix:** Guard event availability and use a supported fallback. For ten-second
behavior, throttle `OnTick` instead of using `EveryTenSeconds`:
```lua
local ticks = 0
local function handlerThrottled()
    ticks = ticks + 1
    if ticks < 600 then return end
    ticks = 0
    handler()
end

if Events and Events.OnTick and Events.OnTick.Add then
    Events.OnTick.Add(handlerThrottled)
elseif Events and Events.EveryOneMinute and Events.EveryOneMinute.Add then
    Events.EveryOneMinute.Add(handler)
end
```

**Confirmed by:** Natural Disasters earthquake chasm check on BiteMe pz-test
B42.18, 2026-05-19. Replacing `Events.EveryTenSeconds.Add(...)` with guarded
`OnTick` throttling prevented the startup Lua exception.

---

## Pattern 23 - Skill-tree config keys are not engine perk IDs

**Symptom:** A specialization/progression mod appears to load, but branch
selection is always locked, crashes on selection, or unlocks the wrong skill.

**Cause:** Config/display keys such as `Electrical`, `Metalworking`, or
`FirstAid` are used directly in dynamic perk lookup:

```lua
player:getPerkLevel(Perks[skillName])
```

PZ's engine perk constants do not always match display/config labels. For
example, electrical and metalworking systems commonly require explicit mapping
to `Perks.Electricity` and `Perks.MetalWelding` rather than relying on string
indexing.

**Fix:** Use a static map from config IDs to engine perk constants, nil-check
the resolved perk, and reject/log unknown skills.

**Also check:** Client UI should not be the authority for unlocks, and the
displayed unlock state must match server validation.

---

## Pattern 24 - Custom trait script fields are inert without Lua handlers

**Symptom:** A trait-backed mod claims bonuses such as speed, construction
strength, or resource savings, but gameplay is unchanged.

**Cause:** Script fields such as `SpeedModifier = 1.1` or
`ConstructionBonus = 1` were added to a trait definition, but no Lua code reads
those fields or applies effects in timed actions, crafting hooks, or world-object
events.

**Fix:** Treat script traits as identifiers/state. Implement explicit Lua effect
handlers and verify in multiplayer. For B42 character traits, compare against
vanilla `character_trait_definition` blocks before inventing a new script
surface.

---

## Quick Diagnosis Checklist

## Latest Patch Checks

- File writers can now return nil/null when initialized incorrectly. Guard `getFileWriter(...)` and `getModFileWriter(...)` before `:write()` or `:close()`.
- Replace `DisableSafehouseWhenPlayerConnected` with `DisableSafehouseWhenOwnerConnected`.
- Remove `AutoCreateUserInWhiteList` from generated configs and docs.

When a feature stops working:

1. **Check logs first** — `%USERPROFILE%\Zomboid\Logs\<date>\console.txt`
2. **Which environment fails?** SP only? MP only? Both? Hosted-host specifically?
3. **Is the file even loading?** Add a top-level `print()` before any guards
4. **Is the event firing?** Add a top-level `print()` inside the handler before any filtering
5. **Is the MODULE_ID correct?** Log both sides and compare exact strings
6. **Is the guard correct?** Server = `if isClient() then return end`
7. **Was `transmit()` called?** After every ModData mutation that clients need to see
8. **Is this a double-registration?** Add a counter to the handler and check if it fires 2x
