# PZ Events Catalog (Build 42)

Full list of `Events.<Name>` symbols referenced in PZ's own Lua source at `<local-path>`. ~163 named events plus a handful of custom mod-declared ones.

Hook with `Events.<Name>.Add(fn)`. Unsubscribe with `Events.<Name>.Remove(fn)`. Trigger custom events with `Events.<Name>.trigger(args...)` after declaring via `LuaEventManager.AddEvent("<Name>")`.

Side column: which file role legitimately hooks the event. "both" means either side can subscribe meaningfully.

## Lifecycle

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnGameBoot` | both | `()` | Game process boot, before world. One-time prep. |
| `OnGameStart` | client | `()` | World loaded, player exists. Standard client init hook. |
| `OnNewGame` | both | `(player, square)` | Brand new world, first start only. PZ uses for spawn items + XP seed. |
| `OnInitGlobalModData` | server | `(isNewGame)` | Global ModData ready. Server bootstrap belongs here. |
| `OnInitWorld` | both | `()` | World construction phase. |
| `OnInitSeasons` | server | `()` | Seasonal climate init. |
| `OnInitRecordedMedia` | both | `()` | Recorded media (CDs, tapes, VHS) registry init. |
| `OnLoadMapZones` | server | `()` | Map zone parsing begins. |
| `OnLoadedMapZones` | server | `()` | Map zones parsed; foraging/zone systems init here. |
| `OnLoadSoundBanks` | both | `()` | Sound bank registration. |
| `OnLoadRadioScripts` | both | `()` | Radio script load. |
| `OnGameTimeLoaded` | both | `()` | GameTime singleton ready. |
| `OnLoad` | both | `(reader)` | World save reader. |
| `OnPostSave` | both | `()` | After save completes. |
| `OnServerStartSaving` | server | `()` | Dedi save window begins. |
| `OnServerFinishSaving` | server | `()` | Dedi save window ends. |
| `OnServerStarted` | server | `()` | Dedi process up. |
| `OnGameStateEnter` | both | `(state)` | High-level game state machine transition. |
| `OnMainMenuEnter` | client | `()` | Player at main menu. |
| `OnReturnToMainMenu` | client | `()` | Player exits world. |
| `OnResetLua` | both | `()` | Lua VM reset. |
| `OnModsModified` | both | `()` | Mod list changed. |

## Networking & connection

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnClientCommand` | server | `(module, command, player, args)` | Client→server command receiver. |
| `OnServerCommand` | client | `(module, command, args)` | Server→client command receiver. |
| `OnConnected` | client | `()` | This client connected to a server. |
| `OnConnectFailed` | client | `()` | Connection attempt failed. |
| `OnConnectionStateChanged` | client | `(state)` | Connection state machine transition. |
| `OnCoopJoinFailed` | client | `()` | Coop join failure. |
| `OnCoopServerMessage` | client | `(message)` | Coop infrastructure message. |
| `OnDisconnect` | client | `()` | This client disconnected. |
| `OnPlayerDisconnect` (deprecated; see PZ source) | server | `(player)` | **Deprecated** — use `OnDisconnect` with custom player tracking. Server-side pattern: maintain a `connectedPlayers` table, update on `OnPlayerConnect`, reconcile with `getOnlinePlayers()` in `EveryOneMinute`. |
| `OnNetworkUsersReceived` | client | `(users)` | Player roster sync. |
| `OnReceiveUserlog` | client | `(log)` | Userlog delivery. |
| `OnRolesReceived` | client | `(roles)` | Role/permission sync. |
| `ServerPinged` | client | `(server, ping)` | Browser server pinged back. |

