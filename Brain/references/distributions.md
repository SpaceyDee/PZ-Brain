# Loot Distributions, Items, and Vehicles (PZ Build 42)

Reference for the weak-coverage areas of the workshop. Sourced from `<local-path>`.

## Item Distribution Pipeline

PZ runs three lifecycle hooks for distribution table assembly:

```lua
Events.OnPreDistributionMerge.Add(preDistributionMerge)    -- before merge
Events.OnDistributionMerge.Add(mergeDistributions)         -- merging running
Events.OnPostDistributionMerge.Add(postDistributionMerge)  -- after merge
```

`SuburbsDistributions.lua` line 206-208 shows the canonical hookup. Mods that add or modify loot tables should hook the same events.

There are two coexisting distribution tables:

- **`SuburbsDistributions`** — the older, container-keyed-by-room-name table. `SuburbsDistributions.<roomName>.<containerType>` describes what spawns in that container in that room.
- **`ProceduralDistributions`** — the newer, named-bucket table. Containers reference these buckets via `procList = { {name="...", min=..., max=..., weightChance=...} }`.

`Distributions` is a global array; both tables push themselves into it via `table.insert(Distributions, 1, distributionTable)`.

## Procedural Distributions (newer system)

`media/lua/server/Items/ProceduralDistributions.lua` — a flat table of named loot buckets:

```lua
ProceduralDistributions.list.AmbulanceDriverTools = {
    rolls = 3,
    items = {
        "BookFirstAid1", 6,
        "Bandage", 20,
        "Pills", 50,
        -- ...
    },
    junk = {
        rolls = 1,
        items = {
            "Notepad", 10,
            "Pencil", 10,
        }
    }
}
```

Schema:

| Field | Type | Notes |
|---|---|---|
| `rolls` | int | How many roll passes the container does. |
| `items` | flat array | Pairs of `"ItemFullType", weight`. Higher weight = more likely. |
| `junk` | table or nil | Same shape; rolled separately as filler. |
| `fillRand` | int (optional) | Random extra rolls. |
| `procList` | array of `{name, min, max, weightChance, forceForTiles}` (in `SuburbsDistributions`) | Reference into `ProceduralDistributions.list`. |

`min` and `max` clamp the percent population (e.g. `min=0, max=99` = no cap). `weightChance` is the relative weight of this proc bucket vs siblings. `forceForTiles` is a semicolon-list of tile sprite names — when the container sprite is one of these, this bucket is forced.

## Suburbs Distributions (older system)

`media/lua/server/Items/SuburbsDistributions.lua`:

```lua
distributionTable.aesthetic = {
    counter = {
        procedural = true,
        procList = {
            { name = "StoreCounterCleaning", min = 0, max = 99,
              forceForTiles = "location_shop_accessories_01_0;..." },
            { name = "SalonCounter", min = 0, max = 99 },
            { name = "SalonShelfHaircare", min = 0, max = 99, weightChance = 100 },
        }
    },
    metal_shelves = { procedural = true, procList = { ... } },
    shelves       = { procedural = true, procList = { ... } },
    -- ...
}
```

Top-level keys are room names (`aesthetic`, `bookstore`, `kitchen`, `garage`, etc.). Second-level keys are container types (`counter`, `shelves`, `metal_shelves`, `sidetable`, `smallbox`, `desk`, `crate`, `fridge`, etc.). The leaf is `{ procedural = true, procList = {...} }` to defer to the procedural buckets, or a direct `{ rolls=N, items={...}, junk={...} }` for inline.

## Helper Functions

Provided in `SuburbsDistributions.lua`:

```lua
ClearAllDistributionItems(_dist, _dorecursive)
RemoveItemFromDistribution(_dist, _item, _chance, _dorecursive)
DeepPrintDistributionTable(_dist, tab)
```

Use these in your mod's `OnPreDistributionMerge` handler when scrubbing or rebalancing existing tables before merge.

## Adding Mod Loot

```lua
-- in media/lua/server/<ModId>Distributions.lua

local function addModItems()
    -- option 1: add a new procedural bucket
    ProceduralDistributions.list["MyMod_LootBucket"] = {
        rolls = 2,
        items = {
            "Base.Bandage", 10,
            "MyMod.SpecialItem", 4,
        },
    }

    -- option 2: extend an existing bucket
    table.insert(ProceduralDistributions.list.AmbulanceDriverTools.items, "MyMod.HealItem")
    table.insert(ProceduralDistributions.list.AmbulanceDriverTools.items, 5)

    -- option 3: add to a specific room/container
    SuburbsDistributions.medical = SuburbsDistributions.medical or {}
    SuburbsDistributions.medical.shelves = SuburbsDistributions.medical.shelves or { procedural = true, procList = {} }
    table.insert(SuburbsDistributions.medical.shelves.procList,
        { name = "MyMod_LootBucket", min = 0, max = 99 })

    -- option 4: positional insert (position 1 = checked first = higher effective hit rate)
    table.insert(SuburbsDistributions.medical.shelves.procList, 1,
        { name = "MyMod_HighPriorityBucket", min = 0, max = 99 })

    -- option 5: zone-restricted bucket (only spawns inside matching zone types)
    ProceduralDistributions.list["MyMod_ForestBucket"] = {
        rolls = 2,
        items = { "Base.BerryBlue", 20 },
        forceForZones = { "DeepForest", "Forest" },   -- zone type strings from Zones editor
    }
end

Events.OnPreDistributionMerge.Add(addModItems)
```

