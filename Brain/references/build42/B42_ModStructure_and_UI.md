# B42 Mod Structure & UI Panels — Reference

How to structure a Build 42 mod, create ISPanel-derived UI windows, and handle mod metadata.

**Last verified:** April 2026, Build 42.15+

---

## Mod Folder Structure (B42 Format)

```
mods/
└── MyMod/
    ├── mod.info                         ← MANDATORY root-level copy (for dedicated server discovery)
    └── 42/                              ← B42 subfolder (required for Build 42)
        ├── mod.info                     ← Mod metadata (MANDATORY 42-level copy)
        └── media/
            ├── lua/
            │   ├── client/              ← Client-only Lua (UI, context menus)
            │   │   ├── MyModClient.lua
            │   │   └── MyModUI.lua
            │   ├── server/              ← Server-only Lua (data, validation)
            │   │   └── MyModServer.lua
            │   └── shared/              ← Loads on both sides
            │       └── MyModShared.lua
            ├── scripts/                 ← Item/recipe definitions (.txt)
            ├── textures/                ← Custom textures
            └── maps/                    ← Map data (if applicable)
```

### Key: The `42/` Subfolder
Build 42 mods use a `42/` directory. `mod.info` must exist at **both** the mod root AND inside `42/`. Without the root-level copy, dedicated servers do not discover the mod.

---

## mod.info Format

```ini
name=My Mod Name
id=MyModID
description=What the mod does
poster=poster.png
versionMin=42.14.1
require=dependency_mod_id
category=features
```

### Fields
| Field | Required | Notes |
|-------|----------|-------|
| `name` | Yes | Display name in mod selector |
| `id` | Yes | Unique identifier, used in `require` by other mods |
| `description` | Yes | Short description |
| `poster` | No | Preview image filename |
| `versionMin` | Recommended | Minimum PZ build version |
| `require` | No | Comma-separated mod IDs this mod depends on |
| `category` | No | `features`, `gameplay`, `ui`, etc. |

### Dependency Pitfall
```ini
# WRONG — "base" is NOT a valid dependency, causes red error in mod selector
require=base;my_dependency

# CORRECT — only list actual mod IDs
require=my_dependency

# Multiple dependencies
require=mod_one,mod_two
```

---

## Workshop Upload Structure

```
Workshop/
└── MyMod/
    ├── workshop.txt          ← Steam Workshop metadata
    ├── preview.png           ← 256x256 preview image
    └── Contents/
        └── mods/
            └── MyMod/
                ├── mod.info          ← MANDATORY root-level copy (dedicated server discovery)
                └── 42/
                    ├── mod.info      ← MANDATORY 42-level copy
                    └── media/...
```

### workshop.txt format
```
version=1
id=STEAM_WORKSHOP_ID
title=My Mod Name
description=[h1]Description[/h1]
tags=Build 42;Mod;Features
visibility=public
```

### WorkshopID
After first upload, PZ creates a file with the Workshop ID. The ID appears in the Steam URL: `https://steamcommunity.com/sharedfiles/filedetails/?id=WORKSHOP_ID`

---

## ISPanel UI — Custom Windows

### Basic panel structure
```lua
require "ISUI/ISPanel"
require "ISUI/ISButton"
require "ISUI/ISLabel"

MyPanel = ISPanel:derive("MyPanel")

MyPanel.instance = nil  -- singleton pattern
```

### Constructor
```lua
function MyPanel:new(x, y, w, h, customData)
    local o = ISPanel:new(x, y, w, h)
    setmetatable(o, self)
    self.__index = self
    o.customData = customData
    o.backgroundColor = { r = 0, g = 0, b = 0, a = 0.85 }
    o.borderColor = { r = 0.5, g = 0.5, b = 0.5, a = 1.0 }
    o.moveWithMouse = true  -- draggable
    return o
end
```

