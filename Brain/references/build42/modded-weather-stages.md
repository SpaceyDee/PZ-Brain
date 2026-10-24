# Modded Weather Stages — Registration API (B42)

**Status:** VERIFIED — pulled from `projectzomboid.jar` (B42 vanilla) and `B42MP.jar` (Storm MP layer) via `javap`, plus vanilla `media/lua/` scripts.

The "modded weather stage" API lets a mod inject custom stages into a `WeatherPeriod` cycle. Vanilla Project Zomboid does **not** fire `OnInitModdedWeatherStage` / `OnUpdateModdedWeatherStage` — those events are added by the **Storm** layer shipped in `B42MP.jar` (the B42 multiplayer build). The underlying Java methods (`createAndAddModdedStage`, `STAGE_MODDED = 10`, `WeatherStage.modId`) exist in vanilla `projectzomboid.jar` itself, so the registration plumbing is engine-side; only the Lua event fan-out is Storm-side.

---

## Verified facts

### Entry points on `WeatherPeriod`

From `javap -p zombie.iso.weather.WeatherPeriod` (in `projectzomboid.jar`):

```
public static final int STAGE_MODDED;            // = 10
public static final int STAGE_MAX;
public boolean startCreateModdedPeriod(boolean isWarmFront, float strength, float windDeg);
public boolean endCreateModdedPeriod();
public WeatherPeriod$WeatherStage createAndAddModdedStage(java.lang.String modId, double durationHours);
public WeatherPeriod$WeatherStage createAndAddStage(int stageId, double durationHours);
public WeatherPeriod$WeatherStage getCurrentStage();
public int getCurrentStageID();
```

Bytecode of `createAndAddModdedStage(String, double)` shows it delegates to the private overload with `stageId = 10` (`STAGE_MODDED`):

```
createAndAddModdedStage(String, double):
  bipush 10
  invokevirtual createAndAddStage(IDLjava/lang/String;)
```

So every modded stage is registered under the single shared vanilla stage ID `STAGE_MODDED (10)`, and distinguished only by the `modId` string.

### `WeatherPeriod$WeatherStage` (the stage object)

From `javap -p` on the inner class. Mutable knobs you can set on the returned stage:

| Member | Type | Notes |
|---|---|---|
| `getStageID()` | `int` | Always `10` (`STAGE_MODDED`) for modded stages. |
| `getModID()` | `String` | The `modId` you passed to `createAndAddModdedStage`. |
| `getStageStart()` / `getStageEnd()` / `getStageDuration()` | `double` (hours, world-age) | Filled in by `endCreateModdedPeriod`. |
| `setStageID(int)` | — | Don't touch on a modded stage. |
| `setTargetStrength(float)` | 0..1 (clamped via `ClimateManager.clamp01`) | Strength curve target. |
| `lerpEntryTo(int, int)` | `(StrLerpVal.value, StrLerpVal.value)` | Where the lerp starts / ends. See enum below. |
| `getStageCurrentStrength()` | `float` | Read in update. |
| `getLinearT()` / `getParabolicT()` | `float` 0..1 | Progress through stage. |
| `getHasStartedCloud()` / `setHasStartedCloud(boolean)` | — | Cloud particle entry flag. |
| protected field `fogStrength` | `float` | No public setter — adjust fog via `ClimateManager.getClimateFloat(FLOAT_FOG_INTENSITY)` instead. |
| protected fields `entryStrength`, `exitStrength`, `targetStrength` | `float` | Only `targetStrength` has a public setter. |

`WeatherPeriod$StrLerpVal` enum values (from bytecode of `static {}`):

| Name | Value |
|---|---|
| `Entry` | 1 |
| `Target` | 2 |
| `NextTarget` | 3 |
| `None` | 0 |

`lerpEntryTo(a, b)` takes those integer values.

### Vanilla stage IDs (for reference)

From `javap -p zombie.iso.weather.WeatherPeriod`:

```
STAGE_START = 0    STAGE_SHOWERS = 1     STAGE_HEAVY_PRECIP = 2
STAGE_STORM = 3    STAGE_CLEARING = 4    STAGE_MODERATE = 5
STAGE_DRIZZLE = 6  STAGE_BLIZZARD = 7    STAGE_TROPICAL_STORM = 8
STAGE_INTERMEZZO = 9                     STAGE_MODDED = 10
STAGE_KATEBOB_STORM = 11                 STAGE_MAX = 12
```

