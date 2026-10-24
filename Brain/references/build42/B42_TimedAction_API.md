# B42 ISBaseTimedAction API

**Source(s):**
- https://pzwiki.net/wiki/ISBaseTimedAction (pzwiki.net 403 at research time — content from search snippets)
- https://pzwiki.net/wiki/Timed_Actions (403 at research time)
- https://demiurgequantified.github.io/ProjectZomboidLuaDocs/ — Unofficial LuaDocs
- Search snippets: pzwiki.net, TIS forums, community guides

---

## Overview

`ISBaseTimedAction` is the base class for all timed player actions in Project Zomboid. A "timed action" represents a task the player performs over time — eating, reading a book, fortifying a window, etc.

- Timed actions are implemented in Lua (in `media/lua/client/` typically)
- They are a subclass of `ISBaseObject`
- Once instantiated, actions are added to `ISTimedActionQueue` and processed sequentially
- The game calls the action's `update()` method from Java every tick

---

## Critical B42.13+ Change: Global Storage for Multiplayer

**Since Build 42.13.0**, timed action classes **must be stored globally** to work correctly in multiplayer. This is a fundamental behavior change from B41.

**Problem:** Local variables go out of scope and cause issues during multiplayer synchronization.

**Solution:** Store the class in the global namespace with a prefixed name to avoid conflicts:

```lua
-- WRONG (B41 style — broken in B42 multiplayer):
local MyTimedAction = ISBaseTimedAction:derive("MyTimedAction")

-- CORRECT (B42 style — global with prefix):
MyMod_MyTimedAction = ISBaseTimedAction:derive("MyMod_MyTimedAction")
```

Alternatively, structure it so it can be required:

```lua
-- In MyMod/media/lua/client/MyMod/MyTimedAction.lua
MyMod_MyTimedAction = ISBaseTimedAction:derive("MyMod_MyTimedAction")
-- ... define methods ...
return MyMod_MyTimedAction
```

---

## Creating a Timed Action

### Template

```lua
-- Global declaration (required for B42 multiplayer)
MyMod_MyAction = ISBaseTimedAction:derive("MyMod_MyAction")

-- Constructor
function MyMod_MyAction:new(character, targetItem, maxTime)
    local o = ISBaseTimedAction.new(self, character)
    -- o.character is set automatically by ISBaseTimedAction.new
    -- WARNING: store item:getID() not the item reference — object refs go stale in MP. Re-resolve from inventory in perform()
    o.targetItemId = targetItem and targetItem:getID() or nil  -- store ID, not the item itself
    o.maxTime    = maxTime    -- duration in ticks (at 30 ticks/sec)
    o.stopOnWalk = true       -- stop action if character moves (default: true)
    o.stopOnRun  = true       -- stop action if character runs (default: true)
    setmetatable(o, self)
    self.__index = self
    return o
end

-- Called when the action starts
function MyMod_MyAction:start()
    -- Play an animation, show a progress bar label, etc.
    self:setActionAnim("Idle")  -- e.g., play the Idle animation
    -- self.character:playAnim("Idle")
end

-- Called every tick while the action runs
-- self.time counts up from 0; self.maxTime is the target
function MyMod_MyAction:update()
    -- Optional: update progress visuals
    -- self.time is automatically incremented by the queue
end

-- Called when the action completes successfully (self.time >= self.maxTime)
function MyMod_MyAction:perform()
    -- The action is done! Execute the result.
    if self.targetItem then
        local inv = self.character:getInventory()
        inv:Remove(self.targetItem)
    end
    ISBaseTimedAction.perform(self)  -- MUST call super; clears the action from queue
end

-- Called when the action is stopped/cancelled before completing
function MyMod_MyAction:stop()
    -- Undo start() effects, clean up
    ISBaseTimedAction.stop(self)  -- MUST call super
end

-- Called every tick to check if this action is still valid
-- Return false to cancel (e.g., if item no longer exists)
function MyMod_MyAction:isValid()
    -- Check preconditions
    if not self.targetItem then return false end
    if not self.character:getInventory():ContainsItem(self.targetItem) then
        return false
    end
    return true
end
```

