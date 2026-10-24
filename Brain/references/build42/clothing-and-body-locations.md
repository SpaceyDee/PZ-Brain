# Clothing, Body Locations & Model Placement (B42)

Reference mod: **Authentic Z - Backpacks+** (workshop `2335368829`).
All patterns below are verified against the live B42 codebase of that mod.

---

## 1. ClothingItem XML

Clothing items are defined by an XML file under `media/clothing/clothingItems/`.

```xml
<?xml version="1.0" encoding="utf-8"?>
<clothingItem>
    <m_MaleModel>skinned\backpacks\MaleAlicepack</m_MaleModel>
    <m_FemaleModel>skinned\backpacks\FemaleAlicepack</m_FemaleModel>
    <m_GUID>9615800e-12cc-4827-857b-a0b99790b7c5</m_GUID>
    <m_Static>false</m_Static>
    <m_AllowRandomTint>false</m_AllowRandomTint>
    <m_AttachBone></m_AttachBone>
    <textureChoices>Clothes\Backpacks\ALICEpack_Festive</textureChoices>
</clothingItem>
```

- `m_MaleModel` / `m_FemaleModel`: path relative to `media/models_X/` (backslash, no extension)
- `m_GUID`: unique per clothing item (generate a fresh UUID for each variant)
- `m_Static`: `false` for skinned clothing meshes; `true` for static prop attachments
- `m_AttachBone`: leave empty for standard clothing; used for prop-bone attachment
- Multiple `<textureChoices>` entries for random skin variants

---

## 2. In-Item-Script Clothing Fields

```
item Bag_MyBackpack
{
    ItemType            = base:Container,
    ClothingItem        = Bag_MyBackpack,       -- references the XML filename (no path, no extension)
    BodyLocation        = Back,                 -- vanilla slot, or custom (see §4)
    CanBeEquipped       = Back,                 -- must match BodyLocation
    Weight              = 1.0,
    Capacity            = 10,
    WeightReduction     = 60,
    WorldStaticModel    = WorldItem_MyBackpack,
    OpenSound           = OpenBag,
    CloseSound          = CloseBag,
    PutInSound          = PutItemInBag,
    RunSpeedModifier    = 0.95,
}
```

### ReplaceInSecondHand / ReplaceInPrimaryHand

When a bag is picked up and carried in-hand (not worn on back), PZ swaps the
worn clothing visual for a hand-carrying visual. The `_LHand` and `_RHand`
XML files serve this purpose — they typically reference the **same FBX mesh**
but trigger the `holdingbagleft` / `holdingbagright` animation state:

```
ReplaceInSecondHand  = Bag_MyBackpack_LHand holdingbagleft,
ReplaceInPrimaryHand = Bag_MyBackpack_RHand holdingbagright,
```

**`_LHand`/`_RHand` are NOT front-mounted variants.** They are purely the
in-hand carry visuals. Do not confuse them with chest/front-pack mounting.

### ClothingItemExtra — two-state toggle

For items that can switch between two modes (e.g. Tighten/Loosen, Open/Closed jacket):

```
-- Item A (tightened state)
ClothingItem            = Bag_UtilityBeltFront,
ClothingItemExtra       = AuthenticZBackpacksPlus.Bag_UtilityBeltFront_Loose,
ClothingItemExtraOption = Loosen,
clothingExtraSubmenu    = Tighten,

-- Item B (loosened state)
ClothingItem            = Bag_UtilityBeltFront_Loose,
ClothingItemExtra       = AuthenticZBackpacksPlus.Bag_UtilityBeltFront,
ClothingItemExtraOption = Tighten,
clothingExtraSubmenu    = Loosen,
```

`ClothingItemExtra` = `<module>.<itemId>` of the partner item.
`ClothingItemExtraOption` = the context menu label for the action.
`clothingExtraSubmenu` = sub-category the option sits inside.
Translation keys for these labels go in `ContextMenu_EN.txt` / `ContextMenu.json`.

---

## 3. Vanilla Body Locations (Back slot)

Standard back-mounted bags use:

```
BodyLocation  = Back,
CanBeEquipped = Back,
```

No custom registration required. The FBX for back-mounted items has its
geometry skinned to back-side spine/shoulder bones and will render behind
the character automatically.

---

## 4. Custom Body Locations (Front / Chest / Torso slots)

