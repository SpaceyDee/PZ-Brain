# CSR Events Registry

**Version:** v1.8.18 | **Updated:** 2026-04-30

Every `Events.AddListener` / `Events.*.Add()` call in the CSR codebase, with the handler function, source file, and purpose.

---

## Always-On Events (register at file load)

These register unconditionally — handlers may early-exit based on feature flags.

| Event | Handler | File | Purpose |
|-------|---------|------|---------|
| `OnPlayerAttackFinished` | `triggerLeftHandAttack` | `client/CSR_DualWieldHooks.lua` | Queues CSR_LeftHandAttackAction if DW enabled and valid left attack |
| `OnWeaponHitCharacter` | `onUnarmedRightHandAttack` | `client/CSR_DualWieldHooks.lua` | CSR unarmed-vs-zombie behavior when DW enabled |
| `OnPlayerUpdate` | `changeUnarmedAnimation` | `client/CSR_DualWieldHooks.lua` | DW unarmed anim state machine + primary-mirror promotion |
| `OnKeyPressed` | `CSR_DualWieldHooks.onQuickEquipKey` | `client/CSR_DualWieldHooks.lua` | NUMPAD7 quick-equip swap for DW |
| `OnPlayerDeath` | `onPlayerDeath` | `client/CSR_Claims/CSR_ClaimClient.lua` | Mark respawn pending on death |
| `OnCreatePlayer` | `onCreatePlayer` | `client/CSR_Claims/CSR_ClaimClient.lua` | Request respawn info + retry loop on new character |
| `OnServerCommand` | `onServerCommand` | `client/CSR_Claims/CSR_ClaimClient.lua` | Handle all CSR claim broadcasts (Added/Removed/Updated/Bundle/Result/Respawn) |
| `EveryOneMinute` | `CSR_GroundCleanup.scan` | `server/CSR_GroundCleanup.lua` | Age-based ground item cleanup scan |
| `EveryOneMinute` | `checkItemWipeSchedule` | `server/CSR_GroundCleanup.lua` | Check and trigger forced item wipe scheduler |
| `OnPlayerDropItem` | `onPlayerDropItem` | `server/CSR_GroundCleanup.lua` | Stamp drop timestamp on item modData |
| `OnServerStarted` | `onServerStarted` | `server/CSR_Claims/CSR_ClaimServer.lua` | Run vanilla SafeHouse migration (one-shot) |
| `OnServerStarted` | `install` | `server/CSR_Claims/CSR_VehicleClaimServerEnforcer.lua` | Install sweep OnTick + player connect/disconnect events |
| `OnGameStart` | `install` | `server/CSR_Claims/CSR_VehicleClaimServerEnforcer.lua` | Same as above (self-host fires both) |
| `OnTick` | `CSR_VehicleClaimServerEnforcer.sweep` | `server/CSR_Claims/CSR_VehicleClaimServerEnforcer.lua` | 1Hz vehicle claim enforcement sweep |
| `OnConnected` / `OnPlayerConnect` | `onPlayerConnected` | `server/CSR_Claims/CSR_VehicleClaimServerEnforcer.lua` | Record player login timestamp for grace period |
| `OnPlayerDisconnect` | `onPlayerDisconnect` | `server/CSR_Claims/CSR_VehicleClaimServerEnforcer.lua` | Clear all per-player strike/state data |

---

## OnGameStart-Deferred Events

These register inside `Events.OnGameStart.Add()` — only fire after the game is fully loaded.

### Claims

| Event | Handler | File | Purpose |
|-------|---------|------|---------|
| `OnGameStart` | `onGameStart` | `client/CSR_Claims/CSR_ClaimClient.lua` | Request initial claims bundle (deferred 1 tick) |
| `OnServerCommand` | `onServerCommand` | `client/CSR_ServerResponses.lua` | Central client response dispatcher |

### Off-Hand Persist

| Event | Handler | File | Purpose |
|-------|---------|------|---------|
| `OnGameStart` | `install` | `shared/CSR_OffhandPersist.lua` | Wrap ISEquipWeaponAction.perform + register OnPlayerAttackFinished |
| `OnServerStarted` | `install` | `shared/CSR_OffhandPersist.lua` | Same for SP/self-host |
| `OnPlayerAttackFinished` | `attackFinishedRestore` | `shared/CSR_OffhandPersist.lua` | Re-anchor off-hand ledger after attack |

### HUD Overlay

| Event | Handler | File | Purpose |
|-------|---------|------|---------|
| `OnGameStart` | `attach` | `client/CSR_OffhandHudOverlay.lua` | Wrap ISEquippedItem.render (also tries at load) |

