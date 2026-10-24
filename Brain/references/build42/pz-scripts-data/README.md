# PZ Scripts Data Ingest

Source: https://github.com/PZ-Wiki-Modding/pz-scripts-data

Ingested from local review clone commit:

- `1ed14a7c7715a9aee35efa685373384b88d5a63c`
- `2026-05-20 23:27:03 +0000`
- `CHORE: format scriptBlocks.json`

This dataset provides structured metadata for Project Zomboid script blocks and parameters. It is useful for validating and looking up script formats such as `item`, `craftRecipe`, `fluid`, `entity`, `vehicle`, `mod.info`, and `sandbox-options.txt`.

Files:

- `scriptBlocks.json` - generated all-in-one script block dataset.
- `LICENSE` - upstream license text.

Use this as the canonical Brain source for script block and parameter schema lookups. It does not replace a vanilla game content index: it describes valid script structure, but it does not prove that a specific vanilla item, sound, sprite, fluid, or recipe ID exists in the installed game.
