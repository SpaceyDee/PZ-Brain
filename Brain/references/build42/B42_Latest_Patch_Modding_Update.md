# PZ Build 42 Latest Patch - Modding Compatibility Notes

Source: user-provided official patch description, recorded 2026-05-11. Treat entries here as patch-note confirmed until bytecode/source extraction refreshes this Brain.

## New / Changed Modding APIs

| Area | Change | Mod impact |
|---|---|---|
| Craft recipes | Non-base Module Recipes now work in MP. | Do not reject non-`Base` module recipes as MP-unsafe by default. Existing workarounds may be removable after testing. |
| Craft recipes | Missing recipe item crash fixed. | Still validate recipe inputs, but this is less likely to be an engine crash path. |
| Craft history | Cleanup improved. | Long-running craft history assumptions should be retested rather than worked around blindly. |
| `CraftRecipe` | Added `getModTags()` and `setTags()`. | Prefer these for mod-owned recipe tags instead of ad hoc fields. Nil-check method availability if supporting older B42 builds. |
| `InputScript` | Added `getItems()`. | Recipe/input introspection can inspect source items directly. Nil-check for older builds. |
| File writers | Incorrect writer initialization now returns nil/null. | Always guard `getFileWriter` / `getModFileWriter` before `:write()` or `:close()`. |
| Item tags | Restored `FITS_CLOTHING_RACK`. | Clothing rack compatibility can use this tag again. |
| Factions | Added `SyncFactionServer(factionName, isRemove)`. | Server-side faction change listeners can hook this for rename/remove/sync work. |
| Trait scripts | Added `Texture` field. | Custom traits can declare a texture path in script rather than relying only on code-side icon wiring. |
| Foraging | Mod foraging icon bug fixed; mod items can be collected by foraging. | Re-test modded foraging definitions and remove icon workaround code if it conflicts. |
| `IsoZombie` speed | Added `doCrawlerSpeed(zombieSpeed)`, `doSprinter()`, `doFastShambler()`, `doFakeShambler()`, `doShambler()`, `getSpeedType()`. | Use public zombie speed methods where available instead of private state pokes. |

## Server / MP Compatibility Flags

| Old assumption | Latest patch behavior | MCP audit action |
|---|---|---|
| `DisableSafehouseWhenPlayerConnected` | Renamed to `DisableSafehouseWhenOwnerConnected`. | Runtime audit warns on the old option string. |
| `AutoCreateUserInWhiteList` | Removed after a security issue. | Runtime audit blocks release if generated configs still include it. |
| Fire/Smoke anti-cheats | Redundant anti-cheats removed. | Log analyzer marks stale references as low-severity cleanup. |
| XP/XPPlayer anti-cheats and unused AddXP packet | Removed. | Log analyzer marks stale references as low-severity cleanup. |

## Development Rules Added To The Brain

- File-writer helper templates must include `if not writer then return end`.
- `space_lookup_method` should know the new CraftRecipe, InputScript, faction, trait, item-tag, foraging, and IsoZombie speed APIs.
- Production gates should catch stale server option names in `.ini`, `.cfg`, `.lua`, `.md`, and other text files.
- Log analysis should distinguish recent engine MP exception signatures from mod-owned Lua stack frames.
