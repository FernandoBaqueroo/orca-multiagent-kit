#!/usr/bin/env node
// Puerta de reparto obligatoria en Claude Code (hooks UserPromptSubmit y PreToolUse de ~/.claude/settings.json).
//
// La regla del núcleo (~/.agents/AGENTS.md §6) pide que, al cargar la skill orca, su veredicto quede escrito
// en el chat en una línea «ORCA: …» antes de editar y que, si reparte, no se toque el proyecto hasta que la
// persona responda al plan de rondas. Con texto el modelo no lo cumple siempre; este hook lo impone:
// - UserPromptSubmit: apunta cuándo escribe la persona (las notificaciones de tareas no cuentan).
// - PostToolUse sobre Skill: apunta cuándo se carga la skill orca.
// - PreToolUse: apunta el veredicto cuando el agente lo registra con `echo "ORCA: …"` y, tras cargar la
//   skill, deniega editar el proyecto, escribir desde la shell o lanzar workers hasta que haya veredicto
//   y, si reparte, hasta que la persona haya respondido.
// Por qué `echo`: Claude Code escribe el transcript con retraso (a veces al acabar el turno), así que la
// línea «ORCA:» del chat no se ve a tiempo desde el hook; la orden sí, porque llega en su propia entrada.
// El transcript se sigue leyendo para lo que ya está escrito (cargas leyendo SKILL.md, veredictos de
// turnos anteriores).
// Solo actúa después de que se cargue la skill orca: sin ella, no hace nada. Si algo falla (transcript
// ilegible, formato desconocido), deja pasar y lo avisa: nunca bloquea por un fallo suyo.
// Desactivarlo: OMK_NO_GATE=1, u «omk gate off».
// Es .cjs a propósito: un package.json con "type": "module" en una carpeta superior no lo convierte en ESM.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MARK = '[Orca Multiagent Kit]';
const TAIL_BYTES = 8 * 1024 * 1024;
const PROMPTS_KEPT = 40;
const EVENTS_KEPT = 40;
const STATE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const SESSION_ID = /^[\w-]{1,128}$/;

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const AGENT_TOOLS = new Set(['Agent', 'Task']);

