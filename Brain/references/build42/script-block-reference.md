# Script Block Reference (B42)

Source: pz-scripts-data scriptBlocks.json (ingested 2026-05-22)
Online docs: https://pz-wiki-modding.github.io/PZ-API-Docs/

For the machine-readable schema, see `references/build42/pz-scripts-data/scriptBlocks.json`.

---

## `item` block

Declared inside `module`. Creates items — weapons, food, clothing, containers, etc.

```
module Base {
    item MyItem {
        ItemType = base:normal,
        ...
    }
}
```

**ItemType** — determines which parameters are valid. Must use `base:` namespace:

| Value | Description |
|---|---|
| `base:normal` | Generic item |
| `base:weapon` | Melee or ranged weapon (HandWeapon) |
| `base:weaponpart` | Weapon attachment/part |
| `base:food` | Edible item |
| `base:drainable` | Item with a fill level (fuel, water, medication) |
| `base:clothing` | Wearable clothing/armour |
| `base:container` | Item that holds other items (bag, box) |
| `base:literature` | Book, magazine, recipe book |
| `base:map` | Map item |
| `base:radio` | Radio/walkie-talkie |
| `base:key` | Key item |
| `base:alarmclock` | Standalone alarm clock |
| `base:alarmclockclothing` | Wrist-worn alarm |
| `base:moveable` | World-placeable moveable |
| `base:animal` | Animal item |

**Naming:** Item display name goes in the `ItemName` translation file — key is `module.id` (e.g., `Base.MyItem`).

**Soft override:** An item block with the same ID as an existing item soft-overrides it — only the stated parameters change, all others are preserved.

**Child component blocks:**
- `component FluidContainer` — fluid container config (capacity, InitialPercent, HiddenAmount, etc.)
- `component ContextMenuConfig` + `contextEntry` children — custom context menu entries
- `component Durability` — extended durability config

### Universal item parameters (all types)

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `ItemType` | enum (namespaced) | — | **Required.** Use `base:` prefix (e.g. `base:normal`). |
| `DisplayCategory` | string | — | Category shown in inventory; controls sort order |
| `Icon` | string | — | Texture path relative to `media/textures/`, no extension. Also supports `IconRotten`, `IconCooked`. |
| `Weight` | float | `1.0` | Item weight/encumbrance |
| `WorldStaticModel` | string | — | Model shown when dropped on ground |
| `BreakSound` | string (sound ref) | — | Sound on break |
| `PlaceOneSound` | string | — | Sound when placing item |
| `DropSound` | string | — | Sound when dropping |
| `EquipSound` | string (sound ref) | — | |
| `UnequipSound` | string | — | |
| `ColorRed` | integer | `255` | Tint; clothing, food, literature, normal, weapon |
| `ColorGreen` | integer | `255` | |
| `ColorBlue` | integer | `255` | |
| `Tags` | array (`;` sep) | — | ItemTag list; use B42 tag API — `item:hasTag(string)` broken |
| `OnCreate` | Lua function ref | — | Global Lua called on item create |
| `ConditionMax` | integer | `10` | Durability pool |
| `ConditionLowerChanceOneIn` | integer | `10` | Durability loss rate — higher = more durable |
| `ChanceToSpawnDamaged` | — | — | drainable, normal |