## Players

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnCreatePlayer` | client | `(playerIdx, playerObj)` | Local player constructed. |
| `OnCreateSurvivor` | both | `(survivor)` | Survivor instance constructed. |
| `OnPlayerDeath` | both | `(player)` | Player died. |
| `OnPlayerMove` | client | `(player)` | Move vector changed this frame. |
| `OnPlayerUpdate` | client | `(player)` | Per-tick player update. **Expensive — avoid.** |
| `OnPlayerAttackFinished` | both | `(player, weapon)` | Swing complete. |
| `OnPressWalkTo` | client | `(x, y)` | Right-click walk-to. |

## Chat

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnPlayerSayLine` | client | `(player, line)` | Player typed normal chat. |
| `OnPlayerSayOverhead` (custom) | both | `(player, text)` | Speech bubble. |
| `OnAddMessage` | client | `(message)` | New chat line received. |
| `OnAdminMessage` | client | `(message)` | Admin broadcast. |
| `OnAlertMessage` | client | `(message)` | Modal/alert text. |
| `OnChatWindowInit` | client | `()` | ISChat first init. |
| `OnSetDefaultTab` | client | `(tab)` | Chat default tab change. |
| `OnTabAdded` | client | `(tab)` | Chat tab added. |
| `OnTabRemoved` | client | `(tab)` | Chat tab removed. |
| `SwitchChatStream` | client | `(streamIdx)` | Stream changed (say/yell/whisper/admin). |

## Inventory & containers

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnFillWorldObjectContextMenu` | client | `(playerIdx, context, worldobjects, test)` | Right-click on world object. First arg is index, resolve via `getSpecificPlayer`. |
| `OnFillInventoryObjectContextMenu` | client | `(playerIdx, context, items)` | Right-click on inventory item. |
| `OnContainerUpdate` | both | `(container)` | Container contents changed. |
| `OnFillContainer` | server | `(roomName, containerType, container)` | Loot generation hook. Used by distribution system. |
| `OnObjectAdded` | both | `(object)` | New IsoObject added. |
| `OnObjectAboutToBeRemoved` | both | `(object)` | IsoObject being deleted. |
| `OnEquipPrimary` | both | `(player, item)` | |
| `OnEquipSecondary` | both | `(player, item)` | |
| `OnMakeItem` | both | `(craftRecipe, items)` | Crafting completed. |
| `OnItemFound` | client | `(item)` | First-time item discovery. |
| `OnClothingUpdated` | both | `(player)` | Outfit changed. |
| `MngInvReceiveItems` | both | `(items)` | Bulk inventory transfer. |

## Combat & damage

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnZombieDead` | server | `(zombie)` | Zombie killed. |
| `OnHitZombie` | both | `(zombie, attacker, bodyPart, weapon)` | Zombie took a hit. |
| `OnWeaponHitTree` | both | `(player, weapon, tree)` | |
| `OnWeaponHitXp` | both | `(player, weapon, target)` | XP-relevant hit. |
| `OnWeaponSwingHitPoint` | client | `(player, weapon, ...)` | Swing animation key frame. |
| `OnDeadBodySpawn` | both | `(body)` | Corpse spawn. |
| `OnDestroyIsoThumpable` | server | `(thumpable)` | Player-built thumpable destroyed. |
| `OnPressRackButton` | client | `(player)` | Manual rack input. |
| `OnPressReloadButton` | client | `(player)` | Manual reload input. |

## Vehicles

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnEnterVehicle` | both | `(player)` | |
| `OnExitVehicle` | — | — | **Removed in B42.18.** Use `EveryOneMinute` polling with a `lastVehicle` local to detect when a player exits. |
| `OnSwitchVehicleSeat` (custom) | both | `(player)` | |
| `OnUseVehicle` (custom) | both | `(player, vehicle)` | |
| `OnVehicleHorn` (custom) | both | `(vehicle)` | |
| `OnVehicleDamageTexture` | both | `(vehicle)` | Damage visual update. |
| `OnSpawnVehicleStart` | server | `(vehicle)` | Vehicle spawn start. |
| `OnMechanicActionDone` | both | `(player, vehicle, action)` | Mechanic timed-action end. |

## Animals

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnAnimalTracks` (custom) | client | `(tracks)` | Animal tracks discovered. |
| `OnClickedAnimalForContext` | client | `(animal)` | Right-click animal. |
| `OnFishingActionMPUpdate` (custom) | both | `(args)` | Fishing rod tick in MP. |
| `OnMovingObjectCrop` | server | `(object)` | Crop relocation. |

