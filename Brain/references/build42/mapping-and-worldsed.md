# Project Zomboid Build 42 — Mapping, Tiles & WorldEd Reference

Verified against `_pz_install/media/maps/` in B42.18. Covers building authoring (TileZed), world composition (WorldEd), map mod packaging, the spawn/zone object system, and integration points with gameplay Lua (notably the room-name surface used by `ResidentialSafehousesOnly` and similar mods).

This is a deep-water area — PZ's mapping toolchain lives mostly OUTSIDE the game install. The tools (TileZed, WorldEd, BuildingEd) are a separate download from the official Indie Stone PZ-tools repo. This doc focuses on what's inside the **shipped map data**, because that's what mods read and react to.

---

## The two-tool authoring split

| Tool | Output | Purpose |
|---|---|---|
| **BuildingEd** (inside TileZed) | `.tbx` files | Author a single building — floors, walls, doors, windows, room rectangles, tile placement |
| **WorldEd** | `.pzw` projects + `.bmp` cell maps | Compose the world from cells, place buildings at coordinates, define zones, generate ship-ready `.lotpack` / `.lotheader` / `chunkdata_*.bin` |

The tools are bundled together in a single Qt-based suite. Source + binaries: https://github.com/TheIndieStone/pz-tools (not shipped with the game).

You do not interact with these tools from Lua. You author offline, **export** to the binary format, and ship the binaries in your mod.

---

## Shipped map file layout (what a mod actually contains)

Verified against vanilla `_pz_install/media/maps/Muldraugh, KY/`. A B42 map's shipped form is binary + Lua metadata:

```
media/maps/<MapName>/
├── map.info                         # metadata (text)
├── thumb.png                        # workshop/menu thumbnail
├── worldmap.xml                     # in-game map shape definition (cells, points)
├── worldmap.xml.bin                 # binary-cached form of worldmap.xml (auto)
├── worldmap.png                     # in-game map texture
├── worldmap-forest.xml              # forest density overlay
├── worldmap-forest.xml.bin
├── worldmap-annotations.lua         # in-game pinned annotations (Lua data)
├── objects.lua                      # ALL placed zones (spawn, loot, forest, etc.)
├── spawnpoints.lua                  # OPTIONAL player spawn points by profession
├── basements.lua                    # OPTIONAL z=-1 basement extension defs
├── WorldGenOverride.lua             # OPTIONAL — override world-gen for this map
├── 0_18.lotheader                   # per-cell tile-data header
├── chunkdata_0_18.bin               # per-cell chunk-data binary
├── 0_19.lotheader
├── chunkdata_0_19.bin
└── ...                              # one .lotheader + one chunkdata_*.bin per cell
```

**Vanilla `Muldraugh, KY`** ships **4067 `.lotheader` files** (one per cell). Cells are named by their `CELL_X_CELL_Y` coordinates in the global PZ world grid.

---

## Cell geometry (the numbers that matter)

From `Muldraugh, KY/map.info`:
```
Chunk size is 8x8, Cell size is 256x256
```

| Unit | Size | Note |
|---|---|---|
| **Tile** | 1×1 | one square; what `getX()/getY()` returns |
| **Chunk** | 8×8 tiles | streaming/serialization unit |
| **Cell** | 32×32 chunks = **256×256 tiles** | one `.lotheader` + one `chunkdata_*.bin` per cell |
| **Z-levels** | 0..7 | floors; z=-1 basements via `basements.lua` |

So coordinate `(10520, 9870)` lives in cell `41_38` (10520÷256=41, 9870÷256=38). The corresponding files are `41_38.lotheader` and `chunkdata_41_38.bin`. Useful for mapping any in-game position back to map files.

**Vanilla cell ranges to AVOID for custom maps** (otherwise you collide and one overrides the other):

| Map | Approx cell range |
|---|---|
| Muldraugh KY | x: 0–~70, y: 18–~64 (very large — Knox County base map) |
| Brandenburg, Echo Creek, etc. | Each occupies its own non-overlapping cell band |

Run `ls _pz_install/media/maps/<MapName>/ | grep '^[0-9]\+_[0-9]\+\.lotheader'` to enumerate any map's actual cells. New custom maps must pick a cell range nobody else uses — check every loaded map at install time, not just vanilla.

