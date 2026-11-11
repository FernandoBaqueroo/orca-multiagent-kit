// Integración de omk con la app Orca: localizar su CLI, encender los plugins e instalar el del kit.
// Solo habla con Orca por su CLI (`orca … --json`): nunca escribe en sus ficheros.
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PLUGIN_ID = 'multiagent-kit';
const PANEL_ID = 'kit';
// `orca plugin install|update|enable` salen con 3 cuando falta la aprobación del usuario.
const APPROVAL_EXIT = 3;
const FINGERPRINT = /^ap1-[0-9a-f]{8,128}$/;
const TIMEOUT_MS = 120000;
// `orca open` espera a que arranque la app.
const OPEN_TIMEOUT_MS = 180000;

/** [mayor, menor, parche] de la primera versión x.y.z del texto, o null. */
function parseVersion(text) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(text || ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Si `version` cumple un requisito `>=x.y.z` (el único formato de engines.orca). */
function satisfies(version, range) {
  const have = parseVersion(version);
  const need = parseVersion(range);
  if (!have || !need) return false;
  for (let i = 0; i < 3; i += 1) if (have[i] !== need[i]) return have[i] > need[i];
  return true;
}

/** Rutas donde suele estar el CLI de Orca cuando no está en el PATH. */
function knownOrcaPaths(platform = process.platform, env = process.env, home = os.homedir()) {
  if (platform === 'win32') {
    return env.LOCALAPPDATA ? [path.join(env.LOCALAPPDATA, 'Programs', 'orca', 'resources', 'bin', 'orca.exe')] : [];
  }
  if (platform === 'darwin') {
    return ['/Applications/Orca.app', path.join(home, 'Applications', 'Orca.app')].map((app) =>
      path.join(app, 'Contents', 'Resources', 'bin', 'orca'));
  }
  return [];
}

// Si corre como ejecutable autónomo (Node SEA): ahí process.execPath es omk, no Node.
// node:sea no existe en Node 18, que sigue soportado.
const isSea = (() => { try { return require('node:sea').isSea(); } catch { return false; } })();

// Un .js se ejecuta con Node: así OMK_ORCA puede apuntar a un CLI envuelto o a un doble de pruebas.
function commandFor(file) {
  if (!/\.m?js$/i.test(file)) return { file, prefix: [] };
  return { file: isSea ? 'node' : process.execPath, prefix: [file] };
}

function probe(cmd) {
  const r = spawnSync(cmd.file, [...cmd.prefix, '--version'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  if (r.error || r.status !== 0) return null;
  const version = parseVersion(r.stdout);
  return version ? version.join('.') : null;
}

/**
 * El CLI de Orca y su versión, o null. OMK_ORCA manda: si apunta a algo que no funciona no se busca
 * otro, para no acabar hablando con una instalación de Orca que no es la que se pidió.
 */
function findOrca(env = process.env) {
  const candidates = env.OMK_ORCA ? [env.OMK_ORCA] : ['orca', ...knownOrcaPaths(process.platform, env)];
  for (const file of candidates) {
    if (file !== 'orca' && !fs.existsSync(file)) continue;
    const cmd = commandFor(file);
    const version = probe(cmd);
    if (version) return { ...cmd, path: file, version };
  }
  return null;
}

// Lo que llega de Orca (nombres, descripciones, errores) se imprime en el terminal del usuario:
// sin caracteres de control, para que no pueda mover el cursor ni cambiar colores.
const clean = (text) => String(text == null ? '' : text).replace(/[\u0000-\u001f\u007f-\u009f]/g, '');

/** Ejecuta `orca <args> --json`. Nunca pasa por una shell: los argumentos van tal cual. */
function runOrca(orca, args, timeout = TIMEOUT_MS) {
  const r = spawnSync(orca.file, [...orca.prefix, ...args, '--json'], {
    encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) return { code: 1, json: null, problem: r.error.message };
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { json = null; }
  // Una línea: los mensajes de Orca pueden ocupar varias y se enseñan junto a un ✗.
  const problem = json && json.ok === false && json.error
    ? clean(`${json.error.code}: ${String(json.error.message).split('\n')[0]}`)
    : json ? null : clean((r.stderr || r.stdout || '').trim().split('\n')[0]) || `orca salió con ${r.status}`;
  return { code: r.status === null ? 1 : r.status, json, problem };
}

const samePath = (a, b) => {
  if (!a || !b) return false;
  const norm = (p) => path.resolve(p).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
};

/** El plugin del kit tal como lo lista `orca plugin list --json`, o null. */
function findInstalled(listJson) {
  const plugins = (listJson && listJson.result && listJson.result.plugins) || [];
  const found = plugins.find((p) => typeof p.pluginKey === 'string' && p.pluginKey.endsWith(`.${PLUGIN_ID}`));
  return found ? { ...found, pluginKey: clean(found.pluginKey), version: clean(found.version), status: clean(found.status) } : null;
}

/**
 * Qué hacer con el plugin:
 * - `install`: no está.
 * - `update`: hay otra versión instalada desde esta misma carpeta (`orca plugin update` la vuelve a copiar).
 * - `foreign`: hay otra versión instalada desde otro sitio; no se toca sin que lo pida el usuario.
 * - `enable`: está esta versión, pero espera aprobación.
 * - `disabled`: está esta versión y el usuario la desactivó; se respeta.
 * - `current`: está esta versión y activa.
 */
function planPlugin(installed, dir, version) {
  if (!installed) return 'install';
  if (installed.version !== version) {
    const source = installed.source || {};
    return source.kind === 'local-path' && samePath(source.path || source.reference, dir) ? 'update' : 'foreign';
  }
  if (installed.status === 'pending' || installed.needsReconsent) return 'enable';
  if (installed.status === 'disabled') return 'disabled';
  return 'current';
}

/** Lo que Orca concedería, en líneas legibles, a partir de `error.data` de approval_required. */
function describeGrants(data) {
  const grants = (data && data.grants) || {};
  const lines = [];
  if (grants.executionDescription) lines.push(grants.executionDescription);
  for (const c of grants.capabilities || []) lines.push(`${c.kind}: ${c.description}`);
  const adds = (grants.contributions || []).map((c) => c.name).filter(Boolean);
  if (adds.length) lines.push(`Añade: ${adds.join(', ')}`);
  return lines.map(clean);
}

/** La huella que hay que pasar a --approve, o null si Orca no la dio o no tiene el formato esperado. */
function approvalFingerprint(result) {
  const data = result.json && result.json.error && result.json.error.data;
  const fp = data && data.approvalFingerprint;
  return typeof fp === 'string' && FINGERPRINT.test(fp) ? fp : null;
}

/**
 * Ejecuta un comando de Orca que puede pedir aprobación. Si la pide, enseña lo que concede y
 * repite con --approve solo si `confirm(grants)` responde que sí.
 */
async function withApproval(orca, args, confirm) {
  const first = runOrca(orca, args);
  if (first.code !== APPROVAL_EXIT) return { ...first, approved: false };
  const fp = approvalFingerprint(first);
  if (!fp) return { ...first, code: 1, problem: 'Orca pidió aprobación sin una huella válida; no apruebo nada' };
  const data = first.json.error.data;
  if (!(await confirm(describeGrants(data), data))) return { code: APPROVAL_EXIT, json: first.json, problem: 'aprobación rechazada', declined: true };
  return { ...runOrca(orca, [...args, '--approve', fp]), approved: true };
}

function readManifest(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'orca-plugin.json'), 'utf8'));
}

module.exports = {
  PLUGIN_ID, PANEL_ID, APPROVAL_EXIT, OPEN_TIMEOUT_MS, isSea,
  clean, samePath, parseVersion, satisfies, knownOrcaPaths, findOrca, runOrca, findInstalled, planPlugin,
  describeGrants, approvalFingerprint, withApproval, readManifest,
};
