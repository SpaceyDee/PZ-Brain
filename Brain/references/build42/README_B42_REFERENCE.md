# B42 Modding Reference Database — Common Sense Reborn

## What This Is
An internal research and reference database built specifically for the Common Sense Reborn (CSR) mod.
It catalogs Build 42 methods, patterns, hooks, and structures from both this project and 45+ external workshop mods.

Future agents working on this mod should consult this database **before** making any changes.

## How It Is Organized

| File | Purpose | Use When... |
|------|---------|-------------|
| `CURRENT_PROJECT_PROFILE.md` | Overview of CSR structure, systems, and risk areas | Starting work on the mod for the first time |
| `B42_Method_Database.md` | Human-readable method/pattern reference | Looking up how a specific B42 API works |
| `B42_Method_Database.json` | Machine-readable structured database | Programmatic lookup of methods/patterns |
| `B42_Latest_Patch_Modding_Update.md` | Latest patch compatibility notes recorded 2026-05-11 | New APIs, renamed server options, removed settings, and MCP audit implications |
| `B42_Patterns_and_Common_Practices.md` | Deep analysis of recurring patterns | Deciding how to implement something |
| `B42_Current_Project_vs_Reference.md` | CSR vs proven mod comparison | Debugging why something isn't working |
| `B42_High_Value_Methods.md` | Curated shortlist of critical B42 APIs | Quick reference during active coding |
| `B42_Suspected_Outdated_or_Risky_Patterns.md` | Known risk areas in CSR | Investigating instability or bugs |
| `B42_Mod_Index.csv` | All reference mods cataloged | Finding examples of specific patterns |

## Where To Look First

1. **Quick help while coding:** `B42_High_Value_Methods.md`
2. **Something is broken:** `B42_Suspected_Outdated_or_Risky_Patterns.md`
3. **How should I implement X?** `B42_Patterns_and_Common_Practices.md`
4. **What does CSR already do?** `CURRENT_PROJECT_PROFILE.md`
5. **How do other mods handle Y?** `B42_Mod_Index.csv` → then read the mod source

## Key Rules for This Project

From `/memories/repo/pz-kahlua-rules.md`:
- **NEVER** use `require` inside function bodies (corrupts Kahlua VM)
- **ALWAYS** defer monkey-patches to `Events.OnGameStart.Add`
- **ALWAYS** use guard flags (`__csr_*_patched`) to prevent double-patching
- **NEVER** use `pcall(require, ...)` at runtime during gameplay
- Use `ISInventoryPaneContextMenu.transferIfNeeded()` for item transfers, NOT manual `ISInventoryTransferAction:new()`
- pcall CANNOT catch Java NPEs — guard with `if not isServer()` or existence checks

## Data Sources

- **Current project:** 64 Lua files in `CommonSenseReborn/42/media/lua/`
- **External mods:** 124 mods from `<local-path>`
- **Analysis date:** April 2026
- **PZ Build target:** Build 42 (42.0 through 42.15+)
