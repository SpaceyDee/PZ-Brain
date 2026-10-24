# Build 42 Environmental Destruction APIs (Lua-callable)

Verified against `projectzomboid.jar` (B42.x) and vanilla `media/lua/**`. All signatures from `javap -p`; all examples copied from vanilla call sites.

Conventions used throughout:
- Prefer explicit guards over blanket `pcall`/`safeCall` wrappers. `pcall` works in verified B42.18 dedicated probes; `safeCall` is separately unverified. Guard with `obj and obj.method and obj:method(...)`.
- "Server-authoritative" = the canonical state change must run on the server (or singleplayer); pure client calls de-sync in MP and the server will overwrite.
- `transmit*` / `sync*` methods are how Java pushes state to clients; call them from the server after mutating.

---

## 1. IsoWindow — smash / break

**Signatures** (`zombie.iso.objects.IsoWindow`):
```
public void smashWindow();
public void smashWindow(boolean);
public void smashWindow(boolean, boolean);
public void WeaponHit(IsoGameCharacter, HandWeapon);   // glass-shatter w/ damage to char
public boolean isDestroyed();
public boolean isSmashed();
public void setSmashed(boolean);
public IsoBarricade getBarricadeOnSameSquare();
public IsoCurtain HasCurtains();
```

**Side:** server-authoritative. `WeaponHit` already routes through the netcode in B42; calling `smashWindow()` directly on the server is the cleanest path. From client, queue an `ISSmashWindow` timed-action — its `:complete()` is gated by `isServer()`.

**Vanilla example** — `media/lua/shared/TimedActions/ISSmashWindow.lua:46-52`:
```lua
function ISSmashWindow:complete()
    if isServer() and not self.window:isDestroyed() then
        if self.vehiclePart ~= nil then
            self.window:hit(self.character);
        else
            self.window:WeaponHit(self.character, nil);
        end
```

**Mod snippet** (server-side, no character needed):
```lua
local w = ... -- IsoWindow from square:getSpecialObjects()
if w and w.smashWindow and not w:isDestroyed() then
    w:smashWindow()                 -- glass shatter, no char damage
    local b = w:getBarricadeOnSameSquare()
    if b then b:getSquare():transmitRemoveItemFromSquare(b) end
end
```

**Caveats:** Barricades on either side survive the smash — explicitly remove them (see `ISDestroyStuffAction.lua:180-189`). Curtains turn into a `Sheet` item on the floor (`ISDestroyStuffAction.lua:193-198`). To fully delete the window, follow up with `square:transmitRemoveItemFromSquare(w)`.

**Status:** verified.

---

## 2. Fire spawn — IsoFireManager

**Signatures** (`zombie.iso.objects.IsoFireManager`, all static):
```
public static void StartFire(IsoCell, IsoGridSquare, boolean spread, int life);
public static void StartFire(IsoCell, IsoGridSquare, boolean spread, int life, int energy);
public static void StartSmoke(IsoCell, IsoGridSquare, boolean spread, int life, int energy);
public static void explode(IsoCell, IsoGridSquare, int radius);
```

**Side:** server-only. Vanilla wraps it in a `ClientCommand` and the client side debug UI just sends a packet. The handler file's first line is `if isClient() then return end`.

**Vanilla example** — `media/lua/server/ClientCommands.lua:12-25`:
```lua
Commands.object.addFireOnSquare = function(player, args)
    local sq = getCell():getGridSquare(args.x, args.y, args.z)
    IsoFireManager.StartFire(getCell(), sq, true, 100, 500);
end
Commands.object.addExplosionOnSquare = function(player, args)
    local sq = getCell():getGridSquare(args.x, args.y, args.z)
    IsoFireManager.explode(getCell(), sq, 100)
end
```
Client side request — `media/lua/client/DebugUIs/BrushTool/FireBrushUI.lua:259-281`:
```lua
function FireBrushUI:addFire(square)
    local args = { x = square:getX(), y = square:getY(), z = square:getZ() }
    sendClientCommand(self.player, 'object', 'addFireOnSquare', args)
end
```

**Mod snippet** (server context, e.g. inside an `OnTick` on server or a `sendServerCommand` handler):
```lua
local sq = getCell() and getCell():getGridSquare(x, y, z)
if sq then IsoFireManager.StartFire(getCell(), sq, true, 100, 500) end
```

