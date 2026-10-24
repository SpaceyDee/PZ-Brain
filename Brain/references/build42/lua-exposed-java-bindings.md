# PZ Build 42 — Java classes & globals exposed to Lua

Catalog of Java classes/functions exposed to Lua by `zombie.Lua.LuaManager` in B42.15.

**How the binding works (binding source: `zombie/Lua/LuaManager$Exposer.exposeAll()`):**

1. `Exposer.exposeAll()` calls `setExposed(class)` ~988 times — adds each Class to a HashSet.
2. After the chain, it iterates the HashSet and calls `LuaJavaClassExposer.exposeLikeJavaRecursively(class, env)` on every entry. This installs the class **at its simple name** in the Lua global environment (e.g. `zombie.iso.IsoWorld` → `IsoWorld` global). Public static methods become callable as `IsoWorld.parseDistributions()` and instance methods are reachable through any returned instance.
3. Finally `Exposer.exposeGlobalFunctions(new LuaManager$GlobalObject())` exposes every public static (and a few instance) methods of `LuaManager$GlobalObject` as **bare Lua functions** (e.g. `getPlayer()`, `getCell()`, `triggerEvent()`).
4. `LuaManager.exposeKeyboardKeys(env)` and `LuaManager.exposeMouseButtons(env)` then bolt key/button name constants onto the global env (e.g. `Keyboard.KEY_A`).

Verbatim bytecode evidence (`javap -v zombie/Lua/LuaManager$Exposer.class`, method `exposeAll`):

```
6892: getfield      #12   // Field exposed:Ljava/util/HashSet;
6896: invokevirtual #2042 // java/util/HashSet.iterator
6909: invokeinterface ...next
6924: invokevirtual #2054 // exposeLikeJavaRecursively(Type, KahluaTable)
6931: new           #2058 // class zombie/Lua/LuaManager$GlobalObject
6938: invokevirtual #2061 // exposeGlobalFunctions(Object)
6944: invokestatic  #2065 // exposeKeyboardKeys(KahluaTable)
6950: invokestatic  #2069 // exposeMouseButtons(KahluaTable)
6953: invokestatic  #2072 // exposeLuaCalendar()
```

This means **every class on the `setExposed` list is a Lua global table**, named after its simple class name. The list is 988 entries — this catalog highlights the load-bearing ones for modding.

---

## 1. Globals — bare functions (from `LuaManager$GlobalObject`)

Defined as `public static X foo(...)` in `zombie.Lua.LuaManager$GlobalObject`. All become bare Lua callables.

### World / scene access

| Lua call | Returns (Java FQCN) | Notes |
|---|---|---|
| `getPlayer()` | `zombie.characters.IsoPlayer` | Active local player (player 0). |
| `getSpecificPlayer(int)` | `zombie.characters.IsoPlayer` | Per-split-screen index. |
| `getPlayerFromUsername(string)` | `zombie.characters.IsoPlayer` | MP-only. |
| `getPlayerByOnlineID(int)` | `zombie.characters.IsoPlayer` | MP-only. |
| `getNumActivePlayers()` / `getMaxActivePlayers()` | int | |
| `getOnlinePlayers()` | `ArrayList<IsoPlayer>` | MP. |
| `getConnectedPlayers()` | `ArrayList<IsoPlayer>` | MP. |
| `getCell()` | `zombie.iso.IsoCell` | The active loaded cell. |
| `getWorld()` | `zombie.iso.IsoWorld` | Same singleton as `IsoWorld.instance`. |
| `getSquare(double, double, double)` | `zombie.iso.IsoGridSquare` | x/y/z square lookup. |
| `getGameTime()` | `zombie.GameTime` | |
| `getClimateManager()` / `getClimateMoon()` | `zombie.iso.weather.ClimateManager` / `ClimateMoon` | |
| `getWorldMarkers()` / `getIsoMarkers()` | `zombie.iso.WorldMarkers` / `IsoMarkers` | |
| `getErosion()` | `zombie.erosion.ErosionMain` | |
| `getPuddlesManager()` | `zombie.iso.IsoPuddles` | |
| `getSearchMode()` | `zombie.iso.SearchMode` | |
| `getZone(x,y,z)` / `getZones(x,y,z)` / `getVehicleZoneAt(x,y,z)` | `zombie.iso.zones.Zone[...]` | |

