#!/usr/bin/env node
import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { migrate } from './migrate.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SERVER = join(ROOT, 'Brain', 'mcp-server');
const CONFIG = join(SERVER, 'pz-brain.config.json');
const VERSION = JSON.parse(readFileSync(join(SERVER, 'package.json'), 'utf8')).version;
const flags = new Set(['--non-interactive', '--dry-run', '--skip-check', '--help']);
const values = new Set(['--workshop', '--corpus', '--game', '--user-data', '--server', '--luac', '--author', '--import', '--clients']);

function parse(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (flags.has(key)) result[key.slice(2)] = true;
    else if (values.has(key) && argv[i + 1] && !argv[i + 1].startsWith('--')) result[key.slice(2)] = argv[++i];
    else throw new Error(`Unknown option or missing value: ${key}`);
  }
  return result;
}

function existingDir(path) { return Boolean(path && existsSync(path) && statSync(path).isDirectory()); }
function steamLibraries() {
  const candidates = process.platform === 'win32'
    ? [join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Steam'), join(process.env.ProgramFiles || 'C:/Program Files', 'Steam')]
    : [join(homedir(), '.steam', 'steam'), join(homedir(), '.local', 'share', 'Steam'), join(homedir(), 'Library', 'Application Support', 'Steam')];
  const libraries = new Set(candidates.filter(existingDir));
  for (const base of [...libraries]) {
    const vdf = join(base, 'steamapps', 'libraryfolders.vdf');
    if (!existsSync(vdf)) continue;
    for (const m of readFileSync(vdf, 'utf8').matchAll(/"path"\s*"([^"]+)"/g)) {
      const path = m[1].replaceAll('\\\\', '\\'); if (existingDir(path)) libraries.add(path);
    }
  }
  return [...libraries];
}

function save(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) copyFileSync(file, `${file}.bak-${Date.now()}`);
  writeFileSync(file, text);
}
function clientFile(client) {
  const home = homedir();
  const app = process.platform === 'win32' ? process.env.APPDATA : process.platform === 'darwin' ? join(home, 'Library', 'Application Support') : join(home, '.config');
  if (client === 'cursor') return join(home, '.cursor', 'mcp.json');
  if (client === 'claude-desktop' && app) return join(app, 'Claude', 'claude_desktop_config.json');
  if (client === 'gemini-cli') return join(home, '.gemini', 'settings.json');
  throw new Error(`Unsupported automatic client: ${client}. Use 'none' and the generated snippets for other clients.`);
}

