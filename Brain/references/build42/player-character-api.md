# Player & Character API — B42 Verified Patterns

Sources: More Traits 42.17 (`1299328280`), Authentic Z Backpacks+ 42.x (`2335368829`).

---

## 1. Equipping Items

### Back slot (convenience method)
```lua
player:setClothingItem_Back(item)   -- equip item to back slot
local back = player:getClothingItem_Back()  -- nil if nothing equipped
```

### General worn item (any body location)
```lua
-- item:getBodyLocation() returns a ResourceLocation — use tostring() if comparing to string
player:setWornItem(item:getBodyLocation(), item)
local worn = player:getWornItem(item:getBodyLocation())  -- nil if slot empty
```

### Hand slots
```lua
player:setPrimaryHandItem(item)    -- right hand
player:setSecondaryHandItem(item)  -- left hand
local rh = player:getPrimaryHandItem()
local lh = player:getSecondaryHandItem()
```

---

## 2. Trait Checking

```lua
-- Vanilla traits — use CharacterTrait constants
player:hasTrait(CharacterTrait.TAILOR)
player:hasTrait(CharacterTrait.SMOKER)

-- Custom traits — use the ResourceLocation object returned from TraitFactory or stored in a registries table
-- e.g. ToadTraitsRegistries.lucky is a ResourceLocation, not a string
player:hasTrait(ToadTraitsRegistries.lucky)
```

`player:hasTrait()` accepts both vanilla `CharacterTrait.X` constants and custom ResourceLocation trait objects. Never pass a string.

---

## 3. Stats (CharacterStat Enum)

```lua
local stats = player:getStats()
local val = stats:get(CharacterStat.STRESS)      -- read
stats:set(CharacterStat.STRESS, 0)               -- write

-- Common CharacterStat values:
-- CharacterStat.STRESS
-- CharacterStat.ENDURANCE
-- CharacterStat.UNHAPPINESS
-- CharacterStat.BOREDOM
-- CharacterStat.HUNGER
-- CharacterStat.THIRST
-- CharacterStat.FATIGUE
-- CharacterStat.PAIN
```

---

## 4. Body Damage API

```lua
local bodyDamage = player:getBodyDamage()

-- Overall health (0–100 float)
local hp = bodyDamage:getOverallBodyHealth()

-- Iterate all body parts (Java ArrayList, 0-indexed)
local parts = bodyDamage:getBodyParts()
for i = 0, parts:size() - 1 do
    local b = parts:get(i)
end

-- Get specific part by enum
local part = bodyDamage:getBodyPart(BodyPartType.LowerLeg_R)
-- Convert index ↔ BodyPartType
local bpType = BodyPartType.FromIndex(i)
local idx = BodyPartType.ToIndex(BodyPartType.LowerLeg_R)

-- Check state (B42 renamed — no "is" prefix)
part:HasInjury()          -- capital H — note mixed case
part:scratched()          -- B42 (was isScratched)
part:cut()
part:deepWounded()
part:isBleeding()         -- isBleeding kept the "is" prefix
part:isBurnt()
part:isInfected()

-- Apply injuries
part:AddDamage(amount)                              -- raw damage
part:setScratched(true, true)                       -- (value, notify)
part:setCut(true, true)
part:setDeepWounded(true)
part:setBurned()
part:setBurnTime(ticks)
part:setNeedBurnWash(false)
part:setFractureTime(ticks)
part:setSplint(true, strength)                      -- strength 0.0–1.0
part:setSplintItem("Base.Splint")
part:setBandaged(true, strength, true, itemType)    -- (bandaged, strength, notify, itemType)
part:setStitched(true)

-- Infection controls
bodyDamage:setInfected(bool)
bodyDamage:setInfectionMortalityDuration(ticks)  -- -1 = no timer
bodyDamage:setInfectionTime(ticks)               -- -1 = no timer
bodyDamage:setInfectionLevel(0.0)
bodyDamage:setInfectionGrowthRate(0.0)
```

---

## 5. Recipe Learning API

```lua
-- Get all craft recipes (Java ArrayList, 0-indexed)
local recipes = getScriptManager():getAllCraftRecipes()
for i = 0, recipes:size() - 1 do
    local recipe = recipes:get(i)
    if recipe:needToBeLearn() then
        player:learnRecipe(recipe:getName())
    end
end

-- Get a single recipe by name
local r = getScriptManager():getCraftRecipe("Make Stick Trap")
```

---

## 6. Custom ItemTag Registration (registries.lua)

