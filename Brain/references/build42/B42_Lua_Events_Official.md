# B42 Lua Events — Official Reference

**Source(s):**
- https://demiurgequantified.github.io/ProjectZomboidLuaDocs/md_Events.html — Unofficial Lua Docs B42
- https://github.com/demiurgeQuantified/PZEventDoc/blob/develop/docs/Events.md
- https://pzwiki.net/wiki/Lua_event (403 at research time)
- https://pzwiki.net/wiki/Lua_Events (403 at research time)
- Search snippet data from pzwiki.net event pages

**Compiled from:** B42 version 42.13.0 and later

---

## Known Corrections and Discrepancies

> These corrections come from cross-referencing SKILL.md (Haven/Biteme mod suite) against PZEventStubs and demiurgeQuantified LuaDocs.

| Claim | Status | Correct Value |
|---|---|---|
| `OnEveryOneMinute` (SKILL.md) | **CONTRADICTED** | Correct name: `EveryOneMinute` (no "On" prefix) — confirmed by PZEventStubs and LuaDocs |
| `OnEveryTenMinutes` (SKILL.md) | **CONTRADICTED** | Correct name: `EveryTenMinutes` (no "On" prefix) — confirmed by PZEventStubs and LuaDocs |
| `OnPlayerSayCommand` (SKILL.md) | **CONFIRMED (MP only)** | Verified in production 2026-05-24 on B42.18.0 dedicated server. Args: `(player, command)` where `command` is the text after the `/` with no leading slash. **Does NOT exist in singleplayer** — `Events.OnPlayerSayCommand` is null in SP, so `.Add(...)` crashes. Always guard: `if Events.OnPlayerSayCommand then Events.OnPlayerSayCommand.Add(fn) end`. Use as backup `/cmd` path alongside the `ISChat.sendMessage` override. |

The correct periodic event names are `EveryOneMinute`, `EveryTenMinutes`, `EveryHours`, `EveryDays` — all without an "On" prefix.

---

## How to Use Lua Events

```lua
-- Adding a function to an event
Events.OnCreatePlayer.Add(function(playerNum, player)
    print("Player created: " .. tostring(player))
end)

-- Removing a function from an event
Events.OnCreatePlayer.Remove(myFunction)

-- Adding with a named function (preferred — easier to remove later)
local function onPlayerCreate(playerNum, player)
    -- your code here
end
Events.OnCreatePlayer.Add(onPlayerCreate)
```

**Context rules:**
- Events in `shared/` scripts — available to both client and server
- Events in `client/` scripts — client-only events
- Events in `server/` scripts — server-only events
- Some events only fire in multiplayer (MP)

---

## Character / Player Events

| Event Name | Parameters | Context | Description |
|-----------|-----------|---------|-------------|
| `OnCreatePlayer` | `playerNum (int), player (IsoPlayer)` | Client | Fires when a player is created/loaded |
| `OnNewGame` | `player (IsoPlayer)` | Client | Fires when starting a brand new game |
| `OnPlayerDeath` | `player (IsoPlayer)` | Client | Fires when the player dies |
| `OnPlayerUpdate` | `player (IsoPlayer)` | Client | Fires every update tick for each player |
| `OnPlayerMove` | `player (IsoPlayer)` | Client | Fires when a player moves |
| `OnPlayerGetDamage` | `player (IsoPlayer), handWeapon, damage (float)` | Client | Fires when player receives damage |
| `OnPlayerAttackFinished` | `player (IsoPlayer), weapon` | Client | Fires when player finishes attacking |
| `OnCharacterDeath` | `character (IsoGameCharacter)` | Shared | Fires when any character dies (player or survivor) |
| `OnCharacterCollide` | `character (IsoGameCharacter), collider` | Client | Fires on character collision |
| `OnCreateLivingCharacter` | `character (IsoGameCharacter), player (IsoPlayer)` | Client | Fires when a living character (survivor) is created |
| `OnCreateSurvivor` | `survivor (IsoSurvivor)` | Client | Fires when a survivor NPC is created |
| `AddXP` | `player (IsoPlayer), perkType, xpAmount (float)` | Client | Fires when XP is added to a perk |
| `LevelPerk` | `player (IsoPlayer), perkType` | Client | Fires when a perk levels up |
| `OnClothingUpdated` | `character (IsoGameCharacter)` | Client | Fires when character clothing changes |
| `OnEquipPrimary` | `character (IsoGameCharacter), item (InventoryItem)` | Client | Fires when primary item is equipped |
| `OnEquipSecondary` | `character (IsoGameCharacter), item (InventoryItem)` | Client | Fires when secondary item is equipped |
| `OnAIStateChange` | `character (IsoGameCharacter), oldState, newState` | Shared | Fires on AI state transition |

