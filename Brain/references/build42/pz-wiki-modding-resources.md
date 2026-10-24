# PZ Wiki Modding — External Resources

Authoritative external references maintained by the PZ-Wiki-Modding org. Prefer these over guessing — they track B42 changes.

## PZ-API-Docs

- **Live docs site:** https://pz-wiki-modding.github.io/PZ-API-Docs/index.html
- **Repo:** https://github.com/PZ-Wiki-Modding/PZ-API-Docs

Compiles structured documentation from the game's Java, Lua, script, and translation data sources. Covers every script block (item, craftRecipe, entity, vehicle, fixing, fluid, sandbox-options, mod.info, and ~80 others) with parameter types, defaults, constraints, and hierarchy rules.

**Use it for:**
- Complete parameter list for any script block
- Valid parent/child block hierarchies
- Parameter type constraints and dependency rules (`Needs:` field)
- Translation file format per block type

### Also linked from PZ-API-Docs

| Resource | URL |
|---|---|
| Unofficial B42 JavaDocs | https://demiurgequantified.github.io/ProjectZomboidJavaDocs/ |
| Unofficial LuaDocs | https://demiurgequantified.github.io/ProjectZomboidLuaDocs/ |
| pz-scripts-data (raw JSON) | https://github.com/PZ-Wiki-Modding/pz-scripts-data |
| pz-translation-data | https://github.com/PZ-Wiki-Modding/pz-translation-data |

The JavaDocs are the canonical reference for Java class method signatures (CraftRecipeData, IsoPlayer, HandWeapon, etc.) when the Lua binding alone is ambiguous.

## ZedScripts — VS Code Extension (B42)

- **Repo:** https://github.com/PZ-Wiki-Modding/ZedScripts
- **Install:** VS Code Marketplace — search "ZedScripts"

B42-specific VS Code extension for `.txt` script files. Features:

- **Syntax highlighting** for ZedScript blocks (item, craftRecipe, vehicle, entity, etc.)
- **Diagnostics** — flags unknown parameters, wrong types, missing required params, missing commas, unmatched braces, deprecated params, wrong parent blocks, missing IDs
- **Auto-completion** — auto-inserts mandatory parameters and child blocks
- **Hover tooltips** — parameter descriptions inline
- **Auto-formatting** — consistent style on save
- **Live data** — fetches latest `scriptBlocks.json` from pz-scripts-data every 12 hrs (manual: `ZedScripts: Force fetch Scripts Data` in Command Palette)

**Usage:** Open a `.txt` script file → Ctrl+Shift+P → Change Language Mode → "ZedScripts"

**Settings:**
- PZ scripts directory defaults to `<local-path> Files (x86)\Steam\steamapps\common\ProjectZomboid\media\scripts`
- Disable specific diagnostics via `zedScripts.disabledDiagnostics` (list of diagnostic IDs)
- `zedScripts.disableAllDiagnostics = true` to suppress all

### Key Diagnostic IDs

| ID | What it catches |
|---|---|
| `MISSING_COMMA` | Missing trailing comma on a parameter line |
| `UNKNOWN_PARAMETER` | Parameter not recognized for that block type |
| `MISSING_PARAMETER` | Required parameter absent |
| `DUPLICATE_PARAMETER` | Same parameter defined twice |
| `WRONG_PARENT_BLOCK` | Block used inside an invalid parent |
| `DEPRECATED_PARAMETER` | B41-era parameter that no longer works |
| `INVALID_BLOCK_REF` | Referenced item/block ID doesn't exist |
| `MISSING_MODULE` | Item type missing `module.id` format |
| `NO_DOTS_ITEM` | Item ID contains a dot (invalid) |
