# Load-Screen Customization (B42)

What's reachable from Lua, what isn't, and why. Compiled from PZ source inspection
(`<local-path>`) and live testing against
B42.17.

## The phases of "loading", from launch to spawn

```
launch .exe
    │
    │ [Engine boot — Java only, NOT Lua-customisable]
    │
"Click to Start" → main menu (MainScreen)
    │
    │ Click Join Server → server browser
    │
ConnectToServer screen (Lua: client/OptionScreens/ConnectToServer.lua)
    │  ▲ Lua-customisable. Has self.loadingBackground field, drawn via
    │  │ drawTextureScaledAspect3 in :prerender(). Server can set this via
    │  │ server:getServerLoadingScreen(). We can override prerender too.
    │
    │ OnConnected fires → forceChangeState(LoadingQueueState.new())
    │ (vanilla also calls GameWindow.doRenderEvent(false) — gates Lua frame events)
    │
LoadingQueueState (zombie.gameStates.LoadingQueueState) — JAVA CLASS
    │  ▲ Has renderBackground() method (Java).
    │  │ Renders its own UI via LoadingQueueUI (Java, has textures[] field).
    │  │ Brief — typically 50–500 ms unless the player is queued behind others.
    │  │ NOT Lua-customisable without a Java patch.
    │
    │ Connection authenticated, queue cleared
    │
GameLoadingState (zombie.gameStates.GameLoadingState) — JAVA CLASS
    │  ▲ The big one. Streams the world, loads mod scripts, generates terrain.
    │  │ This is where 10–30 seconds of "black screen" comes from.
    │  │ NOT Lua-customisable without a Java patch.
    │
    │ Player object created, world ready
    │
IngameState — Events.OnGameStart fires
```

## Why the connect-screen flash is so brief

Logged sequence on a B42.17 connect:

```
19,631,164  ConnectToServer.prerender first runs (we hook here, textures load)
19,631,441  login-queue-request sent
19,631,495  exit LoadingQueueState  (54ms after queue request)
19,631,917  WorldGen begins (Java/server-side Lua streaming)
...
19,641,226  triggerEvent OnInitWorld (~10 seconds later)
```

The Lua-renderable window of the connect process is **~50 ms** on a healthy
server. The 10+ second wait that players experience is `GameLoadingState` and
its world-streaming, which sits behind a Java curtain.

## What's hookable from Lua — the complete list

| Surface | Type | Useful? |
|---|---|---|
| `ConnectToServer:prerender()` | Lua method on a Lua class | ✅ Yes — wrap to inject `self.loadingBackground` and overlay text |
| `ConnectToServer:render()` | Lua method | ✅ Yes — same pattern |
| `Events.OnConnectionStateChanged(state)` | Event | ✅ Fires throughout the connect attempt |
| `Events.OnConnected()` | Event | ✅ Fires when the server accepts |
| `Events.OnConnectFailed()` / `OnDisconnect` | Events | ✅ For cleanup |
| `Events.OnGameStart()` | Event | ✅ Player has spawned — hide overlay |
| `Events.OnPostUIDraw()` | Event (per-frame after UI pass) | ⚠️ Only fires while UIManager is active, **not during JAVA loading states** |
| `Events.OnRenderTick()` | Event (per-frame) | ⚠️ Same |
| `LoadingScreen.update(text)` | NOT a Lua function | ❌ `LoadingScreen` is Java-only — there is no `media/lua/.../LoadingScreen.lua`. Wrapping it does nothing |
| `LoadingQueueState.renderBackground()` | Java method | ❌ Not overridable from Lua |
| `LoadingQueueUI.render()` | Java method | ❌ Not overridable from Lua |
| `GameLoadingState.*` | Java methods | ❌ Not overridable from Lua |
| Server-side `getServerLoadingScreen()` | Returns texture | ✅ But returns one static texture; can't cycle |

## Failure modes I've hit

1. **Wrapped `LoadingScreen.update`** — `LoadingScreen` is a Java global, not a
   Lua table. Wrapping a Java method-binding from Lua does nothing.
