# Body Location API — Verified B42 Pattern

Source: Authentic Z - Backpacks+ (`AuthenticZBackpacks+`, Workshop ID 2335368829).
This is production code running in one of the most complex B42 clothing mods. Treat this as ground truth.

## The Problem With `ItemBodyLocation.register()`

The simple call `ItemBodyLocation.register("MyMod:MySlot")` creates a slot object but does NOT
insert it into any body group. Without group membership, the slot never appears in the equip system,
hotbar, or visual layering. It also does not preserve vanilla layering rules (exclusive, hideModel,
altModel) for surrounding slots.

## Correct Pattern: Full Group Rebuild on OnGameBoot

```lua
require "NPCs/BodyLocations"

local BodyAPI = BodyLocations      -- group manager
local SlotAPI = ItemBodyLocation   -- slot registry
local RL      = ResourceLocation

-- Clone layering rules from old group → new group for one location
local function cloneLocationRules(sourceGroup, locationId, targetGroup)
    for i = 0, sourceGroup:size() - 1 do
        local otherId = sourceGroup:getLocationByIndex(i):getId()
        if sourceGroup:isExclusive(locationId, otherId)  then targetGroup:setExclusive(locationId, otherId)  end
        if sourceGroup:isHideModel(locationId, otherId)  then targetGroup:setHideModel(locationId, otherId)  end
        if sourceGroup:isAltModel(locationId, otherId)   then targetGroup:setAltModel(locationId, otherId)   end
    end
end

-- Rebuild a body group (e.g. "Human") and inject new slots at anchor positions
-- insertions = list of { id = "Mod:SlotId", anchor = SlotAPI.ExistingSlot, before = bool }
local function rebuildGroupWithInsertions(targetGroupId, insertions)
    -- 1. Snapshot the live group list (reset() clears the live view)
    local groupView     = BodyAPI.getAllGroups()
    local groupSnapshot = {}
    for i = 0, groupView:size() - 1 do
        groupSnapshot[#groupSnapshot + 1] = groupView:get(i)
    end

    -- 2. Nuke and rebuild
    BodyAPI.reset()

    for _, oldGroup in ipairs(groupSnapshot) do
        local newGroup = BodyAPI.getGroup(oldGroup:getId())

        for i = 0, oldGroup:size() - 1 do
            local existingId = oldGroup:getLocationByIndex(i):getId()

            -- Insert BEFORE anchor (if applicable)
            if oldGroup:getId() == targetGroupId then
                for _, def in ipairs(insertions) do
                    if def.before then
                        local anchorId = type(def.anchor) == "string" and RL.of(def.anchor) or def.anchor
                        if anchorId == existingId then
                            local newId = type(def.id) == "string" and SlotAPI.get(RL.of(def.id)) or def.id
                            newGroup:getOrCreateLocation(newId)
                        end
                    end
                end
            end

            -- Recreate the vanilla slot
            newGroup:getOrCreateLocation(existingId)

            -- Insert AFTER anchor (if applicable)
            if oldGroup:getId() == targetGroupId then
                for _, def in ipairs(insertions) do
                    if not def.before then
                        local anchorId = type(def.anchor) == "string" and RL.of(def.anchor) or def.anchor
                        if anchorId == existingId then
                            local newId = type(def.id) == "string" and SlotAPI.get(RL.of(def.id)) or def.id
                            newGroup:getOrCreateLocation(newId)
                        end
                    end
                end
            end
        end

        -- 3. Restore vanilla layering rules
        for i = 0, oldGroup:size() - 1 do
            local locId = oldGroup:getLocationByIndex(i):getId()
            newGroup:setMultiItem(locId, oldGroup:isMultiItem(locId))
            cloneLocationRules(oldGroup, locId, newGroup)
        end
    end
end

-- Initialization
local function setupMyModBodyLocations()
    -- Fallback guard for slot that may not exist in all branches
    local outerVestLayer = SlotAPI.TorsoExtraVestBullet or SlotAPI.TorsoExtraVest

    rebuildGroupWithInsertions("Human", {
        -- Insert after outerVestLayer:
        { id = "MyMod:MyCustomSlot", anchor = outerVestLayer },
        -- Insert before an anchor:
        -- { id = "MyMod:AnotherSlot", anchor = outerVestLayer, before = true },
    })
end

Events.OnGameBoot.Add(setupMyModBodyLocations)
```

## Key APIs

| Expression | Type | Purpose |
|---|---|---|
| `BodyLocations` | global table | Body group manager |
| `ItemBodyLocation` | global table | Slot registry; also has named constants like `SlotAPI.TorsoExtraVest` |
| `ResourceLocation.of("Mod:SlotId")` | ResourceLocation | Convert string to resource location ID |
| `BodyAPI.getAllGroups()` | Java ArrayList | All body groups (use 0-indexed iteration) |
| `BodyAPI.reset()` | void | Clear all groups — must be done before rebuild |
| `BodyAPI.getGroup(groupId)` | BodyLocationGroup | Get-or-create a group after reset |
| `group:getOrCreateLocation(slotId)` | BodyLocation | Add a slot to the group |
| `SlotAPI.get(RL.of("Mod:Id"))` | ItemBodyLocation | Get-or-create an ItemBodyLocation object for the ID |
| `group:setExclusive(idA, idB)` | void | Slots A and B are mutually exclusive |
| `group:setHideModel(idA, idB)` | void | Slot A hides model when B is worn |
| `group:setAltModel(idA, idB)` | void | Slot A uses alt model when B is worn |
| `group:setMultiItem(id, bool)` | void | Allow multiple items in this slot |
| `group:isExclusive(idA, idB)` | bool | Query exclusive relationship |
| `group:isHideModel(idA, idB)` | bool | Query hide-model relationship |
| `group:isAltModel(idA, idB)` | bool | Query alt-model relationship |
| `group:isMultiItem(id)` | bool | Query multi-item flag |
| `group:getLocationByIndex(i)` | BodyLocation | 0-indexed slot access |
| `group:size()` | int | Number of slots in group |
| `group:getId()` | string | Group identifier (e.g. `"Human"`) |

## Important Notes

- Hook is **`Events.OnGameBoot`** — NOT `registries.lua`, NOT `OnGameStart`, NOT `OnInitGlobalModData`
- `require "NPCs/BodyLocations"` must be at file top
- `BodyAPI.reset()` is destructive — always snapshot first
- Slot IDs must be namespaced: `"MyMod:SlotName"` (colon separator, NOT dot)
- Named slot constants on `ItemBodyLocation` (e.g. `SlotAPI.TorsoExtraVest`) are ResourceLocation objects, not strings — pass them directly as `anchor`
- Always add a nil-fallback for slot constants: `SlotAPI.TorsoExtraVestBullet or SlotAPI.TorsoExtraVest`
- The clothing XML file references the slot by its namespaced ID in the `<BodyLocation>` field

## ClothingItem XML Connection

The slot ID used in Lua must match the `<BodyLocation>` value in the clothing item XML:
```xml
<BodyLocation>MyMod:MyCustomSlot</BodyLocation>
```
