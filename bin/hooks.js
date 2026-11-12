// Hooks de Claude Code del kit (templates/claude-settings.json): recuerdan la puerta de reparto en
// cada mensaje y al aprobar un plan, que es lo que hace que la orquestación se evalúe también fuera
// de spec-kit. Se fusionan en un settings.json que ya existe (el global de Claude Code o el de un
// proyecto) sin tocar nada más: solo se añaden o se ponen al día las entradas marcadas con el
// nombre del kit.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const KIT_MARK = '[Orca Multiagent Kit]';

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isKitHook = (hook) => isObject(hook) && typeof hook.command === 'string' && hook.command.includes(KIT_MARK);

/**
 * La carpeta de configuración de Claude Code, como la resuelve install.sh: CLAUDE_CONFIG_DIR, salvo
 * que sea un perfil que gestiona la app Orca (importa ~/.claude y no se toca).
 */
function claudeDir(env = process.env, home = env.HOME || os.homedir()) {
  const dir = env.CLAUDE_CONFIG_DIR;
  const orcaProfile = dir && (/[\\/]orca[\\/]claude-profiles[\\/]/i.test(dir) || dir === env.ORCA_CLAUDE_INJECTED_CONFIG_DIR);
  return dir && !orcaProfile ? dir : path.join(home, '.claude');
}

/**
 * `settings` con los hooks del kit de `template`. Devuelve `{ settings, changed }`, o `null` si la
 * clave `hooks` de `settings` no tiene la forma esperada (no se toca). Los hooks que no son del kit
 * se conservan tal cual, también dentro de una entrada compartida con uno del kit.
 */
function mergeKitHooks(settings, template) {
  const current = settings.hooks === undefined ? {} : settings.hooks;
  if (!isObject(current) || !isObject(template.hooks)) return null;
  const hooks = { ...current };
  let changed = false;
  for (const [event, entries] of Object.entries(template.hooks)) {
    if (hooks[event] !== undefined && !Array.isArray(hooks[event])) return null;
    const list = [...(hooks[event] || [])];
    for (const entry of entries) {
      const at = list.findIndex((existing) => isObject(existing) && (existing.matcher || '') === (entry.matcher || '')
        && Array.isArray(existing.hooks) && existing.hooks.some(isKitHook));
      if (at === -1) { list.push(entry); changed = true; continue; }
      const merged = { ...list[at], hooks: [...list[at].hooks.filter((hook) => !isKitHook(hook)), ...entry.hooks] };
      if (JSON.stringify(merged) !== JSON.stringify(list[at])) { list[at] = merged; changed = true; }
    }
    hooks[event] = list;
  }
  return { settings: { ...settings, hooks }, changed };
}

/**
 * Deja en `file` los hooks del kit de `templateFile`. Devuelve qué pasó:
 * 'created' (no existía y `create`), 'missing' (no existía), 'added' / 'current' (ya estaban al día),
 * o 'invalid' (no es un JSON con la forma esperada: no se toca). `backup(file)` se llama antes de
 * escribir sobre un fichero que ya existía.
 */
function syncClaudeHooks(file, templateFile, { dryRun = false, create = false, backup = null } = {}) {
  const template = JSON.parse(fs.readFileSync(templateFile, 'utf8'));
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    if (!create) return 'missing';
    if (!dryRun) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify({ hooks: template.hooks }, null, 2)}\n`, { flag: 'wx' });
    }
    return 'created';
  }
  let settings;
  try {
    settings = JSON.parse(text);
  } catch {
    // Un settings.json que no es JSON válido no lo arregla el kit: se deja como está y se avisa.
    return 'invalid';
  }
  if (!isObject(settings)) return 'invalid';
  const merged = mergeKitHooks(settings, template);
  if (merged === null) return 'invalid';
  if (!merged.changed) return 'current';
  if (dryRun) return 'added';
  if (backup) backup(file);
  const tmp = `${file}.omk-${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(merged.settings, null, 2)}\n`, { flag: 'wx' });
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  return 'added';
}

/**
 * Pone los hooks de reparto en la configuración global de Claude Code (`global`) y en la del
 * proyecto, si tiene `.claude/settings.json`. Sin Claude Code no hace ni dice nada. Devuelve
 * `false` solo si algo falló. `OMK_NO_HOOKS=1` (o `--no-hooks`, que llega como `skip`) lo desactiva.
 */
function applyHooks({ kit, agentsHome, project = null, global = true, dryRun = false, skip = false }) {
  if (skip || process.env.OMK_NO_HOOKS === '1') return true;
  const { c, sym } = require('./ui');
  const { makeBackup } = require('./backup');
  const out = (s = '') => process.stdout.write(s + '\n');
  const template = path.join(kit, 'templates', 'claude-settings.json');
  const targets = [];
  const dir = claudeDir();
  if (global && fs.existsSync(dir)) targets.push({ file: path.join(dir, 'settings.json'), label: 'Claude Code', create: true });
  if (project && fs.existsSync(path.join(project, '.claude', 'settings.json'))) {
    targets.push({ file: path.join(project, '.claude', 'settings.json'), label: `Proyecto ${path.basename(project)}`, create: false });
  }
  if (targets.length === 0) return true;
  const { stamp, backup } = makeBackup(agentsHome);
  let good = true;
  let touched = false;
  out();
  out(`  ${c.lime('◆')} ${c.bold('Puerta de reparto en Claude Code')}`);
  for (const { file, label, create } of targets) {
    let result;
    try {
      result = syncClaudeHooks(file, template, { dryRun, create, backup });
    } catch (e) {
      out(`  ${sym.fail} ${c.red(`${label}: no pude poner los hooks en ${file} (${e.message})`)}`);
      good = false;
      continue;
    }
    if (result === 'current') out(`  ${sym.ok} ${label}: hooks de reparto al día`);
    else if (result === 'invalid') {
      out(`  ${sym.warn} ${label}: ${file} no es un JSON con la forma esperada: no lo toco`);
      out(`      ${sym.todo} Copia a mano la clave "hooks" de ~/.agents/templates/claude-settings.json.`);
    } else {
      touched = touched || result === 'added';
      out(`  ${sym.ok} ${label}: hooks de reparto ${dryRun ? 'se añadirían a' : 'en'} ${file}`);
    }
  }
  out(`      ${sym.info} ${c.grey('Recuerdan en cada mensaje y al aprobar un plan que un trabajo con 2 o más entregables pasa por la skill orca.')}`);
  out(`      ${sym.info} ${c.grey('Para que omk no los ponga: OMK_NO_HOOKS=1 (o --no-hooks) y bórralos de settings.json.')}`);
  if (touched && !dryRun) out(`      ${sym.info} ${c.grey(`Copia anterior: omk restore ${stamp}`)}`);
  return good;
}

module.exports = { KIT_MARK, claudeDir, mergeKitHooks, syncClaudeHooks, applyHooks };
