# B42 IsoPlayer API Reference

**Source(s):**
- https://zomboid-javadoc.com/41.65/zombie/characters/IsoPlayer.html — Unofficial JavaDocs (B41.65; methods largely stable to B42)
- https://projectzomboid.com/modding/zombie/characters/IsoPlayer.html — Official PZ modding docs (403 at research time)
- https://pzwiki.net/wiki/IsoPlayer (403 at research time)
- Search snippets from pzwiki.net and community resources

> **Important:** The method table below is primarily based on Build 41.65 JavaDocs. Most methods are stable into B42, but B42 may have added new methods or changed signatures. Always cross-reference with the unofficial B42 LuaDocs at https://demiurgequantified.github.io/ProjectZomboidLuaDocs/ for the most current reference.

---

## Class Hierarchy

```
IsoObject
  └── IsoMovingObject
        └── IsoLivingCharacter (IsoGameCharacter)
              └── IsoPlayer
```

`IsoPlayer` extends `IsoGameCharacter` (also called `IsoLivingCharacter`). Many methods from the parent classes are also available.

---

## Getting the Local Player

```lua
-- Single player / local player
local player = getPlayer()          -- returns IsoPlayer (local player only)

-- By player number (split-screen / multiplayer)
local player = getSpecificPlayer(playerNum)  -- playerNum starts at 0

-- All players (server-side use)
local players = getPlayers()        -- returns ArrayList<IsoPlayer>
for i = 0, players:size() - 1 do
    local p = players:get(i)
end
```

---

## Identity / Name Methods

| Method | Return | Parameters | Description |
|--------|--------|-----------|-------------|
| `getUsername()` | String | — | Returns the player's username (Steam name or server name) |
| `getDisplayName()` | String | — | Returns the display name (may differ from username) |
| `getForname()` | String | — | Returns first name of the character |
| `getSurname()` | String | — | Returns last name of the character |
| `getPlayerNum()` | int | — | Returns this player's index (0-based in split-screen) |
| `getPlayerIndex()` | int | — | Returns player index number |
| `getOnlineID()` | short | — | Returns online session identifier (MP use) |
| `getSteamID()` | long | — | Returns Steam account ID |
| `getAccessLevel()` | String | — | Returns admin access level ("admin", "moderator", etc.) |
| `getObjectName()` | String | — | Returns internal object name |
| `getTimeSurvived()` | String | — | Returns formatted survival time string |
| `getHoursSurvived()` | double | — | Returns hours survived as double |
| `setUsername(name)` | void | String | Sets player username |
| `setDisplayName(name)` | void | String | Sets display name |
| `setForname(name)` | void | String | Sets first name |
| `setSurname(name)` | void | String | Sets last name |
| `setAccessLevel(level)` | void | String | Sets access level |

---

## Inventory & Items

| Method | Return | Parameters | Description |
|--------|--------|-----------|-------------|
| `getInventory()` | ItemContainer | — | Returns the player's inventory container |
| `getPrimaryHandItem()` | InventoryItem | — | Returns item in primary (right) hand |
| `getSecondaryHandItem()` | InventoryItem | — | Returns item in secondary (left) hand |
| `getActiveLightItem()` | InventoryItem | — | Returns equipped light source (torch etc.) |
| `getClothingItem_Body()` | InventoryItem | — | Returns torso clothing item |
| `getClothingItem_Legs()` | InventoryItem | — | Returns legs clothing item |
| `getClothingItem_Feet()` | InventoryItem | — | Returns foot clothing item |
| `getClothingItem_Back()` | InventoryItem | — | Returns back slot item |

**Inventory usage examples:**
```lua
local inv = player:getInventory()
inv:AddItem("Base.Axe")
inv:AddItemFromTable({ type = "Base.Axe", count = 1 })
local axe = inv:FindAndReturn("Base.Axe")  -- returns InventoryItem or nil
local count = inv:getItemCountRecurse("Base.Axe")
inv:DoRemoveItem(axe)
```

---

## Stats & Status

| Method | Return | Parameters | Description |
|--------|--------|-----------|-------------|
| `getStats()` | Stats | — | Returns the Stats object |
| `getNutrition()` | Nutrition | — | Returns nutrition component |
| `getFitness()` | Fitness | — | Returns fitness component |
| `getMoodleLevel(moodleType)` | int | MoodleType | Returns level of a given moodle (0=none) |
| `getBodyDamage()` | BodyDamage | — | Returns the BodyDamage object |
| `getPerkLevel(perk)` | int | PerkFactory.Perks | Returns current level of a perk |
| `getXp()` | XP | — | Returns XP object |
| `getSleepingPillsTaken()` | int | — | Returns count of sleeping pills consumed |

