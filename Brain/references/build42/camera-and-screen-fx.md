# Camera & Screen FX in Build 42 — Lua Surface Audit

Target: Natural Disasters mod. Question: can Lua produce real screen-shake / flash / color-FX for events like earthquakes?

Build: B42.x. Sources: `projectzomboid.jar` decompiled headers + `media/lua/**`.

---

## Camera shake

**Verdict: No native shake API. Faking it via `IsoCamera.setOffX/setOffY` is technically possible but the camera's per-frame smoothing damps the effect heavily — it works as a soft drift, not a sharp earthquake judder. Real punchy shake requires a Java patch.**

Evidence:

- `zombie.iso.IsoCamera` exposes static `setOffX(float)` / `setOffY(float)` and `playerOffsetX` / `playerOffsetY` fields (public, all static).
- There is no method named `shake`, `addShake`, `addImpulse`, `addOffset`, or anything similar anywhere in `projectzomboid.jar` (jar tf grep for `shake` returns only `SHAKEDigest` / WebSocket `Handshake` — unrelated).
- `zombie.iso.PlayerCamera.update()` writes to `offX` / `offY` every frame via an `fadd` (smoothing toward target tOffX/tOffY based on the followed character). Setting offX from Lua on tick is overwritten the next frame unless you re-set every tick, and even then the value visible at render time is the smoothed one.
- Zero vanilla Lua references to `IsoCamera`, `setOffX`, `playerOffsetX`, or anything camera-offset-related (Grep over `media/lua` for `IsoCamera\.` / `setOffX` / `playerOffsetX`: zero hits in real code — `ISExtendedPlacementUI.lua` matched on substring only).

What would unlock it: a small Java patch (mod-side, Kahlua-exposed) of the form `IsoCamera.addShake(amp, durMs)` that injects an extra additive offset *after* `PlayerCamera.update()` writes offX. Not viable without Java-side mod patching.

## Screen flash / fullscreen tint

**Verdict: Yes — `UIManager.FadeOut(playerNum, seconds)` / `UIManager.FadeIn(playerNum, seconds)` give a per-player black fullscreen fade. Color is fixed to black. For colored flashes draw your own ISUIElement overlay.**

> ⚠ **Live correction (verified in B42.17):** `UIManager.FadeOut` is the **sleep system's fade**. It transitions to black and **stays there** until a matching `FadeIn` is called. There is no auto-restore. If you call `FadeOut` for a transient effect and forget `FadeIn`, the screen stays black indefinitely. **Do not use `FadeOut` for transient darken effects.** Use a fullscreen `ISPanel` overlay with animated alpha instead — verified pattern in `Natural Disasters/Contents/mods/NaturalDisasters/42/media/lua/client/NaturalDisastersShakeOverlay.lua`.

> ⚠ **Mouse passthrough required.** Fullscreen `ISPanel` overlays added to UIManager **consume mouse clicks by default**, blocking the HUD and launcher underneath. Override the click handlers to return `false`: `onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseMoveOutside`, `onRightMouseDown`, `onRightMouseUp`, `isMouseOver`. Without this, the HUD becomes uninteractable while the overlay is visible.

Evidence:

- `zombie.ui.UIManager` exposes static `FadeIn(double)` and `FadeOut(double)` plus `setFadeBeforeUI(int,bool)`, `setFadeAlpha(double)`, `getFadeAlpha()`, `fadeAlpha`, `fadeInTime`, `fadeInTimeMax`, `fadingOut`, and a per-player `playerFadeInfo[]` array. There is a private `BlinkInfo[] playerBlinkInfo` too — not exposed via a public static helper but the field exists.
- `renderFadeOverlay()` is the actual draw — uses `UIManager.black` (the black texture field).
- Vanilla usage (the production pattern):
  - `media/lua/client/ISUI/ISSleepDialog.lua:78-79` — `UIManager.setFadeBeforeUI(self.playerNum, true); UIManager.FadeOut(self.playerNum, 1)`
  - `media/lua/client/ISUI/ISWorldObjectContextMenu.lua:1112-1122` — same pattern for sleep-in-vehicle.
- Color is hardcoded black. There is no `setFadeColor` method.

So: black fade-to-sleep effect is one-liner from Lua. A *red* earthquake flash needs an ISUIElement overlay (see HUD section).

## Color filter / post-FX

**Verdict: No Lua entry point. Java-locked; would need a Java patch.**

Evidence:

- `zombie.core.Core` has `screenFilter` (private int) plus `getScreenFilter()` and `getOptionScreenFilter()` / `setOptionScreenFilter(String)`. These read/write a *config option name* (a shader profile name like "Vibrant" or "Muted") — they are not a per-event runtime tint. Setting it from Lua would change the user's global graphics preference.
- No method on `Core` named `setTint`, `setColorMatrix`, `pushFilter`, etc.
- No `PostProcess`, `PostFX`, `ColorGrade`, or `ScreenEffect` class in the jar (`jar tf` for those substrings returns nothing).
- The world-render shader pipeline is not Lua-bindable.

Closest hack: changing weather/climate state (overcast → fog → night) shifts global lighting, but that is a heavyweight side effect, takes seconds to ease in, and affects all players on the server.

## HUD overlay (Lua-rendered fullscreen draw)

**Verdict: Yes — standard ISUIElement at fullscreen size with `setAlwaysOnTop(true)` and `setRenderThisPlayerOnly(playerNum)`. Use `:drawRect` / `:drawTextureScaled` in `:render()`. This is the supported pattern for any colored flash or vignette.**

