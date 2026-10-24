# Project Zomboid Build 42 — Radio System Reference

How vanilla radio works, and how a mod ships content the game treats as native.

PZ has **two complementary radio pipelines**. Pick the one that matches the
content you're adding.

| Pipeline | What it's for | Storage |
|---|---|---|
| **Static XML scripts** | Authored shows, pre-recorded broadcasts, day-stamped story content (LBMW, Triple-N, Hitz FM, etc.) | `media/radio/*.xml` + matching translation JSON |
| **DynamicRadio** | Procedural / state-driven broadcasts (AEBS emergency weather, faction radios, anything that reacts to game state) | Lua module registered into `DynamicRadio.scripts`, lines emitted at runtime |

Both feed the same in-game radio/TV UI. The player can't tell them apart.

---

## 1. Static XML scripts

### Layout

```
<ModRoot>/Contents/mods/<ModId>/42/
└── media/
    ├── radio/
    │   └── <YourScript>.xml              # GUID-based broadcast definitions
    └── lua/shared/Translate/EN/
        └── <YourScript>.json             # RD_<guid> → line text
```

### File: `media/radio/<Name>.xml`

Real vanilla file: `_pz_install/media/radio/RadioData.xml` (15,455 lines, the
entire vanilla radio/TV catalog). Element grammar:

```
RadioData
├── RootInfo
│   ├── SourceFile
│   ├── FileGUID
│   └── Version
├── Voices
│   └── VoiceEntry ID="<guid>"            # voice → color binding
│       └── FinalColor r="" g="" b=""
├── Adverts
│   └── ScriptEntry ...                    # see ScriptEntry below
└── Channels
    └── ChannelEntry ID="" name=""
                     cat="Radio|Television"
                     freq="<int Hz>"
                     startscript="<name>"
        └── ScriptEntry ID="" name="" startdelay="0"
                        timestampmode="Static"
                        loopmin="1" loopmax="1"
            ├── ExitOptions/
            └── BroadcastEntry ID=""
                               timestamp="<game-minutes>"
                               endstamp="<game-minutes>"
                               type="ActivateBroadcast"
                               day="<0=any>"
                               advertCat="<script-guid|none>"
                               isSegment="false"
                └── LineEntry ID="<guid>"
                              r="" g="" b=""
                              codes="<modifiers>"   # optional, e.g. "BOR-1" (border)
```

**Channel-level fields**

| Field | Meaning |
|---|---|
| `name` | Display name (e.g. `"LBMW - Kentucky Radio"`) |
| `cat` | `Radio` for AM/FM, `Television` for TV channels |
| `freq` | Integer kHz × 100 — `93200` = 93.2 MHz |
| `startscript` | Name of the `ScriptEntry` to enter first (usually `"main"`) |

**ScriptEntry-level fields**

| Field | Meaning |
|---|---|
| `name` | Internal name; channels jump scripts via `startscript` or exit options |
| `startdelay` | Game-minute offset before first broadcast plays |
| `timestampmode` | `Static` = broadcasts play at fixed in-game times |
| `loopmin` / `loopmax` | Number of times to loop the script |

**BroadcastEntry-level fields**

| Field | Meaning |
|---|---|
| `timestamp` | Game-minute the broadcast starts (e.g. `360` = 06:00) |
| `endstamp` | Game-minute the broadcast ends |
| `day` | `0` = any day; otherwise the in-game day this airs |
| `advertCat` | GUID of an `Adverts` ScriptEntry to interleave (`"none"` to skip) |
| `isSegment` | Used for ad inserts vs. main content |

**LineEntry** is **only** an ID and presentation hint (color, optional `codes`). The actual spoken text lives in the translation JSON keyed by `RD_<line-guid>`.

### File: `media/lua/shared/Translate/EN/<Name>.json`

```jsonc
{
    "RD_b0ee632b-789e-4e4f-a2b0-b09374856a62": "Where in the Pizza Whirled are we today?",
    "RD_e026c08a-32a1-4548-8cd0-b4a22830bae8": "Hello there old boy! Pip pip!",
    ...
}
```

Key format: literal `"RD_" .. <line-guid>`. The XML carries the GUID; the JSON carries the text. Translations live in `Translate/<LANG>/<SameFilename>.json`.

### Authoring tip

Vanilla generated `RadioData.xml` from the in-game **RadioComEditor** tool. Hand-authoring is feasible but tedious — every line needs a fresh UUID. For a small mod that ships 20-30 lines (one news bulletin per disaster type), hand-authoring is fine. Generate UUIDs with PowerShell: `[guid]::NewGuid().ToString()`.

### Load mechanism

XML in `media/radio/` is auto-discovered by the engine at world load — no Lua registration needed. The file's `RootInfo > FileGUID` is the disambiguator, so two mods can each ship their own XML without collision.

---

## 2. DynamicRadio — procedural broadcasts (recommended for Natural Disasters)

This is the right pipeline for natural-disaster warnings because content is reactive: "tornado spotted in central sector at 14:00 today" can't live in a static script.

### Anchor file

`_pz_install/media/lua/server/radio/ISDynamicRadio.lua` — the framework. Don't edit; consume.

### Vanilla example: AEBS (Automated Emergency Broadcast System)

`_pz_install/media/lua/server/radio/ISWeatherChannel.lua` (490 lines) is the canonical reference. It:

1. Declares a module `WeatherChannel` with constants (channel UUID, debug flags).
2. Defines `WeatherChannel.OnEveryHour(_dynamicChannel, _gameTime, _radio)` — the per-hour tick.
3. Inside that tick, builds a `_bc` (BroadcastObject) and appends lines via `_bc:AddRadioLine(RadioLine.new(text, r, g, b))`.
4. Registers itself into the framework with `table.insert(DynamicRadio.scripts, WeatherChannel)` (line 87 of `ISWeatherChannel.lua`).
5. The dynamic channel itself was registered earlier in `DynamicRadio.channels` (line 15 of `ISDynamicRadio.lua`).

### Registration recipe — channel

In your `server/radio/NaturalDisastersChannel.lua`:

```lua
if isClient() then return end   -- env guard per Brain principle

-- Append a channel definition the framework will create for us
table.insert(DynamicRadio.channels, {
    name = "Emergency Disaster Alert System",
    freq = { 152000, 162200 },     -- NOAA Weather Radio range (152–162.2 MHz)
    category = "Emergency",
    uuid = "ND-EDAS-001",          -- pick a fresh UUID and KEEP IT FIXED
    register = true,               -- create if absent
    airCounterMultiplier = 1.0,
})
```

### Registration recipe — script module

```lua
NaturalDisastersChannel = {}
NaturalDisastersChannel.channelUUID = "ND-EDAS-001"   -- must match above

function NaturalDisastersChannel.OnEveryHour(_dynamicChannel, _gameTime, _radio)
    if not _dynamicChannel or not _dynamicChannel.AddBroadcast then return end

    -- Source of truth: the disaster scheduler's ModData
    local store = ModData and ModData.getOrCreate and ModData.getOrCreate("NaturalDisasters")
    if not store or not store.pendingBroadcast then return end

    local _bc = _dynamicChannel:AddBroadcast(0, 60, "ActivateBroadcast", 0)
    if not _bc then return end

    local color = { r = 255, g = 0, b = 0 }
    local lineText = getRadioText("ND_warning_" .. tostring(store.pendingBroadcast.kind))
        or "EMERGENCY: Severe weather event detected."
    _bc:AddRadioLine(RadioLine.new(lineText, color.r, color.g, color.b))

    store.pendingBroadcast = nil   -- consumed
end

table.insert(DynamicRadio.scripts, NaturalDisastersChannel)
```

### Text strings

Place strings in `media/lua/shared/Translate/EN/DynamicRadio.json` (extending the vanilla file is fine, or ship a sibling `NaturalDisastersRadio.json` — the `getRadioText` lookup is unified). Vanilla examples to mirror:

```jsonc
"AEBS_weather_warning": "Severe Weather Warning. %s Imminent. ETA %s days...",
"AEBS_Pre_today": "Today,",
"AEBS_temperature": "average temperature %s. Minimum: %s. Maximum: %s. Humidity: %s%%...",
```

Use `string.format(getRadioText("ND_<key>"), ...)` to interpolate.

### Tick rate

`DynamicRadio.OnEveryHour` is bound to `Events.EveryHours` (line 157 of `ISDynamicRadio.lua`). One tick per in-game hour — that's the natural cadence for emergency bulletins. If a faster cadence is needed (e.g. live tornado tracking every 10 in-game minutes), register on `Events.EveryTenMinutes` and call `_dynamicChannel:AddBroadcast(...)` manually inside your own handler.

---

## Pipeline cheat sheet

| Need | Use |
|---|---|
| Pre-written news/music/ad show, time-of-day driven | Static XML |
| State-reactive emergency alert | DynamicRadio script module |
| One-off urgent broadcast (admin triggered) | DynamicRadio + manual `AddBroadcast(now, now+10, ...)` from the trigger handler |
| Multi-language support | Drop the same JSON into every `Translate/<LANG>/` folder |

---

## Open unknowns / caveats

- **DynamicRadio + dedi server.** `ISDynamicRadio.lua` lives under `media/lua/server/`. Confirmed server-driven. Whether the channel propagates to clients automatically (via existing radio sync) or needs a `sendServerCommand` push is not yet verified in the brain — test in a dedi before shipping.
- **`getRadioText(key)` failure mode.** When the key is missing, vanilla appears to return the key string itself rather than `nil`. Always set a default fallback (`or "Generic emergency message."`) and never use the return value to gate logic.
- **DynamicRadio channel persistence.** The framework writes channel state to `GameTime` ModData (line 47 of `ISDynamicRadio.lua`) so frequencies survive save/load. Don't change a registered channel's `uuid` after first launch — survivors of the save won't find the same channel.

---

## Citations

- `_pz_install/media/radio/RadioData.xml` — vanilla static-script catalog
- `_pz_install/media/lua/shared/Translate/EN/RadioData.json` — static line text
- `_pz_install/media/lua/shared/Translate/EN/DynamicRadio.json` — dynamic line text and AEBS templates
- `_pz_install/media/lua/server/radio/ISDynamicRadio.lua:13-157` — framework
- `_pz_install/media/lua/server/radio/ISWeatherChannel.lua:1-490` — AEBS reference implementation
- B42 event registry — `Events.OnLoadRadioScripts` (`Brain/references/build42/B42_Lua_Events_Official.md:150`)
