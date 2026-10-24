# Vanilla translation-key auto-discovery

Build 42.15. Question: which vanilla systems iterate translation keys by prefix (so any matching key is picked up automatically), vs. which look up keys by names that come from elsewhere (script files, data objects, hardcoded Lua lists)?

Only the first kind is a free injection point for mods.

## Method recap

1. `zombie.core.Translator` partitions JSON files into per-prefix Java maps in `loadFiles()` (`ui`, `igui`, `survivorNames`, `mapLabel`, `sandbox`, ...). The dispatch table lives in `getTextInternal` (bytecode PC 12-630).
2. Only `Map<String,String> Translator.getUI()` is exposed publicly. The others (`igui`, `sandbox`, `mapLabel`, `survivorNames`, ...) have no Java getter and no Lua iteration path.
3. Brute-force scan of every class in `projectzomboid.jar` for callers of `Translator.getUI` and for `Map.entrySet`/`keySet` walks against Translator fields:

   ```
   grep -rl 'Translator' --include='*.class' zombie/ \
     | xargs -I{} sh -c 'javap -p -c "{}" 2>/dev/null \
                         | grep -lE "Translator\.(getUI|entrySet)" >/dev/null \
                         && echo "{}"'
   -> zombie/gameStates/GameLoadingState.class    (only hit)
   ```

That's the only class. `loadQuickTipList()` is the only true prefix-iterator in vanilla.

## Confirmed auto-discovery prefixes

| Prefix              | Discovered by (class.method)                        | Keys file                | What the keys do                                    | Inject example |
|---------------------|------------------------------------------------------|--------------------------|-----------------------------------------------------|----------------|
| `UI_quick_tip_*`    | `zombie.gameStates.GameLoadingState.loadQuickTipList` (PC 0-128, iterates `Translator.getUI().entrySet()`, `key.startsWith("UI_quick_tip")`) | `media/lua/shared/Translate/<lang>/UI.json` | Strings shown on the loading screen between progress frames. | Add `"UI_quick_tip_MyMod_01": "Tip text"` to your mod's `media/lua/shared/Translate/EN/UI_<MyMod>.txt` (PZ-format) or to `UI.json`. Loaded the next time `Translator.loadFiles()` runs (game launch). |
| `UI_quick_tip_joke_*` | same method, `key.startsWith("UI_quick_tip_joke")` checked first (PC 66-93). | same | Joke-tier tips, separate `quickTipsListJoke` list shown only when sandbox lore allows. | `"UI_quick_tip_joke_MyMod_01": "Joke text"`. |

That is the entire list of vanilla prefix-iterating discovery sites.

## Suspected prefixes that do NOT auto-discover

Each of these is **keyed lookup** (`getText(prefix..name)`), where `name` comes from outside the translation file. Mods extend them by adding the underlying data object, not by adding translation keys.

| Prefix                | What actually drives the lookup |
|-----------------------|---------------------------------|
| `IGUI_*`              | Hardcoded `getText("IGUI_Foo")` calls in Lua/Java. Adding extra `IGUI_*` keys does nothing unless code looks them up by name. |
| `UI_credits_*`        | `CreditsScreen.lua` iterates `Role` objects (Java-side data); calls `getText(role:getTitle())` per role. Roles are added by `CreditsScreen` data, not by adding translation keys. |
| `UI_intro_*`          | No vanilla keys with this prefix exist. No discovery. |
| `Survival_*`          | No vanilla prefix. `SurvivalGuide_*` keys exist but `SurvivalGuide.lua` looks them up by topic name from `SurvivalGuide` data tables. |
| `SurvivorName_*` / `SurvivorSurname_*` | `SurvivorFactory.MaleForenames/FemaleForenames/Surnames` are `ArrayList`s populated by explicit `SurvivorFactory.addMaleForename("Kate")` calls in `media/lua/shared/NPCs/MainCreationMethods.lua`. The translation key is fetched only after the name is added. Adding `SurvivorName_Foo` to the JSON without `SurvivorFactory.addMaleForename("Foo")` is dead text. |
| `MapLabel_*`          | Looked up by world map / minimap code with the label string from map metadata. Adding a key without the corresponding map data does nothing. |
| `Sandbox_*`           | `SandboxOptions.lua` iterates `getSandboxOptions():getOptions()` (Java options registry) and calls `getText("Sandbox_"..name)` per registered option. Adding `Sandbox_*` keys without registering a sandbox option is dead text. |
| `Tooltip_*` / `ContextMenu_*` / `Recipe_*` / `RM_*` / `RD_*` / `EC_*` / `Print_Media_*` / `Print_Text_*` / `Attributes_*` / `Fluid_*` / `BODYPART_*` / `Moodles_*` / `GameSound_*` / `Stash_*` / `MakeUp*` / `Farming_*` / `Challenge_*` / `credits_*` | Same pattern: `getText(prefix..externalName)`. External name comes from item scripts, recipe IDs, moodle IDs, sandbox option IDs, etc. No prefix iteration. |

## Injection example (the only one that works)

Add a file `media/lua/shared/Translate/EN/UI_<ModName>.txt` (PZ legacy format) or extend `UI.json`:

```json
{
    "UI_quick_tip_MyMod_loaded": "MyMod is now active.",
    "UI_quick_tip_MyMod_dontPanic": "Press F11 for help.",
    "UI_quick_tip_joke_MyMod_punchline": "Why did the zombie cross the road..."
}
```

These appear in the loading-screen tip rotation automatically. `Translator.loadFiles()` is invoked once at game start; no runtime injection.

## Open unknowns

- B42MP.jar was not scanned exhaustively for additional iterators. Brute-force grep on the same pattern in MP-only classes was not run; high confidence nothing else iterates `Translator.getUI()` because the field is private and only one public getter exists, but other map fields (e.g. `igui`, `sandbox`) could in principle be iterated by reflection from a class that doesn't textually contain `Translator.getUI`. Not seen in any grep, but cannot rule out absolutely.
- Mod-loaded `Translate/<lang>/*.txt` files: `Translator.readModTranslation(ChooseGameInfo$Mod)` runs per-mod; same dispatch rules apply, so the same single prefix iterator applies to mod-shipped keys too.