---

## `map.info` schema (verified)

Plain key=value. From Muldraugh:
```
title=Muldraugh P.O.T
fixed2x=true
description=Chunk size is 8x8, Cell size is 256x256
zoomX=11181
zoomY=9725
zoomS=13.5
demoVideo=Muldraugh.bik
```

From Brandenburg (smaller map that **inherits/overlays** Muldraugh):
```
title=See media/lua/shared/Translate/EN/Brandenburg, KY/title.txt
lots=Muldraugh, KY
fixed2x=true
description=See media/lua/shared/Translate/EN/Brandenburg, KY/description.txt
zoomX=2314
zoomY=6253
zoomS=14.3
demoVideo=Brandenburg.bik
only_for_game_mode=Sandbox
```

| Key | Required | Meaning |
|---|---|---|
| `title` | yes | Map display name. Can point to a translation file with `See media/lua/shared/Translate/...`. |
| `description` | yes | Map description. Same translation-file pattern allowed. |
| `lots` | no | **Inheritance.** This map shares tile data with the named base map. Use to extend an existing map (Brandenburg sits inside the Muldraugh world). |
| `fixed2x` | no | `true` for B42 — keeps tile scaling consistent. Default on for new maps. |
| `zoomX` / `zoomY` / `zoomS` | no | World-map UI start position + zoom. |
| `demoVideo` | no | Bink video shown in mod selector. Optional. |
| `only_for_game_mode` | no | `Sandbox` / `Survivor` / `Apocalypse` — restricts which game modes can pick this map. |

---

## `objects.lua` — zones & gameplay objects

Returns a top-level table `objects` (NOT a function). Each entry has `name, type, x, y, z, width, height`. Vanilla Muldraugh contains thousands of these.

