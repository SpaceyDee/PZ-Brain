# `GameWindow.doRenderEvent` — actual scope

Build 42.15. Sources: `zombie/GameWindow.class`, `zombie/ui/UIManager.class`, `zombie/gameStates/GameLoadingState.class`.

## TL;DR

`GameWindow.doRenderEvent(false)` is a single-boolean gate around **one private method**: `GameWindow.onRender()`, whose entire body is `LuaEventManager.triggerEvent("OnRenderTick")`. It gates **only** the `OnRenderTick` Lua event. Nothing else.

## Field + setter

```
private static boolean doRenderEvent;
public static void doRenderEvent(boolean);   // putstatic #1206
```

Only `GameWindow.class` reads the field. Verified by:

```
grep -rl 'doRenderEvent' --include='*.class' zombie/
  -> zombie/GameWindow.class           (only hit)
```

## The single check site (GameWindow.render bytecode)

```
171: invokestatic  #643   // Method renderInternal:()V         <-- ALWAYS runs
174: getstatic     #1206  // Field doRenderEvent:Z
177: ifeq          232                                          <-- skip onRender if false
180: aload_3
181: ldc_w         #1209  // String "On Render"  (profiler tag)
184: invokevirtual #396   // GameProfiler.profile
189: invokestatic  #1211  // Method onRender:()V               <-- gated
...
232: invokestatic  #272   // Core.getInstance().DoFrameReady() <-- ALWAYS runs
```

`renderInternal()` runs before the check. `Core.DoFrameReady()` runs after. Only `onRender()` is gated.

## What `onRender()` actually does

```
private static void onRender();
  0: ldc_w         #1294   // String "OnRenderTick"
  3: invokestatic  #1161   // LuaEventManager.triggerEvent(String)
  6: return
```

That's the whole method. Disabling it suppresses **`OnRenderTick` only**.

## What is NOT gated

### `renderInternal()` -> `GameStateMachine.render()`

```
71: getstatic   #237   // Field states:Lzombie/gameStates/GameStateMachine;
74: invokevirtual #702 // GameStateMachine.render():V
```

The state's `render()` runs regardless. `GameLoadingState.render()` and `LoadingQueueState.render()` both call `UIManager.render()` inside their own bodies (4x and 1x respectively, verified at PC 698/903/1015/1359 in GameLoadingState, PC 65 in LoadingQueueState).

### `UIManager.render()` fires `OnPreUIDraw` and `OnPostUIDraw`

```
170: ldc_w         #479   // String "OnPreUIDraw"
173: invokestatic  #366   // LuaEventManager.triggerEvent
...
664: ldc_w         #648   // String "OnPostUIDraw"
667: invokestatic  #366   // LuaEventManager.triggerEvent
```

These events are gated only by `LuaManager.thread == defaultthread` (i.e. Lua is alive) and by `UIManager.suspend` / `UIManager.useUiFbo && !Core.uiRenderThisFrame`. NOT by `doRenderEvent`.

Children added via `UIManager.AddUI` / `ISUIElement:addToUIManager` are drawn inside the `UIManager.render()` loop between PreUIDraw and PostUIDraw. They are independent of the `doRenderEvent` flag.

## Vanilla call sites

```
media/lua/client/OptionScreens/MainScreen.lua:748     GameWindow.doRenderEvent(true)
media/lua/client/OptionScreens/MainScreen.lua:1009    GameWindow.doRenderEvent(false)
media/lua/client/OptionScreens/MainScreen.lua:1264    GameWindow.doRenderEvent(false)
media/lua/client/OptionScreens/MainScreen.lua:1432    GameWindow.doRenderEvent(false)
media/lua/client/OptionScreens/LastStandPlayerSelect.lua:319  GameWindow.doRenderEvent(false)
media/lua/client/OptionScreens/CharacterCreationMain.lua:2160 GameWindow.doRenderEvent(false)
media/lua/client/OptionScreens/ConnectToServer.lua:292        GameWindow.doRenderEvent(false)
media/lua/client/DebugUIs/DebugScenarios.lua:99               GameWindow.doRenderEvent(false)
media/lua/client/ISUI/ISTermsOfServiceUI.lua:206              GameWindow.doRenderEvent(true)
```

The vanilla pattern: turn off `OnRenderTick` while a transition screen is mounted (so mods that drew in-world content don't tick), then re-enable at MainScreen.

## Summary table

| Hook                 | Trigger source                  | Gated by `doRenderEvent`? |
|----------------------|----------------------------------|---------------------------|
| `OnRenderTick`       | `GameWindow.onRender()`          | YES                       |
| `OnPreUIDraw`        | `UIManager.render()`             | NO                        |
| `OnPostUIDraw`       | `UIManager.render()`             | NO                        |
| `UIElement.render()` | `UIManager.render()` UI[] loop   | NO                        |
| `OnPostRender`       | not fired here (IngameState/IsoCamera path) | NO              |

Additional UIManager-side suppressors:

- `UIManager.suspend = true` (early-return at PC 16 of `UIManager.render`)
- `UIManager.useUiFbo && !Core.uiRenderThisFrame` (early-return at PC 15)

These are the actual switches for blanking UIManager during loading. `doRenderEvent` is not one of them.

## Verdict

**`addToUIManager` panels DO keep rendering during `GameLoadingState` / `LoadingQueueState`** when `doRenderEvent(false)` is set. The gate at `GameWindow.render` PC 174 only skips `onRender() -> triggerEvent("OnRenderTick")`. `UIManager.render()` is invoked directly by each state's `render()` method (PC 698/903/1015/1359 in GameLoadingState; PC 65 in LoadingQueueState) and walks the `UIManager.UI` list normally — including any panel `addToUIManager` registered. To actually blank UI during loading, set `UIManager.suspend = true`, not `doRenderEvent(false)`.