### Feature-Gated (Phoenix II) — Only registered when flag is ON

| Event | Handler | File | Feature Flag |
|-------|---------|------|-------------|
| `OnPlayerUpdate` | cone vision handler | `client/CSR_ConeVisionOutline.lua` | EnableConeVisionOutline |
| `OnPlayerDeath` | cone vision cleanup | `client/CSR_ConeVisionOutline.lua` | EnableConeVisionOutline |
| `OnTick` | firework tick | `client/CSR_FireworkSystem.lua` | EnableFirework |
| `OnPostUIDraw` | firework draw | `client/CSR_FireworkSystem.lua` | EnableFirework |
| `OnFillWorldObjectContextMenu` | firework context | `client/CSR_FireworkSystem.lua` | EnableFirework |
| `OnFillInventoryObjectContextMenu` | firework inventory | `client/CSR_FireworkSystem.lua` | EnableFirework |
| `OnTick` (×4) | generator info ticks | `client/CSR_GeneratorInfo.lua` | EnableGeneratorInfo |
| `LoadGridsquare` | generator grid | `client/CSR_GeneratorInfo.lua` | EnableGeneratorInfo |
| `OnObjectAboutToBeRemoved` | generator remove | `client/CSR_GeneratorInfo.lua` | EnableGeneratorInfo |
| `OnFillWorldObjectContextMenu` | generator context | `client/CSR_GeneratorInfo.lua` | EnableGeneratorInfo |
| `OnKeyPressed` | loot filter key | `client/CSR_LootFilter.lua` | EnableLootFilter |
| `OnCreatePlayer` | loot filter init | `client/CSR_LootFilter.lua` | EnableLootFilter |
| `OnRefreshInventoryWindowContainers` | loot filter refresh | `client/CSR_LootFilter.lua` | EnableLootFilter |
| `OnTick` | seatbelt health watch | `client/CSR_SeatbeltSystem.lua` | EnableSeatbeltProtection |
| `OnPlayerUpdate` | seatbelt update | `client/CSR_SeatbeltSystem.lua` | EnableSeatbeltProtection |
| (7 more seatbelt events) | various | `client/CSR_SeatbeltSystem.lua` | EnableSeatbeltProtection |
| `OnTick` | map tracker tick | `client/CSR_PlayerMapTracker.lua` | EnablePlayerMapTracking |
| `OnGameStart` | map tracker init | `client/CSR_PlayerMapTracker.lua` | EnablePlayerMapTracking |

---

## Additional Always-On Events (selected)

| Event | Handler | File | Purpose |
|-------|---------|------|---------|
| `OnObjectAdded` | item tag handler | `shared/CSR_Utils.lua` | Tag newly added world items for ground cleanup |
| `OnGameStart` | hotbar persistence load | `client/Hotbar/CSR_HotbarPersistence.lua` | Restore saved hotbar slot assignments |
| `OnGameStart` | back2slot init | `client/Hotbar/CSR_Back2Slot.lua` | Patch ISHotbar methods |
| `OnGameStart` | weapon hud init | `client/Hotbar/CSR_WeaponHudOverlay.lua` | Patch ISHotbar:update |
| `OnGameStart` | safehouse router init | `client/CSR_Claims/CSR_VanillaSafehouseRouter.lua` | Patch ISSafehouseUI.new |
| `OnGameStart` | safehouse outline init | `client/CSR_SafehouseOutline.lua` | Patch ISSafehouseUI methods |
| `OnGameStart` | items list fix | `client/CSR_ItemsListViewerFix.lua` | Patch ISItemsListTable:initList |
| `OnGameStart` | rally points init | `client/CSR_RallyPoints.lua` | Patch ISWorldMap.onRightMouseUp |
| `OnGameStart` | player map init | `client/CSR_PlayerMapTracker.lua` | Patch ISWorldMap.render + ISMiniMapOuter.render |
| `OnGameStart` | offhand overlay init | `client/CSR_OffhandHudOverlay.lua` | Patch ISEquippedItem.render |

---

## Notes

- Events registered with `Events.Foo.Add(fn)` in CSR are never removed during gameplay (no `Events.Foo.Remove(fn)` calls in normal flow)
- Exception: inline one-shot handlers (e.g., `fired = true; Events.OnTick.Remove(self)`) used for deferred initialization
- The feature-gated systems (Phoenix II, v1.8.7) remain permanently attached once registered — they do not re-check the flag every tick (they early-exit via local flag checks instead)
- `Events.OnConnected` and `Events.OnPlayerConnect` are both guarded because different PZ builds use different names for the same event