// Órdenes que escriben, en la primera palabra de cada tramo de una línea de shell.
const WRITE_COMMANDS = new Set(['tee', 'touch', 'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'ln', 'chmod', 'chown', 'install', 'truncate', 'dd', 'patch', 'unzip', 'tar']);
const GIT_WRITES = new Set(['add', 'commit', 'merge', 'rebase', 'reset', 'checkout', 'switch', 'apply', 'am', 'cherry-pick', 'restore', 'rm', 'mv', 'clean', 'push', 'pull', 'revert', 'init', 'clone']);
const PKG_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun', 'pip', 'pip3', 'cargo', 'go', 'composer', 'bundle', 'dotnet', 'gem']);
const PKG_WRITES = new Set(['install', 'i', 'ci', 'add', 'remove', 'rm', 'uninstall', 'update', 'up', 'upgrade', 'get', 'init', 'new']);
const PS_WRITES = /\b(Set-Content|Add-Content|Out-File|New-Item|Remove-Item|Copy-Item|Move-Item|Rename-Item|Clear-Content|Expand-Archive|Set-ItemProperty)\b/i;
const SCRIPT_WRITES = /\b(writeFileSync|writeFile|appendFileSync|appendFile|rmSync|mkdirSync|renameSync|copyFileSync|unlinkSync|WriteAllText|WriteAllBytes)\b|\bopen\([^)]*['"][wa]b?\+?['"]/;
// Redirección a un fichero: «>» o «>>» seguido de un nombre. No cuentan 2>&1, >/dev/null ni >$null.
const REDIRECT = /(^|[\s;|&(])\d?>>?\s*(?!&|\/dev\/null\b|\$null\b|nul\b)["']?[\w.~/\\$:-]/i;
const WORK_DIR = /(^|[\s"'=:/\\])\.work[/\\]/;

// ---------------------------------------------------------------- utilidades

const agentsHome = (env = process.env) => env.AGENT_KIT_HOME || path.join(os.homedir(), '.agents');
const stateDir = (env = process.env) => path.join(agentsHome(env), 'state', 'gate');
const isDisabled = (env = process.env) => env.OMK_NO_GATE === '1' || fs.existsSync(path.join(stateDir(env), 'off'));

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

const stateFile = (sessionId, env) => path.join(stateDir(env), `${sessionId}.json`);

/** Borra el estado de sesiones de hace más de dos semanas. Un fallo aquí no importa a nadie: se ignora con motivo. */
function pruneOldState(env) {
  const dir = stateDir(env);
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return; // sin carpeta de estado todavía: nada que limpiar
  }
  const limit = Date.now() - STATE_MAX_AGE_MS;
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    try {
      if (fs.statSync(file).mtimeMs < limit) fs.rmSync(file, { force: true });
    } catch {
      // otra sesión lo está escribiendo o ya lo borró: se intentará la próxima vez
    }
  }
}

/** Si el texto de un prompt lo escribió la persona (no una notificación de tarea en segundo plano). */
function isHumanPrompt(prompt) {
  const text = String(prompt || '').trim();
  if (text === '') return false;
  if (/^<task-notification>/.test(text) || /\[SYSTEM NOTIFICATION/.test(text.slice(0, 200))) return false;
  return true;
}

/** El transcript de la sesión principal: el de un subagente vive en <sesión>/subagents/agent-*.jsonl. */
function mainTranscript(file) {
  const m = /^(.*)[\\/]subagents[\\/]agent-[^\\/]+\.jsonl$/.exec(file || '');
  return m ? `${m[1]}.jsonl` : file;
}

/** Las últimas `bytes` del transcript, empezando en una línea entera. */
function readTail(file, bytes = TAIL_BYTES) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    const text = buffer.toString('utf8');
    return start === 0 ? text : text.slice(text.indexOf('\n') + 1);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Lo que interesa del transcript: los bloques del asistente en orden (texto y llamadas a herramientas),
 * cada uno con su hora. `recognized` es falso si no hay ninguna entrada de asistente con la forma esperada.
 */
function parseTranscript(text) {
  const blocks = [];
  let recognized = false;
  for (const line of text.split('\n')) {
    if (!line.includes('"assistant"')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // una línea a medio escribir al final del fichero
    }
    const message = entry && entry.message;
    if (!message || message.role !== 'assistant' || !Array.isArray(message.content)) continue;
    if (entry.isSidechain) continue;
    recognized = true;
    const at = Date.parse(entry.timestamp);
    if (!Number.isFinite(at)) continue;
    for (const block of message.content) {
      if (block.type === 'text' && typeof block.text === 'string') blocks.push({ at, kind: 'text', text: block.text });
      else if (block.type === 'tool_use') blocks.push({ at, kind: 'tool', name: block.name, input: block.input || {} });
    }
  }
  return { blocks, recognized };
}

const isOrcaLoad = (block) => block.kind === 'tool' && (
  (block.name === 'Skill' && /(^|:)orca$/i.test(String(block.input.skill || '').trim()))
  || (block.name === 'Read' && /skills[\\/]orca[\\/]SKILL\.md$/i.test(String(block.input.file_path || ''))));

/** Las líneas «ORCA: …» de un texto, sin el formato Markdown de alrededor. */
function verdictLines(text) {
  const found = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[*_`]/g, '').replace(/^\s*(?:[>#-]\s*)*/, '').trim();
    const m = /^ORCA:\s*(.*)$/.exec(line);
    if (m) found.push(m[1].trim());
  }
  return found;
}

const isReparto = (verdict) => /^\d+\s+unidad/i.test(verdict);
const isAutoAutonomy = (verdict) => /autonom[ií]a\s+auto\b/i.test(verdict);

/** Si una orden de git escribe en el repositorio. `branch`, `tag`, `stash` y `worktree` también sirven para listar. */
function gitWrites(args) {
  const [sub = '', ...rest] = args.filter((a) => !/^-C$/.test(a));
  const operands = rest.filter((a) => !a.startsWith('-'));
  if (GIT_WRITES.has(sub)) return true;
  if (sub === 'branch' || sub === 'tag') return operands.length > 0 || rest.some((a) => /^-[dDmMcCf]$|^--(delete|move|copy|force)$/.test(a));
  if (sub === 'stash') return !['list', 'show'].includes(operands[0] || '');
  if (sub === 'worktree') return ['add', 'remove', 'move', 'prune', 'repair'].includes(operands[0] || '');
  return false;
}

/** Si una línea de shell escribe en el proyecto (aproximado y a propósito estrecho: solo actúa con la puerta cerrada). */
function isShellWrite(command) {
  const cmd = String(command || '');
  if (WORK_DIR.test(cmd)) return false;
  if (PS_WRITES.test(cmd) || SCRIPT_WRITES.test(cmd) || REDIRECT.test(cmd)) return true;
  if (/\bsed\s+(-\w*\s+)*-i/.test(cmd) || /\bperl\s+(-\w*\s+)*-\w*i/.test(cmd)) return true;
  for (const segment of cmd.split(/&&|\|\||[;|\n]/)) {
    const words = segment.trim().split(/\s+/).filter((w) => w !== '' && !/^\w+=/.test(w)).map((w) => w.replace(/^["']|["']$/g, ''));
    while (['sudo', 'command', 'env', 'exec'].includes(words[0])) words.shift();
    const [first = '', ...args] = words;
    const name = path.basename(first).toLowerCase().replace(/\.(exe|cmd)$/, '');
    const [second = '', third = ''] = args.map((a) => a.toLowerCase());
    if (WRITE_COMMANDS.has(name)) return true;
    if (name === 'git' && gitWrites(args)) return true;
    if (PKG_MANAGERS.has(name) && PKG_WRITES.has(second)) return true;
    if (name === 'orca' && ((second === 'worktree' && /^(create|rm|remove)$/.test(third)) || (second === 'orchestration' && /^(worker-start|dispatch)$/.test(third)))) return true;
  }
  return false;
}

/** Si una ruta queda dentro del proyecto (`cwd`) y fuera de `.work/`. */
function isProjectPath(file, cwd) {
  if (!file || !cwd) return false;
  const norm = (p) => path.resolve(p).replace(/[\\/]+$/, '');
  const abs = norm(path.resolve(cwd, file));
  const root = norm(cwd);
  const same = process.platform === 'win32' ? (a, b) => a.toLowerCase() === b.toLowerCase() : (a, b) => a === b;
  const inside = same(abs, root) || (process.platform === 'win32' ? abs.toLowerCase() : abs).startsWith((process.platform === 'win32' ? root.toLowerCase() : root) + path.sep);
  if (!inside) return false;
  const rel = path.relative(root, abs).split(path.sep);
  return rel[0] !== '.work';
}

// ---------------------------------------------------------------- decisión

const REGISTER = 'regístrala ejecutando `echo "ORCA: …"` con la misma línea (la puerta la lee de esa orden)';
const DENY_NO_VERDICT = `${MARK} Puerta de reparto: has cargado la skill orca y no hay veredicto registrado. Antes de editar el proyecto, escribe en el chat una línea visible que empiece por «ORCA:» —«ORCA: secuencial — <motivo>», o «ORCA: <N> unidades · …» seguida del plan de rondas—, ${REGISTER}, y vuelve a intentarlo. No reintentes la edición sin ese echo: se volverá a denegar.`;
const denyAwait = (verdict) => `${MARK} Puerta de reparto: tu veredicto es repartir («ORCA: ${verdict.slice(0, 120)}»). No se edita el proyecto, no se escribe desde la shell y no se lanzan workers hasta que el usuario responda al plan de rondas (confirmación 1). Termina el turno con el plan y la pregunta «¿Lanzo? (sí / cambia X)». Si en vez de repartir lo haces secuencial, escribe «ORCA: secuencial — <motivo>» y ${REGISTER}.`;

/**
 * Qué hacer con una llamada a herramienta. Devuelve `null` (dejar pasar) o `{ deny: motivo }`.
 * - `input`: la entrada de PreToolUse (tool_name, tool_input, cwd).
 * - `blocks`: los bloques del asistente del transcript principal, en orden (puede venir vacío).
 * - `prompts`: las horas (ms) en que escribió la persona.
 * - `loads`, `verdicts`: lo que han apuntado los propios hooks (horas en ms; veredictos con su texto).
 */
/** Qué vigila la puerta de esta llamada: 'edit', 'shell' o 'agent'; `null` si no le afecta (leer, escribir fuera del proyecto…). */
function gatedKind(input) {
  const tool = input.tool_name;
  const args = input.tool_input || {};
  if (EDIT_TOOLS.has(tool)) return isProjectPath(args.file_path || args.notebook_path, input.cwd) ? 'edit' : null;
  if (SHELL_TOOLS.has(tool)) return isShellWrite(args.command) ? 'shell' : null;
  if (AGENT_TOOLS.has(tool)) return 'agent';
  return null;
}

function decide({ input, blocks = [], prompts = [], loads = [], verdicts = [], since = 0 }) {
  const kind = gatedKind(input);
  if (kind === null) return null;

  // Cargas y veredictos de las dos fuentes, por orden de hora.
  const events = [
    ...loads.map((at) => ({ at, load: true })),
    ...verdicts.map((v) => ({ at: v.at, text: v.text })),
  ];
  for (const block of blocks) {
    if (isOrcaLoad(block)) events.push({ at: block.at, load: true });
    else if (block.kind === 'text') for (const text of verdictLines(block.text)) events.push({ at: block.at, text });
  }
  events.sort((a, b) => a.at - b.at);
  let loadIndex = -1;
  for (let i = events.length - 1; i >= 0; i -= 1) if (events[i].load) { loadIndex = i; break; }
  if (loadIndex === -1) return null;
  const loadAt = events[loadIndex].at;
  const after = events.slice(loadIndex + 1).filter((e) => !e.load);

  if (after.length === 0) {
    // Una carga de la skill de un encargo anterior (la persona ha escrito después) ya no obliga.
    if (prompts.some((at) => at > loadAt)) return null;
    // Una carga anterior a que la puerta empezara a apuntar en esta sesión (se instaló con la sesión ya
    // abierta) no se puede juzgar: no se sabe si la persona escribió después.
    if (loadAt < since) return null;
    // Antes del veredicto, un subagente puede explorar; lo que no se hace es tocar el proyecto.
    return kind === 'agent' ? null : { deny: DENY_NO_VERDICT };
  }
  const latest = after[after.length - 1];
  if (!isReparto(latest.text) || isAutoAutonomy(latest.text)) return null;
  const answered = (verdict) => prompts.some((at) => at > verdict.at);
  if (answered(latest)) return null;
  // Repetir el mismo plan ya confirmado (al dar el estado de una ronda, por ejemplo) no pide otra
  // confirmación; un plan distinto (tras «cambia X») sí.
  const key = (text) => text.toLowerCase().replace(/\s+/g, ' ');
  if (after.some((v) => v !== latest && isReparto(v.text) && key(v.text) === key(latest.text) && answered(v))) return null;
  return { deny: denyAwait(latest.text) };
}

// ---------------------------------------------------------------- entrada y salida del hook

const BLANK = { first: null, prompts: [], loads: [], verdicts: [] };
// `since`: desde cuándo apunta la puerta en esta sesión; lo anterior no se juzga. Solo lo lleva un
// estado nuevo: uno que ya existía sin él lo apuntó otra versión y se juzga entero.
const emptyState = () => ({ since: Date.now(), ...BLANK });
const withDefaults = (state) => ({ ...BLANK, ...state });

/** Lee, cambia y guarda el estado de la sesión. Devuelve el estado guardado, o `null` si el id no vale. */
function updateState(input, env, change) {
  const sessionId = String(input.session_id || '');
  if (!SESSION_ID.test(sessionId)) return null;
  const file = stateFile(sessionId, env);
  const stored = readJson(file, null);
  const state = stored === null ? emptyState() : withDefaults(stored);
  change(state);
  writeJsonAtomic(file, state);
  return state;
}

function onPrompt(input, env) {
  updateState(input, env, (state) => {
    const prompt = String(input.prompt || '');
    if (state.first === null) state.first = prompt.trim().slice(0, 40);
    if (isHumanPrompt(prompt)) state.prompts = [...state.prompts, Date.now()].slice(-PROMPTS_KEPT);
  });
  if (Math.random() < 0.05) pruneOldState(env);
}

/** PostToolUse sobre Skill: si se ha cargado la skill orca, se apunta la hora. */
function onPostToolUse(input, env) {
  if (input.tool_name !== 'Skill') return;
  if (!/(^|:)orca$/i.test(String((input.tool_input || {}).skill || '').trim())) return;
  updateState(input, env, (state) => { state.loads = [...state.loads, Date.now()].slice(-EVENTS_KEPT); });
}

function onPreToolUse(input, env) {
  const sessionId = String(input.session_id || '');
  let state = SESSION_ID.test(sessionId) ? readJson(stateFile(sessionId, env), null) : null;
  // Sin estado, la sesión empezó antes de instalar la puerta (o su UserPromptSubmit no corre): no se
  // sabe cuándo ha escrito la persona y no se juzga.
  if (state === null) return { result: null };
  state = withDefaults(state);
  // Un worker despachado por la skill orca trabaja su unidad: no reparte ni pasa por la puerta.
  if (/^UNIT:/.test(String(state.first || ''))) return { result: null };
  // El agente registra su veredicto con un echo que lo lleva: se apunta y la orden pasa. Solo cuenta un
  // echo (o printf, Write-Output): un grep que busca «ORCA:» no es un veredicto.
  const command = String((input.tool_input || {}).command || '');
  if (SHELL_TOOLS.has(input.tool_name) && /^\s*(echo|printf|Write-Output|Write-Host)\b/i.test(command)) {
    const lines = verdictLines(command.replace(/["']/g, '\n')).filter((text) => text !== '');
    if (lines.length > 0) {
      const at = Date.now();
      state = updateState(input, env, (s) => { s.verdicts = [...s.verdicts, ...lines.map((text) => ({ at, text: text.slice(0, 300) }))].slice(-EVENTS_KEPT); });
      return { result: null };
    }
  }
  // Lo que no vigila (la mayoría de las llamadas) sale sin leer el transcript.
  if (gatedKind(input) === null) return { result: null };
  let blocks = [];
  let warning = null;
  const transcript = mainTranscript(String(input.transcript_path || ''));
  try {
    const parsed = parseTranscript(readTail(transcript));
    if (parsed.recognized) blocks = parsed.blocks;
    else warning = 'el transcript no tiene el formato que conozco';
  } catch (e) {
    warning = `no pude leer el transcript (${e.code || e.message})`;
  }
  // Sin transcript, lo apuntado por los hooks basta para decidir; si no hay nada apuntado, no se sabe
  // si se cargó la skill leyendo su SKILL.md, y se deja pasar avisando.
  if (warning && state.loads.length === 0) return { result: null, warning };
  return { result: decide({ input, blocks, prompts: state.prompts, loads: state.loads, verdicts: state.verdicts, since: Number(state.since) || 0 }) };
}

function logError(env, message) {
  try {
    fs.mkdirSync(stateDir(env), { recursive: true });
    fs.appendFileSync(path.join(stateDir(env), 'errors.log'), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // sin disco donde apuntarlo: el aviso al usuario por systemMessage sigue saliendo
  }
}

/** Ejecuta el hook con la entrada `raw` (JSON de stdin). Devuelve lo que hay que escribir por stdout. */
function run(raw, env = process.env) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return '';
  }
  if (isDisabled(env)) return '';
  try {
    if (input.hook_event_name === 'UserPromptSubmit') {
      onPrompt(input, env);
      return '';
    }
    if (input.hook_event_name === 'PostToolUse') {
      onPostToolUse(input, env);
      return '';
    }
    if (input.hook_event_name !== 'PreToolUse') return '';
    const { result, warning } = onPreToolUse(input, env);
    if (warning) {
      logError(env, warning);
      return JSON.stringify({ systemMessage: `${MARK} Puerta de reparto sin comprobar: ${warning}. La herramienta sigue.` });
    }
    if (!result) return '';
    return JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: result.deny },
    });
  } catch (e) {
    logError(env, e && e.stack ? e.stack : String(e));
    return JSON.stringify({ systemMessage: `${MARK} Puerta de reparto sin comprobar por un fallo interno (${e.message}). La herramienta sigue; detalle en ${path.join(stateDir(env), 'errors.log')}.` });
  }
}

if (require.main === module) {
  const chunks = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    const output = run(Buffer.concat(chunks).toString('utf8'));
    if (output) process.stdout.write(output);
  });
}

module.exports = { MARK, run, decide, parseTranscript, verdictLines, isShellWrite, isProjectPath, isHumanPrompt, mainTranscript, stateDir };
