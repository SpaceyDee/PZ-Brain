# BUILD 42 NOTES

Key facts about B42 that differ from B41 or that are commonly misunderstood.

---

## Environment Model Change from B41

B42 enforces a stricter three-state model:
- Singleplayer: `isServer()=false`, `isClient()=false`
- Hosted-host: `isServer()=false`, `isClient()=false` ← same as singleplayer
- Hosted-remote: `isClient()=true`
- Dedicated server: `isServer()=true`
- Dedi client: `isClient()=true`

This means `if not isServer() then return end` in a "server" file kills it in singleplayer and hosted-host. This was NOT always true in B41 — the guards behaved differently. B42 is strict. Use `if isClient() then return end`.

---

## ModData API (B42 Verified)

| Function | Status |
|---|---|
| `ModData.getOrCreate(key)` | Confirmed B42 |
| `ModData.get(key)` | Confirmed B42 |
| `ModData.exists(key)` | Confirmed B42 |
| `ModData.add(key, table)` | Confirmed B42 |
| `ModData.remove(key)` | Confirmed B42 |
| `ModData.transmit(key)` | Confirmed B42 |
| `ModData.request(key)` | Confirmed B42, client-only |
| `sendGlobalModData(key, table)` | Possibly B41-era or aliased; prefer `ModData.transmit()` |

---

## Event Names (B42 Corrections)

Confirmed correct event names for periodic tickers (no "On" prefix):
- `EveryOneMinute` ✓
- `EveryTenMinutes` ✓
- `EveryHours` ✓
- `EveryDays` ✓

Wrong (contradicted):
- `OnEveryOneMinute` ✗
- `OnEveryTenMinutes` ✗

---

## Server Bootstrap Hook

B42 adds `Events.OnInitGlobalModData` as the correct server bootstrap hook:
- Fires when GlobalModData is ready
- Parameter: `newGame (bool)`
- Fires before `OnGameStart`
- Safe to call `ModData.getOrCreate()` here
- `OnGameStart` fires on clients only in B42; do NOT use it for server ModData bootstrap

---

## New in B42

- **Entity system** — B42 adds a new entity model. See `10_Notes/B42_Entity_System.md`.
- **Animal system** — New animal AI and tracking events (`OnAnimalTracks`, `OnClickedAnimalForContext`)
- **Crafting overhaul** — Significant recipe and crafting system changes. Many B41 recipes need updating.
- **AnimSet** — New animation set system. See `10_Notes/B42_AnimSet_Modding.md`.
- **Build 42 minimum version** — Always set `versionMin=42.0` in `mod.info`.

---

## Known B42.15+ Specific Notes

### pcall works; prefer explicit guards

`pcall` is functional in verified B42.18 dedicated probes (T30/T32/T34). `safeCall` has not been separately runtime-verified. Prefer explicit nil/type guards by convention so errors remain visible:

```lua
-- Avoid blanket wrappers by convention; this is not inherently broken
local ok, val = pcall(function() return player:getX() end)

-- CORRECT
local val = player and player.getX and player:getX() or 0
```

### item:hasTag(string) Broken

`item:hasTag(string)` is broken. Use the `ItemTag` API:
```lua
local tag = ItemTag.get(ResourceLocation.of("base:tagname"))
if tag then item:hasTag(tag) end
```
Tags are always `base:<lowercase>` prefixed: `base:scissors`, `base:canopener`, `base:sharpknife`.

### getDelta() Returns Nil

`item:getDelta()` returns nil in B42.15+. Use `getCurrentUsesFloat()` for drainable fill level (returns a 0.0–1.0 float). Gate with `instanceof(item, "DrainableComboItem")` before using drainable API.

### Body Part Wound Method Renames

The `is` prefix was removed from most wound check methods:

```lua
-- WRONG (B41 — crashes in B42):
bodyPart:isScratched()   bodyPart:isCut()   bodyPart:isDeepWounded()

-- CORRECT (B42):
bodyPart:scratched()     bodyPart:cut()     bodyPart:deepWounded()
bodyPart:isBleeding()    -- EXCEPTION: "is" prefix kept
bodyPart:haveBullet()    bodyPart:haveGlass()
bodyPart:isBurnt()       bodyPart:isInfected()
bodyPart:bandaged()      bodyPart:stitched()
```

When **clearing** wounds, the second boolean arg is the "notify" flag:
```lua
bodyPart:setScratched(false, true)   -- true = notify
bodyPart:setCut(false, true)
bodyPart:setDeepWounded(false, true)
bodyPart:setStitched(true)
```

---

## B41 vs B42 API Differences

See `10_Notes/B42_API_Changes_from_B41.md` for the detailed diff.

Key breaking changes:
- Crafting system API changed significantly
- Some B41 item types may have different field names in B42
- Animation API updated (AnimSet system)
- Entity system is new to B42

---

## Known B42.18 Specific Notes

### B42.18 Removals

- **`item:getAttachmentsProvided()` removed entirely** — Do not call this method. Use `item:DoParam(...)` to read attachment data instead.
- **`Events.OnExitVehicle` removed** — This event no longer fires. Use `EveryOneMinute` polling with a `lastVehicle` local variable to detect when a player leaves a vehicle:
  ```lua
  local lastVehicle = nil
  Events.EveryOneMinute.Add(function()
      local player = getPlayer()
      if not player then return end
      local currentVehicle = player:getVehicle()
      if lastVehicle and not currentVehicle then
          -- player just left a vehicle
          onPlayerExitedVehicle(player, lastVehicle)
      end
      lastVehicle = currentVehicle
  end)
  ```

---

## Known B42.17 Specific Notes

See `10_Notes/B42_17_Patch_Notes.md` for full patch-level notes.

### B42.17 Animation and Combat Fixes (High Impact for Combat/DualWield Mods)

Source: The Indie Stone — Build 42.17.0 unstable released

B42.17.0 specifically touched animation, aiming, hit registration, off-hand state, and MP stability. These are directly relevant to any mod that touches combat or held-item state:

- Animation tracks abruptly stopping (fixed)
- Incorrect aiming behavior when pressing `LCTRL` over UI (fixed)
- Emotes not working with non-weapon off-hand item equipped (fixed)
- Animation not playing when player is seated (fixed)
- Zombies teleporting on hit — MP desync (fixed)
- Multiplayer climbing rope desync (fixed)
- Host Game returning to main menu when loading saves (fixed)
- Server-side exception fixes
- Anti-cheat false positive fixes

**Implication:** B41 dual wield or combat injection techniques cannot be assumed stable in B42.17. These systems were actively being fixed.

### B42.17 API Breakage: `getObjectById` Broken

`getObjectById(id)` does not reliably return IsoZombie objects in B42.17.

**Workaround:**
```lua
local function getZombieFromID(id)
    for _, obj in ipairs(getObjectListForLua()) do
        if instanceof(obj, "IsoZombie") and obj:getOnlineID() == id then
            return obj
        end
    end
end
-- Use getOnlineID() in MP, getID() in SP
```

Confirmed by CSR `CSR_DualWieldUtils.lua` — explicitly labeled as "B42.17 fix replacing broken `getObjectById`".

---

## B42 Source Access

PZ B42 source lives at:
```
<local-path>
```

Always check here before guessing about API behavior. The source is the ground truth.
