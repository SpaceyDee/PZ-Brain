# B42 mod.info and workshop.txt Format

**Source(s):**
- https://pzwiki.net/wiki/Mod.info (403 at research time — content from search snippets)
- https://pzwiki.net/wiki/Mod_structure
- https://github.com/LabX1/ProjectZomboid-Build42-ModTemplate
- https://github.com/FWolfe/Zomboid-Modding-Guide/blob/master/structure/README.md
- https://steamcommunity.com/sharedfiles/filedetails/?id=3391657438

> **Note:** pzwiki.net returned HTTP 403 for all direct fetches. Content reconstructed from community resources. Verify against the live wiki when accessible.

---

## mod.info — Overview

Every mod needs a `mod.info` file to be recognized by the game. In B42 a mod
needs **two** copies of it:

```
Contents/mods/<ModId>/
├── mod.info          ← ROOT copy — REQUIRED for the game to discover the mod
└── 42/
    └── mod.info      ← version copy — B42 content/metadata
```

> **Verified live (B42.18, BiteMe pz-test, 2026-05-15):** a mod shipped with only
> `42/mod.info` and no root `mod.info` is **not discovered** by the dedicated
> server — it never enters the load list. Adding the root `mod.info` (identical
> content is fine) fixed it immediately, and every working Workshop mod inspected
> on the live server ships both. Never ship a mod with only the `42/` copy.

If you support both B41 and B42, the version subfolders are separate:
```
Contents/mods/<ModId>/
├── mod.info          ← root
├── 42/
│   └── mod.info
└── 41/
    └── mod.info
```

---

## mod.info Fields

### Required Fields

| Field | Description | Example |
|-------|-------------|---------|
| `name` | Display name shown in the mod manager | `name=My Amazing Mod` |
| `id` | Unique mod identifier (no spaces; used in `require=`) | `id=MyAmazingModID` |
| `description` | Short description displayed in mod list | `description=Adds useful features` |

### Recommended Fields

| Field | Description | Example |
|-------|-------------|---------|
| `poster` | Filename of the preview image (shown in mod list) | `poster=poster.png` |
| `author` | Author name(s) | `author=YourName` |

### Optional Fields

| Field | Description | Example |
|-------|-------------|---------|
| `icon` | Mod icon filename (small icon in list) | `icon=icon.png` |
| `url` | URL to forums, workshop, or website | `url=https://theindiestone.com/forums/` |
| `require` | Comma-separated list of mod IDs that must load first | `require=OtherModID,AnotherModID` |
| `versionMin` | Minimum game version this mod supports | `versionMin=42.0` |
| `versionMax` | Maximum game version this mod supports | `versionMax=42.99` |

---

## Complete mod.info Example

```
name=My Amazing Mod
id=MyAmazingModID
author=YourName
description=This mod adds amazing features to Project Zomboid.
poster=poster.png
icon=icon.png
url=https://steamcommunity.com/sharedfiles/filedetails/?id=XXXXXXXXX
require=OtherModID
```

**Important notes:**
- No quotes around values
- No semicolons or commas between fields
- Field names are case-sensitive (lowercase)
- The `id` field is what you use in `require=` lists and server config

---

## ⚠ Verified gotchas (observed live in PZ B42.17)

These broke the Natural Disasters mod on first launch. Codified here so they never recur.

1. **`author=` is singular, NOT `authors=`.** The wiki snippet in some places shows `authors` — it's wrong for B42. With `authors=` the in-game mod-list Author column renders empty. All working mods in this workshop use `author=`.

2. **Never write `require=` with an empty value.** PZ parses `require=` (blank) as "this mod requires a mod whose ID is the empty string" and marks it as an unsatisfied dependency — a red dot appears next to "Dependencies" in the in-game mod info, and the mod will not enable. **Omit the entire line if there's no dependency.** Same rule for `loadModBefore=` / `loadModAfter=` / `pack=` / `url=` / `icon=` / `modversion=` — never leave them empty; omit them.

3. **`versionMin`: bare `versionMin=42` is INVALID.** It throws `ERROR: ... ChooseGameInfo.readModInfoAux > invalid versionMin: invalid game version "42"` at server load (verified B42.18 — `FadedPapaChadVehicleSafety` hits this). Valid forms, all verified loading fine on the live server: `versionMin=42.0` (2-segment, the local convention), `versionMin=42.0.0` / `42.13.0` (3-segment — also fine, contrary to earlier notes here), or **omitting the field entirely** (most Workshop mods do). Only the 1-segment bare `42` is rejected. The non-fatal error is logged once and the mod still loads, but fix it anyway.