Vanilla call sites: `IsoFireManager.StartFire(getCell(), sq, ...)` — `media/lua/server/ClientCommands.lua:14`; `getClimateManager():getThunderStorm()` — `ClientCommands.lua` line `18`.

**ClimateManager methods (partial — B42.18 verified):**
```lua
-- Always guard both the global and the method (may be nil server-side)
local clim = getClimateManager and getClimateManager()
if clim then
    local rain = clim:getRainIntensity()    -- float 0.0–1.0; 0 = no rain
    local storm = clim:getThunderStorm()    -- bool-ish; true during a thunderstorm
end
```

### Core managers / singletons

| Lua call | Returns |
|---|---|
| `getCore()` | `zombie.core.Core` |
| `getGameClient()` | `zombie.network.GameClient` |
| `getScriptManager()` | `zombie.scripting.ScriptManager` |
| `getSandboxOptions()` | `zombie.SandboxOptions` |
| `getServerOptions()` | `zombie.network.ServerOptions` |
| `getServerSettingsManager()` | `zombie.network.ServerSettingsManager` |
| `getPerformance()` | `zombie.core.PerformanceSettings` |
| `getDebugOptions()` | `zombie.debug.DebugOptions` |
| `getRenderer()` | `zombie.core.SpriteRenderer` |
| `getTextManager()` | `zombie.ui.TextManager` |
| `getSoundManager()` | `zombie.BaseSoundManager` |
| `getBaseSoundBank()` / `getFMODSoundBank()` | `zombie.audio.BaseSoundBank` |
| `getAmbientStreamManager()` | `zombie.BaseAmbientStreamManager` |
| `getWorldSoundManager()` | `zombie.WorldSoundManager` |
| `getZomboidRadio()` | `zombie.radio.ZomboidRadio` |
| `getRadioAPI()` | `zombie.radio.RadioAPI` |
| `getSLSoundManager()` | `zombie.radio.StorySounds.SLSoundManager` |
| `getCombatConfig()` | `zombie.combat.CombatConfig` |

### Events, hooks, lua control

| Lua call | Purpose |
|---|---|
| `triggerEvent(name, a, b, c, d)` | Dispatch a registered LuaEvent (1–4 args overloads). |
| `callLua(name, arg)` / `callLuaReturn(name, args)` / `callLuaBool(name, arg)` | Invoke a Lua function from Java context. |
| `reloadLuaFile(path)` / `reloadServerLuaFile(path)` | Hot-reload. |
| `require(modulePath)` | The PZ `require` — module loader. Vanilla site: every file. |
| `getLuaStackTrace()` | `ArrayList<String>`. |
| `debugLuaTable(t)`, `displayLUATable(t)` | Diagnostic dump. |
| `isClient()` / `isServer()` / `isMultiplayer()` / `isCoopHost()` | Network role. |
| `isIngameState()` / `isGamePaused()` / `getGameSpeed()` / `setGameSpeed(i)` | Loop state. |
| `isDebugEnabled()` / `getDebug()` | Debug build / `-debug` arg. |

### Item / inventory utilities

| Lua call | Returns |
|---|---|
| `getItem(fullType)` | `zombie.scripting.objects.Item` |
| `instanceItem(item)` / `instanceItem(fullType)` / `instanceItem(fullType, condition)` | `zombie.inventory.InventoryItem` |
| `getAllItems()` | `ArrayList<Item>` |
| `getAllRecipes()` | `ArrayList<Recipe>` |
| `getEvolvedRecipes()` | `Stack<EvolvedRecipe>` |
| `getItemNameFromFullType`, `getItemDisplayName`, `getItemTex(fullType)` | misc lookups |
| `createNewScriptItem(...)`, `cloneItemType(...)` | Runtime script item creation. |
| `hasItemTag(fullType, ItemTag)` | bool |

### Server / MP send-* helpers