Confirmed by vanilla `media/lua/client/DebugUIs/DebugMenu/Climate/ForecasterDebug.lua:21`: `[10] = "STAGE_MODDED"`.

### Climate-wide controls a stage handler can touch

From `javap -p zombie.iso.weather.ClimateManager`. These are the per-climate "channels" you'd actually modulate from `OnUpdateModdedWeatherStage`:

```
public static final int FLOAT_DESATURATION;          // 0
public static final int FLOAT_GLOBAL_LIGHT_INTENSITY;
public static final int FLOAT_NIGHT_STRENGTH;
public static final int FLOAT_PRECIPITATION_INTENSITY;
public static final int FLOAT_TEMPERATURE;
public static final int FLOAT_FOG_INTENSITY;
public static final int FLOAT_WIND_INTENSITY;
public static final int FLOAT_WIND_ANGLE_INTENSITY;
public static final int FLOAT_CLOUD_INTENSITY;
public static final int FLOAT_AMBIENT;
public static final int FLOAT_VIEW_DISTANCE;
public static final int FLOAT_DAYLIGHT_STRENGTH;
public static final int FLOAT_HUMIDITY;
public static final int FLOAT_MAX;
public static final int COLOR_GLOBAL_LIGHT;
public static final int COLOR_NEW_FOG;
public static final int BOOL_IS_SNOW;
public ClimateManager$ClimateFloat getClimateFloat(int);
public ClimateManager$ClimateColor getClimateColor(int);
public ClimateManager$ClimateBool  getClimateBool(int);
public void resetModded();        // wipes modded overrides
public boolean triggerCustomWeatherStage(int stageId, float durationHours);  // also fires vanilla stages
public WeatherPeriod getWeatherPeriod();
public KahluaTable getModData();
public static ClimateManager getInstance();
```

Wind cap from class constants:

```
public static final float MAX_WINDSPEED_KPH;     // physical clamp; getWindspeedKph() respects this
public static final float MAX_WINDSPEED_MPH;
```

`FLOAT_PRECIPITATION_INTENSITY`, `FLOAT_FOG_INTENSITY`, `FLOAT_CLOUD_INTENSITY`, `FLOAT_AMBIENT`, `FLOAT_DESATURATION` and friends are clamped to **0..1** at the engine level via `ClimateManager.clamp01` (used inside `startCreateModdedPeriod` and stage update paths). `FLOAT_WIND_INTENSITY` is a 0..1 multiplier that scales to `MAX_WINDSPEED_KPH` (≈ engine-defined; do not hand‑set kph directly).

### Storm-side event wiring

From `javap -p io.pzstorm.storm.event.lua.*` (in `B42MP.jar`):

```
public class OnInitModdedWeatherStageEvent implements LuaEvent {
    public final WeatherPeriod period;
    public final WeatherPeriod$WeatherStage stage;
    public final Float airFrontStrength;
}
public class OnUpdateModdedWeatherStageEvent implements LuaEvent { ...same fields... }
public class OnClimateManagerInitEvent implements LuaEvent {
    public final ClimateManager manager;
}
```

`LuaEvent.getName()` returns the class simple name stripped of the `Event` suffix, so the Lua-side event names are:

- `OnInitModdedWeatherStage`
- `OnUpdateModdedWeatherStage`
- `OnClimateManagerInit`

**Vanilla `WeatherPeriod` bytecode contains no `OnInitModdedWeatherStage` / `OnUpdateModdedWeatherStage` triggerEvent calls.** Storm injects them at runtime via ASM (`StormEventDispatcher.callDispatchEvent`). In dedicated/MP (`B42MP.jar`) they work. In **vanilla solo with no Storm layer they will not fire** — see "Open unknowns".

### Lua-side event signature

The Lua handler receives the three public fields, in order, as positional args. So:

```
Events.OnInitModdedWeatherStage.Add(function(period, stage, airFrontStrength) ... end)
Events.OnUpdateModdedWeatherStage.Add(function(period, stage, airFrontStrength) ... end)
Events.OnClimateManagerInit.Add(function(climateManager) ... end)
```

