# Admin Hub + Launcher Pattern (B42)

Standalone admin UI for a mod. The pattern is verified against:

- `Biteme Mod Suite/Contents/mods/BitemeModSuite/42/media/lua/client/zz_BitemeSuiteHubUI.lua` (801 lines, suite-wide hub)
- `Natural Disasters/Contents/mods/NaturalDisasters/42/media/lua/client/zz_NaturalDisastersHubUI.lua` (standalone, single-mod)

Use this when a mod needs an on-screen admin button that opens a multi-section panel — same shape as BMS but without depending on the suite framework.

---

## Anatomy

| Piece | Role |
|---|---|
| **LauncherButton** (`ISButton:derive`) | Always-visible draggable button anchored on screen. Opens / closes the hub. |
| **HubWindow** (`ISCollapsableWindow:derive`) | The multi-section panel. Side-nav buttons on left, content on right. |
| **`getUIConfig()` / `ModData`** | Persists launcher position + last-open section across sessions. |
| **Bootstrap with `OnTick` retry** | Admin check + mount, retried until either succeeds or 600 ticks pass. |
| **Chat hook (optional)** | If the mod accepts `/cmd` syntax, the hook is installed in the same file and uses the same `OnTick` retry. |

---

## File location

```
<ModRoot>/Contents/mods/<ModId>/42/media/lua/client/zz_<ModId>HubUI.lua
```

The `zz_` prefix makes the file load **last** in client load order, so all the modules it references (HUD, executors, shared constants) are guaranteed to exist by the time it runs.

---

## Required imports (top of file)

```lua
if isServer() then return end

require "ISUI/ISPanel"
require "ISUI/ISButton"
require "ISUI/ISCollapsableWindow"
require "ISUI/ISLabel"
require "ISUI/ISTextEntryBox"
```

---

## The drag pattern (verified-working)

`o.moveWithMouse = true` lets the engine drive movement. Detecting drag-vs-click is done in `onMouseUp` via element-position delta.

```lua
local LauncherButton = ISButton:derive("MyModLauncherButton")

function LauncherButton:new(x, y)
    local o = ISButton.new(self, x, y, 64, 32, "MM", MyModUI, MyModUI.onLauncherClicked)
    o.backgroundColor = { r = 0.08, g = 0.08, b = 0.1, a = 0.9 }
    o.borderColor     = { r = 0.95, g = 0.35, b = 0.15, a = 0.95 }
    o.font = UIFont.Small
    o.moveWithMouse = true        -- engine-driven drag
    return o
end

function LauncherButton:onMouseDown(x, y)
    self.dragStartX = self:getX()
    self.dragStartY = self:getY()
    return ISButton.onMouseDown(self, x, y)   -- MUST chain to super
end

function LauncherButton:onMouseUp(x, y)
    local sx, sy = self.dragStartX or self:getX(), self.dragStartY or self:getY()
    self.dragStartX, self.dragStartY = nil, nil
    if math.abs(self:getX() - sx) > 3 or math.abs(self:getY() - sy) > 3 then
        -- Real drag — persist + suppress click
        local cfg = getUIConfig()
        cfg.launcherX, cfg.launcherY = self:getX(), self:getY()
        return true
    end
    return ISButton.onMouseUp(self, x, y)
end
```

**Two non-negotiables here** (both already tracked in `TODO_LEARN.md` under ISButton):

1. **Custom `onMouseDown` MUST chain to `ISButton.onMouseDown(self, x, y)`** — ISButton uses an internal `pressed` flag; skipping the super kills click dispatch.
2. **Do NOT compute dx/dy manually** to move the button in `prerender`. Fights the engine's drag state machine. Use `moveWithMouse = true`.

---

## Admin gate + solo handling

```lua
local function isAdmin()
    if isSinglePlayer and isSinglePlayer() then return true end
    local p = getSpecificPlayer and getSpecificPlayer(0)
    if not p or not p.getAccessLevel then return false end
    local lvl = string.lower(p:getAccessLevel() or "")
    return lvl == "admin" or lvl == "moderator"
end
```

Solo player always returns admin. In MP, `getAccessLevel()` may be empty during the OnGameStart window — that's why bootstrap retries on tick.

---

## Bootstrap with OnTick retry (handles "not admin yet" + "ISChat not ready yet")

