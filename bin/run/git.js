// omk run start | worktree | check | merge: lo que toca git en un run. Base fresca y rama de
// integración, un worktree por unidad, alcance contra write y merge --no-ff con ensayo previo.
// Nunca hace push, reset, --force ni borra nada: ante la duda se niega y explica qué falta.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { RunError, UNIT_ID, checkUnitId, checkBranch, git, parseArgs, runDir } = require('./util');
const { parseUnits } = require('./units');
const ledger = require('./ledger');
const glob = require('./glob');

const { EMPTY } = ledger;
const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SHA = /^[0-9a-f]{7,64}$/;
const MERGE_TREE_MIN = [2, 38];
const LOCKFILES = [
  'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'Cargo.lock',
  'poetry.lock', 'uv.lock', 'Pipfile.lock', 'go.sum', 'composer.lock', 'Gemfile.lock',
];
/** Prohibidos a un worker en cualquier carpeta (por nombre) y por ruta desde la raíz. */
const FORBIDDEN_NAMES = new Set(['tasks.md', 'ORCHESTRATION.md', 'STACK.md', ...LOCKFILES]);
const FORBIDDEN_GLOBS = ['planes/*.md', '.plans/*.md', '.work/**'];
const PRODUCTION = /prod/i;

// ---------------------------------------------------------------- git y run.md

const short = (sha) => sha.slice(0, 7);

function refSha(cwd, ref) {
  const res = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd, check: false });
  return res.status === 0 ? res.stdout.trim() : null;
}

function currentBranch(cwd) {
  const res = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd, check: false });
  return res.status === 0 ? res.stdout.trim() : null;
}

/** Cambios en ficheros versionados (los sin versionar no impiden cambiar de rama ni mergear). */
function requireCleanTree(cwd, why) {
  const dirty = git(['status', '--porcelain', '--untracked-files=no'], { cwd }).stdout.trim();
  if (dirty) {
    throw new RunError(`hay cambios sin commitear en ficheros versionados de ${cwd} y ${why}:\n${dirty}\ncommitéalos o apártalos tú antes de seguir`);
  }
}

/** La rama por defecto según `<remote>/HEAD`; si no se sabe, main y master cuentan como tales. */
function defaultBranches(cwd, remote = 'origin') {
  const res = git(['symbolic-ref', '--quiet', `refs/remotes/${remote}/HEAD`], { cwd, check: false });
  const prefix = `refs/remotes/${remote}/`;
  const ref = res.stdout.trim();
  if (res.status === 0 && ref.startsWith(prefix)) return [ref.slice(prefix.length)];
  return ['main', 'master'];
}

function gitVersion(cwd) {
  const match = /(\d+)\.(\d+)/.exec(git(['--version'], { cwd }).stdout);
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}

/** Ruta canónica si existe (en Windows deshace nombres 8.3 y mayúsculas), o solo resuelta. */
function canonical(p) {
  try {
    return fs.realpathSync.native(p);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return path.resolve(p);
    throw error;
  }
}

