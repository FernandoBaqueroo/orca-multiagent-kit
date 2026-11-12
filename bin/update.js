// omk update: pone al día todo lo que el kit instala, con un solo comando y sea cual sea la forma en
// que se instaló. El propio kit (npm o el ejecutable autónomo: bin/fetch.js), la fuente única de
// ~/.agents, el proyecto de la carpeta actual (bloques de AGENTS.md y CLAUDE.md, ficheros que falten
// y los apartados nuevos de ORCHESTRATION.md y STACK.md: bin/sync.js), los hooks de reparto de Claude
// Code (bin/hooks.js) y el plugin de Orca.
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { backupRel, makeBackup } = require('./backup');
const { fetchExecutable, fetchPackage, globalEntry, kitSource, newer } = require('./fetch');
const { applyHooks } = require('./hooks');
const { refreshPlugin } = require('./setup');
const { syncFile } = require('./sync');
const { c, sym } = require('./ui');

// Ficheros de proyecto que se ponen al día con su plantilla, y qué hacer la primera vez (sin sello).
// ORCHESTRATION.md recibe todo lo que le falte: omk team y la skill orca cuentan con esos campos.
// STACK.md pide borrar lo que no aplique, así que la primera vez solo se sella: a partir de ahí
// recibe lo que la plantilla estrene.
const SYNCED = [
  { name: 'ORCHESTRATION.md', firstRun: 'add' },
  { name: 'STACK.md', firstRun: 'stamp' },
];
const PROJECT_BLOCK = /<!-- AGENTS:BEGIN project/;

const out = (s = '') => process.stdout.write(s + '\n');
const ok = (s) => out(`  ${sym.ok} ${s}`);
const warn = (s) => out(`  ${sym.warn} ${s}`);
const fail = (s) => out(`  ${sym.fail} ${c.red(s)}`);
const todo = (s) => out(`      ${sym.todo} ${s}`);
const detail = (s) => out(`      ${sym.info} ${c.grey(s)}`);
const heading = (s) => { out(); out(`  ${c.lime('◆')} ${c.bold(s)}`); };

/** Separa las opciones de omk update de las que van a install.sh (--agents, --dry-run…). */
function parseOptions(args) {
  const own = { offline: false, force: false, yes: false, noProject: false, noPlugin: false, noHooks: false, dryRun: false };
  const rest = [];
  for (const a of args) {
    if (a === '--offline') own.offline = true;
    else if (a === '--force') own.force = true;
    else if (a === '--yes' || a === '-y') own.yes = true;
    else if (a === '--no-project') own.noProject = true;
    else if (a === '--no-plugin') own.noPlugin = true;
    else if (a === '--no-hooks') own.noHooks = true;
    else { if (a === '--dry-run') own.dryRun = true; rest.push(a); }
  }
  return { ...own, rest };
}