```lua
local tries = 0
local function tryMount()
    if MyModUI.launcher then return true end       -- already mounted
    if not isAdmin() then return false end          -- not eligible yet
    local cfg = getUIConfig()
    local btn = LauncherButton:new(cfg.launcherX or 80, cfg.launcherY or 160)
    btn:initialise(); btn:instantiate(); btn:addToUIManager()
    MyModUI.launcher = btn
    return true
end

local function tickBootstrap()
    if tryMount() then
        Events.OnTick.Remove(tickBootstrap)
        return
    end
    tries = tries + 1
    if tries > 600 then                              -- ~10s at 60fps
        Events.OnTick.Remove(tickBootstrap)
    end
end

Events.OnGameStart.Add(function()
    if not tryMount() then Events.OnTick.Add(tickBootstrap) end
end)
```

The same retry shape works for installing the `ISChat.sendMessage` hook — `ISChat` is not always present at `OnGameStart`.

---

## HubWindow skeleton

```lua
local HubWindow = ISCollapsableWindow:derive("MyModHubWindow")
local NAV_ITEMS = {
    { id = "dashboard", label = "Dashboard" },
    { id = "trigger",   label = "Trigger" },
    { id = "config",    label = "Settings" },
    { id = "about",     label = "About" },
}

function HubWindow:new(x, y, w, h)
    local o = ISCollapsableWindow.new(self, x, y, w or 640, h or 400)
    o.resizable = false
    o.pin = true
    o.title = "My Mod — Admin"
    o.currentSection = "dashboard"
    o.infoLabels = {}
    return o
end

function HubWindow:createChildren()
    ISCollapsableWindow.createChildren(self)
    -- Side-nav buttons (left column, 140w 28h each)
    for i, item in ipairs(NAV_ITEMS) do
        local b = ISButton:new(12, 36 + (i-1)*34, 140, 28, item.label,
            self, HubWindow.onNavClicked)
        b.internal = item.id
        b:initialise(); b:instantiate(); self:addChild(b)
    end
    -- Section title + a reusable stack of info labels (filled by refreshSection)
    self.sectionTitle = ISLabel:new(168, 36, 22, "Dashboard",
        1, 0.6, 0.4, 1, UIFont.Large, true)
    self.sectionTitle:initialise(); self:addChild(self.sectionTitle)
    for i = 1, 12 do
        local lbl = ISLabel:new(168, 70 + (i-1)*20, 18, "",
            0.9, 0.9, 0.9, 1, UIFont.Small, true)
        lbl:initialise(); self:addChild(lbl)
        self.infoLabels[i] = lbl
    end
    self:refreshSection()
end

function HubWindow:onNavClicked(button)
    self.currentSection = button.internal or "dashboard"
    self:refreshSection()
end

function HubWindow:refreshSection()
    -- Set sectionTitle.text and fill infoLabels[1..N] based on currentSection.
end
```

---

## Toggle entry point

```lua
function MyModUI.toggleHub()
    if not isAdmin() then return end
    if not MyModUI.hub then
        MyModUI.hub = HubWindow:new(180, 120, 640, 400)
        MyModUI.hub:initialise()
        MyModUI.hub:addToUIManager()
        MyModUI.hub:setVisible(false)
    end
    if MyModUI.hub:getIsVisible() then
        MyModUI.hub:setVisible(false)
    else
        MyModUI.hub:setVisible(true)
        MyModUI.hub:addToUIManager()
        MyModUI.hub:refreshSection()
    end
end

function MyModUI.onLauncherClicked() MyModUI.toggleHub() end
```

---

## Pitfalls — already burned in

- **Forgetting `b:instantiate()`** between `:initialise()` and `:addChild()` — most ISButtons render fine without it, but some skin paths need both. Match BMS exactly and always call both.
- **Building widgets that should appear in only some sections** — build them all once in `createChildren()`, then toggle `:setVisible(true/false)` per section in `refreshSection()`. Recreating widgets on every nav click leaks ISUIElement instances.
- **Persisting launcher position only in memory** — use `ModData.getOrCreate(<MOD_ID>_UI)` so the position survives reconnects.
- **Mounting before player exists** — `getSpecificPlayer(0)` returns `nil` on the main menu. Bootstrap must check and retry.

---

## Citations

- `Biteme Mod Suite/Contents/mods/BitemeModSuite/42/media/lua/client/zz_BitemeSuiteHubUI.lua` lines 195-310 (HubWindow), 500-575 (LauncherButton), 783-798 (tickBootstrap).
- `Natural Disasters/Contents/mods/NaturalDisasters/42/media/lua/client/zz_NaturalDisastersHubUI.lua` (standalone reference).
