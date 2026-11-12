// omk run cleanup: inventario, sacado de git, de los worktrees y ramas que deja un run y, con --apply,
// borrado de solo lo integrado y limpio (skills/orca/references/integrate.md §6). Borra trabajo, así
// que ante la duda se queda: nada de --force ni -D, y nada que git no liste como worktree o rama.
//
// Lo que hace git sin --force (comprobado con git 2.52): `git worktree remove` se lleva los ficheros
// ignorados (el .env copiado, las dependencias) y se niega si hay ficheros no versionados, cambios
// sin commit o el worktree está bloqueado; `git branch -d` se niega si la rama sigue en un worktree o
// no está integrada en su upstream o en el HEAD del checkout donde corre.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { RunError, checkBranch, git, parseArgs } = require('./util');
const ledger = require('./ledger');

const SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const HEADS = 'refs/heads/';
const WIN = process.platform === 'win32';

/** Clave para comparar rutas: absoluta, real si existe y, en Windows, sin mayúsculas. */
function pathKey(p) {
  let full = path.resolve(p);
  try {
    full = fs.realpathSync.native(full);
  } catch (error) {
    // Sin ruta real (no existe o no se puede leer) se compara la ruta tal cual: no se borra por ello.
    if (!['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(error.code)) throw error;
  }
  return WIN ? full.toLowerCase() : full;
}

/** Si `child` es `parent` o está dentro de él. */
function isInside(child, parent) {
  const c = pathKey(child);
  const p = pathKey(parent);
  return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

/** `git worktree list --porcelain` (con -z si el git lo admite) en objetos. */
function listWorktrees(root) {
  let res = git(['worktree', 'list', '--porcelain', '-z'], { cwd: root, check: false });
  let sep = '\0';
  if (res.status !== 0) {
    res = git(['worktree', 'list', '--porcelain'], { cwd: root });
    sep = '\n';
  }
  const list = [];
  let cur = null;
  for (const field of res.stdout.split(sep)) {
    if (field === '') {
      if (cur) list.push(cur);
      cur = null;
      continue;
    }
    const space = field.indexOf(' ');
    const key = space === -1 ? field : field.slice(0, space);
    const value = space === -1 ? '' : field.slice(space + 1);
    if (key === 'worktree') {
      if (cur) list.push(cur);
      cur = { path: value, head: null, branch: null, bare: false, detached: false, locked: false, prunable: false };
    } else if (cur) {
      if (key === 'HEAD') cur.head = value;
      else if (key === 'branch') cur.branch = value.startsWith(HEADS) ? value.slice(HEADS.length) : null;
      else if (['bare', 'detached', 'locked', 'prunable'].includes(key)) cur[key] = true;
    }
  }
  if (cur) list.push(cur);
  return list;
}

/** 0 → sí, 1 → no, otra cosa → no se sabe (null). */
function isAncestor(root, commit, target) {
  const res = git(['merge-base', '--is-ancestor', commit, target], { cwd: root, check: false });
  if (res.status === 0) return true;
  if (res.status === 1) return false;
  return null;
}

function countAhead(root, commit, target) {
  const res = git(['rev-list', '--count', `${target}..${commit}`], { cwd: root, check: false });
  return res.status === 0 ? Number.parseInt(res.stdout.trim(), 10) : null;
}

/** Cambios sin commit (con no versionados) e ignorados de un worktree, sin tomar el bloqueo del índice. */
function worktreeChanges(root, dir) {
  const res = git(['--no-optional-locks', '-C', dir, 'status', '--porcelain', '-z', '--untracked-files=all', '--ignored=matching'], { cwd: root, check: false });
  if (res.status !== 0) return null;
  const entries = res.stdout.split('\0');
  let changes = 0;
  let ignored = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.length < 3) continue;
    if (entry.startsWith('!! ')) { ignored += 1; continue; }
    changes += 1;
    if (entry[0] === 'R' || entry[0] === 'C') i += 1; // con -z, el origen de un renombrado va en la entrada siguiente
  }
  return { changes, ignored };
}

function validBranch(name, root) {
  try {
    checkBranch(name, root);
    return true;
  } catch (error) {
    if (error instanceof RunError) return false;
    throw error;
  }
}

/** Ramas que nunca se tocan, cada una con su motivo. */
function protectedBranches(root, integration) {
  const guard = new Map([['main', 'rama por defecto'], ['master', 'rama por defecto']]);
  const origin = git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { cwd: root, check: false });
  if (origin.status === 0) {
    const name = origin.stdout.trim().replace(/^origin\//, '');
    if (name) guard.set(name, 'rama por defecto');
  }
  const current = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: root, check: false });
  if (current.status === 0 && current.stdout.trim()) guard.set(current.stdout.trim(), 'rama actual del coordinador');
  guard.set(integration, 'rama de integración');
  return guard;
}

