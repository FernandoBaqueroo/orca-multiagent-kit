#!/usr/bin/env node
// Casos de la puerta de reparto (hooks/orca-gate.cjs) contra transcripts sintéticos con la forma de los
// reales de Claude Code: una entrada por bloque, con `timestamp`, `message.role` y `message.content`.
// Lo ejecuta tests/test_gate.sh. Escribe «ok»/«FAIL» por caso y sale con 1 si alguno falla.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const gate = require('../../hooks/orca-gate.cjs');

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
    process.stdout.write(`  ok    ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`  FAIL  ${name}\n        │ ${String(e && e.message).split('\n').join('\n        │ ')}\n`);
  }
}
function equal(actual, expected, what = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what} esperaba ${JSON.stringify(expected)} y salió ${JSON.stringify(actual)}`);
}

const W = fs.mkdtempSync(path.join(os.tmpdir(), 'omk-gate-'));
const HOME = path.join(W, 'agents');
const PROJECT = path.join(W, 'proyecto');
fs.mkdirSync(PROJECT, { recursive: true });
const env = { AGENT_KIT_HOME: HOME };

// ---------------------------------------------------------------- transcripts sintéticos

let clock = Date.parse('2026-11-12T10:00:00.000Z');
const tick = () => new Date((clock += 1000)).toISOString();
const entry = (block) => JSON.stringify({
  parentUuid: null, isSidechain: false, type: 'assistant', timestamp: tick(),
  message: { role: 'assistant', type: 'message', content: [block] },
});
const text = (t) => entry({ type: 'text', text: t });
const tool = (name, input) => entry({ type: 'tool_use', id: `toolu_${clock}`, name, input });
const userLine = (t) => JSON.stringify({ type: 'user', timestamp: tick(), message: { role: 'user', content: t } });
const LOAD = () => tool('Skill', { skill: 'orca' });

function writeTranscript(name, lines) {
  const file = path.join(W, `${name}.jsonl`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}

// La persona escribe ahora: lo apunta el hook UserPromptSubmit, con la hora del reloj de las pruebas.
// `at`: la hora (ms), para los casos que se mezclan con lo que apuntan los hooks con la hora real.
function personWrites(sessionId, prompt, at = (clock += 1000)) {
  const file = path.join(gate.stateDir(env), `${sessionId}.json`);
  const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { first: null, prompts: [] };
  if (state.first === null) state.first = prompt.slice(0, 40);
  if (gate.isHumanPrompt(prompt)) state.prompts.push(at);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state));
}

const pre = (sessionId, transcript, toolName, toolInput, extra = {}) => gate.run(JSON.stringify({
  session_id: sessionId, transcript_path: transcript, cwd: PROJECT, hook_event_name: 'PreToolUse',
  tool_name: toolName, tool_input: toolInput, ...extra,
}), env);
const editIn = (rel) => ({ file_path: path.join(PROJECT, rel), old_string: 'a', new_string: 'b' });
const denied = (out) => out !== '' && JSON.parse(out).hookSpecificOutput?.permissionDecision === 'deny';
const reason = (out) => JSON.parse(out).hookSpecificOutput.permissionDecisionReason;

// ---------------------------------------------------------------- casos

process.stdout.write('== sin la skill orca no hace nada\n');
check('sin carga de la skill, editar el proyecto pasa', () => {
  personWrites('s1', 'arregla el login');
  const t = writeTranscript('s1', [text('Miro el fichero.'), tool('Read', { file_path: 'x' })]);
  equal(pre('s1', t, 'Edit', editIn('src/a.js')), '');
});

