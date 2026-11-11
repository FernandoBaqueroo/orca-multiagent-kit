#!/usr/bin/env node
// Doble del CLI de Orca para las pruebas de omk setup/plugin: responde como `orca … --json` y
// guarda su estado en FAKE_ORCA_STATE y una línea por llamada en FAKE_ORCA_STATE.calls. Nunca habla con la app real.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STATE = process.env.FAKE_ORCA_STATE;
if (!STATE) { process.stderr.write('fake-orca: falta FAKE_ORCA_STATE\n'); process.exit(1); }

const load = () => {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; }
};
const state = { reachable: true, systemOn: false, plugins: [], fingerprint: 'ap1-0123456789abcdef', ...load() };
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2));

const args = process.argv.slice(2).filter((a) => a !== '--json');
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));

const reply = (code, body) => { save(); process.stdout.write(JSON.stringify(body)); process.exit(code); };
const ok = (result = {}) => reply(0, { ok: true, result });
const err = (code, message, data) => reply(code === 'approval_required' ? 3 : 1, { ok: false, error: { code, message, data } });

if (args[0] === '--version') { process.stdout.write(`${process.env.FAKE_ORCA_VERSION || '1.4.256'}\n`); process.exit(0); }
fs.appendFileSync(`${STATE}.calls`, `${args.join(' ')}\n`);

const manifestOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'orca-plugin.json'), 'utf8'));
const find = (key) => state.plugins.find((p) => p.pluginKey === key);
const askApproval = (action, m) => err('approval_required', `${m.id} needs approval`, {
  pluginKey: `local.${m.id}`, name: state.pluginName || m.name, version: m.version, action,
  approvalFingerprint: state.fingerprint,
  grants: {
    executionDescription: 'Runs its own code in a separate Node.js process.',
    capabilities: (m.capabilities || []).map((c) => ({ kind: c.kind, description: `grants ${c.kind}` })),
    contributions: [{ kind: 'panels', name: 'Multiagent Kit' }],
  },
});
const approved = () => flag('--approve') === state.fingerprint;

const [group, sub, target] = positional;
const key = `${group} ${sub || ''}`.trim();
switch (key) {
  case 'status': ok({ runtime: { reachable: state.reachable } }); break;
  case 'open': state.reachable = true; ok({ opened: true }); break;
  case 'plugin system': state.systemOn = true; ok({ enabled: true }); break;
  case 'plugin list': ok({ plugins: state.plugins }); break;
  case 'plugin install': {
    const dir = path.resolve(target);
    const m = manifestOf(dir);
    if (state.failInstall) err('action_failed', state.failInstall);
    if (!approved()) askApproval('install', m);
    state.plugins.push({ pluginKey: `local.${m.id}`, version: m.version, status: 'running', source: { kind: 'local-path', path: dir } });
    ok({ pluginKey: `local.${m.id}` });
    break;
  }
  case 'plugin update': {
    const p = find(target);
    if (!p) err('not_found', `${target} is not installed`);
    const m = manifestOf(p.source.path);
    if (state.updateNeedsApproval && !approved()) askApproval('update', m);
    p.version = m.version;
    ok({ pluginKey: p.pluginKey });
    break;
  }
  case 'plugin enable': {
    const p = find(target);
    if (!p) err('not_found', `${target} is not installed`);
    if (!approved()) askApproval('enable', manifestOf(p.source.path));
    p.status = 'running';
    p.needsReconsent = false;
    ok({ pluginKey: p.pluginKey });
    break;
  }
  case 'plugin uninstall':
    state.plugins = state.plugins.filter((p) => p.pluginKey !== target);
    ok({ removed: true });
    break;
  case 'plugin open': ok({ shown: true }); break;
  default: err('unknown_command', `fake-orca no conoce: ${args.join(' ')}`);
}