### Weapon-specific parameters (`base:weapon`)

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `MinDamage` | float | — | Min hit damage |
| `MaxDamage` | float | `1.5` | Max hit damage |
| `DoorDamage` | integer | `1` | min 1; damage to doors/barricades |
| `DoorHitSound` | string | `BaseballBatHit` | |
| `BaseSpeed` | float | `1.0` | Swing/use speed |
| `KnockdownMod` | float | `1.0` | Knockdown chance modifier |
| `CriticalChance` | float | `20.0` | Base crit %; requires `base:weapon` |
| `CritDmgMultiplier` | float | `2.0` | Damage ×N on crit |
| `MaxHitcount` | integer | — | Max targets per swing/shot |
| `TwoHandWeapon` | boolean | — | Marks as two-handed (use `Idle_Weapon2`/`Run_Weapon2`) |
| `AttachmentType` | — | — | Hotbar slot this item fits into; valid values: `Shovel`, `BigWeapon`, `BigBlade`, `Rifle` |
| `Categories` | — | — | Skill category; use `base:` namespace e.g. `Categories = base:blunt,` |
| `UseEndurance` | boolean | `true` | Consumes stamina on swing |
| `EnduranceMod` | float | `1.0` | Stamina cost multiplier |
| `SwingAnim` | string | — | Melee swing animation name |
| `IdleAnim` | string | `Idle_Weapon` | `Idle_Weapon` (1H) or `Idle_Weapon2` (2H — requires TwoHandWeapon=TRUE) |
| `RunAnim` | string | `Run` | `Run_Weapon` (1H) or `Run_Weapon2` (2H) |
| `PushBackMod` | float | `1.0` | Hit-reaction push magnitude |
| `DamageCategory` | — | — | Type of damage (e.g. blunt, blade) |
| `CanBarricade` | — | — | Can be used to barricade |
| `CloseKillMove` | — | — | Assassination move eligible |
| `CanBePlaced` | — | — | Can be placed in world |
| `NoiseRange` / `NoiseDuration` | — | — | Zombie-attracting noise |
| `SoundGain` | float | `1.0` | Weapon sound volume |
| `ModelWeaponPart` | (duplicatable) | — | Additional visual attachment model |

### Firearm-specific (requires `base:weapon` + `IsAimedFirearm = true`)

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `IsAimedFirearm` | boolean | — | Makes item a ranged firearm |
| `AmmoType` | string | — | Registry ammo type (e.g. `base:bullets_9mm`) |
| `AmmoBox` | string (item ref) | — | Ammo box item type |
| `MagazineType` | string (item ref) | — | Magazine item; omit for internal magazine |
| `MaxAmmo` | integer | — | Magazine or internal capacity |
| `WeaponReloadType` | string | — | Anim reload type: `handgun`, `shotgun`, `boltaction`, `revolver`, `doublebarrelshotgun`, etc. |
| `Aimingtime` | integer | — | Aim-settle delay ticks |
| `HitChance` | — | — | Base hit chance |
| `AimingPerkHitChanceModifier` | float | — | Hit chance per aiming level |
| `AimingPerkCritModifier` | integer | — | Crit chance per aiming level |
| `AimingPerkRangeModifier` | float | — | Extra range per aiming level |
| `MaxRange` | — | — | Hard range cutoff |
| `RecoilDelay` | — | — | Delay before next shot |
| `JamGunChance` | float | `1.0` | Base jam probability per trigger pull |
| `CyclicRateMultiplier` | float | `1.0` | Full-auto rate; only in Auto mode |
| `Projectilecount` | integer | `1` | Pellets per shot (shotguns; needs RangeFalloff=true) |
| `PiercingBullets` | boolean | — | AP rounds — needs MaxHitcount >= 2 |
| `ClickSound` | string (sound) | `Stormy9mmClick` | Dry-fire click |
| `ShellFallSound` | string (sound) | — | Ejected casing |
| `FireMode` | — | — | `Single`, `Auto` |

### Clothing-specific (`base:clothing`)

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `BodyLocation` | string | — | Where it's worn (body location ID) |
| `ClothingItem` | string | — | References clothing.xml entry |
| `ClothingItemExtra` | string | — | Secondary equip option item ref; needs `ClothingItemExtraOption` |
| `ClothingItemExtraOption` | string | — | Context menu label for extra option |
| `ClothingExtraSubmenu` | string | — | Submenu label for extra equip option |
| `AttachmentsProvided` | — | — | Hotbar slots this clothing creates for the player |
| `BiteDefense` | — | — | Bite protection |
| `ScratchDefense` | — | — | |
| `BulletDefense` | — | — | |
| `NeckProtectionModifier` | float | `1.0` | |
| `CombatSpeedModifier` | float | `1.0` | |
| `RunSpeedModifier` | float | `1.0` | |
| `BloodLocation` | array (`;`) | — | Body zones that show blood |
| `CanHaveHoles` | boolean | `true` | |
| `Cosmetic` | — | — | Purely cosmetic, no stat effect |
| `CorpseSicknessDefense` | — | — | |
| `DiscomfortModifier` | — | — | |