process.stdout.write('== cargada la skill, sin veredicto en el chat\n');
personWrites('s2', 'implementa A, B y C');
const t2 = writeTranscript('s2', [text('Cargo la skill.'), LOAD(), tool('Read', { file_path: 'x' })]);
check('editar el proyecto se deniega con el motivo', () => {
  const out = pre('s2', t2, 'Edit', editIn('src/a.js'));
  if (!denied(out) || !/ORCA:/.test(reason(out))) throw new Error(out);
});
check('Write y NotebookEdit también', () => {
  if (!denied(pre('s2', t2, 'Write', { file_path: path.join(PROJECT, 'b.js'), content: 'x' }))) throw new Error('Write');
  if (!denied(pre('s2', t2, 'NotebookEdit', { notebook_path: path.join(PROJECT, 'n.ipynb') }))) throw new Error('NotebookEdit');
});
check('escribir en .work/ o fuera del proyecto pasa', () => {
  equal(pre('s2', t2, 'Write', { file_path: path.join(PROJECT, '.work', 'runs', 'r1', 'units.md'), content: 'x' }), '', '.work');
  equal(pre('s2', t2, 'Write', { file_path: path.join(W, 'fuera.txt'), content: 'x' }), '', 'fuera');
});
check('la shell que solo lee pasa; la que escribe se deniega', () => {
  equal(pre('s2', t2, 'Bash', { command: 'git status && git log --oneline -3 && ls src' }), '', 'lectura');
  if (!denied(pre('s2', t2, 'Bash', { command: 'echo hola > src/x.js' }))) throw new Error('redirección');
  if (!denied(pre('s2', t2, 'PowerShell', { command: 'Set-Content -Path src/x.js -Value 1' }))) throw new Error('PowerShell');
});
check('un subagente para explorar pasa antes del veredicto', () => {
  equal(pre('s2', t2, 'Agent', { description: 'explorar', prompt: 'lee' }), '');
});

process.stdout.write('== veredicto secuencial\n');
check('con «ORCA: secuencial — …» en el chat, editar pasa', () => {
  personWrites('s3', 'implementa A y B');
  const t = writeTranscript('s3', [LOAD(), text('ORCA: secuencial — dos cambios de 5 min en el mismo fichero')]);
  equal(pre('s3', t, 'Edit', editIn('src/a.js')), '');
});
check('el veredicto con formato Markdown también cuenta', () => {
  personWrites('s4', 'implementa A y B');
  const t = writeTranscript('s4', [LOAD(), text('Decidido.\n\n**ORCA:** secuencial — comparten `server.js`')]);
  equal(pre('s4', t, 'Edit', editIn('src/a.js')), '');
});
check('cargar la skill leyendo su SKILL.md también abre la puerta', () => {
  personWrites('s5', 'implementa A y B');
  const t = writeTranscript('s5', [tool('Read', { file_path: '/home/u/.agents/skills/orca/SKILL.md' }), tool('Read', { file_path: 'x' })]);
  if (!denied(pre('s5', t, 'Edit', editIn('a.js')))) throw new Error('sin veredicto debía denegar');
});

process.stdout.write('== veredicto de reparto: hace falta la respuesta de la persona\n');
const PLAN = 'ORCA: 3 unidades · 2 rondas · motor subagents · autonomía semi';
personWrites('s6', 'implementa los tres sprints');
const t6 = writeTranscript('s6', [LOAD(), text(`${PLAN}\n\nronda | unidad\n1 | U1\n¿Lanzo? (sí / cambia X)`)]);
check('sin respuesta, editar, escribir desde la shell o lanzar workers se deniega', () => {
  const out = pre('s6', t6, 'Edit', editIn('src/a.js'));
  if (!denied(out) || !/plan de rondas/.test(reason(out))) throw new Error(out);
  if (!denied(pre('s6', t6, 'Agent', { description: 'U1', prompt: 'UNIT: U1' }))) throw new Error('Agent');
  if (!denied(pre('s6', t6, 'Bash', { command: 'git worktree add ../u1 -b feat/u1' }))) throw new Error('worktree');
  equal(pre('s6', t6, 'Bash', { command: 'git fetch origin --prune && git rev-list --left-right --count origin/main...main' }), '', 'fetch');
});
check('con la respuesta de la persona, pasa', () => {
  personWrites('s6', 'sí');
  equal(pre('s6', t6, 'Edit', editIn('src/a.js')), '', 'Edit');
  equal(pre('s6', t6, 'Agent', { description: 'U1', prompt: 'UNIT: U1' }), '', 'Agent');
});
check('repetir el mismo plan ya confirmado no pide otra confirmación', () => {
  const t = writeTranscript('s6', [...fs.readFileSync(t6, 'utf8').trim().split('\n'), text(`Ronda 1 lanzada.\n${PLAN}`)]);
  equal(pre('s6', t, 'Edit', editIn('src/a.js')), '');
});
check('un plan distinto (tras «cambia X») vuelve a pedirla', () => {
  const t = writeTranscript('s6', [...fs.readFileSync(t6, 'utf8').trim().split('\n'), text('ORCA: 2 unidades · 1 ronda · motor subagents · autonomía semi')]);
  if (!denied(pre('s6', t, 'Edit', editIn('src/a.js')))) throw new Error('debía denegar');
});
check('con autonomía auto no espera', () => {
  personWrites('s7', 'implementa A, B y C');
  const t = writeTranscript('s7', [LOAD(), text('ORCA: 3 unidades · 1 ronda · motor orca · autonomía auto')]);
  equal(pre('s7', t, 'Edit', editIn('a.js')), '');
});
check('una notificación de tarea no cuenta como respuesta', () => {
  personWrites('s8', 'implementa A y B');
  const t = writeTranscript('s8', [LOAD(), text('ORCA: 2 unidades · 1 ronda · motor subagents · autonomía semi')]);
  personWrites('s8', '<task-notification> <task-id>x</task-id> completed </task-notification>');
  if (!denied(pre('s8', t, 'Edit', editIn('a.js')))) throw new Error('debía denegar');
});