A large family: `sendClientCommand(module, command, KahluaTable)`, `sendServerCommand(...)`, `sendItemsInContainer`, `sendVisual`, `sendDamage`, `sendCorpse`, `sendFactionInvite`, `sendSafehouseClaim/Invite/Release`, `sendHitPlayer`, `sendHitVehicle`, `sendSyncPlayerFields`, ~80 in total. Reference signatures in `_pz_install/_jar_extract/_globalobject.txt` lines 79–600.

### Spawning / debug

| Lua call | Notes |
|---|---|
| `createZombie(x,y,z, SurvivorDesc, age, IsoDirections)` | Direct spawn. |
| `createHordeFromTo(x1,y1,x2,y2,count)` / `createHordeInAreaTo(...)` / `spawnHorde(...)` | Hordes. |
| `addZombiesInOutfit(...)` (6 overloads) | Outfit-tagged spawns. |
| `addAnimal(cell, x,y,z, type, AnimalBreed, baby?)` | Animal spawn. |
| `addVehicle(scriptName, x, y, z)` / `addVehicleDebug(...)` | Vehicle spawn. |
| `addPhysicsObject()`, `addCarCrash()`, `assaultPlayer()` | Debug. |

### Misc / random / sound / fs

| Lua call | Returns / Notes |
|---|---|
| `ZombRand(max)` / `ZombRand(min,max)` / `ZombRandFloat(min,max)` / `ZombRandBetween(min,max)` | PZ-seeded RNG used everywhere. |
| `getTexture(path)` / `tryGetTexture(path)` / `getVideo(path,w,h)` | `Texture` / `VideoTexture` |
| `getSprite(name)` / `getSpriteManager(...)` | `IsoSprite` |
| `getText(key, ...args)` / `getTextOrNull(...)` / `getItemText` / `getRadioText` | Translation. |
| `getFileReader(path, modFlag)` / `getFileWriter(path, append, create)` / `getModFileReader(modId, path, ...)` / `getModFileWriter(...)` | Lua-safe IO into `%Zomboid%` and mod dirs. Latest B42 patch notes say invalid writer initialization returns nil/null; guard the writer before `:write()` and `:close()`. |
| `listFilesInZomboidLuaDirectory(rel)` / `listFilesInModDirectory(modId, rel)` | dir listing. |
| `fileExists(path)` / `serverFileExists(path)` / `cacheFileExists(path)` | predicates |
| `getMods()`, `getActivatedMods()`, `getModInfo(id)`, `getModInfoByID(id)`, `isModActive(Mod)`, `toggleModActive(Mod, bool)`, `getMapFoldersForMod(id)` | Mod metadata. |
| `getCurrentUserSteamID()`, `getCurrentUserProfileName()`, `getOnlineUsername()`, `getClientUsername()` | Identity. |
| `isKeyDown(int|name)`, `isKeyPressed(int|name)`, `wasKeyDown(int|name)` | Input polling. |
| `getMouseX()`, `getMouseY()`, `isMouseButtonDown(i)`, `isMouseButtonPressed(i)` | Mouse. |
| `isJoypadConnected(i)`, `isJoypadDown(i)`, joystick axis getters | Controllers. |
| `instof(obj, classSimpleName)` / `isType(obj, classSimpleName)` | Type test against simple name. |
| `getClassSimpleName(obj)` | Reflection. |
| `isSystemWindows()` / `isSystemLinux()` / `isSystemMacOS()` | OS branch. |
| `getTimestamp()` / `getTimestampMs()` / `getGametimeTimestamp()` / `getTimeInMillis()` | Time. |

Complete signature list: see `_pz_install/_jar_extract/_globalobject.txt` (full `javap -p` of `LuaManager$GlobalObject`, 781 lines, ~700 public statics).

---

## 2. Class statics callable as Lua globals (high-value entries from `setExposed`)

Each is registered at its **simple name**. Use `ClassName.staticMethod(...)` from Lua.

### State / screen classes

