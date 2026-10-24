# B42 ISUI Component Reference

**Source:** `references/pz-api.md` from Brain skill file (sourced from `<local-path>`)
**Status:** VERIFIED — pulled from actual PZ game source

ISUI (in-game Scripted UI) components are the building blocks for all mod UI. All are subclasses of `ISUIElement`.

---

## Imports

> **WARNING: In B42, ISUI classes are pre-loaded globals — these requires are optional.**
> Accumulating 30+ vanilla requires in a mod corrupted Kahlua's callFrame stack in a
> real production incident, causing all timed actions to crash with `ReturnValues NPE`.
> Keep requires minimal; never require inside a function body.
> If you must use requires, place them at the very top of the file only.

```lua
require "ISUI/ISCollapsableWindow"
require "ISUI/ISButton"
require "ISUI/ISLabel"
require "ISUI/ISPanel"
require "ISUI/ISScrollingListBox"
require "ISUI/ISTextEntryBox"
require "ISUI/ISTickBox"
require "ISUI/ISComboBox"
```

---

## ISPanel

`ISPanel = ISUIElement:derive("ISPanel")`. Base class for HUDs, overlays, and ISCollapsableWindow itself.

### Constructor

```lua
local panel = ISPanel:new(x, y, w, h)
panel:initialise()
```

### Key Methods

| Method | Notes |
|---|---|
| `:noBackground()` | Sets `self.background = false` — no background rect drawn. |
| `:close()` | Calls `:setVisible(false)`. |
| `:prerender()` | Default draws background rect + border. Override and call parent. |

### Built-in Drag

Drag is automatic. Set `self.moveWithMouse = true` in `:new` and the panel becomes draggable by the user — no custom mouse handlers required.

```lua
function MyHUD:new(x, y, w, h)
    local o = ISPanel.new(self, x, y, w, h)
    o.moveWithMouse = true   -- enables built-in drag
    o:setDrawFrame(false)    -- no chrome for HUDs
    return o
end
```

To persist position after drag, override `:onMouseUp`:

```lua
function MyHUD:onMouseUp(x, y)
    ISPanel.onMouseUp(self, x, y)   -- call parent first
    local store = ModData.getOrCreate(MODULE_ID)
    store.hudX = self:getX()
    store.hudY = self:getY()
    ModData.transmit(MODULE_ID)
end
```

---

## ISCollapsableWindow

`ISCollapsableWindow = ISPanel:derive("ISCollapsableWindow")`. Standard window base for admin panels, dialogs, hubs.

### Constructor Pattern

```lua
function Panel:new(x, y, w, h)
    local o = ISCollapsableWindow.new(self, x, y, w, h)
    o.title           = "My Title"
    o.backgroundColor = { r=0.05, g=0.05, b=0.07, a=0.92 }
    o.borderColor     = { r=0.40, g=0.40, b=0.45, a=0.95 }
    o.pin             = false
    o:setResizable(false)
    return o
end
```

**Construction defaults** (override what you need):
- `borderColor = {r=0.4, g=0.4, b=0.4, a=1}`
- `backgroundColor = {r=0, g=0, b=0, a=0.8}`
- `pin = true`
- `resizable = true`
- `drawFrame = true`
- `anchorTop = anchorLeft = true`

### Lifecycle Methods

| Method | When called | Override pattern |
|---|---|---|
| `:new(x, y, w, h)` | Construction | `local o = ISCollapsableWindow.new(self, x, y, w, h); ...; return o` |
| `:initialise()` | After new | `ISCollapsableWindow.initialise(self); ...` |
| `:createChildren()` | After initialise | `ISCollapsableWindow.createChildren(self); ...` then build children (`:initialise()` + `:addChild()` each) |
| `:prerender()` | Per frame | Optional; cheap state read. Call parent first. |
| `:render()` | Per frame | Optional; draw. Avoid allocations. Call parent first. |
| `:close()` | Dismissed | `ISCollapsableWindow.close(self); instance = nil` — **always null the singleton** |

### Setters / State Methods

