// Render de la salida de install.sh para omk: spinner por fase, color y resumen final.
// install.sh emite (con OMK_EVENTS=1) líneas «::tipo::campo::campo»; lo demás se muestra tal cual.
'use strict';

const readline = require('node:readline');
const { isTransientCopy } = require('./fetch');

// Cómo se llama a omk desde donde corre: con npx no hay un «omk» en el PATH.
const CLI = isTransientCopy(__dirname) ? 'npx orca-multiagent-kit' : 'omk';

const tty = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && process.env.TERM !== 'dumb';
const truecolor = /truecolor|24bit/i.test(process.env.COLORTERM || '');
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = {
  lime: paint(truecolor ? '38;2;198;255;61' : '38;5;154'),
  limeDk: paint(truecolor ? '38;2;92;138;18' : '38;5;64'),
  grey: paint(truecolor ? '38;2;139;147;132' : '38;5;245'),
  amber: paint(truecolor ? '38;2;255;210;90' : '38;5;221'),
  red: paint(truecolor ? '38;2;255;107;107' : '38;5;203'),
  bold: paint('1'),
  dim: paint('2'),
};
const sym = {
  ok: c.lime('✓'), fail: c.red('✗'), warn: c.amber('!'), add: c.lime('+'), keep: c.grey('='), dry: c.amber('~'),
  todo: c.amber('›'), info: c.grey('·'), dot: c.grey('·'),
};
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const MIN_PHASE_MS = 160; // que cada fase se vea, aunque tarde menos
const cols = () => Math.max(50, Math.min(process.stdout.columns || 80, 110));
const out = (s = '') => process.stdout.write(s + '\n');

const vis = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

// Corta una línea larga en varias con sangría colgante.
function wrap(text, first, rest) {
  const width = cols() - rest.length - 1;
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && vis(line + ' ' + w).length > width) { lines.push(line); line = w; } else line = line ? line + ' ' + w : w;
  }
  if (line) lines.push(line);
  return lines.map((l, i) => (i === 0 ? first : rest) + l).join('\n');
}

// Separa «Agente: texto» para resaltar el agente.
function lead(text) {
  const m = /^([^:]{2,40}):\s(.*)$/.exec(text);
  return m ? `${c.bold(m[1])}${c.dim(':')} ${m[2]}` : text;
}

function header(title, sub) {
  const [name, ver] = title.split(/ (?=v\d)/);
  out();
  out(`  ${c.lime('◆')} ${c.bold(c.lime(name.toUpperCase()))}${ver ? '  ' + c.grey(ver) : ''}`);
  if (sub) out(`    ${c.grey(sub)}`);
  out();
}

function section(label, color, items, mark) {
  out();
  out(`  ${color(c.bold(label))} ${c.grey('(' + items.length + ')')}`);
  for (const t of items) out(wrap(lead(t), `  ${mark} `, '    '));
}

function footer(kind, stamp, dry, todos, infos, started) {
  if (todos.length) section('Pendiente', c.amber, todos, sym.todo);
  if (infos.length) section('Para tu información', c.grey, infos, sym.info);
  out();
  if (dry === '1') { out(`  ${c.amber('Simulación:')} no se ha escrito nada. Para aplicarlo, quita ${c.bold('--dry-run')}.`); out(); return; }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const rows = [];
  if (kind === 'restore') { out(`  ${sym.ok} ${c.bold('Restaurado')} ${c.grey('en ' + secs + ' s')}`); out(); return; }
  out(`  ${sym.ok} ${c.bold(todos.length ? 'Hecho, con ' + todos.length + ' pendiente' + (todos.length > 1 ? 's' : '') : 'Hecho')} ${c.grey('en ' + secs + ' s')}`);
  if (kind === 'global') {
    rows.push(['comprobar', `${CLI} verify`]);
    rows.push(['proyectos', `${CLI} init   ` + c.grey('(dentro de cada proyecto)')]);
  } else {
    rows.push(['siguiente', 'en el agente: «inicializa el proyecto»']);
  }
  if (stamp) rows.push(['deshacer', `${CLI} restore ${stamp}`]);
  for (const [k, v] of rows) out(`    ${c.grey(k.padEnd(10))} ${c.lime(v)}`);
  out();
}

