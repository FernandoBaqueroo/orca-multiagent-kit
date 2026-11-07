#!/usr/bin/env node
// omk — CLI de Orca Multiagent Kit. Sin dependencias: envuelve install.sh con comandos cortos.
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const KIT = path.resolve(__dirname, '..');
const VERSION = fs.readFileSync(path.join(KIT, 'VERSION'), 'utf8').trim();
const REPO = 'orca-multiagent-kit';
const AGENTS_HOME = process.env.AGENT_KIT_HOME || path.join(os.homedir(), '.agents');

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const lime = (s) => (color ? `\x1b[38;5;154m${s}\x1b[0m` : s);
const dim = (s) => (color ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s) => (color ? `\x1b[1m${s}\x1b[0m` : s);

const HELP = `
${lime(bold('omk'))} ${dim('v' + VERSION)} — Orca Multiagent Kit

${bold('Uso')}
  omk <comando> [opciones]

${bold('Comandos')}
  ${lime('install')}  [--agents a,b] [--dry-run]   Instala o migra la fuente única en ~/.agents
  ${lime('init')}     [ruta]                       Prepara un proyecto (por defecto, la carpeta actual)
  ${lime('verify')}                                Comprueba enlaces, imports y copias divergentes
  ${lime('adopt')}    <carpeta-skill>              Comparte una skill externa con todos los agentes
  ${lime('backups')}                               Lista las copias de seguridad
  ${lime('restore')}  <fecha>                      Deshace una instalación (fecha de "omk backups")
  ${lime('update')}                                Actualiza el kit a la última versión y reinstala
  ${lime('where')}                                 Muestra dónde está cada cosa
  ${lime('version')}                               Muestra la versión
  ${lime('help')}                                  Esta ayuda

${bold('Agentes')}  claude · antigravity · codex · copilot · cursor · devin (opcional)

${bold('Ejemplos')}
  npx orca-multiagent-kit install --dry-run
  omk install
  omk init ~/Dev/mi-app
  omk adopt ~/.gemini/config/plugins/user-workflows/skills/impeccable
`;

function die(msg, code = 1) {
  process.stderr.write(`omk: ${msg}\n`);
  process.exit(code);
}

// En Windows, el `bash` del PATH puede ser el lanzador de WSL (System32\bash.exe): tiene otro $HOME y no
// entiende rutas C:\, así que instalaría en Linux y no en el Windows del usuario. Solo vale un bash MSYS/Cygwin.
function isWindowsBash(bash) {
  const r = spawnSync(bash, ['-c', 'uname -s'], { encoding: 'utf8' });
  return r.status === 0 && /^(MINGW|MSYS|CYGWIN)/.test((r.stdout || '').trim());
}

function findBash() {
  if (process.platform !== 'win32') return 'bash';
  if (process.env.OMK_BASH) return process.env.OMK_BASH;
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')];
  for (const root of roots.filter(Boolean)) {
    const c = path.join(root, 'Git', 'bin', 'bash.exe');
    if (fs.existsSync(c)) return c;
  }
  if (isWindowsBash('bash')) return 'bash';
  die('Windows necesita Git Bash. Instala Git for Windows, define OMK_BASH con la ruta de su bash.exe, o ejecuta omk dentro de WSL (instala en el $HOME de WSL).');
}

function runInstaller(args) {
  const r = spawnSync(findBash(), [path.join(KIT, 'install.sh'), ...args], { stdio: 'inherit', env: process.env });
  if (r.error) die(r.error.message);
  process.exit(r.status === null ? 1 : r.status);
}

function listBackups() {
  const dir = path.join(AGENTS_HOME, 'backups');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((d) => /^\d{8}-\d{6}$/.test(d)).sort();
}

const [cmd = 'help', ...rest] = process.argv.slice(2);

switch (cmd) {
  case 'install':
  case 'i':
    runInstaller(rest);
    break;

  case 'init': {
    const target = path.resolve(rest[0] || process.cwd());
    if (!fs.existsSync(target)) die(`no existe la carpeta ${target}`);
    runInstaller(['--project-only', target, ...rest.slice(1)]);
    break;
  }

  case 'verify':
  case 'doctor':
    runInstaller(['--verify', ...rest]);
    break;

  case 'adopt':
    if (!rest[0]) die('falta la carpeta de la skill: omk adopt <carpeta>');
    runInstaller(['--adopt', path.resolve(rest[0])]);
    break;

  case 'backups': {
    const b = listBackups();
    if (!b.length) { console.log('No hay copias de seguridad en ' + path.join(AGENTS_HOME, 'backups')); break; }
    for (const d of b) console.log(d.replace(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/, `$&  ${dim('$3/$2/$1 $4:$5:$6')}`));
    console.log(dim(`\nDeshacer: omk restore ${b[0]}  (la más antigua es el estado previo a la primera instalación)`));
    break;
  }

  case 'restore':
    if (!rest[0]) die('falta la fecha: omk restore <fecha>  (consulta "omk backups")');
    runInstaller(['--restore', rest[0]]);
    break;

  case 'update': {
    console.log(lime('Actualizando desde ' + REPO + ' …'));
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const u = spawnSync(npm, ['install', '-g', REPO], { stdio: 'inherit' });
    if (u.status !== 0) die('no se pudo actualizar con npm. Prueba: npx ' + REPO + ' install');
    const r = spawnSync('omk', ['install', ...rest], { stdio: 'inherit', shell: process.platform === 'win32' });
    process.exit(r.status === null ? 1 : r.status);
  }

  case 'where':
    console.log(`${bold('kit')}         ${KIT}`);
    console.log(`${bold('fuente')}      ${AGENTS_HOME}`);
    console.log(`${bold('núcleo')}      ${path.join(AGENTS_HOME, 'AGENTS.md')}`);
    console.log(`${bold('reglas')}      ${path.join(AGENTS_HOME, 'rules')}`);
    console.log(`${bold('skills')}      ${path.join(AGENTS_HOME, 'skills')}`);
    console.log(`${bold('backups')}     ${path.join(AGENTS_HOME, 'backups')}`);
    break;

  case 'version':
  case '-v':
  case '--version':
    console.log(VERSION);
    break;

  case 'help':
  case '-h':
  case '--help':
    console.log(HELP);
    break;

  default:
    die(`comando desconocido: ${cmd}\n${HELP}`, 2);
}