### Food-specific (`base:food`)

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `Calories` | — | — | |
| `Carbohydrates` | — | — | |
| `Proteins` | — | — | |
| `Lipids` | — | — | |
| `DaysFresh` | integer | `1000000000` | Days before going stale |
| `DaysTotallyRotten` | integer | `1000000000` | Days to full rot |
| `DangerousUncooked` | boolean | — | Causes food poisoning if eaten raw |
| `CannedFood` | — | — | |
| `CantBeFrozen` | — | — | |
| `IsCookable` | boolean | — | |
| `MinutesToCook` | float | `60.0` | Must be < MinutesToBurn |
| `BadCold` | — | — | |
| `BadInMicrowave` | — | — | Causes fire in microwave |
| `EvolvedRecipe` | — | — | Evolved recipe participation list |

### Container-specific (`base:container`)

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `Capacity` | integer | `-1` | Container capacity |
| `MaxCapacity` | integer | — | Max capacity (normal only) |
| `BodyLocation` | — | — | Where it's worn (bags) |
| `AttachmentsProvided` | — | — | Hotbar slots bags add |
| `AttachmentReplacement` | — | — | |
| `CloseSound` / `OpenSound` | — | — | |

### Drainable-specific (`base:drainable`)

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `UseDelta` | float | `0.03125` | Depletion per use step |
| `DisappearOnUse` | boolean | `true` | Item disappears when empty |
| `KeepOnDeplete` | — | — | Keep item when depleted |
| `MakeUpType` | — | — | |
| `AlcoholPower` | — | — | |
| `CantBeConsolided` | — | — | Disables consolide action |

### Literature-specific (`base:literature`)

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `SkillTrained` | string | `""` | Skill book trains this skill |
| `LvlSkillTrained` | integer | `-1` | Skill level taught |
| `NumLevelsTrained` | integer | `1` | Number of levels taught |
| `NumberOfPages` | integer | `-1` | |
| `LearnedRecipes` | array (`;`) | — | craftRecipe IDs taught when read |
| `CanBeWrite` | — | — | Player can write in it |
| `BoredomChange` | — | — | |

---

## `craftRecipe` block

Declared inside `module`. Defines a crafting recipe.

```
module Base {
    craftRecipe MyRecipe {
        time = 200,
        tags = InHandCraft,
        category = Miscellaneous,
        inputs { ... }
        outputs { ... }
    }
}
```

**Recipe display name:** Goes in the `Recipes` translation file — key is just the craftRecipe ID (not `module.id`), e.g., `MyRecipe`.

**Soft override:** craftRecipe supports soft override — can override only some parameters of existing recipes.

### Parameters