4. **Field-order matters for tooling, not the engine.** Convention here (verified pattern) is:
   ```
   id=<ModId>
   name=<Display Name>
   description=<one-line description>
   author=Mr Space Cadet
   poster=poster.png
   versionMin=42.0
   ```
   Six lines. Add `require=<OtherModId>` only if a hard dependency actually exists.

5. **Not discovered / disabled / unselectable** is almost always one of: **missing root `mod.info`** (mod never appears at all — see Overview), an empty `require=` line, malformed `versionMin` (bare `42`), or `authors=` instead of `author=`. A missing `poster.png` does **not** stop a mod loading or functioning (verified B42.18 — the BB Common Sense suite loads server-side with no poster); it only affects the in-game mod-screen image and Workshop submission.

---

## poster.png Requirements

- Recommended size: **512x512** pixels (or 256x256 for icon)
- Must be PNG format
- Referenced by filename in `poster=` field
- Must be in the same folder as `mod.info` (i.e., inside `42/`)

---

## workshop.txt — Steam Workshop Integration

For mods published to the Steam Workshop, place a `workshop.txt` in the **root** of your mod folder (outside `Contents/`):

```
YourMod/
├── Contents/
│   └── mods/
│       └── <ModId>/
│           ├── mod.info        ← root mod.info (REQUIRED — see Overview)
│           └── 42/
│               └── mod.info
└── workshop.txt      ← Here
```

### workshop.txt Fields

```
version=1
id=YOUR_STEAM_WORKSHOP_ID
title=My Amazing Mod
description=This mod adds amazing features to Project Zomboid.
visibility=public
tags=Build 42;Gameplay;Items
```

### visibility values
- `public` — Visible to all
- `friends` — Visible to friends only
- `private` — Only you can see it

### tags
Common tags used on the Workshop:
`Build 42`, `Build 41`, `Gameplay`, `Items`, `Maps`, `Weapons`, `Clothing`, `Cheats`, `Framework`, `Interface`, `Multiplayer`, `Realistic`

---

## Server Config — Loading Mods

In `servertest.ini`:
```ini
Mods=MyAmazingModID;OtherModID
WorkshopItems=STEAMWORKSHOPID1;STEAMWORKSHOPID2
```

> **Correction (verified B42.18, BiteMe pz-test, 2026-05-15):** earlier notes here
> claimed a `\` backslash prefix was required before each Mod ID
> (`Mods=\MyModID`). That is **not** true on B42.18 — the live `servertest.ini`
> lists ~80 mods with no backslashes and every one loads, and mods added without a
> backslash (the BB Common Sense suite) loaded fine. Do **not** add backslash
> prefixes.

- `Mods=` uses Mod IDs (the `id=` field from `mod.info`), `;`-separated.
- `WorkshopItems=` uses numeric Steam Workshop IDs.
- A Workshop ID may stay in `WorkshopItems=` without its Mod ID being in `Mods=` —
  the files stay downloaded but the mod does not load. Harmless.
- Non-Workshop / locally-installed mods need no `WorkshopItems=` entry at all;
  they just need to be present in the server's mods folder and listed in `Mods=`.

---

## Mod ID vs Workshop ID

| Concept | Source | Example |
|---------|--------|---------|
| **Mod ID** | Defined in `mod.info` → `id=` field | `MyAmazingModID` |
| **Workshop ID** | Assigned by Steam after publishing | `3386860561` (a number) |

These are two different things. Server config needs both:
- `Mods=` uses the Mod ID from `mod.info`
- `WorkshopItems=` uses the numeric Steam Workshop ID

---

## B42 vs B41 mod.info Differences

| Aspect | Build 41 | Build 42 |
|--------|----------|----------|
| File location | Mod root `/mod.info` | Version folder `/42/mod.info` |
| Folder structure | Flat (no version subdirs) | Versioned (`42/`, `41/`, `common/`) |
| Server backslash | Not required | Required before mod IDs in server.ini |
| `require=` format | Same | Same |

---

## See Also

- `B42_Official_Modding_Guide.md` — Full folder structure and Lua load order
- `B42_API_Changes_from_B41.md` — All B42 API and structural changes