2. **Relied on `addToUIManager` overlay during JAVA loading states** — UIManager
   does not render during `LoadingQueueState` or `GameLoadingState`. The panel
   was alive but nothing called its `prerender`.
3. **Confused server-log vs client-log** — our `print()` only fires on the
   client (because of `if isServer() then return end`). Look at
   `~/Zomboid/console.txt` on the **client** machine, never the dedi server.

## What works today (Lua-only, no Java patch)

### 1. ConnectToServer screen — cycling background

Wrap `ConnectToServer.prerender` and assign `self.loadingBackground` to a
cycling texture each frame. Vanilla does the actual draw via its
`drawTextureScaledAspect3`. Add `:drawTextCentre` calls afterward for tagline
/ tip / credits overlays. Covers the connect-attempt phase only — typically
1–3 seconds on a fast server.

### 2. Long world-load screen — quick tips (PZ B42 has this built-in!)

`zombie.gameStates.GameLoadingState.loadQuickTipList()` iterates
`Translator.getUI()` (the entire UI translation map) and pulls every entry
whose key starts with `UI_quick_tip` into a list it cycles through during
the long load. Vanilla ships ~65 such tips in
`media/lua/shared/Translate/EN/UI.json`.

**To inject themed tips with no code at all:** ship a translation file at
`<modroot>/Contents/mods/<ModId>/42/media/lua/shared/Translate/EN/UI.json`
containing your own `UI_quick_tip_*` keys:

```json
{
    "UI_quick_tip_mymod_1": "Your themed tip here.",
    "UI_quick_tip_mymod_2": "Another themed tip."
}
```

Vanilla picks them up automatically. They appear interleaved with vanilla
tips during the long world-streaming screen. Other languages: ship the same
keys in `LANG/UI.json` for each locale you support (FR, ES, DE etc.).

The keys must start with literally `UI_quick_tip` — `UI_quick_tip_joke`
prefix routes to a separate joke list, anything else is ignored by the
loader.

### 3. Long world-load screen — replace the walking-man animation

Vanilla `zombie.gameStates.GameLoadingState` calls
`zombie.core.textures.AnimatedTextures.getTexture("media/ui/Progress/MaleDoor.png")`
(also `MaleSprint06.png`, `MaleWalk2.png`) to load the small character
animation shown during the long load. `AnimatedTextures.getTexture` resolves
through `ZomboidFileSystem.getString()`, which **scans loaded mod folders
before vanilla**, so a mod-shipped file at the matching path wins.

#### ⚠️ The vanilla files are APNG, not PNG

Static PNGs at these paths produce a red/grey **checkerboard placeholder**
on screen because `AnimatedTextureID` cannot decode them as animated
textures. Vanilla file specs (verified from B42.17):

| File | Frames | Frame duration | PIL mode |
|---|---|---|---|
| `MaleDoor.png` | 30 | 40 ms | `L` (grayscale) |
| `MaleSprint06.png` | 20 | 40 ms | `P` (palette) |
| `MaleWalk2.png` | 31 | 30 ms | `P` (palette) |

The replacements MUST be valid multi-frame APNGs. Save with PIL via:

```python
frames[0].save(path, save_all=True, append_images=frames[1:],
               duration=40, loop=0, format="PNG", optimize=True)
```