async function main() {
  const args = parse(process.argv.slice(2));
  if (args.help) {
    console.log(`PZ Modding Brain ${VERSION}\nUsage: node install.mjs [options]\nDefault: interactive directory setup; then diagnostic.\n--non-interactive --workshop <directory>\n--corpus <Steam/content/108600> --game <PZ installation>\n--user-data <Zomboid user directory> --server <dedicated installation>\n--luac <Lua 5.1 compiler> --author <mod author>\n--import <older package or Brain directory>\n--clients none|cursor,claude-desktop,gemini-cli\n--dry-run (no writes) --skip-check\nClient registration is opt-in. Other clients use the generated snippets.`); return;
  }
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20+ is required; install a supported Node.js LTS release.');
  const prior = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, 'utf8')) : {};
  const libs = steamLibraries();
  const first = suffix => libs.map(p => join(p, ...suffix)).find(existingDir) || '';
  const suggested = {
    workshopRoot: prior.workshopRoot || (existingDir(join(homedir(), 'Zomboid', 'Workshop')) ? join(homedir(), 'Zomboid', 'Workshop') : join(ROOT, 'workspace')),
    corpusRoot: prior.corpusRoot || first(['steamapps', 'workshop', 'content', '108600']),
    gameRoot: prior.gameRoot || first(['steamapps', 'common', 'ProjectZomboid']),
    userDataRoot: prior.userDataRoot || (existingDir(join(homedir(), 'Zomboid')) ? join(homedir(), 'Zomboid') : ''),
    serverRoot: prior.serverRoot || first(['steamapps', 'common', 'Project Zomboid Dedicated Server']),
    luacPath: prior.luacPath || (process.platform === 'win32' && existsSync(join(ROOT, 'vendor', 'lua-5.1.5', 'luac.exe')) ? join(ROOT, 'vendor', 'lua-5.1.5', 'luac.exe') : ''),
    author: prior.author || 'Mod Author',
  };
  const fields = [['workshop', 'workshopRoot', 'Mod development folder'], ['game', 'gameRoot', 'PZ game installation (optional)'], ['corpus', 'corpusRoot', 'Steam Workshop content/108600 (optional)'], ['user-data', 'userDataRoot', 'Zomboid user data and logs (optional)'], ['server', 'serverRoot', 'Dedicated server installation (optional)'], ['luac', 'luacPath', 'Lua 5.1 compiler (optional)'], ['author', 'author', 'Your mod author name']];
  const interactive = !args['non-interactive'] && Boolean(process.stdin.isTTY);
  const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const cfg = { ...prior, schemaVersion: 1, packageVersion: VERSION, brainRoot: resolve(ROOT, 'Brain') };
  try {
    console.log(`PZ Modding Brain ${VERSION} — directory setup\nUse - to clear an optional directory.`);
    for (const [flag, key, title] of fields) {
      let value = args[flag] ?? suggested[key];
      if (rl && args[flag] === undefined) value = (await rl.question(`${title} [${value || 'not configured'}]: `)).trim() || value;
      if (value === '-') value = '';
      if (key === 'author') { cfg[key] = value || 'Mod Author'; continue; }
      if (value) {
        value = resolve(SERVER, value);
        if (existsSync(value)) {
          if (key === 'luacPath' ? !statSync(value).isFile() : !statSync(value).isDirectory()) throw new Error(`${title} has the wrong file type: ${value}`);
        } else if (key !== 'workshopRoot') throw new Error(`${title} does not exist: ${value}`);
      }
      if (key === 'workshopRoot' && !value) throw new Error('A mod development folder is required.');
      cfg[key] = value;
    }
    let old = args.import;
    if (rl && old === undefined) old = (await rl.question('Previous Brain/package to absorb (optional; blank skips): ')).trim();
    if (old) console.log(JSON.stringify(migrate({ source: old, targetBrain: cfg.brainRoot, dryRun: true }), null, 2));
    let clients = args.clients;
    if (rl && clients === undefined) clients = (await rl.question('Register with cursor, claude-desktop, gemini-cli (comma-separated), or none [none]: ')).trim();
    const selected = (clients || 'none').split(',').map(v => v.trim()).filter(v => v && v !== 'none');
    const registrations = selected.map(client => {
      const file = clientFile(client);
      const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
      if (!data || Array.isArray(data) || typeof data !== 'object' || (data.mcpServers && (Array.isArray(data.mcpServers) || typeof data.mcpServers !== 'object'))) throw new Error(`Unsupported client config: ${file}`);
      return { file, data };
    });
    const entry = { command: process.execPath, args: [join(SERVER, 'server.mjs')], env: { PZ_BRAIN_CONFIG: CONFIG } };
    console.log(JSON.stringify({ version: VERSION, config: cfg, register: registrations.map(r => r.file), dryRun: Boolean(args['dry-run']) }, null, 2));
    if (args['dry-run']) return;
    if (old) console.log(JSON.stringify(migrate({ source: old, targetBrain: cfg.brainRoot }), null, 2));
    mkdirSync(cfg.workshopRoot, { recursive: true });
    save(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
    save(join(ROOT, 'mcp-client-snippet.json'), JSON.stringify({ mcpServers: { 'pz-modding-brain': entry } }, null, 2) + '\n');
    save(join(ROOT, 'mcp-client-snippet.toml'), `[mcp_servers.pz-modding-brain]\ncommand = ${JSON.stringify(entry.command)}\nargs = ${JSON.stringify(entry.args)}\n\n[mcp_servers.pz-modding-brain.env]\nPZ_BRAIN_CONFIG = ${JSON.stringify(CONFIG)}\n`);
    for (const { file, data } of registrations) {
      data.mcpServers ||= {}; data.mcpServers['pz-modding-brain'] = entry;
      save(file, JSON.stringify(data, null, 2) + '\n');
    }
    if (!args['skip-check']) {
      const result = spawnSync(process.execPath, [join(ROOT, 'doctor.mjs')], { stdio: 'inherit', windowsHide: true, timeout: 60000 });
      if (result.status !== 0) throw new Error('Configuration saved, but diagnostic failed. Read its error above; run node doctor.mjs after fixing it.');
    }
    console.log('Setup complete. Restart/reconnect your MCP client. Other clients: use mcp-client-snippet.json or .toml. Ask the agent to call space_brain_status.');
  } finally { rl?.close(); }
}
main().catch(e => { console.error(`Setup failed: ${e.message}`); process.exitCode = 1; });