/** La carpeta, si es un proyecto preparado con el kit: tiene ORCHESTRATION.md o el bloque del kit en AGENTS.md. */
function kitProject(dir) {
  if (fs.existsSync(path.join(dir, 'ORCHESTRATION.md'))) return dir;
  try {
    return PROJECT_BLOCK.test(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')) ? dir : null;
  } catch (e) {
    // Sin AGENTS.md no es un proyecto del kit; cualquier otro fallo de lectura sí se cuenta.
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/** Deja al día con su plantilla los ficheros de `SYNCED` que existan. Devuelve si todo fue bien. */
function syncProject({ kit, project, agentsHome, dryRun }) {
  heading(`Plantillas del proyecto ${c.grey(path.basename(project))}`);
  const { stamp, backup } = makeBackup(agentsHome);
  let good = true;
  for (const { name, firstRun } of SYNCED) {
    const file = path.join(project, name);
    if (!fs.existsSync(file)) continue;
    let added;
    let changed;
    try {
      ({ added, changed } = syncFile(path.join(kit, 'templates', name), file, { dryRun, backup, firstRun }));
    } catch (e) {
      fail(`${name}: no se pudo poner al día (${e.message})`);
      good = false;
      continue;
    }
    if (added.length === 0) {
      ok(`${name} ya tiene todos los apartados de la plantilla`);
      // Solo cambió el sello: la primera vez, o la plantilla estrena algo que este fichero ya tenía.
      if (changed) detail(`${dryRun ? 'Se anotaría' : 'Anotado'} al final qué apartados de la plantilla conoce: lo que borres no volverá.`);
      continue;
    }
    const count = `${added.length} ${added.length === 1 ? 'apartado nuevo' : 'apartados nuevos'}`;
    if (dryRun) warn(`${name}: se añadirían ${count}`);
    else ok(`${name}: ${count} ${c.grey('(lo que ya tenías no se toca)')}`);
    for (const item of added) out(`      ${sym.add} ${item}`);
    if (dryRun) continue;
    todo('Llevan el valor de la plantilla: revísalos, o pide al agente «inicializa el proyecto» para que los rellene.');
    detail(`Copia anterior: omk restore ${stamp}`);
  }
  return good;
}

// Lo que dice «omk update» mientras trae la versión nueva.
const say = {
  current: (version, note) => out(`  ${sym.ok} Ya tienes la última versión (${version})${note ? ` (${note})` : ''}. Reaplicando la instalación…`),
  updating: (version, latest) => out(`  ${c.lime('›')} Actualizando ${c.grey(version)} → ${c.lime(latest)}`),
};

/**
 * Trae la versión nueva del kit según cómo se instaló. Devuelve la orden con la que sigue el omk
 * nuevo (`[programa, ...argumentos]`), o `null` si esta copia ya es la última y sigue ella.
 */
async function fetchKit({ kit, version, standalone, force }) {
  const source = kitSource(kit, standalone);
  if (source === 'exe') {
    out(`  ${c.lime('›')} Buscando la última versión del ejecutable…`);
    const latest = await fetchExecutable({ version, target: process.execPath, force });
    if (latest === null) { say.current(version, ''); return null; }
    say.updating(version, latest);
    detail('Descargado y comprobado con su SHA-256. Sigue el ejecutable nuevo.');
    return [process.execPath];
  }
  if (source === 'npm') {
    if (!fetchPackage(version, force, say)) return null;
    // El omk recién instalado, por su ruta y con este mismo Node; si no se encuentra, el del PATH.
    const entry = globalEntry();
    return entry ? [process.execPath, entry] : ['omk'];
  }
  out(`  ${sym.info} Esta copia del kit (${kit}) no viene de npm ni es el ejecutable: se actualiza como la obtuviste`);
  detail('(git pull, o el zip de la última release). Reaplicando ahora esta versión…');
  return null;
}

/** omk update. Devuelve el código de salida. */
async function update({ kit, version, args, installer, standalone, agentsHome, cwd = process.cwd() }) {
  const opts = parseOptions(args);
  if (!opts.offline) {
    const next = await fetchKit({ kit, version, standalone, force: opts.force });
    if (next) {
      // El resto lo hace el omk recién instalado: es el que trae las plantillas y el plugin nuevos.
      const [program, ...prefix] = next;
      const forwarded = args.filter((a) => a !== '--force');
      const run = spawnSync(program, [...prefix, 'update', '--offline', ...forwarded], {
        stdio: 'inherit', shell: program === 'omk' && process.platform === 'win32',
      });
      if (run.error) throw new Error(`no pude seguir con el omk nuevo (${run.error.message}). Repite: omk update --offline`);
      return run.status === null ? 1 : run.status;
    }
  }

  const project = opts.noProject ? null : kitProject(cwd);
  const code = await installer(project ? [...opts.rest, '--project', project] : opts.rest);
  if (code !== 0) return code;

  let good = true;
  if (project) good = syncProject({ kit, project, agentsHome, dryRun: opts.dryRun }) && good;
  else if (!opts.noProject) {
    heading('Proyecto');
    detail(`${cwd} no es un proyecto preparado con el kit: no hay nada que poner al día aquí.`);
    detail('Para prepararlo: omk init, o «inicializa el proyecto» en el agente.');
  }
  good = applyHooks({ kit, agentsHome, project, dryRun: opts.dryRun, skip: opts.noHooks }) && good;
  if (!opts.noPlugin) good = (await refreshPlugin({ kit, yes: opts.yes, dryRun: opts.dryRun })) && good;

  out();
  if (opts.dryRun) out(`  ${c.amber('Simulación:')} no se ha escrito nada.`);
  else if (good) out(`  ${sym.ok} ${c.bold(`Kit al día (v${version})`)}`);
  else out(`  ${sym.fail} ${c.bold(c.red('La actualización ha terminado con fallos'))} ${c.grey('(arriba, con ✗)')}`);
  out();
  return good ? 0 : 1;
}

module.exports = { update, parseOptions, newer, kitProject, backupRel };