**Stats usage:**
```lua
local stats = player:getStats()
stats:setHunger(0.5)    -- 0.0 = full, 1.0 = starving
stats:setThirst(0.3)
stats:setBoredom(0.0)
stats:setFatigue(0.2)
stats:setStress(0.1)
local hp = player:getHealth()  -- 0.0 to 1.0
```

**Perk usage:**
```lua
local perkLevel = player:getPerkLevel(Perks.Aiming)
-- WARNING: getXp():AddXP() does NOT sync to other clients in MP.
-- Use the global addXp(character, Perks.SkillName, amount) instead.
addXp(player, Perks.Aiming, 25)  -- correct MP-safe version
player:LevelPerk(Perks.Nimble)  -- Force-level a perk
```

---

## Position & Movement

| Method | Return | Parameters | Description |
|--------|--------|-----------|-------------|
| `getX()` | float | — | Returns X world coordinate |
| `getY()` | float | — | Returns Y world coordinate |
| `getZ()` | float | — | Returns Z (floor) coordinate |
| `setPosition(x, y, z)` | void | float, float, float | Teleports player to coordinates |
| `getPlayerMoveDir()` | Vector2 | — | Returns movement direction vector |
| `getMoveSpeed()` | float | — | Returns current movement speed |
| `setMoveSpeed(speed)` | void | float | Sets movement speed |
| `isPlayerMoving()` | boolean | — | Returns true if player is moving |
| `isRunning()` | boolean | — | Returns true if player is running |
| `IsRunning()` | boolean | — | Alias for running check |
| `isAllowRun()` | boolean | — | Returns whether running is permitted |
| `setAllowRun(b)` | void | boolean | Allows or blocks running |
| `setAllowSprint(b)` | void | boolean | Allows or blocks sprinting |
| `isOutside()` | boolean | — | Returns true if player is outdoors |
| `getCell()` | IsoCell | — | Returns the current IsoCell |

---

## Actions & Timed Actions

| Method | Return | Parameters | Description |
|--------|--------|-----------|-------------|
| `isPerformingAnAction()` | boolean | — | Returns true if player is doing an action |
| `setPerformingAnAction(b)` | void | boolean | Sets the performing action flag |
| `isDoingActionThatCanBeCancelled()` | boolean | — | Returns true if current action is cancellable |
| `getTimedActionTimeModifier()` | float | — | Returns speed modifier for timed actions |
| `isTimedActionInstant()` | boolean | — | Returns true if cheat for instant actions is on |

---

## Traits & Character Data

| Method | Return | Parameters | Description |
|--------|--------|-----------|-------------|
| `getStaticTraits()` | Stack | — | Returns permanent trait list |
| `hasTrait(traitName)` | boolean | String | Returns true if player has the named trait |
| `HasTrait(traitName)` | boolean | String | Alias for hasTrait |
| `getTraits()` | Stack | — | Returns all active traits |

```lua
-- Check for a trait
if player:HasTrait("Brave") then
    -- player is brave
end
-- Add a trait (not all are addable at runtime)
player:getTraits():add(TraitFactory.getTrait("Brave"))
```

---

## Mod Data

| Method | Return | Parameters | Description |
|--------|--------|-----------|-------------|
| `getModData()` | table (KahluaTable) | — | Returns the mod data table for this player |
| `transmitModData()` | void | — | (Client) Sends player mod data to server |

```lua
-- Common pattern: get or init mod data
local function getPlayerModData(player)
    local md = player:getModData()
    if not md.MyMod then
        md.MyMod = {
            version = 1,
            someValue = false,
        }
    end
    return md.MyMod
end
```

---

## Multiplayer Checks

| Method | Return | Parameters | Description |
|--------|--------|-----------|-------------|
| `isLocal()` | boolean | — | Returns true if this is the local player |
| `isLocalPlayer()` | boolean | — | Alias — returns true if local player |
| `getOnlineID()` | short | — | Returns the network session ID |
| `getPing()` | int | — | Returns network ping in ms |
| `isGhostMode()` | boolean | — | Returns ghost mode (invisibility cheat) state |
| `setGhostMode(b)` | void | boolean | Enables ghost mode |
| `isNoClip()` | boolean | — | Returns noclip cheat state |
| `setNoClip(b)` | void | boolean | Enables noclip |
| `getCoopPVP()` | boolean | — | Returns cooperative PvP mode |
| `setCoopPVP(b)` | void | boolean | Sets cooperative PvP |

---

## Combat & Attack

| Method | Return | Parameters | Description |
|--------|--------|-----------|-------------|
| `IsAiming()` | boolean | — | Returns true if player is aiming |
| `IsInMeleeAttack()` | boolean | — | Returns true if in melee attack |
| `IsUsingAimWeapon()` | boolean | — | Returns true if using an aiming weapon |
| `isAttacking()` | boolean | — | Returns true if attacking |
| `getAttackType()` | String | — | Returns current attack type string |
| `setAttackType(type)` | void | String | Sets attack type |
| `isBannedAttacking()` | boolean | — | Returns true if attack is banned |
| `setBannedAttacking(b)` | void | boolean | Bans/unbans attacking |
| `Kill(attacker)` | void | IsoGameCharacter | Kills this player (attributed to attacker) |