---

## Zombie Events

| Event Name | Parameters | Context | Description |
|-----------|-----------|---------|-------------|
| `OnZombieCreate` | `zombie (IsoZombie)` | Shared | Fires when a zombie is created |
| `OnZombieDead` | `zombie (IsoZombie)` | Shared | Fires when a zombie dies |
| `OnZombieUpdate` | `zombie (IsoZombie)` | Shared | Fires every update tick for zombies |
| `OnHitZombie` | `character (IsoGameCharacter), zombie (IsoZombie), bodyPart, weapon` | Shared | Fires when a zombie is hit |
| `OnBeingHitByZombie` | `zombie (IsoZombie), victim (IsoGameCharacter)` | Shared | Fires when a zombie lands a hit |
| `OnWeaponHitCharacter` | `attacker, victim (IsoGameCharacter), weapon, damage (float)` | Shared | Fires when weapon hits any character |
| `OnWeaponSwing` | `character (IsoGameCharacter), weapon (HandWeapon)` | Shared | Fires on weapon swing START (before hit). PZwiki lists parameter as IsoPlayer but Shared scope means IsoGameCharacter is correct — can fire for any character. Use `OnPlayerAttackFinished` instead for post-attack triggers. |
| `GrappleGrabCollisionCheck` | `zombie (IsoZombie), player (IsoPlayer)` | Shared | Fires during grapple collision check |
| `GrapplerLetGo` | `zombie (IsoZombie), player (IsoPlayer)` | Shared | Fires when zombie releases grapple |

---

## Vehicle Events

| Event Name | Parameters | Context | Description |
|-----------|-----------|---------|-------------|
| `OnEnterVehicle` | `character (IsoGameCharacter)` | Client | Fires when any character enters a vehicle |
| `OnExitVehicle` | `character (IsoGameCharacter)` | Client | Fires when any character exits a vehicle |
| `OnUseVehicle` | `player (IsoPlayer), vehicle, bEnter (bool)` | Client | Fires when player uses (enters/exits) a vehicle |
| `OnSwitchVehicleSeat` | `player (IsoPlayer), vehicle` | Client | Fires when player switches seat in vehicle |
| `OnMechanicActionDone` | `player (IsoPlayer), vehicle` | Client | Fires when a mechanic action completes |
| `OnSpawnVehicleStart` | — | Shared | Fires at start of vehicle spawning phase |
| `OnSpawnVehicleEnd` | — | Shared | Fires at end of vehicle spawning phase |
| `OnVehicleDamageTexture` | `vehicle, int` | Client | Fires when vehicle damage texture updates |

---

## World / Environment Events