## Input

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnKeyPressed` | client | `(key)` | One-shot keypress. |
| `OnKeyStartPressed` | client | `(key)` | Hold-key began. |
| `OnKeyKeepPressed` | client | `(key)` | Hold-key continues. |
| `OnMouseDown` | client | `(x, y)` | Left mouse global. |
| `OnRightMouseDown` | client | `(x, y)` | Right mouse global. |
| `OnMouseWheel` | client | `(delta)` | Scroll. |
| `OnObjectLeftMouseButtonDown` | client | `(object, x, y)` | Click on world object. |
| `OnObjectLeftMouseButtonUp` | client | `(object, x, y)` | |
| `OnObjectRightMouseButtonDown` | client | `(object, x, y)` | |
| `OnObjectRightMouseButtonUp` | client | `(object, x, y)` | |
| `OnContextKey` | client | `(key)` | Contextual hotkey. |
| `OnGamepadConnect` / `OnGamepadDisconnect` | client | `(controller)` | |
| `OnJoypadActivate` / `OnJoypadActivateUI` | client | `(joypad)` | |
| `OnJoypadBeforeDeactivate` / `OnJoypadDeactivate` | client | `(joypad)` | |
| `OnJoypadBeforeReactivate` / `OnJoypadReactivate` | client | `(joypad)` | |
| `OnJoypadRenderUI` | client | `()` | Render-time hook. |

## Render

| Event | Side | Cadence/args | Notes |
|---|---|---|---|
| `OnPreUIDraw` | client | per frame | Before UI draws. |
| `OnPostUIDraw` | client | per frame | After UI draws. |
| `OnRenderTick` | client | render loop | |
| `RenderOpaqueObjectsInWorld` | client | per frame | World pass. |
| `OnResolutionChange` | client | `(w, h)` | Window resize. |
| `DoSpecialTooltip` | client | `(layout, item)` | Add custom tooltip lines. |

## Tickers

| Event | Side | Cadence | Notes |
|---|---|---|---|
| `OnTick` | both | every game tick | **Expensive — avoid.** |
| `EveryOneMinute` | both | per game minute | |
| `EveryTenMinutes` | both | per 10 game minutes | |
| `EveryHours` | both | per game hour | |
| `EveryDays` | both | per game day | |
| `OnSleepingTick` | client | while sleeping | |

## Climate / world

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnClimateManagerInit` | server | `()` | Climate system init. |
| `OnClimateTickDebug` | both | `(state)` | Debug climate tick. |
| `OnInitSeasons` | server | `()` | Listed in lifecycle; included here for context. |
| `OnThunderEvent` | both | `(event)` | Thunder strike. |
| `OnWaterAmountChange` | both | `(square, amount)` | Water object change. |
| `OnWeatherPeriodStart` | both | `(period)` | Weather window begins. |
| `OnWeatherPeriodStage` | both | `(period, stage)` | Mid-window stage transition. |
| `OnWeatherPeriodComplete` | both | `(period)` | Weather window ends. |

## Crafting & XP

| Event | Side | Args | Notes |
|---|---|---|---|
| `AddXP` | both | `(player, perk, amount)` | |
| `LevelPerk` | both | `(player, perk, level)` | |
| `OnProcessAction` | both | `(action)` | TimedAction processed. |
| `OnProcessTransaction` | server | `(transaction)` | Transaction processor hook. |
| `OnDoTileBuilding` | both | `(tile)` | Player built a tile. |
| `OnDynamicMovableRecipe` | both | `(recipe)` | Moveables system hook. |

## Foraging

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnPreDistributionMerge` | server | `()` | Before distribution merge. |
| `OnDistributionMerge` | server | `()` | Distribution merge running. |
| `OnPostDistributionMerge` | server | `()` | After merge. |
| `OnLoadedMapZones` | server | `()` | Foraging init pivots on this. |

## Trading

| Event | Side | Args | Notes |
|---|---|---|---|
| `RequestTrade` | both | `(player1, player2)` | Trade request raised. |
| `AcceptedTrade` | both | `(trade)` | Trade accepted. |
| `TradingUIAddItem` | client | `(item)` | UI add. |
| `TradingUIRemoveItem` | client | `(item)` | UI remove. |
| `TradingUIUpdateState` | client | `(state)` | UI state sync. |

## Safehouses & factions

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnSafehousesChanged` | both | `()` | |
| `AcceptedSafehouseInvite` | client | `(invite)` | |
| `ReceiveSafehouseInvite` | client | `(invite)` | |
| `AcceptedFactionInvite` | client | `(invite)` | |
| `ReceiveFactionInvite` | client | `(invite)` | |
| `OnAcceptInvite` | client | `(invite)` | Generic invite accept. |
| `SyncFaction` | both | `(faction)` | Faction state sync. |
| `SyncFactionServer` | server | `(factionName, isRemove)` | Latest B42 patch notes: fires on any faction change, including rename/removal paths. |

