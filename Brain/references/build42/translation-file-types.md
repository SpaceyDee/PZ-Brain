# Translation File Types (B42)

Reference for all translation file types — what each file is for, the `getText` function that reads it, key prefix requirements, and key pattern.

Sources: https://pz-wiki-modding.github.io/PZ-API-Docs/translations/translation_files.html + scriptBlocks.json ingestion (2026-05-22)

## Script Block → Translation File Mapping

| Script block / parameter | Translation file | Key format |
|---|---|---|
| `item` block ID | `ItemName.json` | `Module.ItemId` (e.g. `Base.Crowbar`) |
| `craftRecipe` block ID | `Recipes.json` | `RecipeId` — NO module prefix |
| `fluid` block `DisplayName` | `Fluids.json` | Convention: `Fluid_Name_<FluidId>` |
| `vehicle` block `carModelName` | `IG_UI.json` | `IGUI_VehicleName<Value>` |
| `sandbox-options.txt` `option.translation` | `Sandbox.json` (under `common/`) | `Sandbox_<PageName>_<OptionName>` — engine prepends `Sandbox_`; do NOT include it in `translation` field |
| `character_profession_definition` `UIName` | `UI.json` | `UI_prof_<id>` |
| `character_profession_definition` `UIDescription` | `UI.json` | `UI_profdesc_<id>` |
| Context menu labels (Lua `getText`) | `ContextMenu.json` | `ContextMenu_<ModPrefix>_<Action>` |
| Tooltip labels (Lua `getText`) | `Tooltip.json` | `Tooltip_<ModPrefix>_<Thing>` |

Translation files live at `media/lua/shared/Translate/<lang>/` (or `common/media/lua/shared/Translate/<lang>/` for Sandbox translations in the BB Common Sense suite). Files use JSON format in B42.

---

## File Type Reference

| File Name | `getText` Function | Key Prefix | Key Pattern |
|---|---|---|---|
| `Attributes` | `getText` | — | `^Attributes_Type_[A-Za-z_]+$`, `^Attributes_TooltipOverride_[A-Za-z_]+$` |
| `BodyParts` | `getText` | — | `^BODYPART_[A-Z_]+$` |
| `Challenge` | `getText` | `Challenge_` | `^Challenge_[A-Za-z0-9\s]+(_[A-Za-z0-9]+\|InfoBox)$` |
| `ContextMenu` | `getText` | `ContextMenu_` | `^ContextMenu_[A-Za-z0-9_]+$` |
| `DynamicRadio` | `getRadioText` | `AEBS_` | `^AEBS_[A-Za-z0-9_]+$` |
| `Entity` | `getText` | `EC_` | `^EC_[A-Za-z_]+$` |
| `EvolvedRecipeName` | `Translator.getItemEvolvedRecipeName` | — | `^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$` |
| `Farming` | `getText` | `Farming_` | `^Farming_[A-Za-z0-9_\s-]+$` |
| `Fluids` | `getText` | — | (fluid IDs) |
| `IGUI` | `getText` | `IGUI_` | `^IGUI_[A-Za-z0-9_]+$` |
| `ItemName` | `getItemNameFromFullType` | — | `^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$` (module.id format) |
| `Moodles` | `getText` | — | moodle IDs |
| `Recipes` | `getRecipeDisplayName` | — | `^[A-Za-z0-9_\(\): -]+$` (just the recipe ID, no module) |
| `Recorded_Media` | `getText` | — | GUIDs |
| `Sandbox` | Java sandbox system | `Sandbox_` | See Sandbox Options section |
| `Tooltip` | `getText` | `Tooltip_` | `^Tooltip_[A-Za-z0-9_]+$` |
| `UI` | `getText` | `UI_` | `^UI_[A-Za-z0-9_]+$` |

---

## Key Rules Per Type

### ItemName
- Key = full item type: `module.id` — e.g., `Base.Crowbar`
- Read by `getItemNameFromFullType("Base.Crowbar")`
- Used for item display names everywhere in the game

### Recipes
- Key = craftRecipe ID only — **no module prefix**
- e.g., craftRecipe `SawLogs` → key is `SawLogs`, not `Base.SawLogs`
- Read by `getRecipeDisplayName("SawLogs")`

### ContextMenu
- Key prefix: `ContextMenu_`
- e.g., `ContextMenu_MyMod_PryDoor = "Pry Open Door",`
- Read by `getText("ContextMenu_MyMod_PryDoor")`
- Must route through the mod's `tr()` helper to avoid raw-key leaks on outdated Workshop builds

### Tooltip
- Key prefix: `Tooltip_`
- e.g., `Tooltip_MyMod_PryDoor = "Attempts to force the door open.",`

### IGUI
- Key prefix: `IGUI_`
- General in-game UI strings

### Sandbox
- Handled Java-side. File is `Sandbox.json` placed at `common/media/lua/shared/Translate/EN/`
- Keys: `Sandbox_<PageName>` (page label), `Sandbox_<PageName>_tooltip`, `Sandbox_<PageName>_<OptionName>`, `Sandbox_<PageName>_<OptionName>_tooltip`
- Page name must be PascalCase, no underscores between words (see CLAUDE.md pitfall #48)

---

## JSON Format

All B42 translation files use JSON (no Lua table wrapper, no `_EN` suffix on the file):

```json
{
    "ContextMenu_MyMod_DoThing": "Do The Thing",
    "ContextMenu_MyMod_DoThing_tooltip": "Performs the thing on the selected object.",
    "Tooltip_MyMod_Result": "Result of the operation."
}
```

Translation `.txt` (legacy Lua format) is still accepted but JSON is preferred in B42. Non-EN files follow the same format but with the language code in the folder name: `Translate/FR/ContextMenu_FR.txt`.

---

## Auto-Discovery

Only one prefix is genuinely auto-discovered (iterated by the engine without being named explicitly):

- `UI_quick_tip_*` — loading-screen tips
- `UI_quick_tip_joke_*` — joke tips (shown based on lore setting)

All other prefixes (`ContextMenu_`, `Recipes`, `ItemName`, etc.) are **keyed lookups** — the engine calls `getText(prefix .. externalName)` where `externalName` comes from item scripts, recipe IDs, etc. Adding extra keys does nothing unless the corresponding data object exists.

See `references/build42/translation-auto-discovery.md` for the full analysis.