/** Celdas de run.md que son ruta (ni «—» ni «(principal)», «(Orca)»…). */
function pathCells(run) {
  return run.units.map((u) => u.worktree).filter((cell) => cell && cell !== ledger.EMPTY && !/^\(.*\)$/.test(cell));
}

function branchCells(run) {
  return run.units.map((u) => u.branch).filter((cell) => cell && cell !== ledger.EMPTY && !/^\(.*\)$/.test(cell));
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Inventario del run: lista de {type, name, branch?, state, action: delete|keep, reason, protected}.
 * Solo entra lo que git lista; las rutas de run.md que git no lista salen como `ruta` y no se tocan.
 */
function inventory({ root, id, integration, run }) {
  const prefix = `${HEADS}wt/${id}/`;
  const worktrees = listWorktrees(root);
  const main = worktrees[0];
  const cellKeys = new Map();
  for (const cell of run ? pathCells(run) : []) cellKeys.set(pathKey(path.resolve(root, cell)), cell);
  const listedKeys = new Set(worktrees.map((wt) => pathKey(wt.path)));
  const guard = protectedBranches(root, integration);
  const integrationRef = `${HEADS}${integration}`;
  const items = [];

  // 1. Worktrees del run: rama wt/<run>/… o ruta que coincide con una celda worktree de run.md.
  const removing = new Set();
  const runWorktrees = worktrees.filter((wt) => !wt.bare && ((wt.branch && `${HEADS}${wt.branch}`.startsWith(prefix)) || cellKeys.has(pathKey(wt.path))));
  for (const wt of runWorktrees) {
    const item = { type: 'worktree', name: wt.path, branch: wt.branch, state: '', action: 'keep', reason: '', protected: false };
    items.push(item);
    const keep = (state, reason, isProtected = false) => Object.assign(item, { state, reason, protected: isProtected });
    if (wt === main || isInside(main.path, wt.path)) { keep('checkout principal', 'es el checkout principal del repositorio', true); continue; }
    if (isInside(root, wt.path)) { keep('checkout del coordinador', 'aquí vive el run', true); continue; }
    if (wt.branch && guard.has(wt.branch)) { keep(`en ${wt.branch}`, `tiene la ${guard.get(wt.branch)}`, true); continue; }
    if (wt.prunable) { keep('ruta desaparecida', 'git lo lista pero la carpeta no existe: git worktree prune'); continue; }
    if (wt.locked) { keep('bloqueado', 'está bloqueado (git worktree unlock si ya no hace falta)'); continue; }
    const changes = worktreeChanges(root, wt.path);
    if (!changes) { keep('sin estado', 'git status falló en el worktree'); continue; }
    const ignoredNote = changes.ignored ? ` · ${plural(changes.ignored, 'ignorado', 'ignorados')} (${changes.ignored === 1 ? 'se va' : 'se van'} con el worktree)` : '';
    if (changes.changes) { keep(`${plural(changes.changes, 'cambio', 'cambios')} sin commit${ignoredNote}`, 'se perderían los cambios sin commit'); continue; }
    if (!wt.head || !SHA.test(wt.head)) { keep('sin commit', 'no tiene un HEAD que comprobar'); continue; }
    const integrated = isAncestor(root, wt.head, integrationRef);
    if (integrated === null) { keep('sin comprobar', `no pude comparar con ${integration}`); continue; }
    if (!integrated) {
      const ahead = countAhead(root, wt.head, integrationRef);
      keep(`${ahead === null ? 'commits' : plural(ahead, 'commit', 'commits')} sin integrar${ignoredNote}`, `no está integrado en ${integration}`);
      continue;
    }
    Object.assign(item, { state: `limpio, integrado${ignoredNote}`, action: 'delete', reason: '' });
    removing.add(wt);
  }

  // 2. Ramas del run: wt/<run>/… y las celdas branch de run.md, solo si git las lista.
  const refs = git(['for-each-ref', '--format=%(refname)', HEADS], { cwd: root }).stdout.split(/\r?\n/).filter(Boolean);
  const local = new Set(refs);
  const names = [];
  for (const ref of refs) if (ref.startsWith(prefix)) names.push(ref.slice(HEADS.length));
  for (const cell of run ? branchCells(run) : []) {
    if (cell === integration || names.includes(cell)) continue;
    if (local.has(`${HEADS}${cell}`)) names.push(cell);
    else items.push({ type: 'rama', name: cell, state: 'git no la lista', action: 'keep', reason: 'run.md la nombra pero no existe como rama local', protected: true });
  }
  const checkedOut = new Map(worktrees.filter((wt) => wt.branch).map((wt) => [wt.branch, wt]));
  for (const name of names) {
    const item = { type: 'rama', name, state: '', action: 'keep', reason: '', protected: false };
    items.push(item);
    const keep = (state, reason, isProtected = false) => Object.assign(item, { state, reason, protected: isProtected });
    if (guard.has(name)) { keep(guard.get(name), 'no se toca nunca', true); continue; }
    if (!validBranch(name, root)) { keep('nombre no válido', 'git check-ref-format la rechaza', true); continue; }
    const holder = checkedOut.get(name);
    if (holder && !removing.has(holder)) { keep('en uso', `la tiene el worktree ${holder.path}, que se queda`); continue; }
    const ref = `${HEADS}${name}`;
    const integrated = isAncestor(root, ref, integrationRef);
    if (integrated === null) { keep('sin comprobar', `no pude comparar con ${integration}`); continue; }
    if (!integrated) {
      const ahead = countAhead(root, ref, integrationRef);
      keep(`${ahead === null ? 'commits' : plural(ahead, 'commit', 'commits')} sin integrar`, `no está integrada en ${integration}`);
      continue;
    }
    Object.assign(item, { state: 'integrada', action: 'delete', worktree: holder ? holder.path : null });
  }

  // 3. Rutas de run.md que git no lista como worktree: se informan y no se tocan nunca.
  for (const [key, cell] of cellKeys) {
    if (listedKeys.has(key)) continue;
    items.push({ type: 'ruta', name: cell, state: 'git no la lista como worktree', action: 'keep', reason: 'no es un worktree de git: no se toca', protected: true });
  }
  return { items, worktrees };
}

/** Borra lo marcado: primero los worktrees y después sus ramas. Devuelve cuántos fallos hubo. */
function apply({ root, integration, items, worktrees }) {
  let failed = 0;
  const removed = new Set();
  const fail = (item, res) => {
    failed += 1;
    item.result = 'falló';
    item.error = (res.stderr.trim() || res.stdout.trim()).split(/\r?\n/)[0];
  };
  for (const item of items.filter((i) => i.type === 'worktree' && i.action === 'delete')) {
    const res = git(['worktree', 'remove', item.name], { cwd: root, check: false });
    if (res.status === 0) { item.result = 'borrado'; removed.add(pathKey(item.name)); } else fail(item, res);
  }
  // `git branch -d` compara con el HEAD de donde corre: se lanza desde el worktree de la integración si lo hay.
  const host = worktrees.find((wt) => wt.branch === integration && !wt.prunable && fs.existsSync(wt.path));
  const cwd = host ? host.path : root;
  for (const item of items.filter((i) => i.type === 'rama' && i.action === 'delete')) {
    if (item.worktree && !removed.has(pathKey(item.worktree))) {
      failed += 1;
      Object.assign(item, { result: 'falló', error: 'su worktree no se borró' });
      continue;
    }
    const res = git(['branch', '-d', item.name], { cwd, check: false });
    if (res.status === 0) item.result = 'borrada'; else fail(item, res);
  }
  return failed;
}

const ACTION_TEXT = { delete: 'borrar', keep: 'se queda' };

function actionText(item) {
  if (item.result) return item.error ? `${item.result} — ${item.error}` : item.result;
  return item.action === 'keep' ? `${ACTION_TEXT.keep} — ${item.reason}` : ACTION_TEXT.delete;
}

function summarize(items) {
  const count = (type, action) => items.filter((i) => i.type === type && i.action === action).length;
  return {
    delete: { worktrees: count('worktree', 'delete'), branches: count('rama', 'delete') },
    keep: items.filter((i) => i.action === 'keep').length,
    unlisted: count('ruta', 'keep'),
    prunable: items.some((i) => i.type === 'worktree' && i.state === 'ruta desaparecida'),
    deleted: items.filter((i) => i.result === 'borrado' || i.result === 'borrada').length,
    failed: items.filter((i) => i.result === 'falló').length,
  };
}

function printTable(items) {
  const rows = [['tipo', 'nombre', 'estado', 'acción'], ...items.map((i) => [i.type, i.name, i.state, actionText(i)])];
  const widths = [0, 1, 2].map((c) => Math.max(...rows.map((r) => r[c].length)));
  for (const row of rows) console.log(row.map((cell, c) => (c < 3 ? cell.padEnd(widths[c]) : cell)).join(' | ').trimEnd());
}

/** Lo que queda del run tras --apply (sin contar lo protegido ni las rutas que git no lista). */
function leftovers(items) {
  return items.filter((i) => i.type !== 'ruta' && !i.protected).length;
}

function run(sub, args, ctx) {
  const { positional, options } = parseArgs(args, { flags: ['apply', 'json'], values: ['integration'] });
  if (positional.length > 1) throw new RunError(`sobra: ${positional.slice(1).join(' ')}`, 2);
  const { root } = ctx;
  const id = ctx.resolveRun(root, positional[0]);
  const file = ledger.runFile(root, id);
  let ledgerRun = null;
  if (fs.existsSync(file)) {
    ledgerRun = ledger.readRun(root, id);
    if (ledgerRun.problems.length) {
      for (const p of ledgerRun.problems) console.error(`  ${file}:${p.line}: ${p.message}`);
      if (options.apply) throw new RunError('run.md tiene problemas de formato: arréglalo antes de borrar nada');
    }
  }
  const fromLedger = ledgerRun && ledgerRun.meta.integration && ledgerRun.meta.integration !== ledger.EMPTY ? ledgerRun.meta.integration : null;
  const integration = options.integration || fromLedger;
  if (!integration) {
    throw new RunError(ledgerRun ? 'run.md no tiene rama de integración: indícala con --integration <rama>' : `no existe ${file}: para un run sin run.md indica --integration <rama>`, 2);
  }
  checkBranch(integration, root);
  if (git(['rev-parse', '--verify', '--quiet', `${HEADS}${integration}`], { cwd: root, check: false }).status !== 0) {
    throw new RunError(`la rama de integración «${integration}» no existe en este repositorio`);
  }

  const { items, worktrees } = inventory({ root, id, integration, run: ledgerRun });
  let failed = 0;
  let cleanup = null;
  let ledgerError = null;
  if (options.apply) {
    failed = apply({ root, integration, items, worktrees });
    if (ledgerRun) {
      cleanup = leftovers(inventory({ root, id, integration, run: ledgerRun }).items) ? 'pending' : 'done';
      const s = summarize(items);
      try {
        const fresh = ledger.readRun(root, id);
        if (fresh.problems.length) throw new RunError('run.md cambió y ahora tiene problemas de formato: no lo toco');
        ledger.setMeta(fresh, 'cleanup', cleanup);
        ledger.addLog(fresh, `cleanup --apply: ${s.deleted} borrados · ${s.keep} se quedan${s.failed ? ` · ${s.failed} fallos` : ''} · cleanup ${cleanup}`);
        ledger.writeRun(root, fresh);
      } catch (error) {
        if (!(error instanceof RunError)) throw error;
        ledgerError = error.message;
      }
    }
  }

  const summary = summarize(items);
  const code = failed || ledgerError ? 1 : 0;
  if (options.json) {
    console.log(JSON.stringify({ run: id, integration, apply: Boolean(options.apply), items, summary, cleanup, ledgerError }, null, 2));
    return code;
  }
  console.log(`cleanup ${id} · integración ${integration} · ${options.apply ? 'borrando' : 'ensayo: sin --apply no se borra nada'}`);
  if (items.length) printTable(items);
  else console.log('no queda ningún worktree ni rama de este run');
  const parts = options.apply
    ? [`${summary.deleted} borrados`, `${summary.keep} se quedan`, ...(summary.failed ? [`${summary.failed} fallos`] : [])]
    : [`para borrar: ${plural(summary.delete.worktrees, 'worktree', 'worktrees')} y ${plural(summary.delete.branches, 'rama', 'ramas')}`, `${summary.keep} se quedan`];
  console.log(`resumen: ${parts.join(' · ')}`);
  if (summary.unlisted) console.log(`aviso: ${plural(summary.unlisted, 'ruta', 'rutas')} de run.md que git no lista como worktree: no se tocan`);
  if (summary.prunable) console.log('aviso: hay worktrees cuya carpeta ya no existe: git worktree prune los quita del registro');
  if (cleanup) console.log(`run.md: cleanup ${cleanup}`);
  if (ledgerError) console.error(`omk run cleanup: ${ledgerError}`);
  return code;
}

module.exports = { run, inventory, listWorktrees, pathKey };