process.stdout.write('== el veredicto registrado con echo (el transcript llega tarde)\n');
const post = (sessionId, skill) => gate.run(JSON.stringify({ session_id: sessionId, hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: { skill } }), env);
const empty = writeTranscript('vacio', [text('Leo el repo.')]);
check('PostToolUse sobre Skill apunta la carga aunque el transcript aún no la tenga', () => {
  personWrites('e1', 'implementa A y B', Date.now() - 5000);
  equal(post('e1', 'orca'), '', 'salida');
  if (!denied(pre('e1', empty, 'Edit', editIn('a.js')))) throw new Error('debía denegar sin veredicto');
});
check('otra skill no cuenta como carga', () => {
  personWrites('e2', 'implementa A y B', Date.now() - 5000);
  post('e2', 'csr-gate');
  equal(pre('e2', empty, 'Edit', editIn('a.js')), '');
});
check('echo "ORCA: secuencial — …" registra el veredicto, pasa, y después se puede editar', () => {
  equal(pre('e1', empty, 'Bash', { command: 'echo "ORCA: secuencial — dos cambios pequeños en server.js"' }), '', 'echo');
  equal(pre('e1', empty, 'Edit', editIn('a.js')), '', 'Edit');
});
check('echo de un reparto registra el veredicto y deniega hasta la respuesta', () => {
  personWrites('e3', 'implementa A, B y C', Date.now() - 5000);
  post('e3', 'orca');
  equal(pre('e3', empty, 'PowerShell', { command: "Write-Output 'ORCA: 3 unidades · 1 ronda · motor subagents · autonomía semi'" }), '', 'registro');
  const out = pre('e3', empty, 'Edit', editIn('a.js'));
  if (!denied(out) || !/repartir/.test(reason(out))) throw new Error(out);
  personWrites('e3', 'sí', Date.now() + 1000);
  equal(pre('e3', empty, 'Edit', editIn('a.js')), '', 'tras el sí');
});
check('un grep que busca «ORCA:» no es un veredicto', () => {
  personWrites('e4', 'implementa A y B', Date.now() - 5000);
  post('e4', 'orca');
  pre('e4', empty, 'Bash', { command: 'grep -rn "ORCA: secuencial" docs' });
  if (!denied(pre('e4', empty, 'Edit', editIn('a.js')))) throw new Error('debía seguir denegando');
});
check('el motivo de la denegación dice cómo registrarlo', () => {
  personWrites('e5', 'implementa A y B', Date.now() - 5000);
  post('e5', 'orca');
  if (!/echo "ORCA: …"/.test(reason(pre('e5', empty, 'Edit', editIn('a.js'))))) throw new Error('sin la orden');
});
check('sin transcript legible, lo apuntado por los hooks basta para decidir', () => {
  personWrites('e6', 'implementa A y B', Date.now() - 5000);
  post('e6', 'orca');
  if (!denied(pre('e6', path.join(W, 'no-existe.jsonl'), 'Edit', editIn('a.js')))) throw new Error('debía denegar');
});