| Event Name | Parameters | Context | Description |
|-----------|-----------|---------|-------------|
| `OnInitWorld` | — | Shared | Fires after the world finishes initializing |
| `OnPostMapLoad` | `cell (IsoCell)` | Shared | Fires after map cell loads |
| `OnPreMapLoad` | `cell (IsoCell)` | Shared | Fires before map cell loads |
| `LoadChunk` | `cell, wx, wy` | Shared | Fires when a chunk is loaded |
| `LoadGridsquare` | `sq (IsoGridSquare)` | Shared | Fires when a grid square is loaded |
| `ReuseGridsquare` | `sq (IsoGridSquare)` | Shared | Fires when a grid square is reused from cache |
| `OnObjectAdded` | `sq (IsoGridSquare), obj (IsoObject)` | Shared | Fires when an object is added to the world |
| `OnObjectAboutToBeRemoved` | `obj (IsoObject)` | Shared | Fires just before an object is removed |
| `OnContainerUpdate` | `container` | Shared | Fires when container contents change |
| `OnDeadBodySpawn` | `body (IsoDeadBody)` | Shared | Fires when a dead body is spawned |
| `OnDestroyIsoThumpable` | `obj (IsoThumpable)` | Shared | Fires when a thumpable object is destroyed |
| `OnTileRemoved` | `sq (IsoGridSquare)` | Shared | Fires when a tile is removed |
| `OnNewFire` | `fire (IsoFire)` | Shared | Fires when a new fire starts |
| `OnGridBurnt` | `sq (IsoGridSquare)` | Shared | Fires when a grid square burns |
| `OnWaterAmountChange` | `sq (IsoGridSquare)` | Shared | Fires when water amount changes |
| `OnWorldSound` | `x (int), y (int), z (int), radius (int), volume (float)` | Shared | Fires when a world sound is emitted |
| `OnSeeNewRoom` | `room (IsoRoom)` | Client | Fires when player discovers a new room |
| `OnLoadMapZones` | — | Shared | Fires when map zones are loading |
| `OnLoadedMapZones` | — | Shared | Fires when map zones finish loading |

---

## Game State Events

| Event Name | Parameters | Context | Description |
|-----------|-----------|---------|-------------|
| `OnGameBoot` | — | Shared | Fires after the game finishes starting up |
| `OnGameStart` | — | Shared | Fires when the game world starts |
| `OnGameTimeLoaded` | — | Shared | Fires when game time data is loaded |
| `OnLoad` | — | Shared | Fires when a save is loaded |
| `OnSave` | — | Shared | Fires when the game is saving |
| `OnResetLua` | — | Shared | Fires when Lua is being reset |
| `OnMainMenuEnter` | — | Client | Fires when main menu is entered |
| `OnModsModified` | — | Client | Fires when mod list changes |
| `OnInitGlobalModData` | `newGame (bool)` | Shared | Fires when global mod data is initialized; use to get/create mod data |
| `OnReceiveGlobalModData` | `key (string), modData (table)` | Client | Fires when global mod data is received from server |
| `OnLoadedTileDefinitions` | — | Shared | Fires when tile definitions are loaded |
| `OnLoadRadioScripts` | — | Shared | Fires when radio scripts are loaded |
| `OnLoadSoundBanks` | — | Shared | Fires when sound banks are loaded |
| `OnGameStateEnter` | `state` | Client | Fires when a game state is entered |
| `OnServerFinishSaving` | — | Server | Fires when server finishes saving |
| `OnServerStartSaving` | — | Server | Fires when server starts saving |
| `OnServerStarted` | — | Server | Fires when server has fully started |

---

## Time-Based Events

| Event Name | Parameters | Context | Description |
|-----------|-----------|---------|-------------|
| `EveryDays` | — | Shared | Fires at 00:00 every in-game day |
| `EveryHours` | — | Shared | Fires every in-game hour |
| `EveryOneMinute` | — | Shared | Fires every in-game minute |
| `EveryTenMinutes` | — | Shared | Fires every 10 in-game minutes |
| `OnTick` | `tickCount (long)` | Shared | Fires every game tick (can pause when paused) |
| `OnTickEvenPaused` | `tickCount (long)` | Shared | Fires every game tick even when paused |
| `OnRenderTick` | — | Client | Fires every render frame |
| `OnFETick` | — | Client | Fires every front-end (main menu) tick |

---

## UI / Input Events