| Lua name | Java FQCN | Notes |
|---|---|---|
| `LoadingQueueState` | `zombie.gameStates.LoadingQueueState` | Boot queue. |
| `MainScreenState` | `zombie.gameStates.MainScreenState` | Main menu state (distinct from `MainScreen` which is a Lua class). |
| `AnimationViewerState` | `zombie.gameStates.AnimationViewerState` | Dev tools. |
| `AttachmentEditorState` | `zombie.gameStates.AttachmentEditorState` | |
| `SeamEditorState` | `zombie.gameStates.SeamEditorState` | |
| `SpriteModelEditorState` | `zombie.gameStates.SpriteModelEditorState` | |
| `TileGeometryState` | `zombie.gameStates.TileGeometryState` | |
| `EditVehicleState` | `zombie.vehicles.EditVehicleState` | |
| `ChooseGameInfo` | `zombie.gameStates.ChooseGameInfo` | + inner `ChooseGameInfo.Mod`. |

### World / iso / weather

| Lua name | Java FQCN | Common static use |
|---|---|---|
| `IsoWorld` | `zombie.iso.IsoWorld` | `IsoWorld.parseDistributions()` — `media/lua/.../ISServerSandboxOptionsUI.lua:768` |
| `IsoCell` | `zombie.iso.IsoCell` | accessed via `getCell()` |
| `IsoGridSquare` | `zombie.iso.IsoGridSquare` | |
| `IsoFireManager` | `zombie.iso.objects.IsoFireManager` | `IsoFireManager.StartFire(cell, sq, ...)` — `ClientCommands.lua:14` |
| `IsoPuddles` | `zombie.iso.IsoPuddles` | + inner `PuddlesFloat` |
| `IsoMarkers` / `WorldMarkers` | `zombie.iso.IsoMarkers` / `WorldMarkers` | + inner `GridSquareMarker`, `DirectionArrow`, `PlayerHomingPoint` |
| `LosUtil` | `zombie.iso.LosUtil` | Line-of-sight tests. |
| `SearchMode` | `zombie.iso.SearchMode` | + inner `PlayerSearchMode`, `SearchModeFloat` |
| `MapKnowledge` | `zombie.ai.MapKnowledge` | |
| `ClimateManager` | `zombie.iso.weather.ClimateManager` | Surfaces `getThunderStorm()`, climate vars. |
| `Basements` / `BasementsV1` | `zombie.basements.Basements` | |
| `ErosionMain`, `ErosionConfig`, `ErosionConfig.Debug/Season/Seeds/Time`, `ErosionSeason` | `zombie.erosion.*` | Erosion tuning. |

### Scripts / recipes / items

| Lua name | Java FQCN | Notes |
|---|---|---|
| `ScriptManager` | `zombie.scripting.ScriptManager` | Script lookup. |
| `RecipeManager` | `zombie.inventory.RecipeManager` | `RecipeManager.PerformMakeItem(recipe, item, char, containers)` — `ISMoveableSpriteProps.lua:3419` |
| `CraftRecipeManager` | `zombie.entity.components.crafting.recipe.CraftRecipeManager` | B42 entity-component recipes. |
| `RecipeMonitor` | `zombie.inventory.recipemanager.RecipeMonitor` | |
| `ItemPickerJava` | `zombie.inventory.ItemPickerJava` | Loot roller. |

### Server, network, options

| Lua name | Java FQCN |
|---|---|
| `SandboxOptions` | `zombie.SandboxOptions` (+ inner BooleanSandboxOption, DoubleSandboxOption, StringSandboxOption, IntegerSandboxOption, EnumSandboxOption) |
| `ServerOptions` | `zombie.network.ServerOptions` (+ inner Boolean/Double/Integer/String/Text/EnumServerOption) |
| `NetworkAIParams` | `zombie.network.NetworkAIParams` |

### Characters / animals / progression