**Caveats:**
- The `Commands.object.addFireOnSquare` channel is **not admin-gated in vanilla** — any client can `sendClientCommand` it. Do not rely on it for anti-cheat. For a mod, register your own server command and gate yourself if you care.
- `explode` radius arg is tile-radius, ~100 in debug. Bigger values lag.
- Permanent (campfire) fire = construct `IsoFire.new(cell, square)` + `square:AddTileObject(fireObj)` + `AttachAnim` — see `SCampfireGlobalObject.lua:118-121`.

**Status:** verified.

---

## 3. IsoThumpable / IsoBarricade — wall & structure HP

**Signatures** (`zombie.iso.objects.IsoThumpable`):
```
public int health;        public int maxHealth;     // public fields
public void setHealth(int);          public int getHealth();
public void setMaxHealth(int);       public int getMaxHealth();
public void setThumpDmg(Integer);    public int getThumpDmg();
public void Thump(IsoMovingObject);                  // zombie-thump entrypoint
public void Damage(float);                           // direct HP reduction
public void WeaponHit(IsoGameCharacter, HandWeapon);
public boolean isDestroyed();
public void syncIsoThumpable();
public void setBreakSound(String);
```
`IsoDoor` has the same `health`/`maxHealth`/`setHealth`/`Damage`/`WeaponHit`. `IsoBarricade` has `setHealth(int)` / `getHealth()` / `WeaponHit(...)`.

**Side:** server-authoritative. The `health` field is replicated through `syncIsoThumpable()` / `transmit*` after change.

**Vanilla example** — door construction sets `health` directly via the java setters: `media/lua/server/BuildingObjects/ISWoodenDoor.lua:14-18`:
```lua
self.javaObject:setMaxHealth(self:getHealth());
self.javaObject:setHealth(self.javaObject:getMaxHealth());
self.javaObject:setBreakSound("BreakDoor");
```
Zombie thump damage per hit is `o.thumpDmg = 5` (line 40 same file) consumed by `Thump()` in Java.

Instant-destroy via timed action: `ISDestroyStuffAction.lua:225-303` removes the object with `sq:transmitRemoveItemFromSquare(self.item)` after sledgehammer animation. Note the dispatch:
```lua
if isClient() then
    sledgeDestroy(self.item);             -- helper: sends server command
else
    self.item:getSquare():transmitRemoveItemFromSquare(self.item)
end
```

**Mod snippet** (server) — earthquake-style HP drain:
```lua
local t = ... -- IsoThumpable or IsoDoor
if t and t.Damage then
    t:Damage(50)                          -- float; reduces health
    if t.syncIsoThumpable then t:syncIsoThumpable() end
    if t.getHealth and t:getHealth() <= 0 then
        t:getSquare():transmitRemoveItemFromSquare(t)
    end
end
```

**Caveats:**
- `Damage(float)` is the canonical HP-down call (used by `IsoTree.Damage` and other game systems). `setHealth(int)` works but skips break-effects.
- After `transmitRemoveItemFromSquare`, also handle barricades/curtains/sheet-rope/double-door siblings — see `ISDestroyStuffAction.lua:177-209` for the full pattern.
- `IsoBarricade.AddBarricadeToObject(BarricadeAble, IsoGameCharacter)` is the static factory if you need to add barricades from code.

**Status:** verified.

---

## 4. Trees — fell from Lua

**Signatures** (`zombie.iso.objects.IsoTree`):
```
public void Damage(float);
public void WeaponHit(IsoGameCharacter, HandWeapon);
public void WeaponHitEffects(IsoGameCharacter, HandWeapon);
public void setHealth(int);    public int getHealth();    public int getMaxHealth();
```

**Side:** server-authoritative. The chop pipeline runs `WeaponHit` server-side only; the tree removal itself happens in Java when `health <= 0`.

**Vanilla example** — `media/lua/shared/TimedActions/ISChopTreeAction.lua:64-93`:
```lua
function ISChopTreeAction:animEvent(event, parameter)
    if not isClient() then
        if event == 'ChopTree' and self.axe then
            self.tree:WeaponHit(self.character, self.axe)
            ...
            if self.tree:getObjectIndex() == -1 then  -- tree gone
                if isServer() then self.netAction:forceComplete()
                else self:forceComplete() end
            end
        end
    else
        if event == 'ChopTree' then
            self.tree:WeaponHitEffects(self.character, self.axe)
        end
    end
end
```
Instant-fell (cheat mode) at `:start()` line 34-36:
```lua
if self.character:isTimedActionInstant() then
    self.tree:setHealth(1)
end
```

