# Build 42 — `sandbox-options.txt` schema

Verified against working workshop mods (`AICompanion`, `HavenEconomy`, `BitemeModSuite`). The PZ parser is **strict**: one malformed option silently rejects the entire file and the mod's whole sandbox page disappears from the in-game Sandbox Options screen.

---

## File location

```
<ModRoot>/Contents/mods/<ModId>/42/media/sandbox-options.txt
```

Translation file lives next door:

```
<ModRoot>/Contents/mods/<ModId>/42/media/lua/shared/Translate/EN/Sandbox_EN.txt
```

---

## Minimal valid file

```
VERSION = 1,

option <ModId>.<OptionName>
{
    type = boolean, default = true,
    page = <ModId>,
    translation = <ModId>_<OptionName>,
}
```

Required: header `VERSION = 1,`, every option block ends with a comma after `translation = …,`.

---

## Supported types (verified)

| `type` | Constraints | Example one-liner |
|---|---|---|
| `boolean` | `default = true \| false` | `type = boolean, default = true,` |
| `integer` | `min`, `max`, `default` (all integers) | `type = integer, min = 0, max = 100, default = 10,` |
| `double` | `min`, `max`, `default` (all numeric) | `type = double, min = 0.1, max = 5.0, default = 1.0,` |

**Do NOT use:** `enum` / `string` / `choice` / `list` / `dropdown` — none are present in any verified workshop mod. The wiki shows `enum` syntax (`type = enum, numValues = 3, valueTranslation = ...`) but using it has been observed to silently reject the entire file. **For enum-like choices, use `integer` with a `min`/`max` range and document the meaning in the translation tooltip** (e.g. "1 = mild, 2 = moderate, 3 = severe").

---

## ⚠ Translation file table-name rules (workshop convention)

The filename and the **table identifier inside the file** are NOT the same.

| File | Table name inside |
|---|---|
| `Sandbox_EN.txt` | `Sandbox_EN = { ... }` |
| `IG_UI_EN.txt` | `IGUI_EN = { ... }` — **underscore between IG and UI dropped** |
| `UI_EN.txt` | `UI_EN = { ... }` |
| `ItemName_EN.txt` | `ItemName_EN = { ... }` |
| `Tooltip_EN.txt` | `Tooltip_EN = { ... }` |

Wrong table name → file is loaded but its contents go into an unreferenced global → `getText(key)` misses every lookup and the raw key is rendered on screen.

**`getText` returns the key string itself on miss, not `nil`.** Always guard:

```lua
local function tryText(key, fallback)
    if not key or not getText then return fallback or "" end
    local v = getText(key)
    if not v or v == key then return fallback or "" end
    return v
end
```

Use `tryText(...)` instead of bare `getText(...)` anywhere a UI element renders the result.

---

## Translation key conventions

Every option needs a label and may optionally have a tooltip. The page itself also needs a label.

| Code reference | Translation key |
|---|---|
| `page = MyMod,` | `Sandbox_MyMod` |
| `translation = MyMod_FooOption,` | `Sandbox_MyMod_FooOption` |
| (optional tooltip) | `Sandbox_MyMod_FooOption_tooltip` |

```
-- Sandbox_EN.txt
Sandbox_EN = {
    Sandbox_MyMod = "My Mod",                                       -- page title
    Sandbox_MyMod_FooOption = "Foo option label",
    Sandbox_MyMod_FooOption_tooltip = "Hovering text explaining the option.",
}
```

---

## Canonical full example (verified-working)

```
VERSION = 1,

option NaturalDisasters.EnableEarthquakes
{
    type = boolean, default = true,
    page = NaturalDisasters,
    translation = NaturalDisasters_EnableEarthquakes,
}

option NaturalDisasters.Severity
{
    type = integer, min = 1, max = 3, default = 2,
    page = NaturalDisasters,
    translation = NaturalDisasters_Severity,
}

option NaturalDisasters.YieldMultiplier
{
    type = double, min = 0.1, max = 5.0, default = 1.0,
    page = NaturalDisasters,
    translation = NaturalDisasters_YieldMultiplier,
}
```

---

## Reading sandbox values from Lua

```lua
local sv = SandboxVars and SandboxVars.NaturalDisasters
if not sv then return end
local enabled = sv.EnableEarthquakes
local sev     = tonumber(sv.Severity) or 2
local mult    = tonumber(sv.YieldMultiplier) or 1.0
```

`SandboxVars.<ModId>` is **nil** until the first save loads with the mod active. Always guard.

---

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Mod's sandbox page does not appear in the in-game Sandbox Options screen | One malformed option in `sandbox-options.txt` rejects the entire file | Remove suspicious options one by one; check for unsupported `type` values; check every block ends `translation = ...,` with the trailing comma |
| Page shows but options are labelled with raw keys (`Sandbox_MyMod_Foo`) instead of human text | `Sandbox_EN.txt` missing the key, or key spelling mismatch | Ensure `translation = X,` in the option matches `Sandbox_X` in the translation file |
| Value typed in Lua doesn't match what the player sees in-game | Unit mismatch — e.g. field labelled "minutes" but code multiplies by 60 | Field name MUST match the unit the code treats it as; pick one and stay consistent |

---

## Citations

- `_pz_install/media/lua/shared/Translate/EN/Sandbox.json` — vanilla sandbox translation reference
- Workshop verified examples: `AICompanion`, `HavenEconomy`, `BitemeModSuite` (boolean, integer, double — no enum / string)