| Parameter | Type | Default | Required | Notes |
|---|---|---|---|---|
| `tags` | array (`;`) | — | **YES** | At least one crafting-bench tag. **In-hand / inventory crafts:** `InHandCraft` (player inventory, worn bags, hands). Add `CanBeDoneFromFloor` so nearby floor items and typical nearby world containers participate, matching vanilla `SawLogs`. **Surface crafts:** `AnySurfaceCraft` (Hammertime curtains, workbenches). Do not invent a Lua scan of crates — the engine already gathers those sources when tags are set. Other common tags: `CanBeDoneInDark`, `CanAlwaysBeResearched`. |
| `time` | any | `50` | no | Ticks to craft (not real-time). Default is 50. |
| `timedAction` | string | — | no | References a `timedAction` script block for anim/sound. |
| `category` | string | — | no | Recipe category in crafting menu. No translation support (confirmed 42.15). |
| `xpAward` | string | — | no | XP on craft. Format: `Skill:amount` or `Skill1:n;Skill2:n`. |
| `SkillRequired` | string | — | no | Skill gate. Format: `Skill:level` or `Skill1:n;Skill2:n`. |
| `AllowBatchCraft` | boolean | `true` | no | Show batch-craft slider in UI. |
| `CanWalk` | boolean | `false` | no | Player can walk while crafting. |
| `NeedToBeLearn` | boolean | — | no | Recipe must be learned before it can be used. |
| `AutoLearnAny` | string | — | no | Auto-learn when any listed skill reaches level. Format: `Skill:level;Skill2:level`. |
| `AutoLearnAll` | string | — | no | Auto-learn when all listed skills reach level. |
| `MetaRecipe` | string | — | no | Link two recipes — knowing the meta recipe unlocks this one. |
| `OnCreate` | Lua function | — | no | Global Lua function called when crafting finishes. Signature: `fn(craftRecipeData, character)`. |
| `OnTest` | Lua function | — | no | Global Lua function to test if recipe is available. Returns boolean. Signature: `fn(item, character)`. |
| `OnFailed` | Lua function | — | no | Called when crafting fails. |
| `OnUpdate` | Lua function | — | no | Called each tick during crafting. |
| `OnAddToMenu` | Lua function | — | no | Called when added to crafting menu. |
| `Icon` | string | — | no | Custom icon in `media/textures/`. Reference without path or extension. |
| `Tooltip` | string | — | no | Description shown in crafting menu. |
| `ResearchAny` | — | — | no | |
| `ResearchSkillLevel` | — | — | no | |
| `recipeGroup` | — | — | no | |
| `overlayStyle` | — | — | no | |

### OnCreate / OnTest Lua function signatures

```lua
-- OnCreate: called when crafting finishes
-- craftRecipeData is a Java CraftRecipeData object
function MyMod_OnCreate(craftRecipeData, character)
    -- your logic
end

-- OnTest: return false to hide/disable the recipe for this character
function MyMod_OnTest(item, character)
    -- item = InventoryItem, character = IsoPlayer
    return true  -- or false to block
end
```

Both must be **global** functions (not local). They can be in a global table (e.g. `Recipe.OnCreate.MyRecipe`).

### Child blocks

| Block | Required | Notes |
|---|---|---|
| `inputs` | **YES** | What items/fluids are consumed |
| `outputs` | no | What items are produced |
| `itemMapper <ID>` | no | Maps specific input item to specific output item |

---

## `inputs` block

Declares what items/fluids are consumed (or kept) by the recipe.

```
inputs
{
    item <quantity> [<ModuleId.ItemId>] [flags[...]] [mode:keep] [tags[...]] [mappers[...]],
    item <quantity> tags[<tag>] mode:keep flags[MayDegradeLight;Prop1],
    -fluid <amount> [<fluid_registry_id>],
    item 1 [*],   -- wildcard: any item
}
```

**Item line format:**
- `item <qty> [ModuleId.ItemId]` — specific item by full type
- `item <qty> tags[tag1;tag2]` — any item carrying all listed tags
- `item 1 [*]` — any item (wildcard). **Must be the last input line** in that recipe. A wildcard listed before a specific type/tag steals every candidate and the later slots never match (tape + flashlight + hat crafts fail).
- `-fluid <amount> [fluidId]` — consume a fluid amount

**Input item properties:**

| Property | Values | Notes |
|---|---|---|
| `itemList` | array | Specific items that can be used |
| `tags` | array | Tag-based item matching |
| `mode` | `destroy` (default), `keep` | Whether item is consumed |
| `flags` | array | Behaviour flags (see below) |
| `mappers` | array | Associate input to specific output |
| `overlayMapper` | boolean | This input drives the overlayMapper |

**Flags** (semicolon-separated, `flags[...]`):

| Flag | Meaning |
|---|---|
| `Prop1` | Item held in primary hand during crafting animation |
| `Prop2` | Item held in off-hand during crafting animation |
| `MayDegradeLight` | Item condition may reduce slightly |
| `NotFull` | Only accept items not at full capacity |
| `AllowFavorite` | Accept favorited items |
| `InheritFavorite` | Output inherits favorite status from input |
| `ItemCount` | Item is counted (not individually consumed) |
| `AllowDestroyedItem` | Accept damaged/destroyed items |