### Queueing the Action

```lua
-- Queue the action for a player
local player  = getPlayer()
local item    = player:getInventory():FindAndReturn("Base.Axe")
local maxTime = 50  -- 50 ticks ≈ ~1.67 seconds at 30 ticks/sec

local action = MyMod_MyAction:new(player, item, maxTime)
ISTimedActionQueue.add(action)
```

---

## ISBaseTimedAction Method Reference

### Constructor and Lifecycle Methods

| Method | Called by | Description |
|--------|-----------|-------------|
| `ISBaseTimedAction:new(character)` | You | Creates a new action instance. Sets `self.character`. |
| `action:start()` | Game | Called once when action begins. Override to set up. |
| `action:update()` | Game (every tick) | Called each tick. `self.time` increments automatically. |
| `action:perform()` | Game | Called when `self.time >= self.maxTime`. Action succeeded. **Must call `ISBaseTimedAction.perform(self)`**. |
| `action:stop()` | Game | Called when action is cancelled/stopped early. **Must call `ISBaseTimedAction.stop(self)`**. |
| `action:isValid()` | Game (every tick) | Return `false` to cancel the action. |
| `action:forceCancel()` | You | Programmatically cancel the action (calls stop). |
| `action:forceComplete()` | You | Programmatically complete the action (calls perform). |

### Properties (Set Before Queueing)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `self.maxTime` | number | required | Duration of action in game ticks |
| `self.time` | number | 0 | Current elapsed ticks (auto-incremented) |
| `self.character` | IsoPlayer | set by new() | The character performing the action |
| `self.stopOnWalk` | boolean | true | Cancel if character starts walking |
| `self.stopOnRun` | boolean | true | Cancel if character starts running |
| `self.allowDynamicMaxTime` | boolean | true | Whether maxTime can change during action. Set to `false` if you've already baked `getTimedActionTimeModifier()` into `maxTime` yourself. |

### Helper Methods from ISBaseTimedAction

| Method | Description |
|--------|-------------|
| `self:setActionAnim(animName)` | Sets the character animation to play during the action |
| `self:setAnimVariable(varName, value)` | Sets an animation variable (for AnimSet conditions) |
| `self:getProgressBar()` | Returns the progress bar UI element |
| `self:setOverrideHandModels(primary, secondary)` | Sets hand model overrides during action |

---

## ISTimedActionQueue Reference

```lua
-- Add an action to the queue
ISTimedActionQueue.add(action)

-- Clear all queued actions for a character
ISTimedActionQueue.clear(character)

-- Check if a specific action class type is queued
ISTimedActionQueue.hasActionType(character, "MyMod_MyAction")

-- Get the queue object + inspect current/next
local q = ISTimedActionQueue.getTimedActionQueue(character)
local current = q and q.current        -- currently-running action (nil if idle)
local next_q  = q and q.queue and q.queue[1]
```

> **Corrected 2026-05-31 (verified: `b42.timed-action.queue-api`).** Older B41-era
> guides listed `addFront`, `isQueued`, and `getAction` as methods on
> `ISTimedActionQueue`. **They do not exist in B42.18 vanilla.** Use
> `hasActionType(character, type)` for queue lookup and
> `getTimedActionQueue(character).current` / `.queue[1]` for action inspection.

---

## Time Calculations

The game runs at approximately **30 ticks per second** but this can vary.

```lua
-- Rough timing constants
local TICKS_PER_SECOND = 30
local duration_1sec    = 1  * TICKS_PER_SECOND   -- 30 ticks
local duration_5sec    = 5  * TICKS_PER_SECOND   -- 150 ticks
local duration_1min    = 60 * TICKS_PER_SECOND   -- 1800 ticks

-- Skills can modify action time via getTimedActionTimeModifier()
local baseTime = 50
local modifier = player:getTimedActionTimeModifier()
local finalTime = baseTime * modifier  -- faster = lower modifier
```