| Lua name | Java FQCN |
|---|---|
| `IsoGameCharacter` | `zombie.characters.IsoGameCharacter` (+ inner `Location`, `PerkInfo`, `XP`) |
| `IsoDummyCameraCharacter` | `zombie.characters.IsoDummyCameraCharacter` |
| `Stats`, `CharacterStat`, `SurvivorDesc`, `SurvivorFactory` (+ `SurvivorType`) | `zombie.characters.*` |
| `PerkFactory` (+ `PerkFactory.Perk`, `PerkFactory.Perks`) | `zombie.characters.skills.PerkFactory` |
| `Moodle`, `Moodles` | `zombie.characters.Moodles.*` |
| `BodyPart`, `BodyPartType`, `BodyDamage`, `Thermoregulator`, `Metabolics`, `Fitness` | `zombie.characters.BodyDamage.*` |
| `ObservationFactory` (+ `Observation`) | `zombie.characters.traits.ObservationFactory` |
| `CharacterTraitDefinition`, `CharacterProfessionDefinition` | `zombie.characters.traits/professions.*` |
| `LuaTimedAction`, `LuaTimedActionNew` | `zombie.characters.CharacterTimedActions.*` — base class for `ISBaseTimedAction` siblings. |
| `Faction` | `zombie.characters.Faction` |
| `IsoAnimal`, `AnimalBreed`, `AnimalGene`, `AnimalAllele`, `AnimalGenomeDefinitions`, `AnimalDefinitions`, `AnimalPartsDefinitions`, `BaseAnimalBehavior`, `AnimalData` | `zombie.characters.animals.*` |

### Events, lua infra

| Lua name | Java FQCN | Notes |
|---|---|---|
| `LuaEventManager` | `zombie.Lua.LuaEventManager` | `LuaEventManager.AddEvent("OnFoo")` — `Vehicles.lua:1534`. Plus `Events` table separately registered. |
| `LuaHookManager` | `zombie.Lua.LuaHookManager` | |

### Misc surprise highlights

| Lua name | Java FQCN | Why interesting |
|---|---|---|
| `ItemPickerJava` | `zombie.inventory.ItemPickerJava` | Full loot-spawn engine reachable from Lua. |
| `VirtualZombieManager` | `zombie.VirtualZombieManager` | Spawn budget / virtual-z management. |
| `BoxedStaticValues` | `zombie.core.BoxedStaticValues` | Boxed-int/long pool — handy for `addClientCommand` payloads. |
| `PZCalendar` | `zombie.util.PZCalendar` | The non-`java.util.Calendar` time class. |
| `LosUtil` | `zombie.iso.LosUtil` | Static LOS predicate. |
| `GameKeyboard` / `Mouse` | `zombie.input.GameKeyboard`, `zombie.input.Mouse` | Lower-level input than the `isKeyDown` global. |
| `ColorInfo` | `zombie.core.textures.ColorInfo` | Color object used by many UI APIs. |
| `Texture` | `zombie.core.textures.Texture` | `Texture.getSharedTexture(name)`; brain already knew this. |
| `FMODAudio`, `FMODSoundBank`, `FMODSoundEmitter`, `FMODDebugEventPlayer`, `EmitterType` | `fmod.fmod.*` | Direct FMOD bindings. |
| `Vector2f`, `Vector3f`, `Position3D` | `org.joml.*`, `zombie.characters.Position3D` | Math helpers. |
| `KahluaUtil` | `se.krka.kahlua.vm.KahluaUtil` | VM helpers (`KahluaUtil.luaequals(...)` etc). |

### Vehicles

`BaseVehicle`, `VehicleScript`, `VehicleZone`, `EditVehicleState`. The `LuaManager$GlobalObject` getters are `addVehicle`, `addVehicleDebug`, `getVehicleById`, `removeVehicle`, `removeAllVehicles`, `addAllVehicles`, `addAllBurntVehicles`, `addAllSmashedVehicles`.

### AI states (~40 classes)

Every AI state in `zombie.ai.states.*` is exposed: `AttackState`, `IdleState`, `LungeState`, `PathFindState`, `PlayerAimState`, `PlayerEmoteState`, `PlayerExtState`, `PlayerFallingState`, `PlayerGetUpState`, `PlayerHitReactionState`, `PlayerKnockedDown`, `PlayerOnGroundState`, `PlayerSitOnFurnitureState`, `PlayerSitOnGroundState`, `PlayerStrafeState`, `SmashWindowState`, `StaggerBackState`, `SwipeStatePlayer`, `ThumpState`, `WalkTowardState`, the `Zombie*State` family, the `Climb*` family, `FishingState`, `FitnessState`, plus `player.PlayerMovementState`, `PlayerMilkAnimalState`, `PlayerPetAnimalState`, `PlayerShearAnimalState`. Each is callable as `LungeState.instance:doAction(...)` style.