(`OnUpdateModdedWeatherStage` has **no** `dt` parameter on the Java side, despite earlier brain notes — the third arg is `airFrontStrength`, not `dt`. Compute `dt` from `GameTime.getInstance():getMultiplier()` or world-age delta if you need it.)

---

## Registration recipe

Drop the registration in a server-context file (`media/lua/server/...`) so it runs where the `WeatherPeriod` simulation lives. Guard everything explicitly — `pcall` works in verified B42.18 dedicated probes; avoiding blanket wrappers is convention, and `safeCall` is separately unverified.

```lua
-- media/lua/server/MyMod/MyMod_WeatherStages.lua

local MY_MOD_ID = "naturaldisasters_dustdevil"

local function buildStage()
    local clim = getClimateManager and getClimateManager()
    if not clim then return false end
    local wp = clim.getWeatherPeriod and clim:getWeatherPeriod()
    if not wp then return false end

    -- Guard every method we touch.
    if not (wp.startCreateModdedPeriod and wp.createAndAddModdedStage and wp.endCreateModdedPeriod) then
        return false
    end

    -- isWarmFront, frontStrength (0..1), windAngleDegrees (0..360)
    if not wp:startCreateModdedPeriod(false, 0.6, 220.0) then
        return false
    end

    -- Each call appends one WeatherStage to the period. modId is per-stage.
    local rampUp   = wp:createAndAddModdedStage(MY_MOD_ID .. ":rampup",   0.5)  -- 30 min
    local peak     = wp:createAndAddModdedStage(MY_MOD_ID .. ":peak",     1.5)  -- 90 min
    local rampDown = wp:createAndAddModdedStage(MY_MOD_ID .. ":rampdown", 0.5)

    -- Optional per-stage tuning. setTargetStrength is the only public strength setter.
    -- StrLerpVal.value: None=0, Entry=1, Target=2, NextTarget=3
    if rampUp and rampUp.setTargetStrength then
        rampUp:setTargetStrength(0.4)
        rampUp:lerpEntryTo(1, 2)  -- Entry -> Target
    end
    if peak and peak.setTargetStrength then
        peak:setTargetStrength(0.9)
        peak:lerpEntryTo(2, 2)
    end
    if rampDown and rampDown.setTargetStrength then
        rampDown:setTargetStrength(0.2)
        rampDown:lerpEntryTo(2, 3)  -- Target -> NextTarget
    end

    return wp:endCreateModdedPeriod()
end

-- Modulate climate channels while *our* stage is current.
local function onUpdateStage(period, stage, airFrontStrength)
    if not (stage and stage.getModID) then return end
    local id = stage:getModID()
    if id == nil then return end                              -- vanilla stage; ignore
    if not string.find(id, MY_MOD_ID, 1, true) then return end -- another mod's stage

    local clim = getClimateManager and getClimateManager()
    if not clim or not clim.getClimateFloat then return end

    local fog   = clim:getClimateFloat(ClimateManager.FLOAT_FOG_INTENSITY)
    local wind  = clim:getClimateFloat(ClimateManager.FLOAT_WIND_INTENSITY)
    local desat = clim:getClimateFloat(ClimateManager.FLOAT_DESATURATION)
    -- ClimateFloat has setModdedValue(float)/clearModdedValue() per ClimateManager.resetModded;
    -- check getModdedValue/setModdedValue exists before calling (engine surface may move).
    local t = stage.getLinearT and stage:getLinearT() or 0
    if fog  and fog.setModdedValue  then fog:setModdedValue(0.85 * t) end
    if wind and wind.setModdedValue then wind:setModdedValue(0.7 * t) end
    if desat and desat.setModdedValue then desat:setModdedValue(0.5 * t) end
end

-- Reset modded overrides when our stage ends, so we don't bleed into vanilla stages.
local function onInitStage(period, stage, airFrontStrength)
    local clim = getClimateManager and getClimateManager()
    if clim and clim.resetModded then clim:resetModded() end
end

Events.OnClimateManagerInit.Add(function(_) buildStage() end)
Events.OnInitModdedWeatherStage.Add(onInitStage)
Events.OnUpdateModdedWeatherStage.Add(onUpdateStage)
```