**Fluid inputs:**

| Property | Values | Notes |
|---|---|---|
| `fluidList` | array | Specific fluids |
| `categories` | array | Fluid category matching |

---

## `outputs` block

Declares what items are produced by the recipe.

```
outputs
{
    item <quantity> <ModuleId.ItemId>,
    item <quantity> mapper:<mapperID>,
}
```

---

## `fixing` block

Declared inside `module`. Defines how an item can be repaired.

```
module Base {
    fixing RepairKnife {
        Fixer = Base.Screwdriver,
        Require = Base.Knife,
        ConditionModifier = 1,
    }
}
```

| Parameter | Attributes | Notes |
|---|---|---|
| `Fixer` | Can be duplicated | The tool/item used for fixing |
| `Require` | — | Item being fixed (what gets repaired) |
| `GlobalItem` | — | Item pulled from a global pool |
| `ConditionModifier` | — | How much condition is restored |

---

## `fluid` block

Declared inside `module`. Defines a custom fluid type.

```
module Base {
    fluid MyFluid {
        DisplayName = Fluid_Name_MyFluid,
        ColorReference = Azure,
    }
}
```

**Display name translation:** Goes in `Fluids.json`. Key format: `Fluid_Name_YourFluid`.

| Parameter | Type | Notes |
|---|---|---|
| `DisplayName` | string | Translation key for the fluid name |
| `ColorReference` | string | References a color from the Colors class |

**Child blocks:**

| Block | Notes |
|---|---|
| `Properties` | Stat changes when drinking this fluid |
| `Categories` | Tags for the fluid. Valid: `Alcoholic`, `Beverage`, `Poisons`, `Colors`, `Medical`, `Industrial`, `Dyes`, `HairDyes`, `Paint`, `Fuel`, `Water` |
| `BlendWhiteList` | Fluids this can blend with |
| `BlendBlackList` | Fluids this cannot blend with |
| `Poison` | Poison properties |

---

## `entity` block

Declared inside `module`. Defines a tile/world object with special properties (B42 construction system).

```
module Base {
    entity MyEntity {
        DisplayName = MyEntity_Name,
        Icon = myEntityIcon,
    }
}
```

| Parameter | Notes |
|---|---|
| `DisplayName` | Display name translation key |
| `Icon` | Icon texture reference |
| `LuaWindowClass` | Lua UI class to open when interacting |

**Child component blocks:**
- `component CraftRecipe` — building recipe for this entity
- `component SpriteConfig` / `component SpriteOverlayConfig` — sprite setup
- `component DryingCraftLogic` — drying/processing logic
- `component FluidContainer` — if entity holds fluid
- `component CraftBench` — makes entity a crafting bench with a given tag

---

## `vehicle` block

Declared inside `module`. Defines a vehicle.

**Child blocks:** `part`, `sound`, `physics`, `wheel`, `model`, `lightbar`, `template`

