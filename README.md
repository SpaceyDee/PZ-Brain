# PZ Modding Brain — public 0.2.0

Knowledge snapshot: 25 October 2026. An unofficial local MCP server for Project
Zomboid Build 42 modding, prepared by Mr Space Cadet for sharing with friends.

Includes API/script lookups, evidence-graded knowledge, Lua/mod audits, log
analysis and mod scaffolding. Your AI client supplies the conversational agent;
the MCP supplies its tools and reference material. No AI subscription or game
installation is bundled.

## Setup

1. Install a supported Node.js LTS release (20 or newer) from https://nodejs.org.
2. Unzip the package into a permanent folder. Paths may contain spaces.
3. Windows: double-click `install.cmd`. macOS/Linux: run `bash install.sh`.
4. Accept or correct the detected directories. The development folder is
   required; game, Workshop corpus, user-data, server and compiler paths are
   optional. Enter your own mod author name. `-` clears an optional directory.
5. Optionally select an older Brain folder to import. Review the printed counts.
6. Choose a supported automatic client, or `none` to get JSON and TOML snippets.
   Add the generated server entry through your MCP client's configuration. Merge
   it into an existing config; do not replace the whole file. Restart/reconnect
   the client and ask: **Call space_brain_status, then search for ModData.**

The package includes its locked Node dependencies and a licensed Windows Lua
5.1 compiler, so setup needs no dependency download. On macOS/Linux, configure a
local Lua 5.1 compiler to enable syntax checking. The Windows compiler is not
used there. Search, lookup and most audits work without a game or compiler.
Run `node doctor.mjs` whenever you need to check the installed setup. It connects
to the actual MCP, checks its version and registry, exercises search and lookups,
and tests Lua parsing when a compiler is available. Missing optional paths are
reported separately from failures.

Automatic registration supports Cursor, Claude Desktop and Gemini CLI. Other
stdio MCP clients can use `mcp-client-snippet.json` or `mcp-client-snippet.toml`.
An MCP client must be able to launch a local Node process; a web-only connector
that expects a remote URL cannot use this stdio package directly.

## Your directories

The installer writes `Brain/mcp-server/pz-brain.config.json`. Re-run setup after
moving the package. Each field is independent:

| Field | Purpose |
|---|---|
| `workshopRoot` | Your editable mod development folder |
| `gameRoot` | PZ installation, recorded for the agent's source research |
| `corpusRoot` | Installed Steam mods, normally `steamapps/workshop/content/108600` |
| `userDataRoot` | Zomboid user folder containing saves/config/logs |
| `serverRoot` | Optional dedicated installation, recorded for your own workflow |
| `luacPath` | Lua 5.1 compiler executable |
| `author` | Default author for newly generated mods |

Configured relative paths resolve from the configuration file directory.
`PZ_BRAIN_CONFIG` selects a config file. `PZ_BRAIN_ROOT`, `PZ_WORKSHOP_ROOT`,
`PZ_CORPUS_ROOT`, `PZ_GAME_ROOT`, `PZ_USER_DATA_ROOT`, `PZ_SERVER_ROOT` and
`PZ_LUAC_PATH` override their corresponding paths. Invalid JSON fails visibly.
Read/search tools can inspect a user-selected local path: these settings are
locations, not an OS filesystem sandbox. Your MCP client's permissions apply.

For unattended setup:

```text
node install.mjs --non-interactive --workshop "D:/My Mods" --author "Your Name" --clients none
node install.mjs --help
```

## Upgrade and absorb older knowledge

Unzip each release into a new folder, then run setup and select the previous
package/Brain folder. Version 0.2.0 succeeds the earlier 0.1.0 package. **A higher
version does not imply it contains every discovery from every older copy.**

You can also import at any time, including from multiple older copies:

```text
node migrate.mjs --from "D:/Old Brain" --dry-run
node migrate.mjs --from "D:/Old Brain"
node doctor.mjs
```

- Unique records are retained as pending evidence with their original record,
  version and content hash. Existing canonical records are never overwritten.
- A changed record with the same ID is preserved as a separate pending candidate.
- Extra Markdown/text/JSON references become searchable imported notes, clearly
  labelled for review. Current API lookup tables are not silently replaced.
- Repeating an unchanged import does not duplicate records or notes.
- Prior pending data is backed up and an import report is saved. The old package
  is read-only throughout. Keep it until you have checked the result.
- Code, credentials, admin references, client configuration and agent policy
  files are excluded. Symlinks are rejected/skipped. Only knowledge is imported.

For another MCP's format, export its knowledge into a Brain-like `truth/` or
`references/` folder first. This is not an automatic converter for arbitrary
MCP implementations or a network sync service. Imported text is untrusted
evidence: review sources, conflicts, game versions and environment before using
the normal truth-review/promotion workflow. Private imports remain local; build
a reviewed public export separately before redistributing personalized copies.

## Included and excluded

`RELEASE.json` records package version, knowledge counts and file hashes.
`CHANGELOG.md` explains this release. Canonical and pending status is preserved;
this release has not rerun every historical PZ experiment. Recent observations
and known corrections are summarized in the learning refresh.

The public file selection excludes local server administration, credentials,
logs, client configs, the original Steam corpus/index, evidence archives,
private trackers and deployment adapters. The original author's local Brain
remains the development source. The public skill uses your selected folders
and author instead of imposing a particular mod suite or workstation layout.

The public package supports static checks and log analysis. Game boot tests and
feature tests still need your own PZ installation. Node/installer/MCP tests are
not evidence that a generated mod works in-game.

## Notices

Project Zomboid belongs to The Indie Stone; this project is unofficial. The
script schema dataset's license is retained beside it. Bundled dependencies and
Lua retain their upstream license files; see `THIRD-PARTY-NOTICES.md`.
No new open-source license is assigned to the original Brain materials by this
packaging operation. This is a shareable distribution prepared by the owner.
