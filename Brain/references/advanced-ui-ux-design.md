# Advanced UI/UX Design for Project Zomboid Mods

> **Role owner:** `Brain/roles/ui_ux_engineer.md`
> **Component API:** `Brain/references/build42/B42_ISUI_Components.md`
> **Full patterns (windows, HUDs, context menus):** `Brain/roles/ui_ux_engineer.md`

This document covers *advanced* patterns only — things beyond a basic `ISCollapsableWindow`. Read the component reference and role file first.

---

## 1. Multi-Tab / Multi-View Panels

Used for: BitemeSuite Hub UI, admin panels with multiple sections (Claim management, Zone config, etc.)

```lua
local TAB_NAMES = { "Overview", "Claims", "Zones" }
local currentTab = 1

function Panel:createChildren()
    ISCollapsableWindow.createChildren(self)

    -- Tab row
    local xOff = 8
    for i, name in ipairs(TAB_NAMES) do
        local btn = ISButton:new(xOff, 26, 90, 20, name, self, Panel.onTabClick)
        btn.tabIndex = i
        btn:initialise()
        self:addChild(btn)
        xOff = xOff + 94
    end

    -- Sub-panels (one per tab, all constructed, only one visible)
    self.tabPanels = {}
    self.tabPanels[1] = self:buildOverviewPanel()
    self.tabPanels[2] = self:buildClaimsPanel()
    self.tabPanels[3] = self:buildZonesPanel()
    for i, p in ipairs(self.tabPanels) do
        self:addChild(p)
        p:setVisible(i == currentTab)
    end
end

function Panel:onTabClick(btn)
    currentTab = btn.tabIndex
    for i, p in ipairs(self.tabPanels) do
        p:setVisible(i == currentTab)
    end
end
```

**Rule:** Construct all sub-panels upfront, toggle `:setVisible()` — never destroy and recreate tabs. Creation allocations in per-frame paths cause frame spikes.

---

## 2. Dynamic Scrolling Lists with Custom Rows

`ISScrollingListBox` default rows are plain text. Override `:doDrawItem` for richer rows (icon + text + status badge).

```lua
local list = ISScrollingListBox:new(8, 50, self.width - 16, self.height - 80)
list.itemheight = 28
list.doDrawItem  = Panel.drawRow    -- custom renderer
list:initialise()
self:addChild(list)

function Panel.drawRow(list, y, item, alt)
    -- item.item is the data object passed to :addItem()
    local entry = item.item
    local textColor = entry.online and {r=0.2,g=1,b=0.2,a=1} or {r=0.6,g=0.6,b=0.6,a=1}
    list:drawText(entry.name, 8, y + 6, textColor.r, textColor.g, textColor.b, textColor.a, UIFont.Small)
    list:drawText(entry.status, list.width - 80, y + 6, 0.7, 0.7, 0.7, 1, UIFont.Small)
end
```

Populate from server data after sync:

```lua
function Panel:refreshList(entries)
    self.list:clear()
    for _, entry in ipairs(entries or {}) do
        self.list:addItem(entry.name, entry)
    end
end
```

---

## 3. Reconnect-Resilient UI

All panels that display server data must handle the case where server data has not arrived yet when the panel opens.

```lua
function Panel:new(...)
    ...
    o.dataReady = false
    return o
end

function Panel:render()
    ISCollapsableWindow.render(self)
    if not self.dataReady then
        self:drawTextCentre("Syncing...", self.width / 2, self.height / 2, 0.7, 0.7, 0.7, 1, UIFont.Medium)
        return
    end
    -- normal render
end

function Panel:onDataReceived(data)
    self.dataReady = true
    self:refreshList(data)
end
```

Request sync on open; server reply triggers `onDataReceived`:

```lua
local function open()
    if instance then ... end
    instance = Panel:new(...)
    instance:initialise()
    instance:addToUIManager()
    sendClientCommand(MODULE_ID, "requestSync", {})   -- server replies → Panel.onDataReceived
end
```

---

## 4. Admin-Gated Context Menu Options

