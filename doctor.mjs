#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const ROOT = dirname(fileURLToPath(import.meta.url));
const SERVER = join(ROOT, 'Brain', 'mcp-server');
const moduleAt = rel => import(pathToFileURL(join(SERVER, rel)).href);
let client;
try {
  const { Client } = await moduleAt('node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js');
  const { StdioClientTransport } = await moduleAt('node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js');
  client = new Client({ name: 'pz-brain-doctor', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(SERVER, 'server.mjs')], cwd: ROOT, env: { ...process.env, PZ_BRAIN_CONFIG: join(SERVER, 'pz-brain.config.json') }, stderr: 'inherit' });
  transport.onerror = e => console.error(e.message);
  await client.connect(transport, { timeout: 15000 });
  const tools = (await client.listTools()).tools;
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 15000 });
    if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`);
    return result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  };
  const state = JSON.parse(await call('space_brain_status'));
  const expected = JSON.parse(readFileSync(join(SERVER, 'package.json'), 'utf8')).version;
  if (state.version !== expected || !state.publicMode) throw new Error('Connected server version/profile does not match this package.');
  if (state.truth.errors.length) throw new Error(`Truth registry errors: ${JSON.stringify(state.truth.errors)}`);
  if ((await call('space_search_brain', { query: 'ModData', max_results: 2 })).startsWith('no matches')) throw new Error('Knowledge search returned no ModData results.');
  if ((await call('space_lookup_method', { name: 'ModData' })).startsWith('no method')) throw new Error('Method database unavailable.');
  await call('space_lookup_script_block', { name: 'item' });
  const sample = join(ROOT, 'samples', 'hello.lua');
  if (state.luacPresent) {
    const check = spawnSync(state.luacPath, ['-v'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (!/Lua 5\.1(?:\D|$)/.test((check.stdout || '') + (check.stderr || ''))) throw new Error('Configured compiler is not Lua 5.1.');
    const parse = spawnSync(state.luacPath, ['-p', sample], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (parse.status !== 0) throw new Error(`Lua sample parse failed: ${parse.stderr || parse.error?.message || parse.status}`);
  }
  console.log(JSON.stringify({ ok: true, version: state.version, tools: tools.length, canonical: state.truth.canonical, pending: state.truth.pending, paths: state, optional: { luaSyntax: state.luacPresent ? 'available' : 'missing Lua 5.1 compiler', corpus: existsSync(state.corpusRoot) ? 'configured; refresh index to search installed mods' : 'not configured', game: state.gameRoot ? 'configured' : 'not configured' } }, null, 2));
} catch (e) { console.error(`Diagnostic failed: ${e.message}`); process.exitCode = 1; }
finally { await client?.close(); }