/** Ejecuta install.sh dibujando sus eventos. Devuelve el código de salida. */
function render(child) {
  const started = Date.now();
  const queue = [];
  let wake = null;
  let closed = false;
  let code = 0;
  const push = (ev) => { queue.push(ev); if (wake) { wake(); wake = null; } };
  const next = () => (queue.length ? Promise.resolve(queue.shift()) : closed ? Promise.resolve(null) : new Promise((r) => { wake = () => r(queue.shift() ?? null); }));

  readline.createInterface({ input: child.stdout }).on('line', (l) => push({ src: 'out', l }));
  readline.createInterface({ input: child.stderr }).on('line', (l) => push({ src: 'err', l }));
  child.on('close', (status) => { code = status === null ? 1 : status; closed = true; if (wake) { wake(); wake = null; } });

  const todos = [];
  const infos = [];
  let phase = null; // { label, items, since, timer, frame, warn }
  let checks = { ok: 0, fail: 0 };

  const spin = () => {
    if (!tty || !phase) return;
    phase.frame = (phase.frame + 1) % FRAMES.length;
    process.stdout.write(`\r\x1b[2K  ${c.lime(FRAMES[phase.frame])} ${phase.label}${c.grey('…')}`);
  };
  const startPhase = (label) => {
    phase = { label, items: [], since: Date.now(), frame: 0, warn: false, timer: null };
    if (tty) { spin(); phase.timer = setInterval(spin, 80); }
  };
  const endPhase = async (summary) => {
    if (!phase) return;
    const wait = MIN_PHASE_MS - (Date.now() - phase.since);
    if (tty && wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (phase.timer) clearInterval(phase.timer);
    if (tty) process.stdout.write('\r\x1b[2K');
    const mark = phase.items.some((i) => i.kind === 'fail') ? sym.fail : phase.warn ? sym.warn : sym.ok;
    const label = c.bold(phase.label);
    const pad = Math.max(2, 30 - phase.label.length);
    out(`  ${mark} ${label}${summary ? ' '.repeat(pad) + c.grey(summary) : ''}`);
    const dry = phase.items.filter((i) => i.kind === 'dry');
    for (const i of phase.items.filter((x) => x.kind !== 'dry')) out(wrap(i.kind === 'keep' ? c.grey(i.text) : i.text, `      ${sym[i.kind] || sym.dot} `, '        '));
    if (dry.length) {
      for (const i of dry.slice(0, 4)) out(wrap(c.grey(i.text), `      ${sym.dry} `, '        '));
      if (dry.length > 4) out(`        ${c.grey('… y ' + (dry.length - 4) + ' acciones más')}`);
    }
    phase = null;
  };

  return (async () => {
    for (;;) {
      const ev = await next();
      if (!ev) break;
      if (ev.src === 'err') { if (phase && tty) process.stdout.write('\r\x1b[2K'); out(`  ${c.red(ev.l)}`); continue; }
      if (!ev.l.startsWith('::')) { if (ev.l.trim()) { if (phase && tty) process.stdout.write('\r\x1b[2K'); out(`      ${c.grey('│ ' + ev.l)}`); } continue; }
      const [type, ...f] = ev.l.slice(2).split('::');
      switch (type) {
        case 'title': header(f[0], f[1]); break;
        case 'begin': await endPhase(); startPhase(f[0]); break;
        case 'item': if (phase) { phase.items.push({ kind: f[0], text: f.slice(1).join('::') }); if (f[0] === 'warn') phase.warn = true; } break;
        case 'end': await endPhase(f.join('::')); break;
        case 'todo': todos.push(f.join('::')); break;
        case 'info': infos.push(f.join('::')); break;
        case 'check': {
          const [k, ...t] = f;
          checks[k === 'fail' ? 'fail' : 'ok'] += k === 'info' ? 0 : 1;
          out(wrap(lead(t.join('::')), `  ${k === 'ok' ? sym.ok : k === 'fail' ? sym.fail : sym.info} `, '    '));
          break;
        }
        case 'result':
          out();
          if (checks.fail === 0) out(`  ${sym.ok} ${c.bold('Todo correcto')} ${c.grey(checks.ok + ' comprobaciones')}`);
          else out(`  ${sym.fail} ${c.bold(c.red(checks.fail + (checks.fail > 1 ? ' fallos' : ' fallo')))}  ${c.grey('repáralos con')} ${c.lime(`${CLI} install`)}`);
          out();
          break;
        case 'footer': await endPhase(); footer(f[0], f[1], f[2], todos, infos, started); break;
        default: break;
      }
    }
    await endPhase();
    return code;
  })();
}

module.exports = { render, c, sym, tty };