---

## Visual / Clothing

| Method | Return | Parameters | Description |
|--------|--------|-----------|-------------|
| `getHumanVisual()` | HumanVisual | — | Returns visual model |
| `getVisual()` | BaseVisual | — | Returns base visual component |
| `getItemVisuals()` | ItemVisuals | — | Returns item visual component |
| `dressInClothingItem(type)` | void | String | Equips clothing by type string |
| `dressInNamedOutfit(outfit)` | void | String | Applies a complete named outfit |
| `GetAnimSetName()` | String | — | Returns animation set identifier |
| `onWornItemsChanged()` | void | — | Notifies that worn items changed |

---

## Tag / Label (Multiplayer UI)

| Method | Return | Parameters | Description |
|--------|--------|-----------|-------------|
| `getTagColor()` | ColorInfo | — | Returns name tag color |
| `getTagPrefix()` | String | — | Returns name tag prefix |
| `isShowTag()` | boolean | — | Returns whether name tag is visible |
| `setTagColor(color)` | void | ColorInfo | Sets tag color |
| `setTagPrefix(prefix)` | void | String | Sets tag prefix |
| `setShowTag(b)` | void | boolean | Shows/hides name tag |

---

## Vehicles

| Method | Return | Parameters | Description |
|--------|--------|-----------|-------------|
| `getNearVehicle()` | BaseVehicle | — | Returns nearby vehicle reference |
| `getUseableVehicle()` | BaseVehicle | — | Returns the vehicle this player can use |
| `isNearVehicle()` | Boolean | — | Returns true if player is near a vehicle |
| `isLookingWhileInVehicle()` | boolean | — | Returns look-while-in-vehicle state |

---

## Inherited from IsoGameCharacter (Important Subset)

These methods are from parent class but commonly used on IsoPlayer:

| Method | Description |
|--------|-------------|
| `getHealth()` | Returns health 0.0–1.0 |
| `setHealth(h)` | Sets health value |
| `isDead()` | Returns true if dead |
| `getZ()` | Returns floor level |
| `getCurrentSquare()` | Returns IsoGridSquare |
| `getSquare(x, y, z)` | Returns specific IsoGridSquare |
| `getWeapon()` | Returns active weapon |
| `getSoundRadius()` | Returns character sound radius |
| `getBodyParts()` | Returns BodyParts collection |
| `setVariable(key, value)` | Sets a persistent game variable |
| `getVariable(key)` | Gets a persistent game variable |
| `hasVariable(key)` | Checks if variable exists |

---

## Common Code Patterns

### Check if player has item

```lua
local inv = player:getInventory()
if inv:containsTypeRecurse("Base.Axe") then
    local axe = inv:FindAndReturn("Base.Axe")
    -- use axe
end
```

### Get player position

```lua
local x = player:getX()
local y = player:getY()
local z = player:getZ()
local sq = player:getCurrentSquare()
```

### Add XP to a skill

```lua
-- WARNING: getXp():AddXP() does NOT sync to other clients in MP.
-- Use the global addXp(character, Perks.SkillName, amount) instead.
addXp(player, Perks.Carpentry, 50)  -- correct MP-safe version
```

### Check/set moodles

```lua
local player = getPlayer()
-- Moodles are managed via the MoodleFactory
player:getMoodles():setMoodleLevel(MoodleType.Hungry, 2)
```

### Persist mod data across sessions

```lua
-- On load (in OnCreatePlayer or OnLoad event)
local md = player:getModData()
if not md.MyMod_Initialized then
    md.MyMod_Initialized = true
    md.MyMod_Counter = 0
end

-- During gameplay
local md = player:getModData()
md.MyMod_Counter = md.MyMod_Counter + 1
-- Data is auto-saved with the player save file
```

---

## Notes for B42

- The `IsoPlayer` class is largely unchanged in its interface from B41 to B42
- B42 introduced the **Registry system** for body locations; use `Registries.BodyLocations` to add new clothing slots
- B42 added native `PZAPI.ModOptions` — player preferences are stored separately from ModData
- `getVariable()`/`setVariable()` are Java-layer variables, not Lua ModData — they have different persistence characteristics
- For multiplayer, always check `player:isLocal()` before accessing client-only features

---

## See Also

- `B42_Lua_Events_Official.md` — Events list (OnCreatePlayer, OnPlayerUpdate, etc.)
- `B42_TimedAction_API.md` — Creating timed actions that use the player
- `B42_ModData_SModData.md` — Persistent data patterns