Use the isAdmin gate (from `CLAUDE.md`) before adding any destructive or admin-only options.

```lua
local function onFillWorldObjectContextMenu(playerIdx, context, worldobjects, test)
    if test then return end
    local player = getSpecificPlayer(playerIdx)
    if not player then return end
    if not isAdmin(player) then return end    -- gate entire block for admin-only features

    local sq = worldobjects[1] and worldobjects[1]:getSquare()
    if not sq then return end

    context:addOption(getText("ContextMenu_BBWriteOnWorld_SetLabel"), worldobjects, function()
        BB_WriteOnWorld.openLabelDialog(player, sq)
    end)
end
Events.OnFillWorldObjectContextMenu.Add(onFillWorldObjectContextMenu)
```

For player-allowed actions that have an admin variant, add both separately:

```lua
context:addOption("Claim Vehicle", worldobjects, claimVehicle, player)
if isAdmin(player) then
    context:addOption("[Admin] Override Claim", worldobjects, adminOverrideClaim, player)
end
```

---

## 5. Performance Rules for UI Code

| Location | Rule |
|---|---|
| `:render()` / `:prerender()` | **No table or string allocations.** Cache everything in `:createChildren()` or on data update. |
| `OnTick` | Throttle with a tick counter. HUDs: 60-tick (1s). Admin panels: 180-tick (3s). |
| `EveryOneMinute` | Use for area scans (WriteOnWorld label discovery pattern). |
| `:doDrawItem` | Reads `item.item` directly — no copy, no allocation. |
| Singleton open | Check `instance` first; `:bringToTop()` if already open rather than creating a second. |

```lua
-- Throttle example for a HUD OnTick
local tickCount = 0
local function onTick()
    tickCount = tickCount + 1
    if tickCount < 60 then return end
    tickCount = 0
    -- update logic here
end
Events.OnTick.Add(onTick)
```

---

## 6. State Sync Pattern (Client UI ↔ Server ModData)

```
Client opens panel
  → sendClientCommand(MODULE_ID, "requestSync", {})
Server receives → sends current ModData snapshot
  → sendServerCommand(player, MODULE_ID, "syncData", { data = store })
Client onServerCommand → Panel:onDataReceived(args.data)
  → refreshes list, sets dataReady = true

Admin mutates via panel button
  → sendClientCommand(MODULE_ID, "doThing", { id = x })
Server validates (isAdmin check), applies, ModData.transmit(MODULE_ID)
  → sendServerCommand(MODULE_ID, "syncData", { data = store })   -- broadcast update
All open panels receive and refresh
```

Never read `ModData.getOrCreate(MODULE_ID)` directly from a client UI file — always wait for the server sync reply.

---

## 7. WriteOnWorld: OnPreUIDraw Pattern

For overlaying world-space text or graphics directly onto the screen (not inside a window):

```lua
local function onPreUIDraw()
    local player = getPlayer()
    if not player then return end
    -- render world labels by projecting IsoToScreen
    local x, y = IsoUtils.XToScreen(sq:getX(), sq:getY(), sq:getZ(), 0)
    getTextManager():DrawStringCentre(UIFont.Dialogue, x, y, text, r, g, b, 0.9)
end
Events.OnPreUIDraw.Add(onPreUIDraw)
```

Reverse-iterate label lists to safely remove stale entries in this callback.

---

## 8. Common Mistakes (From This Project's History)

| Mistake | Fix |
|---|---|
| Not nulling `instance` in `:close()` | Leaks old window; next open sees stale state |
| `if isServer() then return end` missing | Crashes on dedicated server where client files must be skipped |
| Table allocation in `:render()` | Frame spike per update tick; allocate in `:createChildren()` |
| Reading server ModData directly in client UI | Returns stale or nil; always sync via sendClientCommand |
| `OnFillWorldObjectContextMenu` playerIdx used as IsoPlayer | Must call `getSpecificPlayer(playerIdx)` |
| Hooking ISChat in a server file | ISChat is client-only; guard with `if isServer() then return end` |
| Missing `if test then return end` probe guard | Heavy logic runs twice per right-click |
