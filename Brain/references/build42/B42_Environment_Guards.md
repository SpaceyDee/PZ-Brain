# B42 Environment Guards — isServer() / isClient() Reference

**Sources:**
- pzwiki.net/wiki/Networking (search snippet — live wiki returns 403)
- pzwiki.net/wiki/Lua_event (search snippet)
- SKILL.md — a working multiplayer mod workshop (Haven / Biteme suite), cited as validated from real shipped failures
- Validation status: corrected against canonical runtime/vanilla truth on 2026-10-25; older hosted-host both-false guidance was wrong

> **This is one of the most important B42 modding facts.** Getting the guard wrong silently kills your mod in solo or hosted-host with no error message.

---

## The Truth Table

Build 42 exposes three execution contexts, not two.

| Environment | `isServer()` | `isClient()` |
|---|:---:|:---:|
| Singleplayer | `false` | `false` |
| Hosted game — **host player** | `false` | `true` |
| Hosted game — embedded coop server | `true` | `false` |
| Hosted game — remote client | `false` | `true` |
| Dedicated server process | `true` | `false` |
| Client connected to dedicated | `false` | `true` |

**Key insight:** The host player in a "Host Game" session is NOT a server from Lua's perspective. `isServer()` is `false` and `isClient()` is `true`. The embedded coop server runs in a separate process. Verified truth: `b42.env.hosted-host-player-isclient-true`.

### B42 Built-in Environment Globals

In addition to `isServer()` and `isClient()`, B42 exposes these built-in globals:

| Global | Returns `true` when... |
|---|---|
| `isCoopHost()` | Running as the hosted-game host player (`isServer()` is false; `isClient()` is true) |
| `isSinglePlayer()` | Running in solo play only (NOT true for hosted-host) |
| `isMultiplayer()` | Running in any MP context (hosted or dedicated) |
| `getActivatedMods()` | Returns ArrayList of loaded mod IDs (use for soft dependency probing) |

> **Caution:** `isSinglePlayer()` is NOT the same as "solo or host". Both-false detects singleplayer only. Use `isCoopHost()` for the host player; it does not identify the embedded server.

Helper you can define once:

```lua
local function isSolo()
    return not isClient() and not isServer()
end
```

This returns `true` for singleplayer only, not the hosted host player.

> **Note:** Do NOT name this `isSinglePlayer()` — that name conflicts with the B42 built-in global `isSinglePlayer()` which has different semantics (true only in solo play, not for hosted-host).

---

## Correct File Guards

### Server file (logic, persistence, authority)

```lua
if isClient() then return end
```

This runs in: singleplayer, embedded coop server, dedicated server.
This skips: all multiplayer player processes, including the host player.

### Client / UI file (display, input, chat)

```lua
if isServer() then return end
```

This runs in: singleplayer, hosted-host, all remote clients.
This skips: dedicated and embedded coop server processes.

Place the guard at the very top of the file, right after the header comment. Inner guards may be appropriate for operations such as skipping a network send in singleplayer.

---

## Anti-Patterns — Do NOT Use

```lua
-- WRONG as a file guard — kills server code in singleplayer
if not isServer() then return end

-- WRONG as a file guard — kills client code in singleplayer
if not isClient() then return end
```

Both negative file guards break singleplayer. The host player is a client and the hosted server is a separate process. There is no error — the file just never loads.

---

## Why the Three-State Model Exists

When a player uses "Host Game" from the main menu, PZ runs a separate internal server process AND a client process on the same machine. The Lua running in the host player's game session is the **client** Lua environment. The server Lua runs separately. From the host player's Lua perspective, `isServer()` is `false` because they are not inside the server process.

This means:
- Server Lua files run in the server process (dedicated OR the internal hosted-game server process)
- Client Lua files run in every human-facing process (solo player, host player's client, all remote clients)
- The guard `if isClient() then return end` correctly handles the hosted-game server because the server process has `isClient() = false`

---

## Quick Reference — Which Guard for Which File Type

| File role | Correct guard |
|---|---|
| Server-authoritative logic, ModData writes, validation | `if isClient() then return end` |
| UI windows, HUDs, chat hooks, local input | `if isServer() then return end` |
| Shared constants, config tables | **No guard** — shared loads on both sides |
| Shared file with side-specific inner logic | Guard inside the function, not at file top |

---

## Detecting Specific Contexts in Code

```lua
-- Is this a server process (dedicated OR embedded coop server)?
local function isServerProcess()
    return isServer() and not isClient()
end

-- Is this any kind of host/solo (human at keyboard)?
local function isHumanPlayer()
    return not isServer()
end

-- Is this singleplayer?
local function isSolo()
    return not isServer() and not isClient()
end
```

---

## Common Failure Pattern

```
-- Developer writes this in their server file:
if not isServer() then return end

-- Result:
-- Solo player → isServer()=false → bails out → server code never runs
-- Host player → server code belongs in the embedded server process
-- Users report: "Mod doesn't work in singleplayer" or "Mod broken when hosted"
-- No Lua error in the console — it just returns silently
```

This was the failure mode of early Haven builds (real-world example from the source).