### Core parameters

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `engineForce` | float | `3000` | Engine power. `engineForce` is 10× the displayed horsepower. |
| `engineIdleSpeed` | float | `750.0` | Idle RPM |
| `engineLoudness` | integer | `100` | Engine noise level |
| `engineQuality` | integer | `100` | Engine quality starting value |
| `engineRepairLevel` | integer | — | Required mechanics skill for engine repair |
| `engineRPMType` | string | `"jeep"` | RPM type reference |
| `mass` | float | `800` | Vehicle mass for physics. 800=car, 1100=truck, 200=trailer. Max ~1400 before sinking. |
| `maxSpeed` | float | `20.0` | Max forward speed |
| `maxSpeedReverse` | float | `40.0` | Max reverse speed |
| `mechanicType` | integer (1/2/3) | — | 1=standard, 2=heavy-duty, 3=performance |
| `seats` | integer | `2` | Number of seats |
| `gearRatioCount` | integer | `4` | Number of gears (up to 9) |
| `gearRatioR` | float | `7.09` | Reverse gear ratio |
| `gearRatio1`–`gearRatio8` | float | various | Forward gear ratios |
| `brakingForce` | — | — | |
| `rollInfluence` | float | `0.1` | Roll physics |
| `offRoadEfficiency` | float | `1.0` | Horsepower retention off-road |
| `steeringClamp` | float | `0.4` | Max wheel turn angle |
| `steeringIncrement` | float | `0.04` | Steering rate |
| `stoppingMovementForce` | float | `1.0` | Drag at rest |
| `physicsChassisShape` | float array | — | Hitbox dimensions: `height width length` |
| `extents` | float array | — | Visual bounding box |
| `extentsOffset` | float array | — | Visual bounding box offset |
| `carModelName` | string | — | Translation key — `IGUI_VehicleName<Value>` in IG_UI.json |
| `carMechanicsOverlay` | string | — | Mechanics overlay image |
| `frontEndDurability` | integer | `100` | Front-end durability |
| `rearEndDurability` | integer | `100` | Rear-end durability |
| `frontEndHealth` | — | — | DEPRECATED — use `frontEndDurability` |
| `rearEndHealth` | — | — | DEPRECATED — use `rearEndDurability` |
| `hasLighter` | boolean | `true` | Has cigarette lighter |
| `hasSiren` | boolean | — | (marked useless in schema) |
| `isSmallVehicle` | boolean | `true` | |
| `neverSpawnKey` | boolean | — | No key spawns for this vehicle |
| `notKillCrops` | boolean | — | Does not destroy crops |
| `playerDamageProtection` | float | — | Crash damage multiplier (1=normal) |
| `forcedColor` | float array | `-1 -1 -1` | Fixed HSV color (hue sat val) |
| `specialKeyRing` | array (`;`) | — | Keyring item to spawn |
| `specialKeyRingChance` | integer | — | Spawn chance for special keyring |
| `specialLootChance` | integer | `8` | |
| `storageCapacity` | integer | `100` | (marked useless in schema) |
| `template` / `template!` | (duplicatable) | — | Inherit from a vehicle template script |
| Texture params | string | — | `textureDamage1Overlay`, `textureDamage1Shell`, `textureDamage2Overlay`, `textureDamage2Shell`, `textureLights`, `textureMask`, `textureRust`, `textureShadow` |

---

## `mod.info` file (ROOT-ModInfo)

File pattern: `mod.info`
Format: key=value, no commas.

| Parameter | Type | Notes |
|---|---|---|
| `name` | string | Display name in mod manager. Supports translation via Mod.json. |
| `id` | string | **Never change after first release.** Unique mod ID (not the Workshop ID). |
| `author` | string | Author name(s). No convention for multiple. |
| `description` | string | Mod description. Supports ISRichTextPanel tags. Use `<LINE>` for line breaks. Supports translation. |
| `url` | string | Homepage URL shown as "Homepage" in mod manager. |
| `poster` | string (duplicatable) | Image for mod manager. Multiple allowed — first is primary. |
| `icon` | string | Small icon beside mod name in list. |
| `modversion` | string | Mod version string. Increment on every Workshop update. |
| `require` | string | Comma-separated required mod IDs. |
| `incompatible` | string | Comma-separated incompatible mod IDs. Prefix each with backslash: `\ModId`. |
| `loadModAfter` | string | Load after these mods. Comma-separated. |
| `loadModBefore` | string | Load before these mods. Comma-separated. |
| `category` | string | Filter category: `"map"`, `"vehicle"`, `"features"`, `"modpack"`. |
| `pack` | string | Texture/tile pack file names. |
| `tiledef` | string | Tiledef name + ID: `tiledef=MyTiles 2115` |
| `versionMin` | string | Min PZ version. **Must be format `42.0` not just `42`.** |
| `versionMax` | string | Max PZ version. |

---

## `sandbox-options.txt` (ROOT-SandboxOptions)

File pattern: `media/sandbox-options.txt`