---

## Full Working Example

```lua
-- File: media/lua/client/MyMod/ISMyModEatAction.lua
-- Action: Player eats a custom food item

MyMod_EatFoodAction = ISBaseTimedAction:derive("MyMod_EatFoodAction")

function MyMod_EatFoodAction:new(player, foodItem)
    local o = ISBaseTimedAction.new(self, player)
    -- WARNING: store item:getID() not the item reference — object refs go stale in MP. Re-resolve from inventory in perform()
    o.foodItemId = foodItem and foodItem:getID() or nil  -- store ID, not the item itself
    o.maxTime  = 40  -- ~1.3 seconds
    o.stopOnWalk = false  -- can eat while walking slowly
    o.stopOnRun  = true
    setmetatable(o, self)
    self.__index = self
    return o
end

function MyMod_EatFoodAction:isValid()
    if not self.foodItemId then return false end
    -- Make sure the item is still in inventory (check by ID, not object reference)
    return self.character:getInventory():containsID(self.foodItemId)
end

function MyMod_EatFoodAction:start()
    -- Play eating animation
    self:setActionAnim("Eat")
end

function MyMod_EatFoodAction:update()
    -- Nothing needed here for a simple action
end

function MyMod_EatFoodAction:perform()
    -- Re-resolve item from inventory by ID (object reference may be stale in MP)
    local inv = self.character:getInventory()
    if not inv:containsID(self.foodItemId) then
        ISBaseTimedAction.perform(self)
        return
    end
    local foodItem = inv:getItemById(self.foodItemId)

    -- Apply food effect
    local stats = self.character:getStats()
    stats:setHunger(math.max(0, stats:getHunger() - 0.3))

    -- Remove item from inventory
    inv:Remove(foodItem)

    -- MUST call super
    ISBaseTimedAction.perform(self)
end

function MyMod_EatFoodAction:stop()
    -- MUST call super
    ISBaseTimedAction.stop(self)
end

-- Usage: (in a context menu handler, etc.)
-- local action = MyMod_EatFoodAction:new(player, foodItem)
-- ISTimedActionQueue.add(action)
```

---

## Chaining Multiple Actions

```lua
-- Actions can be chained; they execute sequentially
local action1 = MyMod_WalkToAction:new(player, targetX, targetY)
local action2 = MyMod_PickUpAction:new(player, targetItem)
ISTimedActionQueue.add(action1)
ISTimedActionQueue.add(action2)  -- runs after action1 completes
```

---

## Vanilla Timed Action Examples

Reference these in game files (`media/lua/client/`) for real-world patterns:

| File | Actions |
|------|---------|
| `ISEatFoodAction.lua` | Eating food |
| `ISBandageAction.lua` | Applying bandages |
| `ISTimedActionFortify.lua` | Fortifying windows/doors |
| `ISReadABook.lua` | Reading books |
| `ISReloadWeaponAction.lua` | Reloading weapons |
| `ISGrabItemAction.lua` | Picking up items |
| `ISDropItemAction.lua` | Dropping items |

---

## Common Mistakes

1. **Not calling `ISBaseTimedAction.perform(self)`** in `perform()` — causes the queue to get stuck
2. **Not calling `ISBaseTimedAction.stop(self)`** in `stop()` — causes animation to get stuck
3. **Storing class in a local variable** — breaks multiplayer in B42.13+; use a global with a prefix
4. **`maxTime = 0`** — action completes instantly on first tick (might be intentional)
5. **Using Java ticks directly** — if `getTimedActionTimeModifier()` is not applied, actions won't respect speed-up skills/traits

---

## See Also

- `B42_Lua_Events_Official.md` — Events that relate to actions (OnPlayerAttackFinished, etc.)
- `B42_IsoPlayer_API.md` — Player methods used in actions
- `B42_API_Changes_from_B41.md` — B42.13 timed action global requirement