function samePath(a, b) {
  const x = canonical(a);
  const y = canonical(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

/** Si `child` está dentro de `parent` (o es él). */
function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function loadRun(root, id) {
  const run = ledger.readRun(root, id);
  if (run.problems.length) {
    const lines = run.problems.map((p) => `  ${ledger.runFile(root, id)}:${p.line}: ${p.message}`).join('\n');
    throw new RunError(`run.md tiene problemas de formato: arréglalo antes de seguir\n${lines}`);
  }
  return run;
}

function loadUnit(root, id, unitId) {
  const file = path.join(runDir(root, id), 'units.md');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') throw new RunError(`el run ${id} no tiene units.md (${file})`);
    throw error;
  }
  const parsed = parseUnits(text);
  if (parsed.problems.length) {
    const lines = parsed.problems.map((p) => `  ${file}:${p.line}: ${p.message}`).join('\n');
    throw new RunError(`units.md tiene problemas de formato:\n${lines}`);
  }
  const unit = parsed.units.find((u) => u.id === unitId);
  if (!unit) throw new RunError(`units.md del run ${id} no tiene la unidad ${unitId}`);
  return unit;
}

function rowOf(run, unitId) {
  const row = run.units.find((u) => u.unit === unitId);
  if (!row) throw new RunError(`run.md del run ${run.id} no tiene la unidad ${unitId}`);
  return row;
}

const present = (value) => value !== undefined && value !== null && value !== '' && value !== EMPTY;

function integrationOf(run, cwd) {
  if (!present(run.meta.integration)) {
    throw new RunError(`el run ${run.id} no tiene rama de integración: ejecuta antes omk run start ${run.id} --parent <rama>`);
  }
  return checkBranch(run.meta.integration, cwd);
}

/** `<run> <unidad>` o, si solo llega la unidad, el único run activo. */
function runAndUnit(positional, ctx, usage) {
  if (positional.length === 2) return [ctx.resolveRun(ctx.root, positional[0]), checkUnitId(positional[1])];
  if (positional.length === 1 && UNIT_ID.test(positional[0])) return [ctx.resolveRun(ctx.root), positional[0]];
  throw new RunError(`uso: ${usage}`, 2);
}

const unitBranch = (id, unitId) => `wt/${id}/${unitId.toLowerCase()}`;
const defaultWorktree = (root, id, unitId) => path.join(path.dirname(root), `${path.basename(root)}.wt`, id, unitId.toLowerCase());

// ---------------------------------------------------------------- start

/** Base de la rama de integración según la tabla de SKILL.md §4: {ref, sha, note}. */
function freshBase(root, parent, remote, from) {
  const remotes = git(['remote'], { cwd: root }).stdout.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const localSha = refSha(root, `refs/heads/${parent}`);
  if (!remotes.includes(remote)) {
    if (!localSha) throw new RunError(`no existe la rama ${parent} y no hay remoto ${remote}`);
    return { ref: parent, sha: localSha, note: `sin remoto ${remote}: parto de la rama local ${parent}` };
  }
  // Sin terminal: que un remoto con credenciales falle en vez de quedarse esperando una contraseña.
  if (process.env.GIT_TERMINAL_PROMPT === undefined) process.env.GIT_TERMINAL_PROMPT = '0';
  const fetched = git(['fetch', '--prune', remote], { cwd: root, check: false });
  if (fetched.status !== 0) {
    const reason = (fetched.stderr.trim() || fetched.stdout.trim()).split(/\r?\n/).pop();
    throw new RunError(`RISK: no pude actualizar ${remote} (${reason}). Pregunta al usuario antes de seguir con la base local`);
  }
  const remoteRef = `${remote}/${parent}`;
  const remoteSha = refSha(root, `refs/remotes/${remoteRef}`);
  if (!remoteSha) {
    if (!localSha) throw new RunError(`no existe ${parent} ni ${remoteRef}`);
    return { ref: parent, sha: localSha, note: `${remoteRef} no existe: parto de la rama local ${parent}` };
  }
  if (!localSha) return { ref: remoteRef, sha: remoteSha, note: `${parent} no existe en local: parto de ${remoteRef}` };
  const counts = git(['rev-list', '--left-right', '--count', `refs/remotes/${remoteRef}...refs/heads/${parent}`], { cwd: root }).stdout.trim().split(/\s+/).map(Number);
  const [behind, ahead] = counts;
  if (!Number.isInteger(behind) || !Number.isInteger(ahead)) throw new RunError(`no entiendo la salida de git rev-list: «${counts.join(' ')}»`);
  if (ahead === 0 && behind === 0) return { ref: parent, sha: localSha, note: `${parent} y ${remoteRef} coinciden` };
  if (ahead === 0) return { ref: remoteRef, sha: remoteSha, note: `${parent} va ${behind} commit(s) por detrás de ${remoteRef}: parto de ${remoteRef} (la local no se toca)` };
  if (from === 'local') return { ref: parent, sha: localSha, note: `--from local: parto de ${parent} con sus ${ahead} commit(s) sin subir` };
  if (from === 'remote') return { ref: remoteRef, sha: remoteSha, note: `--from remote: parto de ${remoteRef} sin los ${ahead} commit(s) de la local` };
  throw new RunError([
    `la rama local ${parent} tiene ${ahead} commit(s) que no están en ${remoteRef}${behind ? ` y le faltan ${behind}` : ''}. Decide la base:`,
    `  --from remote  parte de ${remoteRef} (sin esos commits locales)`,
    `  --from local   parte de ${parent} con sus commits sin subir`,
  ].join('\n'), 3);
}

function cmdStart(args, ctx) {
  const { root } = ctx;
  const { positional, options } = parseArgs(args, { values: ['parent', 'remote', 'from', 'integration'] });
  if (positional.length > 1) throw new RunError(`sobra: ${positional.slice(1).join(' ')}`, 2);
  const id = ctx.resolveRun(root, positional[0]);
  if (options.parent === undefined) throw new RunError('falta --parent <rama> (la rama destino del merge final)', 2);
  const parent = checkBranch(options.parent, root);
  const remote = options.remote === undefined ? 'origin' : options.remote;
  if (!REMOTE_NAME.test(remote)) throw new RunError(`nombre de remoto no válido: «${remote}»`, 2);
  if (options.from !== undefined && !['local', 'remote'].includes(options.from)) throw new RunError('--from admite local o remote', 2);

  const run = loadRun(root, id);
  const saved = present(run.meta.integration) ? run.meta.integration : null;
  if (saved && options.integration !== undefined && options.integration !== saved) {
    throw new RunError(`run.md ya dice integration: ${saved}; si de verdad cambia, hazlo antes con omk run meta ${id} integration=…`);
  }
  const wanted = options.integration !== undefined ? options.integration : saved;
  if (!wanted) throw new RunError('falta la rama de integración: --integration <rama> (o integration en run.md)', 2);
  const integration = checkBranch(wanted, root);
  if (integration === parent) throw new RunError(`la rama de integración no puede ser la padre (${parent})`);
  if (defaultBranches(root, remote).includes(integration)) throw new RunError(`la rama de integración no puede ser la rama por defecto (${integration})`);
  requireCleanTree(root, 'start va a cambiar de rama');

  const base = freshBase(root, parent, remote, options.from);
  console.log(`base: ${base.ref} @ ${short(base.sha)} — ${base.note}`);

  const existing = refSha(root, `refs/heads/${integration}`);
  let baseRef = run.meta.base_ref;
  if (existing) {
    if (currentBranch(root) !== integration) git(['switch', '--quiet', integration], { cwd: root });
    console.log(`la rama de integración ${integration} ya existe (${short(existing)}): no la recreo; estás en ella`);
    if (git(['merge-base', '--is-ancestor', base.sha, existing], { cwd: root, check: false }).status !== 0) {
      console.log(`aviso: la rama padre ha avanzado: ${base.ref} @ ${short(base.sha)} no está en ${integration}; dilo en el plan`);
    }
    if (!present(baseRef)) baseRef = `${base.ref} @ ${short(base.sha)}`;
  } else {
    if (remote && refSha(root, `refs/remotes/${remote}/${integration}`)) {
      throw new RunError(`existe ${remote}/${integration} pero no la rama local: decide si seguir la remota (git switch ${integration}) o usar otro nombre`, 3);
    }
    git(['switch', '--quiet', '--no-track', '-c', integration, base.sha], { cwd: root });
    console.log(`rama de integración ${integration} creada desde ${base.ref} @ ${short(base.sha)} (sin upstream)`);
    baseRef = `${base.ref} @ ${short(base.sha)}`;
  }

  if (!saved) ledger.setMeta(run, 'integration', integration);
  ledger.setMeta(run, 'base_ref', baseRef);
  if (run.meta.status === 'planned') ledger.setMeta(run, 'status', 'active');
  ledger.addLog(run, `start: ${existing ? 'reanuda' : 'crea'} ${integration} · base ${base.ref} @ ${short(base.sha)} · ${base.note}`);
  ledger.writeRun(root, run);
  return 0;
}

// ---------------------------------------------------------------- worktree

/** Lee .worktreeinclude: rutas literales, una por línea, `#` comentario. */
function readIncludes(root) {
  const file = path.join(root, '.worktreeinclude');
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  if (!stat.isFile()) throw new RunError('.worktreeinclude no es un fichero regular: no lo sigo');
  return fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

/** Motivo por el que una línea de .worktreeinclude no se copia, o null si es válida. */
function includeProblem(root, entry) {
  if (path.isAbsolute(entry) || path.win32.isAbsolute(entry) || /^[A-Za-z]:/.test(entry) || entry.startsWith('\\')) return 'ruta absoluta';
  const segments = entry.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.');
  if (!segments.length) return 'ruta vacía';
  if (segments.includes('..')) return 'sale de la raíz con «..»';
  if (glob.isGlob(entry.replace(/\\/g, '/'))) return 'parece un glob (solo rutas literales)';
  let current = root;
  for (let i = 0; i < segments.length; i += 1) {
    current = path.join(current, segments[i]);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return 'no existe';
      throw error;
    }
    if (stat.isSymbolicLink()) return 'es o cruza un enlace simbólico';
    if (i === segments.length - 1 && !stat.isFile()) return 'no es un fichero regular';
  }
  if (!isInside(root, current)) return 'sale de la raíz';
  const rel = segments.join('/');
  if (git(['check-ignore', '-q', '--', rel], { cwd: root, check: false }).status !== 0) return 'no está ignorado por git (lo versionado ya viene en el worktree)';
  return null;
}

/** Copia los ficheros permitidos de .worktreeinclude. Nunca lee ni enseña su contenido. */
function copyIncludes(root, worktree) {
  const report = [];
  for (const entry of readIncludes(root)) {
    const segments = entry.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.');
    const name = segments[segments.length - 1] || entry;
    if (PRODUCTION.test(name)) {
      report.push({ entry, copied: false, reason: 'parece de producción', risk: true });
      continue;
    }
    const problem = includeProblem(root, entry);
    if (problem) {
      report.push({ entry, copied: false, reason: problem });
      continue;
    }
    const dest = path.join(worktree, ...segments);
    let parent = worktree;
    let blocked = null;
    for (const segment of segments.slice(0, -1)) {
      parent = path.join(parent, segment);
      try {
        if (fs.lstatSync(parent).isSymbolicLink()) { blocked = 'en el worktree cruza un enlace simbólico'; break; }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (!blocked && fs.existsSync(dest)) blocked = 'ya existe en el worktree (no lo piso)';
    if (blocked) {
      report.push({ entry, copied: false, reason: blocked });
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, ...segments), dest, fs.constants.COPYFILE_EXCL);
    report.push({ entry, copied: true });
  }
  return report;
}

/** Entrada de `git worktree list --porcelain` cuya rama es `branch`, o null. */
function worktreeOfBranch(root, branch) {
  const text = git(['worktree', 'list', '--porcelain'], { cwd: root }).stdout;
  for (const block of text.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const wt = lines.find((l) => l.startsWith('worktree '));
    if (wt && lines.includes(`branch refs/heads/${branch}`)) return wt.slice('worktree '.length);
  }
  return null;
}

function cmdWorktree(args, ctx) {
  const { root, cwd } = ctx;
  const { positional, options } = parseArgs(args, { values: ['path'], flags: ['no-copy'] });
  const [id, unitId] = runAndUnit(positional, ctx, 'omk run worktree <run> <unidad> [--path <ruta>] [--no-copy]');
  const run = loadRun(root, id);
  rowOf(run, unitId);
  loadUnit(root, id, unitId);
  const integration = integrationOf(run, root);
  const baseSha = refSha(root, `refs/heads/${integration}`);
  if (!baseSha) throw new RunError(`no existe la rama de integración ${integration}: ejecuta antes omk run start ${id}`);
  const branch = checkBranch(unitBranch(id, unitId), root);
  const target = options.path !== undefined ? path.resolve(cwd, options.path) : defaultWorktree(root, id, unitId);
  if (/[|\r\n]/.test(target)) throw new RunError('la ruta del worktree no puede llevar «|» ni saltos de línea (rompería run.md)', 2);
  if (isInside(canonical(target), canonical(root))) throw new RunError(`la ruta ${target} contiene el checkout del coordinador`, 2);

  if (refSha(root, `refs/heads/${branch}`)) {
    const where = worktreeOfBranch(root, branch);
    if (where && samePath(where, target)) {
      console.log(`${unitId}: el worktree ya existe (${target}, rama ${branch}): no toco nada`);
      return 0;
    }
    throw new RunError(`la rama ${branch} ya existe ${where ? `con worktree en ${where}` : 'sin worktree'}: no la piso`);
  }
  let stat = null;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (stat && (!stat.isDirectory() || fs.readdirSync(target).length)) {
    throw new RunError(`${target} ya existe y no es una carpeta vacía: elige otra con --path`);
  }

  git(['worktree', 'add', '--quiet', '-b', branch, target, `refs/heads/${integration}`], { cwd: root });
  console.log(`${unitId}: worktree ${target} · rama ${branch} desde ${integration} @ ${short(baseSha)}`);
  // Se anota ya: si la copia falla después, el worktree creado consta en run.md (cleanup lo encuentra).
  ledger.setUnit(run, unitId, { branch, worktree: target, base: short(baseSha) });
  ledger.addLog(run, `${unitId} worktree ${target} · rama ${branch} · base ${short(baseSha)}`);
  ledger.writeRun(root, run);
  if (options['no-copy']) return 0;

  const report = copyIncludes(root, target);
  for (const r of report) {
    if (r.copied) console.log(`  copiado: ${r.entry}`);
    else if (r.risk) console.log(`RISK: omitido ${r.entry}: ${r.reason}; no se copia a ningún worktree`);
    else console.log(`  omitido: ${r.entry} — ${r.reason}`);
  }
  const copied = report.filter((r) => r.copied).length;
  const risky = report.filter((r) => r.risk).length;
  if (copied || risky) {
    ledger.addLog(run, `${unitId} .worktreeinclude: ${copied} copiado(s)${risky ? `, ${risky} omitido(s) por parecer de producción` : ''}`);
    ledger.writeRun(root, run);
  }
  return 0;
}

// ---------------------------------------------------------------- check

/** Si un worker no puede tocar este fichero aunque lo cubra un glob de write o shared. */
function isForbidden(file) {
  const name = file.split('/').pop();
  return FORBIDDEN_NAMES.has(name) || FORBIDDEN_GLOBS.some((pattern) => glob.matches(file, pattern));
}

const splitZ = (text) => text.split('\0').filter(Boolean);

function gitDir(cwd) {
  const res = git(['rev-parse', '--git-common-dir'], { cwd, check: false });
  return res.status === 0 ? path.resolve(cwd, res.stdout.trim()) : null;
}

/**
 * Alcance de una unidad: lo commiteado desde su base y lo que quede sin commitear en su worktree,
 * contra write ∪ shared. Devuelve el informe; `ok` es false si hay algo que impide integrar.
 */
function checkScope(root, run, unitId) {
  const row = rowOf(run, unitId);
  const unit = loadUnit(root, run.id, unitId);
  if (!present(row.base)) throw new RunError(`${unitId} no tiene base en run.md (la anota omk run worktree)`);
  if (!SHA.test(row.base)) throw new RunError(`${unitId}: base no es un sha: «${row.base}»`);
  if (!present(row.branch)) throw new RunError(`${unitId} no tiene rama en run.md (la anota omk run worktree)`);
  const branch = checkBranch(row.branch, root);
  const base = refSha(root, row.base);
  if (!base) throw new RunError(`${unitId}: la base ${row.base} no es un commit de este repositorio`);
  if (!refSha(root, `refs/heads/${branch}`)) throw new RunError(`${unitId}: no existe la rama ${branch}`);

  const committed = splitZ(git(['diff', '--name-only', '--no-renames', '-z', `${base}...refs/heads/${branch}`], { cwd: root }).stdout);
  const uncommitted = [];
  const problems = [];
  const worktree = present(row.worktree) ? row.worktree : null;
  if (worktree && fs.existsSync(worktree)) {
    if (gitDir(worktree) === null || !samePath(gitDir(worktree), gitDir(root))) {
      problems.push(`el worktree ${worktree} no es de este repositorio`);
    } else {
      const head = currentBranch(worktree);
      if (head !== branch) problems.push(`el worktree ${worktree} está en ${head || 'HEAD suelto'}, no en ${branch}`);
      const status = git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'], { cwd: worktree }).stdout;
      for (const entry of splitZ(status)) uncommitted.push(entry.slice(3));
    }
  }

  const write = unit.fields.write || [];
  const allowed = [...write, ...(unit.fields.shared || [])];
  const literal = new Set(write.map((w) => glob.normalizePath(w)));
  const changed = [...new Set([...committed, ...uncommitted])].sort();
  const forbidden = [];
  const outOfScope = [];
  for (const file of changed) {
    if (literal.has(file)) continue;
    if (isForbidden(file)) forbidden.push(file);
    else if (!allowed.some((pattern) => glob.matches(file, pattern))) outOfScope.push(file);
  }
  const ok = !problems.length && !forbidden.length && !outOfScope.length && !uncommitted.length;
  return {
    run: run.id, unit: unitId, base: row.base, branch, worktree, ok,
    changed, committed, uncommitted: [...new Set(uncommitted)].sort(), out_of_scope: outOfScope, forbidden, problems,
  };
}

function printScope(report, stream = console.log) {
  stream(`check ${report.unit} (${report.branch}, base ${report.base}): ${report.changed.length} fichero(s) cambiado(s)`);
  for (const p of report.problems) stream(`  problema: ${p}`);
  for (const f of report.out_of_scope) stream(`  fuera de alcance: ${f}`);
  for (const f of report.forbidden) stream(`  prohibido a un worker: ${f}`);
  for (const f of report.uncommitted) stream(`  sin commitear: ${f}`);
  stream(report.ok ? `check ${report.unit}: OK` : `check ${report.unit}: FALLA (merge solo integra commits dentro de write ∪ shared)`);
}

function cmdCheck(args, ctx) {
  const { positional, options } = parseArgs(args, { flags: ['json'] });
  const [id, unitId] = runAndUnit(positional, ctx, 'omk run check <run> <unidad> [--json]');
  const report = checkScope(ctx.root, loadRun(ctx.root, id), unitId);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printScope(report);
  return report.ok ? 0 : 1;
}

// ---------------------------------------------------------------- merge

function cmdMerge(args, ctx) {
  const { root } = ctx;
  const { positional, options } = parseArgs(args, { flags: ['dry-run'] });
  const [id, unitId] = runAndUnit(positional, ctx, 'omk run merge <run> <unidad> [--dry-run]');
  const run = loadRun(root, id);
  const row = rowOf(run, unitId);
  const unit = loadUnit(root, id, unitId);
  const integration = integrationOf(run, root);
  if (defaultBranches(root).includes(integration)) {
    throw new RunError(`la rama de integración ${integration} es la rama por defecto: el merge a ella lo decide el usuario, no omk run`);
  }
  const current = currentBranch(root);
  if (current !== integration) throw new RunError(`estás en ${current || 'HEAD suelto'}, no en la rama de integración ${integration} (git switch ${integration})`);
  requireCleanTree(root, 'merge necesita el árbol limpio');
  if (row.status !== 'accepted') throw new RunError(`${unitId} está en ${row.status}: solo se integra una unidad accepted`);

  const scope = checkScope(root, run, unitId);
  if (!scope.ok) {
    printScope(scope, console.error);
    throw new RunError(`${unitId} no pasa check: no la integro`);
  }

  const [major, minor] = gitVersion(root);
  if (major < MERGE_TREE_MIN[0] || (major === MERGE_TREE_MIN[0] && minor < MERGE_TREE_MIN[1])) {
    throw new RunError(`git ${major}.${minor} no tiene merge-tree --write-tree: hace falta git ≥ ${MERGE_TREE_MIN.join('.')} para ensayar el merge`);
  }
  const branchRef = `refs/heads/${scope.branch}`;
  const trial = git(['merge-tree', '--write-tree', '--name-only', '--no-messages', `refs/heads/${integration}`, branchRef], { cwd: root, check: false });
  if (trial.status === 1) {
    const files = [...new Set(trial.stdout.split(/\r?\n/).slice(1).map((l) => l.trim()).filter(Boolean))];
    throw new RunError(`${unitId}: el ensayo da conflictos con ${integration} en:\n${files.map((f) => `  ${f}`).join('\n')}\nno toco nada (95-multi-agent.md §Conflictos)`);
  }
  if (trial.status !== 0) {
    throw new RunError(`git merge-tree falló (${trial.status}): ${trial.stderr.trim()} — hace falta git ≥ ${MERGE_TREE_MIN.join('.')}`);
  }
  if (options['dry-run']) {
    console.log(`${unitId}: el ensayo de ${scope.branch} sobre ${integration} sale limpio (${scope.changed.length} fichero(s)); no he integrado nada`);
    return 0;
  }

  const message = `merge(${id}): ${unitId}${unit.title ? ` — ${unit.title}` : ''}`;
  const merged = git(['merge', '--no-ff', '--no-edit', '-m', message, branchRef], { cwd: root, check: false });
  if (merged.status !== 0) {
    const aborted = git(['merge', '--abort'], { cwd: root, check: false });
    const detail = merged.stderr.trim() || merged.stdout.trim();
    throw new RunError(`git merge falló: ${detail}\n${aborted.status === 0 ? 'merge abortado: la rama de integración está como estaba' : `y git merge --abort también falló: ${aborted.stderr.trim()}; revisa ${root} a mano`}`);
  }
  const head = short(git(['rev-parse', 'HEAD'], { cwd: root }).stdout.trim());
  ledger.setUnit(run, unitId, { status: 'merged', head });
  ledger.addLog(run, `${unitId} integrada en ${integration} · merge ${head}`);
  ledger.writeRun(root, run);
  console.log(`${unitId}: integrada en ${integration} (merge ${head}). No he hecho push`);
  return 0;
}

const COMMANDS = { start: cmdStart, worktree: cmdWorktree, check: cmdCheck, merge: cmdMerge };

/** Contrato de bin/run.js: devuelve el código de salida. */
function run(sub, args, ctx) {
  if (!COMMANDS[sub]) throw new RunError(`subcomando desconocido para bin/run/git.js: ${sub}`, 2);
  return COMMANDS[sub](args, ctx);
}

module.exports = { run, checkScope, isForbidden, defaultBranches, unitBranch, defaultWorktree, FORBIDDEN_GLOBS, FORBIDDEN_NAMES };