| Event Name | Parameters | Context | Description |
|-----------|-----------|---------|-------------|
| `OnCreateUI` | — | Client | Fires when UI is being created; use to add UI panels |
| `OnPreUIDraw` | — | Client | Fires before UI is drawn |
| `OnPostUIDraw` | — | Client | Fires after UI is drawn |
| `OnFillInventoryObjectContextMenu` | `playerNum, contextMenu, items` | Client | Fires when right-clicking inventory items |
| `OnFillWorldObjectContextMenu` | `playerNum, contextMenu, worldObjects, test` | Client | Fires when right-clicking world objects |
| `DoSpecialTooltip` | `tooltip, item (InventoryItem)` | Client | Fires to populate special item tooltips |
| `OnKeyPressed` | `key (int)` | Client | Fires when a key is pressed |
| `OnKeyStartPressed` | `key (int)` | Client | Fires on the initial keydown |
| `OnKeyKeepPressed` | `key (int)` | Client | Fires while a key is held down |
| `OnCustomUIKey` | `key (int)` | Client | Fires for custom UI keybinds |
| `OnCustomUIKeyPressed` | `key (int)` | Client | Fires when custom UI key is pressed |
| `OnCustomUIKeyReleased` | `key (int)` | Client | Fires when custom UI key is released |
| `OnContextKey` | `player (IsoPlayer), key (int)` | Client | Fires when context action key is pressed |
| `OnMouseDown` | `x, y` | Client | Fires on mouse button down |
| `OnMouseUp` | `x, y` | Client | Fires on mouse button up |
| `OnMouseMove` | `dx, dy, x, y` | Client | Fires on mouse movement |
| `OnMouseWheel` | `delta` | Client | Fires on mouse wheel scroll |
| `OnRightMouseDown` | `x, y` | Client | Fires on right mouse button down |
| `OnRightMouseUp` | `x, y` | Client | Fires on right mouse button up |
| `OnObjectLeftMouseButtonDown` | `obj, x, y` | Client | Fires on left click on a world object |
| `OnObjectLeftMouseButtonUp` | `obj, x, y` | Client | Fires on left click release on world object |
| `OnObjectRightMouseButtonDown` | `obj, x, y` | Client | Fires on right click on a world object |
| `OnObjectRightMouseButtonUp` | `obj, x, y` | Client | Fires on right click release on world object |
| `SetDragItem` | `item (InventoryItem)` | Client | Fires when drag-and-drop starts for an item |
| `OnChatWindowInit` | — | Client | Fires when chat window is initialized |
| `OnResolutionChange` | `oldW, oldH, newW, newH` | Client | Fires when screen resolution changes |
| `OnPostRender` | — | Client | Fires after all rendering |
| `OnPreDistributionMerge` | — | Server | Fires before distribution tables are merged |
| `OnDistributionMerge` | — | Server | Fires during distribution table merge |
| `OnPostDistributionMerge` | — | Server | Fires after distribution tables are merged |
| `OnFillContainer` | `roomName, containerType, container` | Server | Fires when a container is being filled with loot |
| `OnItemFound` | `player (IsoPlayer), item (InventoryItem)` | Client | Fires when player finds/picks up an item |
| `SendCustomModData` | — | Shared | Fires to send custom mod data |
| `OnSafehousesChanged` | — | Shared | Fires when safehouse list changes |
| `OnRefreshInventoryWindowContainers` | `playerNum, inventory` | Client | Fires when inventory window refreshes |

---

## Multiplayer / Networking Events

| Event Name | Parameters | Context | Description |
|-----------|-----------|---------|-------------|
| `OnConnected` | — | Client | Fires when client connects to server |
| `OnConnectFailed` | `reason (string)` | Client | Fires when connection fails |
| `OnConnectionStateChanged` | `state` | Client | Fires when connection state changes |
| `OnDisconnect` | — | Client | Fires when client disconnects |
| `OnServerCommand` | `module (string), command (string), args (table)` | Client | Fires when server sends a command to client |
| `OnClientCommand` | `module (string), command (string), player (IsoPlayer), args (table)` | Server | Fires when client sends command to server |
| `OnAddMessage` | `message, tabID` | Client | Fires when a chat message is added |
| `OnAdminMessage` | `text (string), player (IsoPlayer)` | Client | Fires when admin sends a message |
| `AcceptedFactionInvite` | `factionName (string)` | Client | Fires when faction invite is accepted |
| `AcceptedSafehouseInvite` | `safeHouseName (string)` | Client | Fires when safehouse invite is accepted |
| `AcceptedTrade` | — | Client | Fires when trade is accepted |
| `ReceiveFactionInvite` | `factionName (string), inviterName (string)` | Client | Fires when receiving faction invite |
| `ReceiveSafehouseInvite` | `safeHouseName (string), inviterName (string)` | Client | Fires when receiving safehouse invite |
| `RequestTrade` | `player (IsoPlayer)` | Client | Fires when trade is requested |
| `OnScoreboardUpdate` | — | Client | Fires when scoreboard updates |
| `OnServerStatisticReceived` | — | Client | Fires when server stats are received |
| `OnGetDBSchema` | `result` | Client | Fires when database schema is received |
| `OnGetTableResult` | `result` | Client | Fires when DB table query returns |
| `OnReceiveGlobalModData` | `key (string), data (table)` | Client | Fires when global mod data arrives from server |
| `OnReceiveItemListNet` | — | Client | Fires when item list is received over network |
| `MngInvReceiveItems` | — | Client | Fires when managed inventory receives items |
| `TradingUIAddItem` | `item (InventoryItem)` | Client | Fires when item added to trade UI |
| `TradingUIRemoveItem` | `item (InventoryItem)` | Client | Fires when item removed from trade UI |
| `TradingUIUpdateState` | `state` | Client | Fires when trade state updates |
| `SyncFaction` | — | Client | Fires when faction data syncs |