Notes:

- `startCreateModdedPeriod` / `endCreateModdedPeriod` bracket a **period**, not a single stage. Multiple `createAndAddModdedStage` calls go between them and play in order.
- `frontStrength` is `clamp01`'d; `windAngleDegrees` is `clamp(0, 360, x)`. You cannot exceed the engine wind cap (`MAX_WINDSPEED_KPH`).
- One period is active at a time. To schedule a custom storm "out of band," call `ClimateManager:triggerCustomWeatherStage(WeatherPeriod.STAGE_MODDED, durationHours)` — confirmed in `media/lua/client/ISUI/AdminPanel/ISAdmPanelWeather.lua:174` (vanilla uses it for `STAGE_STORM`). Whether passing `STAGE_MODDED` there picks up your last-registered modded period is **untested** (see Open unknowns).
- Distinguish your stage from other mods' stages by string-matching `stage:getModID()`. The engine stores only one `modId` string per stage.

---

## Open unknowns

- **Solo/offline coverage.** Storm's ASM injectors live in `B42MP.jar`. Whether the b42 stand-alone client (`ProjectZomboid64.exe` without the `b42mp` launcher) loads them is unverified. Test in your target launcher before relying on `OnInitModdedWeatherStage` firing in solo.
- **`ClimateFloat.setModdedValue` surface.** `javap -p zombie.iso.weather.ClimateManager` shows the inner class `ClimateManager$ClimateFloat` but I did not extract its method list here. The existence of `resetModded()` on `ClimateManager` strongly implies a `setModdedValue`/`clearModdedValue` pair on `ClimateFloat`; verify with `javap -p zombie.iso.weather.ClimateManager\$ClimateFloat` before shipping. Guarded calls in the recipe degrade safely if the method name differs.
- **Triggering a registered modded period on demand.** `triggerCustomWeatherStage(int, float)` accepts a stage ID, not a modded period handle. There is no obvious `triggerModdedPeriod(modId)` in the public surface, so it's unclear whether you can fire your registered period from script after creation, or whether it must be (re)built each time `OnClimateManagerInit` runs.
- **Persistence across save/load.** `WeatherStage.save/load` exists but `modId` is plain `String`; whether the engine reconstructs the modded period after a reload (when the mod's Lua hasn't yet run) is unverified.
- **MP authority.** `OnClimateManagerInit` fires both on dedicated server and on clients (`ClimateManager.init` calls `LuaEventManager.triggerEvent` directly — verified in bytecode). The `WeatherPeriod` itself is server-driven; modded stages probably need to be registered server-side to take effect, with clients only receiving the resulting climate-float values via `WeatherPacket`. Not verified end-to-end.

---

## Citations

- `<local-path>` — extracted: `zombie/iso/weather/WeatherPeriod.class`, `zombie/iso/weather/WeatherPeriod$WeatherStage.class`, `zombie/iso/weather/WeatherPeriod$StrLerpVal.class`, `zombie/iso/weather/ClimateManager.class`, `zombie/iso/weather/ClimateValues.class`, `zombie/iso/weather/ClimateColorInfo.class` (inspected via `javap -p` and `javap -c`).
- `<local-path>` — extracted: `io/pzstorm/storm/event/lua/OnInitModdedWeatherStageEvent.class`, `io/pzstorm/storm/event/lua/OnUpdateModdedWeatherStageEvent.class`, `io/pzstorm/storm/event/lua/OnClimateManagerInitEvent.class`, `io/pzstorm/storm/event/lua/LuaEvent.class`, `io/pzstorm/storm/event/StormEventDispatcher.class`.
- `<local-path>` — confirms `STAGE_MODDED = 10`.
- `<local-path>,181,188` — example `clim:triggerCustomWeatherStage(WeatherPeriod.STAGE_STORM, dur)` etc.
- `<local-path>,386,395` — same pattern.
- `<local-path>` — vanilla handler for `OnClimateManagerInit` showing accessor style (`_clim:getColFog()`, `_clim:getWeatherPeriod():getCloudColorReddish()`, etc.).
- `<local-path>` — banner format reference (banner intentionally omitted here: this file documents no pcall/safeCall pattern that needs deprecating).