**Mod snippet** (server) — tornado fells trees:
```lua
local tree = ... -- IsoTree
if tree and tree.Damage then
    tree:Damage(9999)         -- removal handled in Java when HP hits 0
end
-- Or instant: tree:setHealth(0); the next WeaponHit/tick processes removal.
```

Pure-Lua fallback (no axe / no character) — set HP to 1 then call `WeaponHit(nil, nil)`:
```lua
tree:setHealth(0)
tree:WeaponHit(nil, nil)      -- triggers java-side removal & log-drops
```

**Caveats:** `WeaponHit(nil, nil)` is undocumented but vanilla's java passes the char through to particle/xp code paths — with both nil the removal path still runs. Test in MP. The "log drops" come out of Java's tree-fell handler; you do not need to spawn them yourself.

**Status:** verified (Damage path), partial for the nil-WeaponHit fallback (works in SP, test MP).

---

## 5. Doors — break, force-open, unlock

**Signatures** (`zombie.iso.objects.IsoDoor`):
```
public boolean isOpen();         public boolean IsOpen();
public void ToggleDoor(IsoGameCharacter);
public void ToggleDoorActual(IsoGameCharacter);
public void ToggleDoorSilent();
public boolean isLocked();
public void setLocked(boolean);
public void setIsLocked(boolean);
public boolean isLockedByKey();
public void setLockedByKey(boolean);
public void setKeyId(int);
public void setHealth(int);      public int getHealth();
public void WeaponHit(IsoGameCharacter, HandWeapon);
public boolean isDestroyed();
```
`IsoThumpable` (when `:isDoor()`) shares `ToggleDoor`, `setLockedByKey`, `setLockedByPadlock`, `setLockedByCode(int)`.

**Side:** server-authoritative. Toggle / lock setters propagate via `syncIsoObject(...)`.

**Vanilla examples**:

Toggle — `ISOpenCloseDoor.lua:30-33`:
```lua
function ISOpenCloseDoor:complete()
    self.item:ToggleDoor(self.character);
    return true;
end
```

Lock/unlock — `ISLockDoor.lua:50-70`:
```lua
function ISLockDoor:complete()
    if self.lock then self.door:setLockedByKey(true);
    else self.door:setLockedByKey(false); end
    self.door:syncIsoObject(false, 0, nil, nil);

    local doubleDoorObjects = buildUtil.getDoubleDoorObjects(self.door)
    for i=1,#doubleDoorObjects do
        doubleDoorObjects[i]:setLockedByKey(self.lock)
        doubleDoorObjects[i]:syncIsoObject(false, 0, nil, nil);
    end
```

Admin force-toggle — `AdminContextMenu.lua:157-178`:
```lua
function AdminContextMenu.OnDoorLock(worldobjects, door)
    door:setIsLocked(not door:isLocked())
    if instanceof(door, "IsoDoor") and door:checkKeyId() ~= -1 then
        door:setLockedByKey(door:isLocked())
    end
    if instanceof(door, "IsoThumpable") and door:getKeyId() ~= -1 then
        door:setLockedByKey(door:isLocked())
    end
```

**Mod snippet** (server) — force-open + unlock + smash:
```lua
local d = ... -- IsoDoor or door-IsoThumpable
if d and d.setLockedByKey then
    d:setLockedByKey(false)
    d:setLocked(false)            -- IsoDoor only
end
if d and d.IsOpen and not d:IsOpen() and d.ToggleDoor then
    d:ToggleDoor(nil)             -- nil char OK in vanilla call sites
end
if d and d.Damage then d:Damage(9999) end
if d and d.syncIsoObject then d:syncIsoObject(false, 0, nil, nil) end
```

**Caveats:**
- `setLocked` vs `setLockedByKey`: vanilla AdminContextMenu calls both. `setLocked` is the runtime lock-state (zombies-can-be-thumping-it), `setLockedByKey` is the player-facing key requirement. Toggle both for full admin override.
- For double/garage doors, walk `buildUtil.getDoubleDoorObjects(d)` and `getGarageDoorObjects(d)` and mirror the state on each tile — see ISLockDoor.lua:58-70.
- Do not call `ToggleDoor` from a pure client path in MP without a `sendClientCommand` — see `VehicleCommands.lua` for the door-toggle pattern on cars.