---

## Controller / Joypad Events

| Event Name | Parameters | Context | Description |
|-----------|-----------|---------|-------------|
| `OnGamepadConnect` | `id (int)` | Client | Fires when gamepad connects |
| `OnGamepadDisconnect` | `id (int)` | Client | Fires when gamepad disconnects |
| `OnJoypadActivate` | `joypadIndex (int)` | Client | Fires when joypad is activated |
| `OnJoypadDeactivate` | `joypadIndex (int)` | Client | Fires when joypad is deactivated |
| `OnJoypadActivateUI` | `joypadIndex (int)` | Client | Fires when joypad activates UI mode |
| `OnJoypadBeforeDeactivate` | `joypadIndex (int)` | Client | Fires before joypad deactivates |
| `OnJoypadBeforeReactivate` | `joypadIndex (int)` | Client | Fires before joypad reactivates |
| `OnJoypadReactivate` | `joypadIndex (int)` | Client | Fires when joypad reactivates |
| `OnJoypadRenderUI` | `joypadIndex (int)` | Client | Fires when joypad renders its UI |

---

## Weather Events

| Event Name | Parameters | Context | Description |
|-----------|-----------|---------|-------------|
| `OnWeatherPeriodStart` | `period` | Shared | Fires when a weather period begins |
| `OnWeatherPeriodComplete` | `period` | Shared | Fires when a weather period ends |
| `OnWeatherPeriodStage` | `period, stage` | Shared | Fires at each weather stage transition |
| `OnWeatherPeriodStop` | `period` | Shared | Fires when weather period is stopped |
| `OnThunderEvent` | `worldSoundDist (int)` | Shared | Fires when thunder occurs |
| `OnInitModdedWeatherStage` | `stage` | Shared | Fires to initialize custom weather stage |
| `OnUpdateModdedWeatherStage` | `stage, dt (float)` | Shared | Fires to update custom weather stage |
| `OnClimateManagerInit` | — | Shared | Fires when climate manager initializes |
| `OnClimateTick` | — | Shared | Fires every climate update tick |
| `OnClimateTickDebug` | — | Shared | Fires every climate debug tick |

---

## Foraging Events

| Event Name | Parameters | Context | Description |
|-----------|-----------|---------|-------------|
| `onAddForageDefs` | — | Shared | Fires to add foraging definitions |
| `preAddForageDefs` | — | Shared | Fires before foraging defs are added |
| `preAddCatDefs` | — | Shared | Fires before category definitions are added |
| `preAddItemDefs` | — | Shared | Fires before item definitions are added |
| `preAddSkillDefs` | — | Shared | Fires before skill definitions are added |
| `preAddZoneDefs` | — | Shared | Fires before zone definitions are added |
| `onEnableSearchMode` | `player (IsoPlayer)` | Client | Fires when foraging search mode enables |
| `onDisableSearchMode` | `player (IsoPlayer)` | Client | Fires when foraging search mode disables |
| `onToggleSearchMode` | `player (IsoPlayer), enabled (bool)` | Client | Fires when search mode is toggled |
| `onItemFall` | `item (InventoryItem)` | Client | Fires when a forageable item falls |
| `onFillSearchIconContextMenu` | `player, contextMenu` | Client | Fires to populate search icon context menu |
| `onUpdateIcon` | `player (IsoPlayer)` | Client | Fires to update forage icon |

---

