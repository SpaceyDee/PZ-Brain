# Texture Loading from Lua (B42)

How `getTexture` resolves names, when widths come back as zero, and how the
Lua global maps to Java. Compiled from `javap` on `projectzomboid.jar` (B42)
and vanilla `media/lua/**` call sites.

## 1. Canonical `getTexture(name)` path format

The Lua global `getTexture(name)` is `zombie.Lua.LuaManager$GlobalObject.getTexture`,
which is a one-line forward to `Texture.getSharedTexture(name)`:

```
// LuaManager$GlobalObject.getTexture(String)
0: aload_0
1: invokestatic Texture.getSharedTexture:(Ljava/lang/String;)Texture;
4: areturn
```

`Texture.getSharedTexture` → `getSharedTextureInternal(name, flags)` which:

1. Looks up `s_sharedTextureTable[name]` (the literal string you passed). Hit → return.
2. Normalises `\` → `/`, strips a trailing `.png`, then takes the **basename**
   (everything after the last `/`), and looks that up in `TexturePackPage.getTexture`.
   This is the path that finds vanilla atlas entries like `Item_Knife`, `Icon_Radio_Speaker`.
3. Falls through to `ZomboidFileSystem` / asset-manager path resolution for on-disk PNGs.

Two forms work, for different reasons:

```lua
-- Form A: full media-relative path with extension. Loads a PNG from disk
-- (your mod's media/ tree, merged into the virtual FS).
local tex = getTexture("media/ui/MyMod/Button_Foo.png")

-- Form B: bare registered name. Resolves against the texture-pack atlas;
-- works for any name TexturePackPage has indexed (vanilla Item_*/Icon_*
-- icons, or anything your mod ships inside a .pack via texturepacks/).
local tex = getTexture("Item_Knife")
```

Empirically, Form A also resolves via the basename rule in step 2, so
`"media/ui/MyMod/Button_Foo.png"` and `"Button_Foo"` hit the same atlas entry
once it's been loaded. The full path is preferred for mod assets because it
also works before any texture pack has registered the basename, and it survives
basename collisions across mods.

Backslashes are auto-normalised; do not rely on it — use `/`.

## 2. Lazy size population and `getWidth()`

`Texture.getWidth()` bytecode:

```
0: aload_0
1: invokevirtual isReady:()Z         // inherited from zombie.asset.Asset
4: ifne 25                            // ready → jump to return width
7: getfield width:I
11: ifgt 25                           // width already > 0 → return
14: instanceof SmartTexture
18: ifne 25
21: invokevirtual syncReadSize:()V    // blocking PNG-header read
25: getfield width:I
29: ireturn
```

So `getWidth()` is **self-healing**: if the asset hasn't finished GPU upload
and `width` is still 0, it calls `syncReadSize()`, which opens the PNG on the
calling thread via `PNGSize.readSize(path)` and fills in `width`/`height` from
the IHDR chunk. After the first call, `width` is cached on the Lua-visible
field.

Implications:

- `getWidth()`/`getHeight()` immediately after `getTexture()` return real values
  in practice — but the **first** call may do synchronous file I/O. Cache the
  result; don't call `:getWidth()` in a hot render path.
- `getWidthHW()`/`getHeightHW()` return the **GPU** dimensions from `TextureID`
  and only become non-zero after upload. These can legitimately be 0 for a tick
  or two after `getTexture()` on a cold asset. If you need them, defer the
  measurement to your first `render(...)` tick.
- A returned `Texture` whose backing file is missing is logged once and the
  name is added to `Texture.nullTextures`; subsequent `getTexture` calls return
  `nil` fast. Always guard the result.

Safe pattern:

```lua
function MyPanel:createChildren()
    self.tex = getTexture("media/ui/MyMod/Button_Foo.png")
    -- tex may be nil if the file is missing; tex:getWidth() may do a sync read.
    self.texW, self.texH = 0, 0
end

function MyPanel:render()
    local tex = self.tex
    if not tex then return end
    if self.texW == 0 then
        self.texW, self.texH = tex:getWidth(), tex:getHeight()
        if self.texW == 0 then return end -- still not measured; skip a frame
    end
    self:drawTexture(tex, 0, 0, 1, 1, 1, 1)
end
```

Prefer explicit `if tex then` guards. `pcall` is functional in verified B42.18
dedicated probes; avoiding blanket wrappers is convention, not an engine limitation.

## 3. `Texture.getSharedTexture` (Java) vs `getTexture` (Lua)

They are the **same handle**. Lua `getTexture(name)` is literally
`Texture.getSharedTexture(name)` — see the LuaManager$GlobalObject bytecode in
§1. Both flow into `getSharedTextureInternal`, which caches by the **input
string** in `s_sharedTextureTable`:

```
26: getstatic s_sharedTextureTable
29: aload_0                          // the exact name you passed
30: invokevirtual HashMap.get
37: ifnull 43                        // hit → return cached Texture
41: areturn
```

Consequences for Java patches piping names from Lua:

- Calling `Texture.getSharedTexture(name)` from Java with the same string Lua
  used returns the same `Texture` instance Lua sees. Object identity holds.
- The cache key is **the unnormalised input string**. `"Item_Knife"` and
  `"media/ui/whatever/Item_Knife.png"` are separate keys in the cache, even
  if step-2 normalisation later collapses them to the same `TexturePackPage`
  entry. Pick one canonical name per asset.
- Server-side (`GameServer.server && !ServerGUI.isCreated`) returns `null`
  early — do not call this on the dedicated server thread.

Related entry points:

- `Texture.getTexture(name)` (NOT what Lua calls) — strips dir + `.png`,
  consults `TexturePackPage` then `BucketManager`, then `new Texture(name)`.
  Different cache (`Bucket`), different lifecycle. Avoid mixing.
- `Texture.trygetTexture(name)` — exposed to Lua as `tryGetTexture` (camel-case
  G). Calls `getSharedTexture` first, then falls back to a `.png` lookup with
  the `media/` prefix forced. Use this if you want a "look in atlas, else look
  on disk, else nil" call without the warning spam.

## Verified canonical pattern for a mod texture

Filesystem (inside your mod's `42/` content folder):

```
mods/MyMod/42/common/media/ui/MyMod/Button_Foo.png
```

Lua:

```lua
local btn = ISButton:new(0, 0, 32, 32, "", self, MyPanel.onFoo)
btn:setImage(getTexture("media/ui/MyMod/Button_Foo.png"))
```

Render-time guard (when you need dimensions):

```lua
function self:prerender()
    local t = self.tex
    if t and t:getWidth() > 0 then
        self:drawTextureScaled(t, 0, 0, self.width, self.height, 1, 1, 1, 1)
    end
end
```

## Pitfalls

- **Wrong path prefix.** `getTexture("ui/MyMod/Foo.png")` will silently fail
  if the file lives at `media/ui/MyMod/Foo.png`. The `media/` prefix is part
  of the virtual-FS path; it's not auto-prepended for `getSharedTexture`.
- **Backslashes in literals.** Auto-normalised, but inconsistent keys still
  hash to different cache entries before the normalisation step in
  `getSharedTextureInternal`. Always write `/`.
- **Single-frame PNG where an APNG is expected.** The loading-screen system
  expects animated PNGs for the splash; a static PNG loaded via `getTexture`
  works fine for UI but will not animate. See
  [load-screen-customization.md](../load-screen-customization.md).
- **Calling `:getWidthHW()` on a cold texture.** Returns 0 until GPU upload
  completes. Use `:getWidth()` (cached after first sync-read) if you only
  need pixel dimensions for layout.
- **Server thread.** `getSharedTexture` returns `null` on dedicated servers.
  Guard mod UI code with `isClient()` / `not isServer()`.
- **`nullTextures` cache.** A missing file is remembered; renaming a PNG and
  re-calling `getTexture` with the old name continues to return `nil` for
  the rest of the session. Restart the game after fixing asset paths.
- **Prefer explicit guards over `pcall(getTexture, ...)`.** This is convention, not a broken `pcall` implementation. Guard with
  `if tex then ... end`.

## Citations

- `javap -p -c zombie.core.textures.Texture` — `getTexture`, `getSharedTexture`,
  `getSharedTextureInternal`, `trygetTexture`, `processFilePath`, `getWidth`,
  `syncReadSize`, `s_sharedTextureTable`, `nullTextures`.
- `javap -p -c zombie.Lua.LuaManager$GlobalObject` — `getTexture(String)`,
  `tryGetTexture(String)` bindings.
- `javap -p zombie.asset.Asset` — `isReady()` inherited.
- Vanilla call sites:
  - `media/lua/client/Chat/ISChat.lua:137` — `getTexture("media/ui/inventoryPanes/Button_Gear.png")` (Form A).
  - `media/lua/client/Vehicles/ISUI/ISVehicleMenu.lua:357` — `getTexture("Item_WaterDrop")` (Form B).
  - `media/lua/client/Vehicles/ISUI/ISVehicleDashboard.lua:595` — `getTexture("Icon_Radio_Speaker")` (Form B).
  - `media/lua/client/XpSystem/ISUI/ISClothingInsPanel.lua:80` — extensionless `media/ui/BodyInsulation/heatbar_horz` (mixed form; basename rule lets it resolve).
