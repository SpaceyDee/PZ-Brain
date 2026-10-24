# B42 Official Modding Guide

**Source(s):**
- https://pzwiki.net/wiki/Modding (403 at time of research — content reconstructed from search snippets and cached data)
- https://pzwiki.net/wiki/Mod_structure
- https://pzwiki.net/wiki/Getting_started_with_modding
- https://github.com/LabX1/ProjectZomboid-Build42-ModTemplate
- https://github.com/FWolfe/Zomboid-Modding-Guide/blob/master/structure/README.md
- https://steamcommunity.com/sharedfiles/filedetails/?id=3391657438 — "How To Update Your Mod for Build 42"
- https://pzfans.com/build_42_modding_what_works_what_s_broken_and_what_s_worth_it/
- https://github.com/JBD-Mods/awesome-project-zomboid-build42-resources

> **Note:** pzwiki.net returned HTTP 403 for all direct fetches during this research session. Content is compiled from search result snippets, community guides, and GitHub resources. Verify against the live wiki when accessible.

---

## Overview

Project Zomboid uses **Lua** (via Kahlua2 — a Java implementation of Lua 5.1) for mod scripting. Mods are composed of:
- A `mod.info` metadata file
- A `media/` directory containing Lua scripts, item scripts, textures, sounds, models, etc.
- Optionally, a `workshop.txt` for Steam Workshop integration

**Key B42 change:** Build 42 introduced a **versioned folder system** where mod assets are placed inside version-specific subdirectories (`42/`, `41/`, `common/`) rather than directly in the mod root.

---

## Folder Structure

### Local Mods (non-Workshop)

Local mods live in: `%USERPROFILE%\Zomboid\mods\`

```
YourModName/
├── 42/                    ← Build 42-specific content
│   ├── mod.info
│   ├── poster.png
│   └── media/
│       ├── lua/
│       │   ├── shared/       ← Loaded first (server + client)
│       │   ├── client/       ← Loaded after shared (client only)
│       │   └── server/       ← Loaded at game start (server only)
│       ├── scripts/          ← Item, recipe, vehicle definitions (.txt)
│       ├── textures/         ← PNG icons/textures (Item_ prefix for items)
│       ├── models/           ← Non-static / animation-text definitions only
│       ├── models_X/         ← Static world / item 3D models (.fbx) — B42 canonical
│                              (verified truth `b42.world-model-dir-models-x`)
│       ├── sound/            ← Audio (.wav or .ogg)
│       ├── AnimSets/         ← Animation set XML files (NEW in B42 era)
│       ├── clothing/         ← Clothing XML files with GUIDs
│       └── registries.lua    ← (B42.13+) Loaded BEFORE all Lua; registers identifiers
├── 41/                    ← Optional: B41-specific content (for dual-compat)
│   ├── mod.info
│   └── media/
└── common/                ← Shared across build versions (can be empty)
    └── media/lua/client/
```

### Workshop Mods

Workshop mods live in: `%USERPROFILE%\Zomboid\Workshop\`

```
YourModName/
├── Contents/
│   └── mods/
│       └── YourModName/
│           ├── 42/
│           │   ├── mod.info
│           │   ├── poster.png
│           │   └── media/
│           ├── common/
│           └── (optional 41/)
└── workshop.txt
```

---

## Lua Script Load Order

Scripts are loaded in this order within each session:

1. **`media/registries.lua`** — B42.13+ only. Loaded before everything else. Used for registering identifiers (items, traits, fluids, body locations, etc.)
2. **`media/lua/shared/`** — Loaded first. Available to both server and client. Use for shared data structures and utilities.
3. **`media/lua/client/`** — Loaded after shared. Client-only. For UI, context menus, timed actions, rendering.
4. **`media/lua/server/`** — Loaded at gameplay start, server only. For spawning, farming, weather events, server commands.

> **Important:** Lua files must be placed in **subdirectories** of `media/lua/`, not directly in `media/lua/` itself.

---

## Script File Format (`media/scripts/`)

Item, recipe, and vehicle definitions use `.txt` files in `media/scripts/`. The format is block-based:

```
module Base {
    item MyItem
    {
        Type                = Normal,
        DisplayName         = My Item,
        Icon                = MyItem,
        Weight              = 0.5,
        ...
    }
}
```

**Rules:**
- Blocks are delimited by `{` and `}`
- Key-value pairs use `Key = Value,` format
- The comma after the last line is **mandatory** (unlike JSON — this is a common mistake)
- Files saved with `.txt` extension

**Item Types available in B42:**
`Normal`, `Weapon`, `Food`, `Literature`, `Drainable`, `Clothing`, `Container`, `WeaponPart`, `Key`, `Moveable`, `Radio`, `AlarmClock`, `AlarmClockClothing`, `Map`

---

## registries.lua (B42.13+ Only)

Introduced in **Build 42.13.0**. This file is loaded before all Lua scripts and all script files. It is used to register namespaced identifiers.

File location: `media/registries.lua` (exact name required)

```lua
-- Example: registering a custom trait
Registries.Traits:add("mymod:mytrait", {
    -- trait properties
})