## Administrative / Process Events

| Event Name | Parameters | Context | Description |
|-----------|-----------|---------|-------------|
| `OnProcessAction` | `module, action, player (IsoPlayer), args` | Server | Fires when server processes a mod action |
| `OnProcessTransaction` | `player (IsoPlayer), data` | Server | Fires when processing a transaction |
| `OnClientCommand` | `module, command, player (IsoPlayer), args` | Server | Fires when client sends command to server |
| `OnChallengeQuery` | `challenge (string)` | Server | Fires on auth challenge |
| `OnSGlobalObjectSystemInit` | — | Server | Fires when server global object system starts |
| `OnCGlobalObjectSystemInit` | — | Client | Fires when client global object system starts |

---

## Steam Events

| Event Name | Parameters | Context | Description |
|-----------|-----------|---------|-------------|
| `OnSteamGameJoin` | `steamID (long), name (string)` | Client | Fires when joining via Steam |
| `OnSteamFriendStatusChanged` | — | Client | Fires when friend status changes |
| `OnSteamRefreshInternetServers` | — | Client | Fires when server list refreshes |
| `OnSteamRulesRefreshComplete` | — | Client | Fires when server rules refresh |
| `OnSteamServerResponded` | — | Client | Fires when Steam server responds |
| `OnSteamServerResponded2` | — | Client | Fires on secondary server response |
| `OnSteamServerFailedToRespond2` | — | Client | Fires when server fails to respond |
| `OnSteamWorkshopItemCreated` | `workshopID (long)` | Client | Fires when Workshop item is created |
| `OnSteamWorkshopItemNotCreated` | — | Client | Fires when Workshop item creation fails |
| `OnSteamWorkshopItemUpdated` | `workshopID (long)` | Client | Fires when Workshop item is updated |
| `OnSteamWorkshopItemNotUpdated` | — | Client | Fires when Workshop item update fails |
| `OnServerWorkshopItems` | — | Client | Fires with server Workshop item list |
| `ServerPinged` | `ip, port, ping` | Client | Fires when a server ping responds |

---

## Usage Patterns

### Basic Event Hook
```lua
-- In a client Lua file
local function MyMod_OnCreatePlayer(playerNum, player)
    -- player is IsoPlayer
    if playerNum == 0 then
        -- This is the local player
        local modData = player:getModData()
        modData.MyMod_FirstLoad = modData.MyMod_FirstLoad or true
    end
end
Events.OnCreatePlayer.Add(MyMod_OnCreatePlayer)
```

### Server Command Pattern
```lua
-- CLIENT SIDE: Send command to server
local function sendToServer(action, data)
    local args = { action = action, data = data }
    sendClientCommand("MyMod", "HandleAction", args)
end

-- SERVER SIDE: Receive from client
local function onClientCommand(module, command, player, args)
    if module == "MyMod" and command == "HandleAction" then
        -- handle it
    end
end
Events.OnClientCommand.Add(onClientCommand)
```

### Server-to-Client Command Pattern
```lua
-- SERVER SIDE: Send to all clients
sendServerCommand("MyMod", "UpdateData", { value = 42 })

-- SERVER SIDE: Send to specific client
sendServerCommand(specificPlayer, "MyMod", "UpdateData", { value = 42 })

-- CLIENT SIDE: Receive from server
local function onServerCommand(module, command, args)
    if module == "MyMod" and command == "UpdateData" then
        print("Received: " .. tostring(args.value))
    end
end
Events.OnServerCommand.Add(onServerCommand)
```

---

## Chat Events (Additional)