process.stdout.write('== encargos anteriores, workers y subagentes\n');
check('una carga de la skill de un encargo anterior sin veredicto ya no obliga', () => {
  personWrites('s9', 'implementa A y B');
  const t = writeTranscript('s9', [LOAD(), text('Hecho.')]);
  personWrites('s9', 'ahora cambia el título del README');
  equal(pre('s9', t, 'Edit', editIn('README.md')), '');
});
check('un worker despachado (primer mensaje «UNIT:») no pasa por la puerta', () => {
  personWrites('s10', 'UNIT: U2 — Pagos     RUN: r1     BASE: abc');
  const t = writeTranscript('s10', [LOAD(), tool('Read', { file_path: 'x' })]);
  equal(pre('s10', t, 'Edit', editIn('src/pagos.js')), '');
});
check('un subagente se juzga con el transcript de la sesión principal', () => {
  personWrites('s11', 'implementa los tres módulos');
  const main = writeTranscript('s11', [LOAD(), text(PLAN)]);
  const sub = path.join(W, 's11', 'subagents', 'agent-a1.jsonl');
  fs.mkdirSync(path.dirname(sub), { recursive: true });
  fs.writeFileSync(sub, `${text('trabajo del subagente')}\n`);
  equal(gate.mainTranscript(sub), main, 'ruta');
  if (!denied(pre('s11', sub, 'Edit', editIn('a.js'), { agent_id: 'a1' }))) throw new Error('debía denegar');
});

check('una sesión sin estado (empezó antes de instalar la puerta) no se juzga', () => {
  const t = writeTranscript('s15', [LOAD(), tool('Read', { file_path: 'x' })]);
  equal(pre('s15', t, 'Edit', editIn('a.js')), '');
});

check('una carga anterior a que la puerta apuntara en la sesión (instalada con la sesión abierta) no se juzga', () => {
  const t = writeTranscript('s16', [LOAD(), tool('Read', { file_path: 'x' })]);
  // El primer mensaje que ve la puerta es una notificación, después de la carga: no hay ninguno de la persona.
  gate.run(JSON.stringify({ session_id: 's16', hook_event_name: 'UserPromptSubmit', prompt: '<task-notification> x </task-notification>' }), env);
  equal(pre('s16', t, 'Edit', editIn('a.js')), '');
});

process.stdout.write('== registro de lo que escribe la persona (UserPromptSubmit)\n');
check('apunta los mensajes de la persona y no las notificaciones', () => {
  const prompt = (p) => gate.run(JSON.stringify({ session_id: 's12', hook_event_name: 'UserPromptSubmit', prompt: p }), env);
  equal(prompt('implementa A y B'), '', 'salida');
  prompt('<task-notification> x </task-notification>');
  prompt('[SYSTEM NOTIFICATION - NOT USER INPUT] algo');
  prompt('sí');
  const state = JSON.parse(fs.readFileSync(path.join(gate.stateDir(env), 's12.json'), 'utf8'));
  equal(state.prompts.length, 2, 'mensajes');
  equal(state.first, 'implementa A y B', 'primero');
});
check('un session_id con forma rara no escribe nada fuera de su carpeta', () => {
  gate.run(JSON.stringify({ session_id: '../../fuera', hook_event_name: 'UserPromptSubmit', prompt: 'x' }), env);
  equal(fs.existsSync(path.join(HOME, 'fuera.json')) || fs.existsSync(path.join(W, 'fuera.json')), false);
});