| Method | Notes |
|---|---|
| `:setTitle(title)` / `:getTitle()` | Title bar text. |
| `:setResizable(bool)` | Toggle corner resize widget. |
| `:setDrawFrame(bool)` | Toggle all chrome (close, pin, collapse buttons). Use for chrome-less panels. |
| `:setInfo(text)` / `:onInfo()` | Info button + popup. |
| `:collapse()` / `:uncollapse()` | Hide everything but the title bar. |
| `:pin()` | Toggle pin (prevent auto-fade). |
| `:titleBarHeight()` | Pixel height of title bar (font-size dependent). |
| `:resizeWidgetHeight()` | Pixel size of resize handles. |
| `:addView(view)` / `:getViews()` | View management. |
| `:RestoreLayout(name, layout)` / `:SaveLayout(name, layout)` | Persist position/size via `ISLayoutManager`. |

---

## ISButton

`ISButton:new(x, y, w, h, title, target, onclick)` — `target` and any trailing `args...` are passed to `onclick(target, button, args...)`.

### Methods

| Method | Notes |
|---|---|
| `:setImage(texture)` | Icon-only button. |
| `:setTextureColor(color)` | Tint icon. |
| `:forceImageSize(w, h)` | Override image dimensions. |
| `:setOverlayText(text)` | Text on top of image. |
| `:setFont(font)` | Font enum: `UIFont.Small`, `UIFont.Medium`, `UIFont.Large`. |
| `:setTitle(title)` / `:getTitle()` | Button label. |
| `:setOnMouseOverFunction(fn)` | Hover-in callback. |
| `:setOnMouseOutFunction(fn)` | Hover-out callback. |
| `:setDisplayBackground(bool)` | Toggle background draw. |
| `:setVisible(bool)` | Show/hide. |
| `:forceClick()` | Programmatic click. |

Styling fields (set after `:initialise()`):
```lua
btn.borderColor            = {r, g, b, a}
btn.backgroundColor        = {r, g, b, a}
btn.backgroundColorMouseOver = {r, g, b, a}
btn.textColor              = {r, g, b, a}
```

### Button Creation Pattern

```lua
function Panel:createChildren()
    ISCollapsableWindow.createChildren(self)

    local btn = ISButton:new(10, 30, 120, 24, "Click Me", self, Panel.onButtonClick)
    btn:initialise()
    btn:addChild(btn)  -- note: add to parent panel, not to btn itself
    self:addChild(btn)
end

function Panel:onButtonClick(button)
    -- button.target is self (Panel)
    sendClientCommand(MODULE_ID, "doThing", {})
end
```

---

## ISContextMenu

The right-click context menu. Received as `context` in `OnFillWorldObjectContextMenu` and `OnFillInventoryObjectContextMenu` callbacks.

### Main Methods

| Method | Notes |
|---|---|
| `:addOption(name, target, onclick, args...)` | Add an entry. `target` and trailing args are passed to `onclick(target, button, args...)`. |
| `:getNew(parent)` | Create a submenu attached to a parent option. |
| `:hideSelf()` | Dismiss this menu. |
| `:hideAndChildren()` / `:hideSelfAndChildren2()` | Dismiss this menu and all children. |
| `:closeAll()` | Close every open context menu. |
| `:isAnyVisible()` | Check if any context menu is currently open. |

### Context Menu Pattern

```lua
-- World object right-click
local function onFillWorldObjectContextMenu(playerIdx, context, worldobjects, test)
    if test then return end   -- probe pass — skip heavy logic
    local player = getSpecificPlayer(playerIdx)
    if not player then return end

    context:addOption("Open Panel", worldobjects, function()
        MyModUI.open()
    end)
end
Events.OnFillWorldObjectContextMenu.Add(onFillWorldObjectContextMenu)

-- Inventory item right-click
local function onFillInventoryObjectContextMenu(playerIdx, context, items)
    local player = getSpecificPlayer(playerIdx)
    if not player then return end
    -- items is array of InventoryItem
    context:addOption("Inspect Item", items, function()
        -- ...
    end)
end
Events.OnFillInventoryObjectContextMenu.Add(onFillInventoryObjectContextMenu)
```