From `references/events-catalog.md` in the Brain skill file (sourced from PZ game source).

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnPlayerSayLine` | client | `(player, line)` | Player typed normal chat and it was sent |
| `OnPlayerSayOverhead` | both | `(player, text)` | Speech bubble text over head (custom event) |
| `OnAlertMessage` | client | `(message)` | Modal/alert text received |
| `OnSetDefaultTab` | client | `(tab)` | Chat default tab changed |
| `OnTabAdded` | client | `(tab)` | New chat tab added |
| `OnTabRemoved` | client | `(tab)` | Chat tab removed |
| `SwitchChatStream` | client | `(streamIdx)` | Player switched say/yell/whisper stream |

> **`OnPlayerSayCommand`**: Used in the Haven/Biteme mod suite as a backup `/cmd` path (client, args `(player, command)` where command is the bare verb without the slash). This event is NOT present in the PZEventStubs or this events catalog. Status: **UNVERIFIED**. Test in-game before relying on it.

---

## Animal Events

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnAnimalTracks` | client | `(tracks)` | Animal tracks discovered (custom event) |
| `OnClickedAnimalForContext` | client | `(animal)` | Right-click on an animal |
| `OnFishingActionMPUpdate` | both | `(args)` | Fishing rod tick in MP (custom event) |
| `OnMovingObjectCrop` | server | `(object)` | Crop being relocated |

---

## Crafting / Building Events (Additional)

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnDoTileBuilding` | both | `(tile)` | Player constructed a tile |
| `OnDynamicMovableRecipe` | both | `(recipe)` | Moveables system recipe hook |
| `OnProcessAction` | both | `(action)` | TimedAction processed (also in Admin section) |
| `OnProcessTransaction` | server | `(transaction)` | Transaction processor hook |

---

## Additional Multiplayer / Networking Events

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnCoopJoinFailed` | client | `()` | Coop join failure |
| `OnCoopServerMessage` | client | `(message)` | Coop infrastructure message |
| `OnNetworkUsersReceived` | client | `(users)` | Player roster sync received |
| `OnReceiveUserlog` | client | `(log)` | Userlog delivery |
| `OnRolesReceived` | client | `(roles)` | Role/permission sync |
| `OnPlayerDisconnect` | server | `(player)` | **Deprecated** — see PZ source. Use `OnDisconnect` with custom tracking. |
| `OnAcceptInvite` | client | `(invite)` | Generic invite accept |
| `OnPressWalkTo` | client | `(x, y)` | Player right-click walk-to |

---

## Additional Admin / Scoreboard Events

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnMiniScoreboardUpdate` | client | `(rows)` | Compact scoreboard refresh |
| `RefreshCheats` | client | `()` | Cheat menu refresh |
| `ViewBannedIPs` | client | `(rows)` | Admin view of banned IPs |
| `ViewBannedSteamIDs` | client | `(rows)` | Admin view of banned Steam IDs |
| `ViewTickets` | client | `(rows)` | Admin view of player tickets |

---

## Custom Events via `LuaEventManager`

Events registered with `LuaEventManager.AddEvent("<Name>")` are indistinguishable from core events at runtime — same subscription and trigger API. Mods can declare their own.

**PZ-declared custom events** (from PZ source — already callable via `Events.<Name>.Add(fn)`):

- `OnExitVehicle`, `OnSwitchVehicleSeat`, `OnUseVehicle`, `OnVehicleHorn`
- `OnSteamFriendStatusChanged`, `OnSteamRefreshInternetServers`, `OnSteamRulesRefreshComplete`
- `OnSteamServerFailedToRespond2`, `OnSteamServerResponded`, `OnSteamServerResponded2`
- `OnSteamWorkshopItemCreated`, `OnSteamWorkshopItemNotCreated`
- `OnSteamWorkshopItemUpdated`, `OnSteamWorkshopItemNotUpdated`
- `OnDesignationZoneUpdatedNetwork`
- `onToggleSearchMode`, `onEnableSearchMode`, `onDisableSearchMode` (note: lowercase `o`)
- `OnAnimalTracks`, `OnFishingActionMPUpdate`, `OnPlayerSayOverhead`
- `SetDragItem`

Mod author pattern:

```lua
-- Declare once (in shared file or early in load order)
LuaEventManager.AddEvent("MyMod_OnDataReady")

-- Subscribe
Events.MyMod_OnDataReady.Add(function(data)
    -- ...
end)

-- Trigger
Events.MyMod_OnDataReady.trigger(myData)
```

---

## See Also

- `B42_TimedAction_API.md` — ISBaseTimedAction API
- `B42_IsoPlayer_API.md` — IsoPlayer methods
- `B42_ModData_SModData.md` — Mod data / persistence
- `B42_Globals_API.md` — Engine globals, `LuaEventManager`
- `B42_API_Changes_from_B41.md` — What changed vs B41