Mode `RGBA` works for the replacement; matching vanilla frame counts is not
required, but providing at least 2 frames (so it's a real animation) is.
Stick to 256×256 — vanilla render code uses the texture's actual
`getWidth()`/`getHeight()` for draw size and a screen-relative anchor for
position, so larger textures may render off-center.

### 4. Main menu animated tableau — bypass Bink via `MainScreen.prerender`

The vanilla rotating background behind the main menu is a `.bik` (Bink) video,
which is Java/native-only and requires the proprietary Bink encoder to author.
**You don't need Bink.** PZ's `MainScreen` is a Lua class with a Lua
`prerender()` method that you can wrap — drawing your own background **before**
the original prerender runs covers the screen with whatever you want. The
PROJECT ZOMBOID logo and menu buttons still draw on top, exactly as designed.

```lua
local origPrerender = MainScreen.prerender
MainScreen.prerender = function(self)
    if self and not self.inGame then
        local sw = getCore():getScreenWidth()
        local sh = getCore():getScreenHeight()
        local tex = pickCurrentTexture()  -- your cycling logic here
        if tex then
            drawTextureFitCover(self, tex, sw, sh, 1)
            self:drawRect(0, 0, sw, sh, 0.18, 0, 0, 0)  -- subtle dim for readability
        end
    end
    return origPrerender(self)
end
```

Verified on B42.17 in `BitemeLoadScreen` mod. No Java patch, no Bink, no
extra tooling — just shipped 1920×1080 PNG stills under `media/ui/<modname>/`
and the Lua hook cycles them every N seconds. Total mod size for 10
backgrounds: ~35 MB (well under any Workshop cap; vanilla Bink files run
9–43 MB per file).

The `.bik.png` thumbnails (480×270, world-selection map list) and the
walking-man APNG override (256×256) work alongside this without conflict —
they target different render paths.

### 5. Long world-load screen — `gameLoadingString`

`GameLoadingState.gameLoadingString` is a `public static String` field. From
Lua you can write it directly (no method call needed):

```lua
if GameLoadingState ~= nil then
    GameLoadingState.gameLoadingString = "Your custom loading string"
end
```

**Caveat:** vanilla `GameLoadingState.enter()` sets this back to `""` early
in the entry sequence, so a write done from Lua at file-load time gets
overwritten. The narrow window where the write sticks is between
`Events.OnConnected` and `GameLoadingState.enter()`. Test on your build —
exact timing varies.

## What requires a Java patch — and the harsh distribution reality

Anything that draws inside `LoadingQueueState` or `GameLoadingState`
(specifically: the 10–30 second world-stream black background) requires
modifying compiled Java code. **PZ B42 does NOT support shipping mod-loaded
`.class` files**; we verified this against the only working in-workshop
example (`HavenAdminTools/hard_culling_fix`), which uses a Python installer
to physically rewrite `projectzomboid.jar`.

That installer pattern is incompatible with Workshop-distributable client
mods because:
- It bypasses Steam validation and can be reverted on game update
- Users must run a separate Python script outside the game
- It can't be auto-applied via Workshop subscription

**Practical conclusion:** for a mod that ships only via Workshop, the
long-load black background is a hard limit. Don't sell users on a fully
themed long-load — sell them on a themed connect screen + themed quick
tips, and accept the vanilla walking-man animation in between.

If a project genuinely needs the long-load background customised, the
viable paths are:
1. **Server-side `getServerLoadingScreen()`** — one static texture, the
   engine-blessed path. Works during the connect screen only.
2. **Storm framework** (bundled in `B42MP.jar`) — see
   [java-mod-patches.md Pattern B](java-mod-patches.md). Untested for this
   use case; may or may not give a Lua-callable hook into load-screen render.
3. **Jar-modification installer** — only for dedicated server admins who can
   run Python on their server box. Not Workshop-distributable.

## Practical recommendations

1. **For most servers**, the Lua-only `ConnectToServer` hook is the right
   ceiling. Set expectations accordingly when offering "custom load screens"
   to clients.
2. **For a true cinematic experience** during world streaming, scope a Java
   patch as a separate sub-mod. It's reusable across servers.
3. **Use server-side `getServerLoadingScreen()`** when one static themed image
   is acceptable — that's the engine's intended path and it works during the
   connect screen with zero hooks.

## Locations of relevant PZ source

- `<local-path>`
- `<local-path>` (sets `loadingBackground`)
- `<local-path>`
  - `zombie/gameStates/LoadingQueueState.class`
  - `zombie/gameStates/IngameState.class`
  - `zombie/gameStates/GameLoadingState.class`
  - `zombie/ui/LoadingQueueUI.class`
- `<local-path>`
  - `zombie/gameStates/ConnectToServerState.class` (post-process glue)