Item full-types use `Module.Name` form (e.g. `Base.Bandage`, `MyMod.HealItem`). Module is declared in the `module Foo { ... }` block of your `media/scripts/<ModId>.txt`.

## Item Scripts

Item definitions live in `media/scripts/*.txt`:

```
module MyMod
{
    item HealItem
    {
        DisplayName = Heal Item,
        Type = Drainable,
        DisplayCategory = FirstAid,
        Weight = 0.1,
        UseDelta = 0.5,
        Icon = HealItem,
        Tooltip = Tooltip_HealItem,
    }

    recipe Make Heal Item
    {
        Bandage,
        Disinfectant,
        Result: HealItem,
        Time: 50.0,
        Category: First Aid,
        SkillRequired: Doctor=2,
    }
}
```

The PZ tutorial / vanilla scripts at `<local-path>` are the reference for full schema (`item`, `recipe`, `vehicle`, `model`, `sound`, `evolvedrecipe`, etc.).

## Vehicle Distributions

`media/lua/server/Vehicles/VehicleDistributions.lua`:

```lua
VehicleDistributions.GloveBox = {
    rolls = 1,
    items = {},
    junk = ClutterTables.GloveBoxJunk,
}

VehicleDistributions.TrunkStandard = {
    rolls = 1,
    items = { "NormalTire1", 0.5 },
    junk = ClutterTables.TrunkJunk,
}

VehicleDistributions.TrunkSports = {
    rolls = 1,
    items = {
        "Cooler_Beer", 0.1,
        "HottieZ", 4,
        "NormalTire3", 0.5,
        "TrophyBronze", 1,
    },
    junk = ClutterTables.TrunkJunk,
}
```

Same schema as procedural distributions. Each named bucket maps to a vehicle part (`GloveBox`, `TrunkStandard`, `TrunkHeavy`, `TrunkSports`, `EmptySeat`, etc.).

Vehicle scripts (chassis, models, parts) live in `media/scripts/vehicles/*.txt`. The schema is large — open `media/scripts/vehicles/vehicles_carnormal.txt` for a vanilla reference before authoring.

## Weapon Upgrade Tables

```lua
WeaponUpgrades = {
    HuntingRifle = { "x4Scope", "x8Scope", "RecoilPad" },
    Shotgun      = { "ChokeTubeFull", "ChokeTubeImproved", "RecoilPad" },
    Pistol       = { "GunLight", "Laser", "TritiumSights" },
}
```

Defined in `SuburbsDistributions.lua`. Maps weapon item full-types to attachable upgrade items.

## NoContainerFillRooms

```lua
NoContainerFillRooms = {
    armysurplus = {}, bookstore = {}, camping = {},
    -- ...
}
```

Rooms listed here skip the default fill pass — used for stores that have curated loot via story/narrative systems instead of procedural rolls. Mods can add or remove keys here in their `OnPreDistributionMerge`.

## Loot Lifecycle Summary

1. Game boots, `media/scripts/*.txt` parse → item / recipe / vehicle definitions registered.
2. `Events.OnPreDistributionMerge` fires → mods scrub or extend tables.
3. PZ merges all `Distributions[i]` arrays in registration order.
4. `Events.OnDistributionMerge` fires → mods do the merge step (rare).
5. `Events.OnPostDistributionMerge` fires → mods do post-merge fixups (rare).
6. World loads. Container fill uses the merged tables on first interaction.

## Item Spawning at Runtime

Outside the distribution pipeline, spawn an item directly:

```lua
local item = container:AddItem("Base.Bandage")        -- spawn into a container
local item = player:getInventory():AddItem("Base.Bandage")
local item = InventoryItemFactory.CreateItem("Base.Bandage")
square:AddWorldInventoryItem(item, 0, 0, 0)           -- drop on ground
```

For server-authoritative item grants from a `Events.OnClientCommand` handler, spawn server-side and let client sync handle visibility.

## Container ContextMenu Integration

To inject options into right-click context menus on world containers (the user mods use this for `HavenContainerProtect`):

```lua
local function onFillWorldObjectContextMenu(playerIdx, context, worldobjects, test)
    local player = getSpecificPlayer(playerIdx)
    for i = 1, #worldobjects do
        local obj = worldobjects[i]
        local container = obj:getContainer()
        if container then
            context:addOption("Lock Container", worldobjects, function() ... end)
        end
    end
end
Events.OnFillWorldObjectContextMenu.Add(onFillWorldObjectContextMenu)
```

`test` is a probe pass — return early if it's true and you don't want to hit any heavy logic.