Authentic Z registers two extra torso slots: `AZ:TorsoRigPlus2` (used for
utility belts worn on the chest) and `AZ:TorsoExtraPlus1`.

### Insert into the body group layer order via `OnGameBoot`

**VERIFIED 2026-05-22 (AZ source):** A `registries.lua` pre-registration step
is NOT required. `SlotAPI.get(RL.of("Mod:SlotId"))` does get-or-create
as part of the rebuild. AZ ships no `registries.lua` at all.

Insert the slot at the correct depth in the Human group using the
`BodyLocations.reset()` rebuild pattern. Hook `Events.OnGameBoot` (fires
before world load — earlier than OnGameStart). See [body-location-api.md](body-location-api.md) for the full canonical pattern.

```lua
-- Client Lua file
require "NPCs/BodyLocations"

local function setupBodyLocations()
    local BodyAPI = BodyLocations
    local SlotAPI = ItemBodyLocation
    local RL      = ResourceLocation

    -- Snapshot all groups before reset clears them
    local groupView     = BodyAPI.getAllGroups()
    local groupSnapshot = {}
    for i = 0, groupView:size() - 1 do
        groupSnapshot[#groupSnapshot + 1] = groupView:get(i)
    end

    BodyAPI.reset()

    for _, oldGroup in ipairs(groupSnapshot) do
        local newGroup = BodyAPI.getGroup(oldGroup:getId())

        for i = 0, oldGroup:size() - 1 do
            local existingId = oldGroup:getLocationByIndex(i):getId()

            -- Insert BEFORE the chosen anchor slot
            if oldGroup:getId() == "Human" then
                local anchorSlot = SlotAPI.TorsoExtraVestBullet or SlotAPI.TorsoExtraVest
                if anchorSlot == existingId then
                    local newId = SlotAPI.get(RL.of("MyMod:FrontPack"))
                    if newId then
                        newGroup:getOrCreateLocation(newId)
                    end
                end
            end

            -- Recreate original slot
            newGroup:getOrCreateLocation(existingId)
        end

        -- Restore vanilla layering rules (exclusive, hideModel, altModel)
        for i = 0, oldGroup:size() - 1 do
            local locId = oldGroup:getLocationByIndex(i):getId()
            newGroup:setMultiItem(locId, oldGroup:isMultiItem(locId))
            for j = 0, oldGroup:size() - 1 do
                local otherId = oldGroup:getLocationByIndex(j):getId()
                if oldGroup:isExclusive(locId, otherId) then
                    newGroup:setExclusive(locId, otherId)
                end
                if oldGroup:isHideModel(locId, otherId) then
                    newGroup:setHideModel(locId, otherId)
                end
                if oldGroup:isAltModel(locId, otherId) then
                    newGroup:setAltModel(locId, otherId)
                end
            end
        end
    end
end

Events.OnGameBoot.Add(setupBodyLocations)
```

### Step 3 — Item script

```
item MyMod_FrontPack
{
    ItemType        = base:Container,
    ClothingItem    = MyMod_FrontPack,
    BodyLocation    = MyMod:FrontPack,
    CanBeEquipped   = MyMod:FrontPack,
    Weight          = 0.5,
    Capacity        = 4,
}
```

Both `BodyLocation` and `CanBeEquipped` must reference the same custom slot.

### Step 4 — ClothingItem XML

```xml
<?xml version="1.0" encoding="utf-8"?>
<clothingItem>
    <m_MaleModel>skinned\MyMod\FrontPackMale</m_MaleModel>
    <m_FemaleModel>skinned\MyMod\FrontPackFemale</m_FemaleModel>
    <m_GUID><!-- new UUID --></m_GUID>
    <m_Static>false</m_Static>
    <m_AllowRandomTint>false</m_AllowRandomTint>
    <m_AttachBone></m_AttachBone>
    <textureChoices>Clothes\MyMod\FrontPackTex</textureChoices>
</clothingItem>
```

---

## 5. The FBX Constraint — You Cannot Flip a Skinned Mesh

**Changing `BodyLocation` alone will NOT move a skinned clothing mesh from
back to front.** This is the most common mistake when attempting front-pack
mounting.

### Why