**Status:** verified.

---

## 6. Shake / drop container contents to floor

The "everything off the shelf" effect is one line on the container object.

**Signature** (`zombie.iso.IsoObject`):
```
public void dumpContentsInSquare();
public ItemContainer getContainer();
public int getContainerCount();
public ItemContainer getContainerByIndex(int);
```
And on `IsoGridSquare`:
```
public InventoryItem AddWorldInventoryItem(InventoryItem, float xoff, float yoff, float zoff);
public InventoryItem AddWorldInventoryItem(String, float, float, float);
```

**Side:** server-authoritative for `dumpContentsInSquare` (items become world items, which are network-synced). `AddWorldInventoryItem` is widely called from both sides in vanilla (forageSystem, ISMoveableSpriteProps, OnBreak).

**Vanilla example** — `ISDestroyStuffAction.lua:102-109`:
```lua
-- we add the items contained inside the item we destroyed to put them randomly on the ground
self.item:dumpContentsInSquare()
```
Manual scatter pattern — `ISMoveableSpriteProps.lua:3072` and forage system:
```lua
_square:AddWorldInventoryItem(item, ZombRandFloat(0.1,0.9), ZombRandFloat(0.1,0.9), 0);
```

**Mod snippet** (server) — earthquake shakes shelf onto same tile:
```lua
local shelf = ... -- IsoObject with a container
if shelf and shelf.dumpContentsInSquare then
    shelf:dumpContentsInSquare()    -- drops all containers' items at random offsets
end
```
Scatter to an *adjacent* square (no built-in helper — iterate manually):
```lua
local sq    = shelf:getSquare()
local drop  = sq:getAdjacentSquare(IsoDirections.S) or sq
local nC = shelf.getContainerCount and shelf:getContainerCount() or 0
for i = 0, nC - 1 do
    local c = shelf:getContainerByIndex(i)
    if c and c.getItems then
        local items = c:getItems()
        for j = items:size() - 1, 0, -1 do
            local it = items:get(j)
            drop:AddWorldInventoryItem(it, ZombRandFloat(0.1,0.9), ZombRandFloat(0.1,0.9), 0)
            c:Remove(it)
        end
    end
end
```

**Caveats:**
- `dumpContentsInSquare` drops on the **same** tile only. For tornado/quake "items flew sideways" you must move items yourself as above.
- `AddWorldInventoryItem(InventoryItem, ...)` reuses the existing item (preserves condition, contents). The `(String, ...)` overload spawns a new item from the script type.
- Items dropped via `AddWorldInventoryItem` from server propagate. From client in MP, prefer wrapping in a server command.

**Status:** verified.

---

## Citations

- `_pz_install/media/lua/shared/TimedActions/ISSmashWindow.lua`
- `_pz_install/media/lua/shared/TimedActions/ISChopTreeAction.lua`
- `_pz_install/media/lua/shared/TimedActions/ISLockDoor.lua`
- `_pz_install/media/lua/shared/TimedActions/ISOpenCloseDoor.lua`
- `_pz_install/media/lua/shared/TimedActions/ISDestroyStuffAction.lua`
- `_pz_install/media/lua/shared/TimedActions/ISBarricadeAction.lua`
- `_pz_install/media/lua/server/ClientCommands.lua`
- `_pz_install/media/lua/server/Camping/SCampfireSystem.lua`
- `_pz_install/media/lua/server/Camping/SCampfireGlobalObject.lua`
- `_pz_install/media/lua/server/BuildingObjects/ISWoodenDoor.lua`
- `_pz_install/media/lua/client/DebugUIs/BrushTool/FireBrushUI.lua`
- `_pz_install/media/lua/client/DebugUIs/AdminContextMenu.lua`
- `_pz_install/media/lua/shared/Moveables/ISMoveableSpriteProps.lua` (AddWorldInventoryItem patterns)
- `_pz_install/media/lua/shared/Items/OnBreak.lua` (AddWorldInventoryItem patterns)
- `javap -p` on: `zombie.iso.objects.IsoWindow`, `IsoThumpable`, `IsoDoor`, `IsoTree`, `IsoBarricade`, `IsoFire`, `IsoFireManager` (in `zombie.iso.objects`), `zombie.iso.IsoGridSquare`, `zombie.iso.IsoObject`