**Verified B42.18 — AmmoMaker source:**
```lua
-- media/registries.lua (fires before item scripts are parsed)
ammomakerRegistries = {}
ammomakerRegistries.tags = {
    RELOADINGPRESS = ItemTag.register("ammomaker:reloadingpress"),
    BRASSCATCHER   = ItemTag.register("ammomaker:brasscatcher"),
    FIREDCASING    = ItemTag.register("ammomaker:firedcasing"),
}
```

Store the returned tag object globally. Then check tags:
```lua
local tag = ammomakerRegistries.tags.RELOADINGPRESS
if tag and item:hasTag(tag) then ... end
```

Do NOT pass a string to `item:hasTag()` — the string form is broken in B42 (see Breaking Changes pitfall #13).

---

## 11. ISFirearmRadialMenu — Hooking the R-Key Weapon Radial (B42.13 verified)

The vanilla firearm radial menu (`ISFirearmRadialMenu`) opens when pressing R with a ranged weapon. Add slices to it by wrapping its methods.

```lua
require "ISUI/ISFirearmRadialMenu"

-- Append Gunworks-style slices after vanilla slices are built
local orig_fillMenu = ISFirearmRadialMenu.fillMenu
function ISFirearmRadialMenu:fillMenu()
    orig_fillMenu(self)   -- MUST call vanilla first; builds reload/chamber slices
    local weapon = self.character:getPrimaryHandItem()
    if not weapon or not instanceof(weapon, "HandWeapon") or not weapon:isRanged() then return end

    local menu = getPlayerRadialMenu(self.playerNum)
    menu:addSlice("My Option", getTexture("media/ui/myicon.png"), myCallback, arg1, arg2)
end

-- Allow the radial to activate for weapons that don't normally show it
local orig_checkWeapon = ISFirearmRadialMenu.checkWeapon
function ISFirearmRadialMenu.checkWeapon(playerObj)   -- NOTE: dot notation, not colon
    if orig_checkWeapon(playerObj) then return true end
    -- custom condition
    return myCustomCheck(playerObj)
end
```

**Key APIs:**
- `getPlayerRadialMenu(playerNum)` — global; returns the radial menu object for that player
- `menu:addSlice(text, texture, callback, ...args)` — add a pie slice; extra args are passed to callback
- `menu:clear()` — clear all slices (for sub-radials)
- `displaySubRadial(playerNum)` — show sub-radial after filling it with `menu:addSlice` calls
- `self.character` — IsoPlayer; `self.playerNum` — 0-indexed int

**Weapon script APIs (verified B42.13+):**
```lua
weapon:isRanged()              -- bool
weapon:getMagazineType()       -- string or nil (nil = no magazine system)
weapon:getMaxAmmo()            -- magazine capacity (if it IS a magazine item)
weapon:getCurrentAmmoCount()   -- current rounds in magazine
weapon:getFullType()           -- "Module.ItemId" full type string

ScriptManager.instance:getItem("Base.556Bullets")   -- get ItemScript by full type
script:getDisplayName()                              -- localized display name from script

-- Weapon reload type check (verified Hot_Brass 42.15)
weapon:isManuallyRemoveSpentRounds()   -- revolvers, break-action shotguns = true
```

**`WeaponReloadType` enum** (verified B42.15 — Hot_Brass source):
```lua
WeaponReloadType.HANDGUN
WeaponReloadType.REVOLVER
WeaponReloadType.SHOTGUN
WeaponReloadType.DOUBLE_BARREL_SHOTGUN
WeaponReloadType.DOUBLE_BARREL_SHOTGUN_SAWN
WeaponReloadType.BOLT_ACTION
WeaponReloadType.BOLT_ACTION_NO_MAG
WeaponReloadType.LEVER_ACTION
```

**`AmmoType.register()` — verified B42.16 (GunsOfMarz source):**
```lua
-- In media/registries.lua only
MyMod_AmmoTypes = {}
MyMod_AmmoTypes.BULLET_9MM = AmmoType.register("mymod:bullet_9mm", "MyMod.9mm_Bullet")
-- Args: namespaced ID string, full item type of the ammo item
-- Returns an AmmoType object — pass to Gunworks Ammo.RegisterAmmoFamily() enum field
```

**Wrapping note:** Storing a Lua class method as a local is safe and is the standard wrap pattern (`local orig = ISFirearmRadialMenu.fillMenu`). This is different from Java object method storage, which crashes.

---

## 12. Weapon Firing Events (verified Hot_Brass 42.15)

```lua
-- Fires when player swings/shoots a weapon (client and solo/host)
Events.OnWeaponSwing.Add(function(player, weapon)
    if not player or not weapon then return end
    if player:isDoShove() then return end             -- shove action, not a real swing
    if weapon:isRackAfterShoot() then return end      -- pump shotgun mid-rack
    if weapon:isMelee() then return end               -- melee weapon

    -- Client-only guard for multiplayer (skip remote players)
    if isClient() and player.isLocalPlayer and not player:isLocalPlayer() then return end

    -- ... handle firing event
end)
```

**Additional weapon state methods:**
```lua
weapon:isRackAfterShoot()   -- true for pump-action (needs racking between shots)
weapon:isMelee()            -- true for melee weapons
player:isDoShove()          -- true while doing a shove action
player:isLocalPlayer()      -- client-side; true if this is the controlling client's character
player:getEmitter():playSound("soundName")  -- play a sound at the player's position
```

---

## 13. Timed Action Internals

```lua
-- Check if timed actions are instant for this character (debug/admin flag)
character:isTimedActionInstant()  -- bool; if true, actions complete in 1 frame

-- Inside a timed action: self.Type is the class name string
if self.Type == "ISReadABook" then ... end

-- Wrapping a timed action's new() to inject custom maxTime
local orig_new = ISSplint.new
ISSplint.new = function(self, character, ...)
    local o = orig_new(self, character, ...)
    o.maxTime = o:getDuration()   -- some actions expose getDuration() for override
    return o
end

ISSplint.getDuration = function(self)
    local base = 140 - (self.character:getPerkLevel(Perks.Doctor) * 4)
    return base
end
```

---

## 14. Vanilla CharacterTrait Constants

```lua
-- Vanilla trait constants for player:hasTrait()
CharacterTrait.TAILOR
CharacterTrait.SMOKER
CharacterTrait.FAST_READER
CharacterTrait.SLOW_READER
CharacterTrait.DEXTROUS
CharacterTrait.ALL_THUMBS
```

---

## 7. Foraging Integration (Events.preAddSkillDefs)

Register trait-based foraging bonuses via the `preAddSkillDefs` event:
```lua
-- Verified pattern: More Traits 42.17
require "Foraging/forageDefinitions"

local function onPreAddSkillDefs(forageSystem)
    forageSystem.addSkillDef({
        name              = "MyMod:myTrait",    -- namespaced string
        type              = "trait",
        visionBonus       = 1.0,                -- extra vision radius
        weatherEffect     = 0,                  -- weather resistance bonus
        darknessEffect    = 0,                  -- darkness resistance bonus
        specialisations   = {
            ["Medical"]      = 5,               -- bonus to Medical foraging category
            ["Ammunition"]   = 5,
            ["ForestRarities"] = 5,
        },
        testFuncs         = {},                 -- optional condition functions
    })
end

Events.preAddSkillDefs.Add(onPreAddSkillDefs)
```

Known foraging category names: `"ForestRarities"`, `"Medical"`, `"Ammunition"`, `"JunkWeapons"`, `"MedicinalPlants"`, `"Trash"`, `"Animals"`, `"Berries"`, `"Mushrooms"`, `"JunkFood"`, `"WildPlants"`, `"Crops"`, `"Insects"`, `"FishBait"`.

---

## 8. PZAPI.ModOptions — Verified Param Shapes

**Verified B42.17 — More Traits source:**
```lua
-- Client file, at module load time (NOT inside an event)
local opts = PZAPI.ModOptions:create("1299328280", "Display Name")
-- First arg can be Workshop ID (string) or mod ID

opts:addTitle("Section Label")
opts:addDescription("Subtitle or help text")

-- 4-param addTickBox (tooltip is 4th)
opts:addTickBox("myKey", "Display Label", defaultBool, "Tooltip text")

-- 3-param addComboBox — then add items via getOption()
opts:addComboBox("myCombo", "Display Label", "Tooltip text")
opts:getOption("myCombo"):addItem("Option A", false)
opts:getOption("myCombo"):addItem("Option B", true)   -- true = default

opts:addKeyBind("myKey", "Display Label", Keyboard.KEY_H)
opts:addColorPicker("myColor", "Display Label", {r=0.2, g=0.6, b=1.0, a=1.0})
opts:addSeparator()
```

**Reading options outside the create() file:**
```lua
local opts = PZAPI.ModOptions:getOptions("1299328280")
if opts then
    local val = opts:getOption("myKey"):getValue()
end
```

---

## 9. ZombRand

```lua
ZombRand(min, max)   -- returns integer in [min, max)  (max is EXCLUSIVE)
ZombRand(0, 16)      -- returns 0..15
ZombRand(1, 5)       -- returns 1..4
```

---

## 10. Game State Checks

```lua
player:isAsleep()                     -- bool
getGameTime():getMultiplier()         -- current game speed (1.0, 5.0, 20.0, 40.0 for speeds 1–4)
UIManager.getSpeedControls():getCurrentGameSpeed()  -- 1=normal, 2=fast, 3=faster, 4=fastest
```