Skinned clothing FBXes have their geometry **vertex-weighted to skeleton
bones**. A back-mounted backpack has vertices weighted to back-side spine
bones and shoulder-blade bones. When the skeleton poses, those vertices
follow those bones — which are always behind the character. The `BodyLocation`
slot controls which equipment layer the item occupies (can two items be worn
at once, hide-model rules, etc.) but has **no effect on mesh position**.

### The `attachment { rotate }` block does not help here

The `attachment { offset, rotate }` block in a model script works for
**non-skinned (static) weapon/hotbar** models — props attached to a specific
named bone via a rigid transform. It does not affect skinned clothing meshes,
which deform with the full skeleton regardless.

### Correct solution: re-rig the FBX

To have a backpack appear on the **front** of the character:

1. Author a new FBX with the bag geometry positioned in front of the torso
2. Skin/weight the geometry to **front-facing torso bones** (chest, front
   spine bones, clavicle)
3. Reference this new FBX in the `_FrontPack` clothingItem XML
4. Use the custom `BodyLocation` slot as described in §4

There is no shortcut via Lua, model scripts, or attachment offsets that
avoids this 3D modelling step for skinned clothing items.

---

## 6. Model Script — `attachment world` (ground/drop orientation)

For non-skinned world item models (items dropped on the ground), the
`attachment world { offset, rotate }` block corrects how the item sits
on the floor:

```
model WorldItem_MyBackpack
{
    mesh = WorldItems/WorldItem_MyBackpack,
    texture = Clothes/Backpacks/MyBackpack,

    attachment world
    {
        offset = 0.0 0.0 0.0,
        rotate = 0.0 0.0 180.0,
    }
}
```

This **does** work for static world-item models. It has no effect on worn
skinned clothing.

---

## 7. AttachmentsProvided (clothing → hotbar slots)

`AttachmentsProvided` on a clothing/bag script declares which **hotbar
attachment slots** the clothing item creates for the player to use. This is
separate from `BodyLocation` (where the item itself renders):

```
item Bag_MilitaryWebbing
{
    BodyLocation        = base:webbing,
    CanBeEquipped       = base:webbing,
    AttachmentsProvided = AZWebbingLeft;AZWebbingRight,
}
```

The slot type names (`AZWebbingLeft`, etc.) must be defined in the client
`ISHotbarAttachDefinition` table via `table.insert(ISHotbarAttachDefinition, { type = "AZWebbingLeft", ... })`.

**Do not confuse `AttachmentsProvided` (clothing → creates slots) with
`AttachmentType` (weapon/item → fits into a slot).** They are opposite roles.

---

## 8. Hotbar Attachment Slot Definition

New hotbar slots are declared by inserting into `ISHotbarAttachDefinition`
in a client Lua file:

```lua
local MySlot = {
    type      = "MyMod_FrontSlot",
    name      = "Front Slot",
    animset   = "back",          -- animation set name for the attached item
    attachments = {
        Knife = "FrontKnife_MyMod",
        Rope  = "FrontRope_MyMod",
    },
}
table.insert(ISHotbarAttachDefinition, MySlot)
```

The `attachments` table maps item attachment-type names to AnimSet bone
attachment point names defined in the AnimSet XML.

---

## 9. Translation for Clothing Context Menu Options

Context menu strings for clothing options (Loosen, Tighten, Wear on Left, etc.)
go in:

- `42/media/lua/shared/Translate/EN/ContextMenu.json` — flat JSON (source of truth)
- `42/media/lua/shared/Translate/EN/ContextMenu_EN.txt` — Lua table (runtime)

Both files carry identical content. The `42/` path (not `common/`) is correct
for context menu translations. Only **Sandbox** translations require `common/`.

**Non-EN languages:** Two valid approaches, both confirmed in production:

| Approach | When to use |
|---|---|
| `_XX.txt` Lua table only | Legacy / Backpacks+ pattern; simplest for translator contributions |
| `XX/ContextMenu.json` flat JSON | Modern pattern (AZ Current); JSON works for all language folders, not only EN |

Authentic Z - Backpacks+ uses TXT-only for non-EN. Authentic Z - Current uses
pure JSON for all languages (CH, CN, DE, EN, etc.). Both load correctly in B42.

```json
{
  "ContextMenu_Loosen": "Loosen",
  "ContextMenu_Tighten": "Tighten",
  "ContextMenu_WearLeft": "Wear on Left Side",
  "ContextMenu_WearRight": "Wear on Right Side"
}
```
