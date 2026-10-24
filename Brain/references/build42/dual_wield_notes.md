# DUAL WIELD NOTES — B42.17

Fact-checked knowledge on dual wield implementation for Project Zomboid Build 42.17. Synthesizes:
- Public research from official JavaDocs, PZwiki, and TIS patch notes
- CSR's own proven implementation (v1.8.18)

Confidence labels follow the NON_HALLUCINATION_PROTOCOL: `[Confirmed]` `[Likely]` `[Unknown]` `[Needs Testing]` `[Contradicted]` `[Deprecated]`

---

## Executive Summary

A "true" simultaneous dual wield system (both hands attack independently at the same instant) is `[Unknown]` — not proven from public sources alone. However, a **sequential second attack** triggered immediately after the primary attack completes is `[Confirmed]` — CSR implements this in production.

The safest B42.17-compatible designs:
- **Melee dual wield:** trigger a real second attack after `OnPlayerAttackFinished` fires using a `TimedAction`
- **Dual pistols:** a single firearm item with adjusted stats is the safest path; true independent off-hand fire exists in CSR but is WIP
- **Unarmed:** a pseudo-weapon item using vanilla melee behavior

---

## Confirmed APIs (JavaDocs-Verified)

### IsoGameCharacter — Hand Item Access
Source: [IsoGameCharacter JavaDocs](https://projectzomboid.com/modding/zombie/characters/IsoGameCharacter.html)

```lua
player:getPrimaryHandItem()             -- returns InventoryItem or nil
player:setPrimaryHandItem(item)         -- sets primary hand
player:getSecondaryHandItem()           -- returns InventoryItem or nil
player:setSecondaryHandItem(item)       -- sets secondary hand
```

`[Confirmed]` These APIs exist and CSR uses them.

**Critical:** These set the reference, but do not trigger equip animations. For proper equip with animation and slot management, use `ISEquipWeaponAction` instead.

---

### HandWeapon — Firearm and Hit Properties
Source: [HandWeapon JavaDocs](https://projectzomboid.com/modding/zombie/inventory/types/HandWeapon.html)

```lua
weapon:isAimedFirearm()                 -- bool: is this an aimed firearm
weapon:isAimedHandWeapon()              -- bool: is this aimed (non-firearm)
weapon:getProjectileCount()             -- int
weapon:setProjectileCount(n)            -- set projectile count
weapon:getMaxHitCount()                 -- int
weapon:setMaxHitCount(n)               -- set max simultaneous hits
weapon:getCategories()                  -- returns category list
weapon:setCategories(...)               -- set categories
weapon:getSwingAnim()                   -- [Confirmed] used in CSR: "Stab" special-case
```

`[Confirmed]` All of the above confirmed by JavaDocs and CSR usage.

`[Confirmed]` `instanceof(obj, "HandWeapon")` is the correct type check for weapons.

---

### Key Combat Events
Source: PZwiki and CSR production use

| Event | Parameters | Side | Notes |
|---|---|---|---|
| `OnPlayerAttackFinished` | `player (IsoPlayer), weapon` | Client | Fires after primary attack completes. **CSR's primary dual wield trigger.** `[Confirmed]` |
| `OnWeaponSwing` | `character (IsoGameCharacter), weapon` | Shared | Fires at swing START. Useful for state tracking. `[Confirmed]` |
| `OnWeaponHitCharacter` | `attacker, victim (IsoGameCharacter), weapon, damage (float)` | Shared | Fires on weapon hit. CSR uses for unarmed right-hand attacks. `[Confirmed]` |

**Important distinction:** The research document emphasizes `OnWeaponSwing`. CSR's actual dual wield implementation uses `OnPlayerAttackFinished` as the primary trigger. `OnWeaponSwing` fires at swing START (before hit), making it unreliable for triggering a second attack — the primary swing hasn't landed yet.

---

## What CSR Has Proven Works (B42.17)

### Sequential Left-Hand Attack via TimedAction `[Confirmed - CSR production]`

CSR queues `CSR_LeftHandAttackAction` immediately after `OnPlayerAttackFinished` fires. This TimedAction:
- Saves the current secondary slot in `start()`
- Performs the left-hand attack
- Restores the secondary slot in `perform()` / `stop()` / `forceCancel()`

This is NOT simultaneous — it's sequential (right hand swings, then left hand swings). In practice it feels rapid and is multiplayer-safe.

**Trigger:**
```lua
Events.OnPlayerAttackFinished.Add(triggerLeftHandAttack)
```

**Guard in `checkIfValidLeftHandAttack`:**
- Early-exit if primary is a ranged weapon
- Early-exit if `getSwingAnim() == "Stab"` (stab animations conflict)
- Returns `{weapon, mode}` or nil

### Off-Hand Persist Ledger `[Confirmed - CSR production]`

Engine transiently clears the secondary slot during attacks. CSR maintains a per-player `_book[username]` ledger:

```lua
_book[username] = {
    ref       = <IsoItem>,    -- the off-hand item reference
    txr       = <texture>,    -- cached for HUD overlay
    fullType  = "Base.Pistol",
    stamp     = <frameNumber>,
    lastInvOK = <frameNumber>,
}
KEEPALIVE = 180  -- frames before entry expires (~3 sec at 60fps)
INV_CHECK  = 10  -- frames between inventory presence checks
```

### Custom Animation States `[Confirmed - CSR production]`

CSR uses two standalone animation states:
- `CSR_LAttackBash` — for non-knife off-hand weapons
- `CSR_LAttackKnife` — for knife/blade off-hand weapons

Animation variable: `PerformingAction=LAttack`

Bone weighting: both `Bip01_Prop1` (primary) and `Bip01_Prop2` (off-hand) are weighted in these states.

### Unarmed Mode Switching `[Confirmed - CSR production]`

CSR switches between unarmed modes using `changeWeaponStats(weapon, sourceItem, sourceScript)` which copies ~18 properties from a source item onto the live weapon. Mode is tracked via:
```lua
player:setVariable("UnarmedPunching", unarmedMode.UNARMEDPUNCHINGVALUE)
```

Unarmed items:
- `Base.CSR_BarePunching` — unarmed punch mode
- `Base.CSR_BareShove` — shove mode

---

## Known Pitfalls and Risks

### CRITICAL: `getObjectById` is broken in B42.17 `[Confirmed - CSR]`

`getObjectById(id)` does not reliably return zombies in B42.17. CSR's fix:

```lua
-- WRONG (broken in B42.17):
local zombie = getObjectById(id)

-- CORRECT:
local function getZombieFromID(id)
    for _, obj in ipairs(getObjectListForLua()) do
        if instanceof(obj, "IsoZombie") and obj:getOnlineID() == id then
            return obj
        end
    end
end
```

Use `getOnlineID()` in MP, `getID()` in SP.

---

### CRITICAL: `ISEquipWeaponAction:complete()` wrapping creates feedback loop `[Confirmed - CSR v1.8.18]`

CSR v1.8.17 wrapped `ISEquipWeaponAction:complete()` to re-apply the off-hand pistol every time vanilla cleared the secondary slot. This created a feedback loop: when the player tried to equip a different pistol in the primary hand, vanilla's reciprocal handgun-slot logic and the wrapper fought each other, preventing primary pistols from equipping at all.

**Resolution:** The `complete()` wrapper was removed entirely in v1.8.18. Off-hand restore now uses `wrapEquipPerform()` (wraps `perform`, not `complete`) and `attackFinishedRestore()` on `OnPlayerAttackFinished`. Both early-exit when a handgun is already held in the primary hand.

**Rule:** Wrapping `ISEquipWeaponAction:complete()` for off-hand logic is dangerous. Use `perform` instead.

---

### Off-Hand Pistol Renders Unrotated `[Confirmed - CSR v1.8.18]`

Vanilla only weights `Bip01_Prop1` in single-pistol aim states. `Bip01_Prop2` is not weighted. Off-hand pistol renders unrotated without custom FBX + AnimSet override. This is a known visual limitation as of v1.8.18.

**Fix path:** Requires custom FBX with proper `Bip01_Prop2` bone weighting in aim states + custom AnimSet entry.

---

### Off-Hand Swing Animation Broken in B42 (Community-confirmed) `[Confirmed - community]`

Danger Zone Dual Wield mod author stated that the mod functions in B42 but "the off-hand swing animation does not properly play." This aligns with CSR's experience that off-hand animation requires custom AnimSet work.

Source: Steam Workshop — Danger Zone Dual Wield (Workshop ID: `2706426546`)

---

### Primary-Mirror Promotion Edge Cases `[Confirmed - CSR]`

When the primary slot is nil but secondary has a weapon, CSR promotes secondary to primary. Guards required:
- 30-frame window since primary was last seen
- Skip if secondary is broken, two-handed, ranged, or attached to holster
- Skip if player has active timed actions
- Never promote the same item reference as `lastPrimary` (guards two-hand unequip)
- Never promote ranged secondaries (off-hand pistols must stay in secondary)

---

### B42.17 Animation/Combat System Is Fragile `[Confirmed]`

B42.17.0 patch notes include fixes to systems dual wield directly touches:
- Animation tracks abruptly stopping
- Incorrect aiming behavior when pressing `LCTRL` over UI
- Emotes not working with non-weapon off-hand
- Animation not playing when player is seated
- Zombies teleporting on hit (MP desync)
- Climbing rope synchronization
- Host Game returning to main menu when loading saves
- Server-side exception fixes
- Anti-cheat false positive fixes

Source: The Indie Stone — Build 42.17.0 unstable released

**Implication:** Do not assume B41 dual wield techniques work in B42.17 without testing. This build actively touched animation, aiming, hit registration, off-hand state, and MP stability.

---

## Implementation Approaches

### Approach A — Sequential Left-Hand Attack (After Primary Finishes)
**Status:** `[Confirmed - CSR production]`  
**How:** Hook `OnPlayerAttackFinished`. Queue a second `TimedAction` for the left hand.  
**MP safety:** High — server sees a legitimate second action in sequence.  
**Difficulty:** Medium.

### Approach B — Off-Hand as Stat/Visual Modifier Only
**Status:** `[Recommended for new mods starting from scratch]`  
**How:** Check `getSecondaryHandItem()`, modify primary weapon stats, play sounds.  
**MP safety:** High — primary weapon is the only real attacker.  
**Difficulty:** Low.

### Approach C — Single Weapon Representing Two Pistols
**Status:** `[Confirmed viable via item scripts]`  
**How:** One `HandWeapon` firearm item with adjusted `ProjectileCount`, spread, recoil.  
**MP safety:** High — vanilla processes one weapon.  
**Difficulty:** Low.

### Approach D — Hotkey Off-Hand Strike
**Status:** `[Needs Testing]` — CSR has WIP implementation (v1.8.17+, gated by `F` key + right-mouse aim)  
**How:** Client input → server validation → server-authoritative damage application.  
**MP safety:** Medium — depends on server-side validation design.  
**Difficulty:** High.

### Approach E — Custom Animation Override
**Status:** `[Needs Testing]` — B42.17 multiplayer-safe combat animation override is not fully proven.  
**How:** Custom FBX, AnimSet entries with `Bip01_Prop2` weighting.  
**MP safety:** Unknown for combat animation graph overrides.  
**Difficulty:** Very high. Do not start here.

### What Not to Do in v1
- Manual `Hit(...)` calls from client-only Lua
- Client-only damage application (not server-validated)
- Forced equipment swaps during attack frames
- Off-hand firearm ammo consumption without server validation
- Wrapping `ISEquipWeaponAction:complete()` for off-hand logic

---

## B42.17 Multiplayer Safety Rules for Dual Wield

| Pattern | Safety |
|---|---|
| One real attacking weapon (primary) | Safe |
| Second attack triggered via sequential TimedAction | Safe (CSR-proven) |
| Off-hand as condition/stat modifier | Safe |
| Server validates all inventory/ammo/durability changes | Safe |
| Client-only damage application | Unsafe |
| Swapping held items during attack frames | Risky — desync potential |
| Animation overrides that mismatch combat state | Risky |
| Manual Java combat method calls from Lua | Unknown |

---

## Unarmed Combat Notes

`player:setVariable("UnarmedPunching", value)` controls unarmed animation state. `[Confirmed - CSR]`

When primary is nil and secondary has a real non-ranged weapon, CSR promotes secondary to primary and sets unarmed mode. The animation is managed via a per-frame `OnPlayerUpdate` state machine, not via events alone — because `OnPlayerAttackFinished` alone misses cases where third-party sync mods clear slots without firing the event.

---

## Available CC0 / Licensed Assets

Assets identified in research with clear licenses. Must still be converted for PZ format.

| Asset | Source | License | Notes |
|---|---|---|---|
| Handgun sprite | OpenGameArt — Handgun by Zxelt | CC0 | 2D icon, needs resize/rename to `item_*.png` |
| Pistol 3D model | OpenGameArt — Pistol by shedmon | CC0 | FBX/GLTF, needs Blender cleanup and PZ scale |
| Free Firearm Sound Library | OpenGameArt — Free Firearm Sound Library | CC0 | Multiple sounds, needs normalize/trim |
| 3 Melee Sounds | OpenGameArt — 3 Melee Sounds | CC0 | Swing/hit sounds |
| Weapon/gun icons | game-icons.net | CC BY 3.0 | **Attribution required.** Good for UI/HUD icons |
| Mixamo animations | Adobe Mixamo | Adobe TOS | **Not CC0.** Can use in projects per Adobe FAQ, but do not package raw files. Retarget to PZ rig. |

---

## Reference Mods (Do Not Copy Code Without Confirming License)

| Mod | Workshop ID | Status | Notes |
|---|---|---|---|
| Danger Zone Dual Wield | `2706426546` | B42 functions, off-hand anim broken | Author welcomes community use; no formal source license found |
| DualPistolWield | `3175340452` | Tagged B41 only | No B42.17 proof |
| TrueDualWield (SportXAI) | unknown | Compatible with CSR v1.8.18 | CSR confirmed compatible after removing `complete()` wrapper |