-- Example: registering a custom item tag
Registries.ItemTags:add("mymod:mytag")

-- Example: registering a custom fluid
Registries.Fluids:add("mymod:myfluid", {
    -- fluid properties
})
```

**Why it matters:** B42.13 refactored many game systems (ItemTag, ItemBodyLocation, fluids, etc.) from hardcoded enums to extensible registries. Mods must use `registries.lua` to add new entries without overwriting vanilla data.

---

## Sandbox Options (Mod-defined)

Mods can add custom sandbox settings by placing a file at:
`media/sandbox-options.txt`

### Format

```
option ModName.OptionName
{
    type        = boolean,
    default     = true,
    page        = MyPage,
    translation = ModName_OptionName,
}

option ModName.SpawnCount
{
    type        = integer,
    default     = 5,
    min         = 1,
    max         = 50,
    page        = MyPage,
    translation = ModName_SpawnCount,
}

option ModName.Difficulty
{
    type            = enum,
    numValues       = 3,
    default         = 1,
    page            = MyPage,
    translation     = ModName_Difficulty,
}
```

### Option Types

| Type | Additional Fields | Notes |
|------|-------------------|-------|
| `boolean` | none | true/false checkbox |
| `integer` | `min`, `max` | Slider or text field |
| `enum` | `numValues` | Dropdown; values indexed from 1 |
| `double` | `min`, `max` | Float slider |

### Accessing in Lua

```lua
local myBool    = SandboxVars.ModName.OptionName   -- boolean
local myInt     = SandboxVars.ModName.SpawnCount    -- number
local myEnum    = SandboxVars.ModName.Difficulty    -- number (1-based index)
```

### Translation File

Location: `media/lua/shared/Translate/EN/Sandbox_EN.txt`

```
Sandbox_ModName_OptionName         = "My Option Name",
Sandbox_ModName_OptionName_tooltip = "Description of what this option does.",
Sandbox_ModName_SpawnCount         = "Spawn Count",
Sandbox_MyPage                     = "My Mod Settings",
```

---

## Media Folder Reference

| Folder | Purpose | File Types |
|--------|---------|------------|
| `media/lua/shared/` | Shared Lua (server+client) | `.lua` |
| `media/lua/client/` | Client-only Lua | `.lua` |
| `media/lua/server/` | Server-only Lua | `.lua` |
| `media/scripts/` | Item/recipe/vehicle definitions | `.txt` |
| `media/textures/` | Textures and icons | `.png` |
| `media/models/` | Non-static / animation-text definitions only | (text) |
| `media/models_X/` | Static world / item 3D models (B42 canonical, verified `b42.world-model-dir-models-x`) | `.fbx`, `.x` |
| `media/sound/` | Audio files | `.wav`, `.ogg` |
| `media/AnimSets/` | Animation set XML files | `.xml` |
| `media/clothing/` | Clothing item XML files | `.xml` |
| `media/maps/` | Map tiles (TileZed output) | various |
| `media/radio/` | Radio script definitions | `.xml` |
| `media/registries.lua` | B42.13+ identifier registry | `.lua` |
| `media/sandbox-options.txt` | Custom sandbox options | `.txt` |

---

## Development Tools

**Required:**
- **Visual Studio Code** (recommended) with Lua extension for syntax highlighting and type hints
- **IntelliJ IDEA** — alternative, better for Java source browsing

**Optional:**
- **LuaLS** — Language server for Lua with PZ type stubs (see pzwiki.net/wiki/LuaLs)
- **TileZed** — Official map creation tool
- **WorldEd** — Official world editor
- **Blender** — 3D modeling and animation export

**Documentation:**
- pzwiki.net — Main modding wiki (may require VPN or cached access)
- https://demiurgequantified.github.io/ProjectZomboidLuaDocs/ — Unofficial Lua Docs (B42)
- https://projectzomboid.com/modding/ — Official JavaDocs (partial)

---

## Load Order and Mod Dependencies

- Dependencies are declared in `mod.info` with the `require=` field
- Required mods are loaded before the dependent mod
- Load order is generally: vanilla → dependencies → your mod
- In B42, the folder version (`42/` vs `common/`) is selected at game startup based on the running build

---

## Common Modding Pitfalls

1. **Missing comma** in script files — The trailing comma after the last key-value pair is mandatory
2. **Wrong Lua folder** — Files directly in `media/lua/` (not in `shared/`, `client/`, or `server/`) will not load
3. **Registries not used** — In B42.13+, new item tags, body locations, and fluids must go through `registries.lua`
4. **Timed actions not global** — Since B42.13.0, timed action classes must be stored in a global variable to work in multiplayer (see `B42_TimedAction_API.md`)
5. **Server ID backslash** — B42 server config requires a backslash before each Mod ID in the server config file

---

## See Also

- `B42_ModInfo_Format.md` — Complete mod.info and workshop.txt syntax
- `B42_Lua_Events_Official.md` — Full event list
- `B42_TimedAction_API.md` — ISBaseTimedAction API
- `B42_API_Changes_from_B41.md` — What changed vs B41
- `B42_ModData_SModData.md` — Multiplayer data persistence