Evidence and pattern (verified against `ISUIElement.lua`):

- `ISUIElement:addToUIManager()` calls `UIManager.AddUI(self.javaObject)` (line 1186).
- `ISUIElement:setAlwaysOnTop(b)` flips the `alwaysOnTop` field on `zombie.ui.UIElement` (line 1135) — these elements render after the normal UI stack.
- `ISUIElement:setRenderThisPlayerOnly(playerNum)` (line 488) restricts to one split-screen player.
- `UIManager.fadeBeforeUi` (boolean) controls whether the black fade is drawn before or after UI — confirms there *is* a z-ordering for overlays vs. fade.

Minimal pattern (drop-in for an earthquake red flash, no `pcall`):

```lua
local ND_Flash = ISUIElement:derive("ND_Flash")

function ND_Flash:new(playerNum, r, g, b, durationMs)
    local o = ISUIElement:new(0, 0, getPlayerScreenWidth(playerNum), getPlayerScreenHeight(playerNum))
    setmetatable(o, self); self.__index = self
    o.playerNum = playerNum
    o.r, o.g, o.b = r, g, b
    o.startMs = getTimestampMs()
    o.durationMs = durationMs
    o:setAlwaysOnTop(true)
    o:setRenderThisPlayerOnly(playerNum)
    return o
end

function ND_Flash:prerender()
    local t = getTimestampMs() - self.startMs
    if t >= self.durationMs then
        self:removeFromUIManager()
        return
    end
    local a = 1.0 - (t / self.durationMs)         -- linear ease-out
    self:drawRect(0, 0, self.width, self.height, a * 0.7, self.r, self.g, self.b)
end

function ND_Flash:render() end                     -- prerender draws under UI; use render() to draw OVER UI

-- usage:
-- local f = ND_Flash:new(0, 1, 0, 0, 600); f:addToUIManager()
```

Notes:
- `prerender` draws below standard HUD; `render` draws above. Earthquake flash above HUD reads more visceral — move the `drawRect` into `render`.
- Resize-resilience: re-read `getPlayerScreenWidth/Height` each frame and reassign `self.width/self.height` if you care about window resize during a flash.
- Prefer explicit guards by convention; `pcall` works in verified B42.18 dedicated probes.

## Recommended fake-shake pattern

Since `IsoCamera.setOffX` is smoothed-away by `PlayerCamera.update()`, the cleanest deliverable for an earthquake is a **HUD-level shake**: the entire UI/world view appears to judder because every UI element draws at a wiggling origin — but the world doesn't actually shift. The honest cheat:

1. **Audio + screen tint + HUD vibration** combo, all Lua-side:
   - Trigger a low-rumble looped sound on the player.
   - Add a red/brown 10–20% alpha ND_Flash overlay (above), pulsing.
   - Add a **second** fullscreen ISUIElement whose `:render()` simply draws a 1-px-bordered transparent rect offset by `(math.random(-N, N), math.random(-N, N))` every frame. Use a soft envelope (amp ramps up 200ms, holds, ramps down 1–2s). This gives the player a "something is wrong" peripheral cue without touching the camera.

2. **Sprite proxy for world shake**: spawn a short-lived `IsoObject` or particle on each visible tile that visually jitters. Expensive at scale — only worth it for a few hero tiles near the player.

3. **DO NOT** burn cycles trying to fight `PlayerCamera.update()` from Lua. `setOffX` looks tempting; it does not deliver. Confirmed by reading the bytecode: `update()` writes `offX = offX + (tOffX - offX) * smoothing` every frame, and `tOffX` is recomputed from the followed character. A Lua write between frames is mostly eaten by the smoothing.

If real camera shake is mod-critical, the only honest path is a Java patch (`addShake(ampX, ampY, durationMs)`) that injects an additive offset *after* `PlayerCamera.update()` and decays it on a per-tick basis. That's outside the Lua-only scope of this mod.

## Citations

- `zombie.iso.IsoCamera` — javap header: `setOffX(float)`, `setOffY(float)`, `playerOffsetX/Y`, no shake method.
- `zombie.iso.PlayerCamera` — bytecode of `update()` shows `offX = offX + delta * smoothing` written every frame.
- `zombie.ui.UIManager` — `FadeIn(double)`, `FadeOut(double)`, `setFadeBeforeUI`, `playerFadeInfo[]`, `playerBlinkInfo[]`, `renderFadeOverlay()`, `black` texture, `fadeAlpha`.
- `zombie.core.Core` — `screenFilter` is the user's display-preference shader name, not a runtime hook.
- `media/lua/client/ISUI/ISSleepDialog.lua:78-79` — vanilla `UIManager.FadeOut` usage.
- `media/lua/client/ISUI/ISWorldObjectContextMenu.lua:1112-1122` — vanilla `setFadeBeforeUI` + `FadeOut` for sleep.
- `media/lua/client/ISUI/ISUIElement.lua:488` `setRenderThisPlayerOnly`; line 1135 `setAlwaysOnTop`; line 1186 `addToUIManager` → `UIManager.AddUI`.
- `IsoMolotovCocktail` — `Explode()` is private and triggers no screen FX for the thrower; confirms vanilla precedent for "no flash, no shake" on explosions.
- Full-jar `jar tf` for `shake|posteffect|colorfilter|screenfx` → no matches (only unrelated crypto/networking classes).
