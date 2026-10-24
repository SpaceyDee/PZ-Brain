# WORKSHOP UPLOAD NOTES

How to package and publish a Project Zomboid mod to the Steam Workshop. B42-specific.

---

## Required Files

Every Workshop mod needs these files at minimum:

```
<WorkshopRoot>/
└── <ModFolder>/
    ├── workshop.txt          — Workshop metadata (title, description, tags, ID)
    ├── preview.png           — Thumbnail (320×320px recommended, square)
    └── Contents/mods/<ModId>/42/
        ├── mod.info          — Mod identity and metadata
        └── media/lua/        — Actual mod code
```

---

## workshop.txt Format

```
version=1
id=<SteamWorkshopFileId>
title=<Mod Title>
description=<Long description. Supports BBCode.>
tags=Build 42;Multiplayer;Quality of Life
visibility=public
```

**Critical rules:**
- `id=` is the Steam file ID assigned on first publish. **Never change it after publishing** — changing it orphans all subscribers.
- `visibility=` options: `public`, `friends`, `private`, `unlisted`
- Leave `id=` empty or omit before first publish. Steam assigns it.
- Tags must match Steam's accepted tag list for PZ. Common: `Build 42`, `Multiplayer`, `Singleplayer`, `Quality of Life`, `Survival`, `Crafting`, `UI`

---

## mod.info Format

```
name=Common Sense Reborn
id=CommonSenseReborn
description=Short description shown in-game mod list.
url=https://steamcommunity.com/sharedfiles/filedetails/?id=<workshopId>
modversion=1.8.19
pzversion=42.17
versionMin=42.0
```

**Critical rules:**
- `id=` is the in-game mod ID. **Never change this after first release** — it breaks save compatibility. All player saves that reference this mod use this string.
- `modversion=` is your mod version. Increment on every Workshop update.
- `pzversion=` is the PZ version you tested against. Update on each release.
- `versionMin=42.0` — required for B42 mods. Prevents B41 players from loading it.
- `name=` is display-only. Can change freely.

---

## Version Number Convention

Use `Major.Minor.Patch`:
- **Patch** — Bug fixes, minor text changes, no save format changes
- **Minor** — New features, backward-compatible changes
- **Major** — Breaking changes, save format migrations, major redesigns

Examples: `1.0.0` → `1.0.1` (bug fix) → `1.1.0` (new feature) → `2.0.0` (breaking change)

---

## BBCode for Workshop Description

Steam Workshop descriptions use BBCode:

```
[h1]Heading 1[/h1]
[h2]Heading 2[/h2]
[b]Bold[/b]
[i]Italic[/i]
[u]Underline[/u]
[strike]Strikethrough[/strike]
[url=https://example.com]Link text[/url]
[img]https://example.com/image.png[/img]
[list]
[*] Item one
[*] Item two
[/list]
[olist]
[*] Numbered one
[*] Numbered two
[/olist]
[code]lua code here[/code]
[quote]Quoted text[/quote]
[spoiler]Hidden until clicked[/spoiler]
[hr][/hr]   (horizontal rule)
```

---

## Publishing Steps (First Time)

1. Complete `mod.info` and `workshop.txt` (leave `id=` blank in `workshop.txt`)
2. Test in SP, hosted, and dedicated environments
3. Open PZ → Mods → select mod → "Upload to Workshop"
4. Steam assigns a Workshop file ID
5. Copy the assigned ID into `workshop.txt` `id=` field
6. Update `mod.info` `url=` with the Workshop page URL
7. Commit these values — they are permanent

---

## Publishing Steps (Update)

1. Increment `modversion=` in `mod.info`
2. Update `pzversion=` if PZ version changed
3. Write CHANGELOG entry
4. Update Workshop description if features changed
5. Open PZ → Mods → select mod → "Upload to Workshop"
6. Confirm the existing `id=` in `workshop.txt` is correct before uploading
7. Monitor for player feedback after publish

### Batch update with SteamCMD

For batch releases, prefer SteamCMD over manually clicking through PZ's in-game uploader for each mod. SteamCMD can upload Workshop items from one VDF file per mod.

```text
"workshopitem"
{
    "appid" "108600"
    "publishedfileid" "<workshop.txt id>"
    "contentfolder" "<Workshop>/<Mod Folder>/Contents/mods"
    "previewfile" "<Workshop>/<Mod Folder>/preview.png"
    "visibility" "0"
    "title" "<workshop.txt title>"
    "description" "<workshop.txt description>"
    "changenote" ""
}
```

Upload with:

```text
workshop_build_item <path-to-vdf>
```

Use `publishedfileid = 0` only for first-time publication. Existing live items must use the current Workshop ID from `workshop.txt`.

---

## Timing Considerations

- Do not push Workshop updates while players are mid-session on a server running your mod
- Version mismatch between server and client can cause: command handler mismatches, item ID conflicts, save format errors
- Coordinate with server operators before releasing breaking changes
- For breaking changes: announce in advance, give server ops time to schedule restarts

---

## Save Compatibility

When a Workshop update changes any of these, it is a **breaking change**:
- `mod.info` `id=` field (never change this)
- Any ModData key name stored to GlobalModData
- Any command string used in `sendClientCommand` / `sendServerCommand`
- Any item ID referenced in saves
- Any ModData table structure that old saves may contain

**Mitigation:**
```lua
-- In OnInitGlobalModData:
local store = ModData.getOrCreate("MyMod")
if not store.version or store.version < 2 then
    -- migrate old data
    store.players = store.players or {}
    store.version = 2
end
```

---

## Workshop ID vs Mod ID

| Field | Where | Can change? | If you change it |
|---|---|---|---|
| `id=` in `workshop.txt` | Workshop metadata | Never | Orphans all subscribers; creates duplicate mod entry |
| `id=` in `mod.info` | In-game mod identity | Never | Breaks all saves that used the old ID |
| `name=` in `mod.info` | Display name | Yes | Fine — display only |
| `modversion=` | Version tracking | Every release | Fine — expected |

---

## preview.png Requirements

- Square aspect ratio (Steam crops non-square)
- 320×320px minimum; 512×512px recommended
- PNG or JPG
- Shows in the in-game mod list and Workshop page
- Can be updated at any time without breaking compatibility

---

## Common Workshop Mistakes

| Mistake | Consequence |
|---|---|
| Changing `id=` in `mod.info` | All existing saves break; players get "missing mod" errors |
| Changing `id=` in `workshop.txt` | Creates a new Workshop entry; old subscribers stay on old version |
| Forgetting `versionMin=42.0` | B41 players load a B42 mod and get errors |
| Not incrementing `modversion=` | Version tracking is useless; players can't tell if they have latest |
| Publishing mid-server-session | Live servers get version mismatch; commands may fail silently |
| Removing a ModData key without migration | Old saves nil-access the removed key; errors or silent broken state |
| Pushing breaking changes without announcement | Server operators get blindsided; their players get a broken experience |

---

## Rollback Plan

If a bad update is pushed:
1. Revert code to last known good state
2. Increment `modversion=` again (do not reuse old version number)
3. Push immediately
4. Note in CHANGELOG: "v1.x.x — Hotfix: reverts broken change from v1.x.x-1"
5. Contact affected server operators directly if possible

Do not delete and re-upload the Workshop item — this changes the Workshop ID and orphans all subscribers.