process.stdout.write('== nunca bloquea por un fallo suyo\n');
check('sin transcript, avisa y deja pasar', () => {
  personWrites('s13', 'implementa A y B');
  const out = pre('s13', path.join(W, 'no-existe.jsonl'), 'Edit', editIn('a.js'));
  const json = JSON.parse(out);
  equal(json.hookSpecificOutput, undefined, 'decisión');
  if (!/sin comprobar/.test(json.systemMessage)) throw new Error(out);
});
check('con un transcript de formato desconocido, avisa y deja pasar', () => {
  personWrites('s14', 'implementa A y B');
  const t = writeTranscript('s14', ['{"otra":"cosa"}', 'no es json']);
  const json = JSON.parse(pre('s14', t, 'Edit', editIn('a.js')));
  if (json.hookSpecificOutput || !/formato/.test(json.systemMessage)) throw new Error(JSON.stringify(json));
});
check('una entrada que no es JSON no rompe nada', () => {
  equal(gate.run('esto no es json', env), '');
});
check('OMK_NO_GATE=1 y «omk gate off» la desactivan', () => {
  equal(gate.run(JSON.stringify({ session_id: 's2', transcript_path: t2, cwd: PROJECT, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: editIn('a.js') }), { ...env, OMK_NO_GATE: '1' }), '', 'variable');
  fs.writeFileSync(path.join(gate.stateDir(env), 'off'), '');
  equal(pre('s2', t2, 'Edit', editIn('a.js')), '', 'fichero');
  fs.rmSync(path.join(gate.stateDir(env), 'off'));
  if (!denied(pre('s2', t2, 'Edit', editIn('a.js')))) throw new Error('sin el fichero vuelve a actuar');
});

process.stdout.write('== qué cuenta como escribir desde la shell\n');
const writes = ['echo a > f.txt', 'cat a >> b', 'tee out.log', 'rm -rf src', 'cp a b', 'mv a b', 'mkdir x', 'touch y', 'sed -i s/a/b/ f',
  'git commit -m x', 'git add .', 'git checkout -b feat/x', 'git worktree add ../w', 'git branch nueva', 'git stash', 'git merge feat/x',
  'npm install', 'pnpm add x', 'pip install y', 'node -e "require(\'fs\').writeFileSync(\'a\',\'b\')"',
  'Remove-Item -Recurse dist', 'New-Item -ItemType File x', 'Out-File -FilePath x', 'orca worktree create --name u1', 'orca orchestration worker-start --task t1',
  'cd src && rm a.js', 'sudo cp a /etc/b'];
const reads = ['git status', 'git diff --stat', 'git log --oneline -3', 'git branch', 'git branch -a', 'git tag', 'git stash list', 'git worktree list',
  'git fetch origin --prune', 'ls -la', 'cat package.json', 'grep -rn foo src', 'npm test', 'npm run build', 'node --version', 'cmd 2>&1', 'cmd 2>/dev/null',
  'Get-ChildItem src', 'orca status --json', 'orca orchestration run-create --json', 'mkdir -p .work/runs/r1', 'echo plan > .work/runs/r1/plan.json'];
check('detecta las escrituras', () => {
  const missed = writes.filter((c) => !gate.isShellWrite(c));
  if (missed.length) throw new Error(`no detectadas: ${missed.join(' · ')}`);
});
check('deja pasar las lecturas y lo que va a .work/', () => {
  const wrong = reads.filter((c) => gate.isShellWrite(c));
  if (wrong.length) throw new Error(`tomadas por escrituras: ${wrong.join(' · ')}`);
});

process.stdout.write('== el hook de verdad, por stdin\n');
check('node hooks/orca-gate.cjs lee stdin y deniega con el formato de Claude Code', () => {
  const { spawnSync } = require('node:child_process');
  const input = JSON.stringify({ session_id: 's2', transcript_path: t2, cwd: PROJECT, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: editIn('a.js') });
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'hooks', 'orca-gate.cjs'), gate.MARK], { input, encoding: 'utf8', env: { ...process.env, ...env } });
  equal(r.status, 0, 'código de salida');
  const out = JSON.parse(r.stdout);
  equal(out.hookSpecificOutput.hookEventName, 'PreToolUse', 'evento');
  equal(out.hookSpecificOutput.permissionDecision, 'deny', 'decisión');
});

fs.rmSync(W, { recursive: true, force: true });
process.stdout.write(`\n${pass} ok · ${fail} fallos\n`);
process.exit(fail === 0 ? 0 : 1);