### Full list

For exhaustive enumeration, see the bytecode dump at `_pz_install/_jar_extract/_exp_v.txt` (or the extracted `_setExposed_classes.txt` — 988 entries). Search for `setExposed` near method `exposeAll` in the verbose disassembly.

---

## 3. Keyboard / mouse constants

Installed by `LuaManager.exposeKeyboardKeys(env)` and `LuaManager.exposeMouseButtons(env)`:

- `Keyboard.KEY_A` … `Keyboard.KEY_Z`, `KEY_0` … `KEY_9`, `KEY_LSHIFT`, `KEY_SPACE`, `KEY_TAB`, etc. (mirrors `org.lwjglx.input.Keyboard` `KEY_*` static ints).
- `Mouse.LEFT_BUTTON`, `Mouse.RIGHT_BUTTON`, `Mouse.MIDDLE_BUTTON`.

---

## 4. Calling-convention quirks (B42.15)

- **Class names are simple names**, so two Java classes with the same simple name collide. PZ avoids this in vanilla but mods that ship Java patches must check.
- Inner classes get their own globals named `Outer$Inner` (the `$` is preserved in the Lua key). Examples: `ServerOptions$BooleanServerOption`, `SandboxOptions$EnumSandboxOption`, `PerkFactory$Perks`. Reach via `_G["ServerOptions$BooleanServerOption"]`.
- The big async **send*** family on `LuaManager$GlobalObject` takes `IsoPlayer` / `InventoryItem` / `KahluaTable` payloads; never pass a plain Lua table where a `KahluaTable` is required (the converter expects the wrapper).
- `triggerEvent(name, ...)` only has 1–4 arg overloads in Java. Beyond 4 args, define a custom dispatcher table or pack into a single table.
- Prefer explicit `if x ~= nil then` checks. `pcall` is functional in verified B42.18 dedicated probes; avoiding blanket wrappers is convention. `safeCall` is separately unverified.

---

## 5. Open unknowns

- The `Events` global (`Events.OnPlayerUpdate.Add(fn)`) is *populated by Lua* in `media/lua/shared/Events.lua`, but the registry machinery routes through `LuaEventManager` Java methods. Treat both as part of the same API.
- `BaseVehicle.scripts`-style static helpers — many statics exist on exposed classes that are not used by vanilla Lua but are reachable. Discovery is by reading `javap -p` on each exposed class.
- `ConnectToServer` and `MainScreen` (in the original prior list) are **Lua-defined classes**, not Java bindings. `MainScreenState` (Java) and the `media/lua/client/OptionScreens/MainScreen.lua` ISPanelJoypad subclass are different things. Calling site: `MainScreen = ISPanelJoypad:derive("MainScreen")` — `media/lua/client/OptionScreens/MainScreen.lua:9`.

---

## 6. Reproducing this catalog

```
# 1. Extract the jar
python -c "import zipfile; zipfile.ZipFile(r'PATH\projectzomboid.jar').extractall(r'OUT')"

# 2. Dump the exposer
cd OUT
javap -v 'zombie/Lua/LuaManager$Exposer.class' > exposer.txt
javap -p 'zombie/Lua/LuaManager$GlobalObject.class' > globals.txt

# 3. Extract setExposed args (PowerShell)
$body = (Get-Content exposer.txt -Raw)
$body = $body.Substring($body.IndexOf("public void exposeAll();"),
                        $body.IndexOf("public void setExposed", $body.IndexOf("exposeAll();")) - $body.IndexOf("exposeAll();"))
[regex]::Matches($body, 'ldc(?:_w)?\s+#\d+\s+//\s+class\s+([\w/$]+)') |
  ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
```