> **Important:** The first arg to both callbacks is a player **index** (int), not the IsoPlayer object. Always resolve with `getSpecificPlayer(playerIdx)`. The `test` arg in `OnFillWorldObjectContextMenu` is a probe pass — return early if you don't want to do heavy work during it.

---

## ISScrollingListBox

Vertical scrollable list. Constructor: `ISScrollingListBox:new(x, y, w, h)`.

### Methods

| Method | Notes |
|---|---|
| `:addItem(name, item, tooltip)` | Append entry. `item` is any Lua value stored with the row. |
| `:insertItem(index, name, item)` | Insert at index. |
| `:addUniqueItem(name, item, tooltip)` | Skip if display name already present. |
| `:contains(itemText)` | Membership check by display name. |
| `:removeItem(itemText)` | Remove by display name. |
| `:removeItemByIndex(idx)` | Remove by index. |
| `:removeMatchingItems(pattern)` | Remove all rows matching a Lua pattern. |
| `:removeFirst()` | Pop head. |
| `:rowAt(x, y)` | Resolve mouse coordinates to row index (for click handling). |
| `:topOfItem(index)` | Scroll Y position of an item. |
| `:prevVisibleIndex(idx)` / `:nextVisibleItem(idx)` | Navigate visible rows. |

Override `:doDrawItem(y, item, alt)` to customize per-row rendering. Row data accessed via `self.items[i].item`.

---

## ISTextEntryBox

Single-line or multi-line text input. Constructor: `ISTextEntryBox:new(text, x, y, w, h)`.

### Methods

| Method | Notes |
|---|---|
| `:getText()` / `:setText(str)` | Read/write current value. |
| `:setEditable(bool)` / `:isEditable()` | Enable/disable user editing. |
| `:setSelectable(bool)` / `:isSelectable()` | |
| `:setMultipleLine(bool)` / `:isMultipleLine()` | Toggle multi-line mode. |
| `:setMaxLines(n)` / `:getMaxLines()` | Line count cap. |
| `:setClearButton(bool)` | Add an X button to clear input. |
| `:setOnlyNumbers(bool)` | Numeric input filter. |
| `:setOnlyText(bool)` | Letters-only filter. |
| `:setFont(font)` | UIFont enum. |
| `:onCommandEntered()` | Override to handle Enter key. |
| `:onTextChange()` | Override to react to typing. |
| `:onLostFocus()` | Override for blur. |
| `:ignoreFirstInput()` | Suppress the first keystroke (use when opening a panel with text entry focused). |

---

## ISLabel

Text display. Constructor:

```lua
ISLabel:new(x, y, h, text, r, g, b, a, font, alignedRight)
```

`r, g, b, a` are 0.0–1.0 color values. `font` is a UIFont enum. `alignedRight` is boolean.

---

## ISTickBox

Checkbox widget. Constructor:

```lua
ISTickBox:new(x, y, w, h, name, target, onchange)
```

`onchange(target, checkbox)` fires when state changes.

---

## ISComboBox

Dropdown selector. Constructor:

```lua
ISComboBox:new(x, y, w, h, target, onchange)
```

Call `:addOption(name)` to populate, `:getSelected()` to read current selection.

---

## Component Creation Pattern

All components follow this sequence inside `:createChildren()`:

```lua
function Panel:createChildren()
    ISCollapsableWindow.createChildren(self)   -- call parent first

    -- 1. Construct
    local lbl = ISLabel:new(10, 10, 20, "Label text", 1, 1, 1, 1, UIFont.Small, false)
    -- 2. Initialise
    lbl:initialise()
    -- 3. Add to parent
    self:addChild(lbl)

    -- Buttons, lists, text entries — same three-step pattern
end
```

---

## See Also

- `B42_UI_Patterns.md` — window skeletons and HUD patterns
- `B42_Globals_API.md` — `getCore()`, `getSpecificPlayer()`
- `B42_Lua_Events_Official.md` — `OnFillWorldObjectContextMenu`, `OnFillInventoryObjectContextMenu`