**Required first line:** `VERSION 1`

Each option declared as `option <ModId.OptionName> { ... }`.

**Translation:** Keys go in `common/media/lua/shared/Translate/EN/Sandbox.json` (JSON, not TXT, not under 42/).

**Page name rule:** PascalCase, NO underscores between words (e.g. `BBCommonSenseCore`). Underscores break the tab label display.

**Translation key rule:** The engine prepends `Sandbox_` to the `translation` field — do NOT include `Sandbox_` in the `translation` field.

### `option` block parameters

| Parameter | Type | Required | Values | Notes |
|---|---|---|---|---|
| `type` | string | **YES** | `boolean`, `integer`, `double`, `string`, `enum` | Option data type |
| `default` | (matches type) | no | — | Default value |
| `min` | float | no | — | Minimum; integer and double only |
| `max` | float | no | — | Maximum; integer and double only |
| `page` | string | no | — | Page name (PascalCase, no underscores between words) |
| `translation` | string | no | — | Translation key WITHOUT the `Sandbox_` prefix |
| `numValues` | integer | no | — | For enum type: number of values |

### Translation file format

```json
{
    "Sandbox_BBMyMod": "BB My Mod",
    "Sandbox_BBMyMod_OptionName": "Display Label",
    "Sandbox_BBMyMod_OptionName_tooltip": "Tooltip text shown on hover.",
    "Sandbox_BBMyMod_EnumOption_option1": "First Choice",
    "Sandbox_BBMyMod_EnumOption_option2": "Second Choice"
}
```

---

## Other notable blocks

### `evolvedRecipe` block
Declares a dynamic recipe (e.g., sandwich ingredients). Declared inside `module`.

| Parameter | Notes |
|---|---|
| `BaseItem` | The base item being built up |
| `Name` | Display name |
| `ResultItem` | Output item |
| `MaxItems` | Max ingredients |
| `Cookable` | Whether result can be cooked |

### `timedAction` block
Links to timed actions for crafting animation and sound. Declared inside `module`.

| Parameter | Notes |
|---|---|
| `actionAnim` | Animation name |
| `animVarKey` / `animVarVal` | Animation variable override |
| `sound` | Sound to play |
| `soundTime` | When to trigger the sound |
| `completionSound` | Sound at completion |
| `metabolics` | Calories burned |
| `muscleStrainFactor` / `muscleStrainParts` / `muscleStrainSkill` | Strain config |
| `prop1` / `prop2` | Hand prop definitions |

### `component FluidContainer` (item sub-block)

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `Capacity` | float | `1.0` | Min value: 0.05 |
| `ContainerName` | string | `FluidContainer` | Unused/cosmetic; no whitespace allowed |
| `CustomDrinkSound` | string | `DrinkingFromGeneric` | Sound ref |
| `HiddenAmount` | boolean | `false` | Hide fill level from UI |
| `InitialPercent` | float | — | Fixed starting fill; incompatible with min/max |
| `InitialPercentMin` | float | `0.0` | Random fill min; incompatible with InitialPercent |
| `InitialPercentMax` | float | `1.0` | Random fill max; incompatible with InitialPercent |
| `InputLocked` | — | — | Prevents adding fluid |

---

## Translation file quick-reference

| Content | File name | Key format | Notes |
|---|---|---|---|
| Item display names | `ItemName.json` | `Module.ItemId` | e.g. `Base.Crowbar` |
| Recipe display names | `Recipes.json` | `RecipeId` | No module prefix |
| Fluid names | `Fluids.json` | `Fluid_Name_FluidId` | Convention, not required |
| Sandbox options | `Sandbox.json` | `Sandbox_PageName_OptionName` | Under `common/` not `42/` |
| UI strings | `IG_UI.json` | `IGUI_*` | e.g. `IGUI_VehicleNameMyCar` |
| Context menus | `ContextMenu.json` | `ContextMenu_*` | |
| Item tooltips | `Tooltip.json` | `Tooltip_*` | |

See `Brain/references/build42/translation-file-types.md` for the full translation system reference.
