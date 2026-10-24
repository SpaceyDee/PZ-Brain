# PROJECT ZOMBOID MODDING TERMS

> ⚠ **B42.15+ correction:** Any `pcall(...)` or `safeCall(...)` pattern shown below is **deprecated and unsafe.** `pcall` corrupts Kahlua in B42.15+ — do not introduce it in new code. Replace with explicit nil/method guards (`obj and obj.method and obj:method()`). Canonical rule lives in [SKILL.md](../../SKILL.md) principle #16 and [local-conventions.md](../local-conventions.md).

Quick reference for terminology used across all mod files and documentation.

---

## Environments

| Term | Definition |
|---|---|
| **Singleplayer** | Solo game; `isServer()=false`, `isClient()=false` |
| **Hosted-host** | Player runs "Host Game" from main menu; host has `isServer()=false`, `isClient()=false` — same as singleplayer from Lua's view |
| **Hosted-remote** | Client connected to a hosted game; `isClient()=true` |
| **Dedicated server** | Standalone server process; `isServer()=true`, `isClient()=false` |
| **Dedi client** | Player connected to a dedicated server; `isClient()=true` |

## Lua File Roles

| Term | Definition |
|---|---|
| **Server file** | Lives in `media/lua/server/`; runs on server process and in SP/hosted-host |
| **Client file** | Lives in `media/lua/client/`; runs on all human-facing game processes |
| **Shared file** | Lives in `media/lua/shared/`; loaded on both sides with no guard |

## Networking

| Term | Definition |
|---|---|
| **MODULE_ID** | String constant that names the network channel; must be identical on both sides of every command |
| **sendClientCommand** | Client → server message |
| **sendServerCommand** | Server → client message (one player or broadcast) |
| **OnClientCommand** | Server-side event that receives client messages |
| **OnServerCommand** | Client-side event that receives server messages |
| **Payload** | The `args` table passed with a command |

## ModData

| Term | Definition |
|---|---|
| **GlobalModData** | World-scoped persistent data keyed by string; accessed via `ModData.getOrCreate(key)` |
| **Player ModData** | Per-player data accessed via `player:getModData()` |
| **Item ModData** | Per-item data accessed via `item:getModData()` |
| **transmit** | Push server ModData to all connected clients: `ModData.transmit(key)` |
| **request** | Client asks server to push current value: `ModData.request(key)` |

## ISUI

| Term | Definition |
|---|---|
| **ISUIElement** | Base class for all UI elements |
| **ISPanel** | Base panel; used for HUDs and as parent for ISCollapsableWindow |
| **ISCollapsableWindow** | Standard window base with title bar, close/pin/collapse buttons |
| **ISButton** | Clickable button |
| **ISScrollingListBox** | Vertical scrollable list |
| **ISTextEntryBox** | Text input field |
| **ISContextMenu** | Right-click context menu |
| **Singleton pattern** | One instance of a UI panel at a time; `instance` variable nulled in `:close()` |
| **moveWithMouse** | ISPanel flag; when `true`, panel is draggable without custom handlers |

## Workshop

| Term | Definition |
|---|---|
| **Workshop ID** | Steam file ID in `workshop.txt` `id=` field; must never be changed after first publish |
| **Mod ID** | String in `mod.info` `id=` field; must never be changed (breaks save compatibility) |
| **versionMin** | Minimum PZ version the mod requires; set to `42.0` for B42 mods |
| **BBCode** | Steam's markup language for Workshop descriptions; tags like `[b]`, `[list]`, `[url]` |

## Game Systems

| Term | Definition |
|---|---|
| **IsoPlayer** | Java class representing a player; accessed via `getPlayer()` or `getSpecificPlayer()` |
| **IsoObject** | Base class for all world objects |
| **IsoGridSquare** | A single world tile |
| **InventoryItem** | An item in a container or on the ground |
| **ISBaseTimedAction** | Base class for player actions with a progress bar |
| **SafeCall** | Deprecated `pcall` wrapper pattern; do not use in B42.15+ because it corrupts Kahlua |
| **AccessLevel** | `player:getAccessLevel()` — "Admin", "Moderator", "Overseer", "GM", "Observer", or "" |
| **ProceduralDistributions** | Named loot bucket system; newer distribution approach |
| **SuburbsDistributions** | Room-and-container keyed loot table; older approach |
| **LuaEventManager** | System for declaring custom events: `LuaEventManager.AddEvent("Name")` |