**Verified object types** (extracted from Muldraugh's objects.lua):

| Type | Purpose |
|---|---|
| `Nav` | Navmesh hint — pathfinding aid, NPC/zombie movement |
| `TownZone` | Marks a tile area as "in town" — affects loot density, zombie population |
| `Vegitation` | (sic — actually misspelled in vanilla) tree/foliage spawn zone |
| `Forest` / `DeepForest` | Heavier forest density, affects fog and spawns |
| `Farm` / `FarmLand` | Farming-suitable tiles, crop spawn rules |
| `Ranch` | Animal spawn zone |
| `Animal` | Specific animal-type spawn area |
| `LootZone` | Override loot generation in a region |
| `Mannequin` | Spawn a clothed mannequin |
| `ParkingStall` | Vehicle spawn slot |
| `RoomTone` | Audio ambience zone |
| `SpawnPoint` | Player spawn (in addition to spawnpoints.lua) |
| `TrailerPark` | Trailer-park flavoured zone (loot tilt) |
| `WaterFlow` | Flowing water sound + visual |
| `WaterZone` | Static water (lake, pool) |
| `WorldGen` | World-generation hint (forest spread, etc.) |
| `ZombiesType` | Override zombie type/density |
| `ZoneStory` | Triggers a randomised "zone story" (RBBasic stories) |
| `Basement` | Connected basement (z=-1) anchor |

**File format** is a Lua return-table:
```lua
objects = {
    { name = "", type = "TownZone",  x = 12541, y = 1090, z = 0, width = 32, height = 58 },
    { name = "", type = "ParkingStall", x = 10560, y = 9820, z = 0, width = 2, height = 1 },
    -- ...
}
```

Note: top-level `objects = { ... }` is a global assignment — not a function definition. The engine reads it after `dofile`.

---

## `spawnpoints.lua` — player spawn points

Returns a function. Schema:

```lua
function SpawnPoints()
    return {
        unemployed = {
            { posX = 2152, posY = 6089, posZ = 0 },
        },
        carpenter = {
            { posX = 2152, posY = 6089, posZ = 0 },
        },
        -- ... one table per profession
    }
end
```

The outer keys are **profession IDs** matching `media/lua/shared/Translate/EN/Professions_EN.txt`. Each lists one or more spawn coordinates. The new-game UI picks one at random per character.

`unemployed` is the universal fallback — always include it. Otherwise some character builds will fail to spawn.

---

## `worldmap.xml` — in-game map UI

Defines what the player sees when they open the in-game map (the paper one with `M`). XML structure:

```xml
<world>
    <cell x="..." y="..."/>
    <region name="..." level="..." x1="..." y1="..." x2="..." y2="..."/>
    <point name="..." x="..." y="..." icon="..."/>
</world>
```

Companion file `worldmap-forest.xml` is a separate overlay specifically for tree density rendering on the paper map.

`worldmap.xml.bin` and `worldmap-forest.xml.bin` are **auto-generated binary caches** — never hand-edit; they're rebuilt from the XML on first map load.

`worldmap.png` is the actual map texture. `thumb.png` is the smaller mod-selector preview.

`worldmap-annotations.lua` adds in-game annotations (text labels, marker dots) that vanilla pins on the map for known locations. Lua table return form similar to `objects.lua`.

---

## Tile properties → room names (CRITICAL surface for gameplay mods)

Each tile in a tilesheet can declare properties. The most important property for gameplay mods is the **room type string** (`RoomDef.name`), assigned during BuildingEd authoring.

Common vanilla room names (used as keys by gameplay code, e.g. `ResidentialSafehousesOnly_Config.lua`):

- **Residential:** `bedroom`, `kitchen`, `livingroom`, `bathroom`, `diningroom`, `closet`, `hallway`, `laundry`, `garage`
- **Commercial:** `shop`, `store`, `restaurant`, `bar`, `cafe`, `office`, `bigoffice`
- **Industrial:** `warehouse`, `factory`, `storageunit`, `storage`
- **Public:** `school`, `classroom`, `library`, `bank`, `church`, `community`, `motelroom`, `hotelroom`, `gasstation`
- **Security:** `police`, `policestore`, `armory`, `firedept`, `firestation`, `military`
- **Medical:** `clinic`, `medical`, `hospital`, `pharmacy`

Custom maps can introduce **new room names** — the engine doesn't validate against a fixed vocabulary. This means gameplay mods that switch on room name (safehouse filters, loot overrides, etc.) need to be **tunable per map** and should default to "block if unrecognised" or "allow if unrecognised" depending on intent.

To enumerate the actual room names on any loaded map, use a debug Lua command in-game:
```lua
local sq = getPlayer():getSquare()
local b = sq and sq:getBuilding()
local d = b and b:getDef()
if d then
    local rooms = d:getRooms()
    for i = 0, rooms:size() - 1 do
        print("room", i, rooms:get(i):getName())
    end
end
```

`ResidentialSafehousesOnly` ships this exact pattern as a `sendClientCommand("ResidentialSafehousesOnly", "inspect", {})` command — see that mod for the full implementation.

---

## Mod folder structure for a map mod

For a map-only mod (no Lua gameplay):

```
<ModId>/
├── workshop.txt
├── preview.png                              # MANDATORY 256x256
├── mod.info
└── 42/
    ├── mod.info
    ├── poster.png                           # MANDATORY 256x256
    └── media/
        └── maps/
            └── <MapName>/
                ├── map.info
                ├── thumb.png
                ├── worldmap.png
                ├── worldmap.xml
                ├── worldmap-forest.xml
                ├── worldmap-annotations.lua
                ├── objects.lua
                ├── spawnpoints.lua
                ├── (optional) basements.lua
                ├── (optional) WorldGenOverride.lua
                └── <NNN>_<MMM>.lotheader     # one per cell
                └── chunkdata_<NNN>_<MMM>.bin # one per cell
```

`mod.info` follows the standard schema (`id=`, `name=`, `description=`, `author=`, `poster=`, `versionMin=42.0` — no empty fields). See `B42_ModInfo_Format.md`.

If a map mod also ships custom tilesheets (new building styles, new room types), it additionally needs:

```
└── media/
    ├── tiledefinitions_<modname>.tiles
    ├── tiledefinitions_<modname>.tiles.txt
    └── tiles/                              # textures
        └── ...
```

The `.tiles` binary is generated by TileZed's tilesheet packer. The matching `.tiles.txt` is the human-readable definition list.

---

## Coordinate conventions

| Form | Example | Where used |
|---|---|---|
| Tile (world) coords | `(10520, 9870, 0)` | `IsoPlayer:getX/Y/Z()`, `getCell():getGridSquare(x,y,z)`, `objects.lua` entries |
| Cell coords | `(41, 38)` | `.lotheader` / `chunkdata_*.bin` filenames |
| Chunk coords | `(1315, 1233)` (= tile÷8) | streaming; rarely surfaced in Lua |
| Z-level | `0..7` (or `-1` for basements) | every API takes a Z |

Conversion: `cellX = tileX ÷ 256`, `chunkX = tileX ÷ 8`, `localTileXInCell = tileX mod 256`.

---

## Common pitfalls

1. **Cell collisions.** Two maps that ship `.lotheader` files for the same cell coordinates will fight on load — only one wins. Always pick a cell range nobody else has. Run a cell-range survey before publishing.

2. **Missing `unemployed` spawn.** Forgetting `unemployed` in `spawnpoints.lua` means players who pick certain background combinations spawn on the default Muldraugh point instead of yours.

3. **Hand-editing `.xml.bin` files.** These are auto-regenerated binary caches. Editing them is overwritten on first load. Always edit the `.xml` and delete the `.xml.bin` to force regeneration.

4. **`Vegitation` typo.** This is a vanilla typo in PZ since B41 — keep it spelled `Vegitation` (not `Vegetation`) in your `objects.lua` or the engine won't recognise the zone.

5. **`lots=` inheritance order.** When `map.info` declares `lots=OtherMap`, your map's `.lotheader` / `chunkdata_*.bin` files OVERLAY the named base map's files for any cell coordinates you ship. Cells you DON'T ship fall through to the base map. Useful for "add a town" mods; dangerous if you forget you're overlaying.

6. **`only_for_game_mode`** silently hides your map from players using other game modes. Make sure this is the behaviour you want (Brandenburg uses it deliberately — it's a sandbox-only intro map).

7. **Z-level mismatches in `basements.lua`.** Basements live at z=-1 and need explicit registration. Forgetting this leaves the basement tiles drawn but the navmesh broken.

---

## Reading your own map from Lua at runtime

The engine exposes the loaded map state via:

| Lua | Purpose |
|---|---|
| `getCell()` | Returns the loaded `IsoCell` — the chunk-aware view around the local player |
| `cell:getGridSquare(x, y, z)` | Tile lookup. Returns nil for tiles outside the loaded cell. |
| `square:getBuilding()` | `IsoBuilding` or nil if outside any building |
| `building:getDef()` | `BuildingDef` — metadata including all rooms |
| `def:getRooms()` | `ArrayList<RoomDef>` — every room in the building |
| `roomDef:getName()` | The string room type (`"bedroom"`, etc.) — what map-aware gameplay mods key on |
| `getWorld():getMetaGrid()` | Coarser map view spanning beyond the loaded cell (for AI / zone queries) |

The `square:getRoom()` shortcut returns the specific `RoomDef` that contains a tile (or nil for outside). Useful for "what room am I currently in?" checks, which is different from "what rooms exist in this building?" (the latter via `building:getDef():getRooms()`).

---

## `VehicleZoneDistribution` — Custom Vehicle Spawn Pools (B42)

**Verified B42 source: HavenFall (`3728357493`) `HFCarSpawns.lua`**

The global `VehicleZoneDistribution` table links `ParkingStall` zone names in `objects.lua` to specific vehicle pools. Mods extend it by adding or modifying named zones.

```lua
-- Always guard against the global not existing (soft-optional API)
if VehicleZoneDistribution then
    VehicleZoneDistribution.trafficcar1 = VehicleZoneDistribution.trafficcar1 or {}
    VehicleZoneDistribution.trafficcar1.vehicles = VehicleZoneDistribution.trafficcar1.vehicles or {}

    -- Add a vehicle type to this zone's pool
    VehicleZoneDistribution.trafficcar1.vehicles["Base.CarNormal"] = {
        index = -1,        -- always -1 for random selection
        spawnChance = 100  -- 0–100; 100 = guaranteed
    }

    VehicleZoneDistribution.trafficcar1.baseVehicleQuality = 0.5   -- 0.0–1.0 condition quality
    VehicleZoneDistribution.trafficcar1.chanceToSpawnKey    = 50   -- % chance a key spawns in the vehicle
    VehicleZoneDistribution.trafficcar1.chanceToSpawnSpecial = 0   -- % chance a "special" (unique) vehicle
    VehicleZoneDistribution.trafficcar1.spawnRate           = 100  -- % chance the stall spawns at all
end
```

The zone name (`trafficcar1`, `good`, `ranger`, etc.) is the **`name` field of a `ParkingStall` entry in `objects.lua`**. Vanilla zone names and their vehicle pools are pre-populated by the engine; mods can extend or override them.

**Verified ParkingStall `name` values** (from HavenFall `objects.lua` — B42.18):

| Name | Vehicle type (typical) |
|---|---|
| `good` | Standard civilian cars (good condition) |
| `ranger` | Off-road / ranger vehicles |
| `sport` | Sports cars |
| `junkyard` | Wrecked / junk vehicles |
| `mccoy` | McCoy Logging truck types |
| `burnt` | Burnt-out vehicle wrecks |
| `police` | Police cruisers |
| `farm` | Farm vehicles |
| `medium` | Mid-range generic vehicles |
| `fire` | Fire department vehicles |
| `postal` | Postal vans |
| `radio` | Radio/media vehicles |
| `trafficjamn` / `trafficjams` / `trafficjame` / `trafficjamw` | Traffic jam directions (N/S/E/W) |

**Note:** The vehicle `name` on a `ParkingStall` entry IS the `VehicleZoneDistribution` key. Adding a new distribution entry with a custom name, then placing a `ParkingStall` with that name in `objects.lua`, creates a custom spawn zone.

---

## TileZed Container Overlay Maps (`WorldFiller` pattern)

**Verified B42 source: HavenFall (`3728357493`) `WorldFiller_HF.lua`**

TileZed auto-generates overlay maps for multi-tile container sprites (where clicking one tile logically belongs to a multi-tile object). These ship as Lua files in the map's shared/server folder.

```lua
-- THIS FILE WAS AUTOMATICALLY GENERATED BY TileZed
local overlayMap = {}
overlayMap.VERSION = 1

-- Key: the "front-facing" sprite index, Value: {{ name, tiles }}
overlayMap["MyMod-furniture-01_8"] = {{ name = "other", tiles = {"MyMod-furniture-01_10", "MyMod-furniture-01_10"} }}
overlayMap["MyMod-furniture-01_9"] = {{ name = "other", tiles = {"MyMod-furniture-01_11", "MyMod-furniture-01_11"} }}

-- Always guard against running inside the editor
if not TILEZED then
    getContainerOverlays():addOverlays(overlayMap)
end

return overlayMap
```

- `TILEZED` is a global that is `true` when the file runs inside TileZed's scripting sandbox. Always gate `getContainerOverlays()` with `if not TILEZED then`.
- `getContainerOverlays():addOverlays(overlayMap)` — engine-global; registers the overlay map so clicking any tile in a multi-tile object opens the container for the correct parent tile.
- The tile names follow the pattern `<TilesetName>_<N>` where N is the sprite index within the tileset.
- These files are auto-generated; do not hand-edit. Re-run TileZed's container overlay export if tilesets change.

---

## Citations

- `_pz_install/media/maps/Muldraugh, KY/map.info`
- `_pz_install/media/maps/Muldraugh, KY/objects.lua` (21 verified object types)
- `_pz_install/media/maps/Brandenburg, KY/map.info` (verified `lots=`/inheritance)
- `_pz_install/media/maps/Brandenburg, KY/spawnpoints.lua`
- `_pz_install/media/maps/Muldraugh, KY/worldmap-annotations.lua`
- `_pz_install/media/maps/Muldraugh, KY/worldmap-forest.xml`
- `Brain/references/build42/destruction-apis.md` — building/room API used by gameplay mods
- `Brain/references/build42/B42_ModInfo_Format.md` — mod.info schema
- `Brain/roles/mapping_tiles_worlded_specialist.md` — review role
- External: `https://github.com/TheIndieStone/pz-tools` — TileZed + WorldEd source