### Lifecycle methods
```lua
function MyPanel:initialise()
    ISPanel.initialise(self)
end

function MyPanel:createChildren()
    ISPanel.createChildren(self)

    -- Add child UI elements here
    self.titleLabel = ISLabel:new(10, 8, 20, "Title", 1, 1, 1, 1, UIFont.Medium, true)
    self:addChild(self.titleLabel)

    self.btnClose = ISButton:new(self.width - 70, self.height - 30, 60, 20, "Close", self, MyPanel.onClose)
    self.btnClose:initialise()
    self.btnClose:instantiate()
    self:addChild(self.btnClose)
end
```

### Custom rendering
```lua
function MyPanel:prerender()
    ISPanel.prerender(self)  -- MUST call parent

    -- Draw custom graphics
    self:drawRect(x, y, w, h, alpha, r, g, b)           -- filled rectangle
    self:drawRectBorder(x, y, w, h, alpha, r, g, b)     -- border only
    self:drawText(text, x, y, r, g, b, a, UIFont.Small)  -- text
end
```

### Opening (singleton pattern)
```lua
function MyPanel.Open(data)
    -- Close existing instance
    if MyPanel.instance then
        MyPanel.instance:removeFromUIManager()
        MyPanel.instance = nil
    end

    local w = 280
    local h = 140
    -- Center on screen
    local x = (getCore():getScreenWidth() - w) / 2
    local y = (getCore():getScreenHeight() - h) / 2

    local ui = MyPanel:new(x, y, w, h, data)
    ui:initialise()
    ui:instantiate()
    ui:setVisible(true)
    ui:addToUIManager()

    MyPanel.instance = ui
end
```

### Closing
```lua
function MyPanel:onClose()
    self:removeFromUIManager()
    MyPanel.instance = nil
end
```

### Positioning
```lua
-- Centered on screen (recommended)
local x = (getCore():getScreenWidth() - w) / 2
local y = (getCore():getScreenHeight() - h) / 2

-- Near mouse (keep on screen)
local x = getMouseX() + 15
local y = getMouseY() + 15
if x + w > getCore():getScreenWidth() then x = getCore():getScreenWidth() - w - 10 end
if y + h > getCore():getScreenHeight() then y = getCore():getScreenHeight() - h - 10 end
```

---

## Font Heights

```lua
local FONT_HGT_SMALL = getTextManager():getFontHeight(UIFont.Small)
local FONT_HGT_MEDIUM = getTextManager():getFontHeight(UIFont.Medium)
local FONT_HGT_LARGE = getTextManager():getFontHeight(UIFont.Large)
```

### Measuring text width
```lua
local textWidth = getTextManager():MeasureStringX(UIFont.Small, "My Text")
```

---

## Color Bar Pattern (progress/fill indicator)

```lua
-- Green → Yellow → Red gradient based on percentage
local pct = value / maxValue  -- 0.0 to 1.0
local r, g, b
if pct > 0.5 then
    local t = (pct - 0.5) / 0.5
    r = 1.0 - t    -- decreases from 1 to 0
    g = 0.8
    b = 0.1
else
    local t = pct / 0.5
    r = 1.0
    g = 0.8 * t    -- decreases from 0.8 to 0
    b = 0.1 * t
end

local barW = math.floor(totalBarWidth * pct)
self:drawRect(barX + 1, barY + 1, barW - 2, barH - 2, 0.9, r, g, b)
```

---

## Available UIFont Values
- `UIFont.Small`
- `UIFont.Medium`
- `UIFont.Large`
- `UIFont.Title`
- `UIFont.Handwritten`
- `UIFont.Cred1` / `UIFont.Cred2`
- `UIFont.NewSmall` / `UIFont.NewMedium` / `UIFont.NewLarge`

---

## Common Pitfalls

1. **Forgetting `ISPanel.prerender(self)` call** — panel background won't render.
2. **Forgetting `ISPanel.createChildren(self)`** — base children won't initialize.
3. **Not calling `initialise()` and `instantiate()` on buttons** before `addChild`.
4. **Missing root-level `mod.info`** — `mod.info` must exist at BOTH `Contents/mods/<ModId>/mod.info` (root level) AND `Contents/mods/<ModId>/42/mod.info`. Without the root copy, dedicated servers do not discover the mod.
5. **`require=base;`** prefix in mod.info causes "dependency not found" red error.
6. **Stray `common/` folders** at the mod root (outside `42/`) can confuse PZ.