## Admin / scoreboard / tickets

| Event | Side | Args | Notes |
|---|---|---|---|
| `OnScoreboardUpdate` | client | `(rows)` | Full scoreboard refresh. |
| `OnMiniScoreboardUpdate` | client | `(rows)` | Compact scoreboard refresh. |
| `RefreshCheats` | client | `()` | Cheat menu refresh. |
| `ViewBannedIPs` | client | `(rows)` | Admin view. |
| `ViewBannedSteamIDs` | client | `(rows)` | Admin view. |
| `ViewTickets` | client | `(rows)` | Admin view. |
| `OnDesignationZoneUpdatedNetwork` (custom) | both | `(zone)` | Designation zone change. |
| `OnSGlobalObjectSystemInit` | server | `(system)` | Server-side global object system. |
| `OnCGlobalObjectSystemInit` | client | `(system)` | Client-side global object system. |

## Steam

| Event | Side | Args |
|---|---|---|
| `OnSteamFriendStatusChanged` (custom) | client | `(friend)` |
| `OnSteamGameJoin` | client | `(invite)` |
| `OnSteamRefreshInternetServers` (custom) | client | `()` |
| `OnSteamRulesRefreshComplete` (custom) | client | `(server)` |
| `OnSteamServerFailedToRespond` / `OnSteamServerFailedToRespond2` (custom) | client | `(server)` |
| `OnSteamServerResponded` / `OnSteamServerResponded2` (custom) | client | `(server)` |
| `OnSteamWorkshopItemCreated` (custom) | client | `(itemId)` |
| `OnSteamWorkshopItemNotCreated` (custom) | client | `(error)` |
| `OnSteamWorkshopItemUpdated` (custom) | client | `(itemId)` |
| `OnSteamWorkshopItemNotUpdated` (custom) | client | `(error)` |
| `OnServerWorkshopItems` | server | `(items)` |

## Misc

| Event | Side | Args | Notes |
|---|---|---|---|
| `LoadGridsquare` | both | `(square)` | Square loading. |
| `OnDeviceText` | both | `(text)` | Device text input. |
| `OnGoogleAuthRequest` | client | `(req)` | Google auth flow. |
| `OnQRReceived` | client | `(qr)` | QR code received. |
| `OnTemplateTextInit` | both | `()` | Template text manager init. |
| `OnChallengeQuery` | both | `(challenge)` | Challenge mode query. |
| `OnOverrideSearchManager` | client | `(manager)` | Override search system. |
| `OnWarUpdate` | both | `(state)` | War system tick. |
| `OnCoopServerMessage` | client | `(msg)` | Listed earlier; mentioned here for index completeness. |
| `OnSpawnVehicleStart` | server | `(vehicle)` | Listed in vehicles section. |
| `SetDragItem` (custom) | client | `(item)` | Inventory drag tracker. |

## Custom events declared via `LuaEventManager.AddEvent`

These are explicitly registered in PZ source rather than defined as core events. Mod authors can do the same — `LuaEventManager.AddEvent("MyEvent")` then `Events.MyEvent.Add(fn)` and `Events.MyEvent.trigger(...)`.

- `OnSteamFriendStatusChanged`
- `OnSteamWorkshopItemCreated` / `Not...`
- `OnSteamWorkshopItemUpdated` / `Not...`
- `OnSteamRefreshInternetServers`
- `OnSteamRulesRefreshComplete`
- `OnSteamServerFailedToRespond2`
- `OnSteamServerResponded` / `Responded2`
- `OnDesignationZoneUpdatedNetwork`
- `OnSwitchVehicleSeat`, `OnUseVehicle`, `OnVehicleHorn`
- ~~`OnExitVehicle`~~ — **Removed in B42.18.** Use `EveryOneMinute` polling with a `lastVehicle` local.
- `onToggleSearchMode`, `onEnableSearchMode`, `onDisableSearchMode` (note lowercase `o`)
