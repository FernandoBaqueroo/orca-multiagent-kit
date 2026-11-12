#!/usr/bin/env node
// omk — CLI de Orca Multiagent Kit. Sin dependencias: envuelve install.sh con comandos cortos y prepara Orca.
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const KIT = path.resolve(__dirname, '..');
const VERSION = fs.readFileSync(path.join(KIT, 'VERSION'), 'utf8').trim();
const REPO = 'orca-multiagent-kit';
const AGENTS_HOME = process.env.AGENT_KIT_HOME || path.join(os.homedir(), '.agents');
const RELEASES = 'https://github.com/FernandoBaqueroo/orca-multiagent-kit/releases/latest';
// Ejecutable autónomo (Node SEA, bin/sea.js)
const STANDALONE = require('./orca').isSea;

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const lime = (s) => (color ? `\x1b[38;5;154m${s}\x1b[0m` : s);
const dim = (s) => (color ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s) => (color ? `\x1b[1m${s}\x1b[0m` : s);

const HELP = `
${lime(bold('omk'))} ${dim('v' + VERSION)} — Orca Multiagent Kit

${bold('Uso')}
  omk <comando> [opciones]

${bold('Comandos')}
  ${lime('setup')}    [--yes] [--dry-run]          Prepara Orca entero: kit, plugins, plugin del kit y su panel
  ${lime('install')}  [--agents a,b] [--dry-run]   Instala o migra la fuente única en ~/.agents
  ${lime('init')}     [ruta]                       Prepara un proyecto (por defecto, la carpeta actual)
  ${lime('verify')}                                Comprueba enlaces, imports y copias divergentes
  ${lime('plugin')}   install|status|uninstall     El plugin de Orca del kit (install pide tu aprobación)
  ${lime('team')}     [set …]                      Enseña o cambia el equipo de roles de ORCHESTRATION.md
  ${lime('adopt')}    <carpeta-skill>              Comparte una skill externa con todos los agentes
  ${lime('backups')}                               Lista las copias de seguridad
  ${lime('restore')}  <fecha>                      Deshace una instalación (fecha de "omk backups")
  ${lime('update')}                                Actualiza a la última versión de npm y reinstala
  ${lime('where')}                                 Muestra dónde está cada cosa
  ${lime('version')}                               Muestra la versión
  ${lime('help')}                                  Esta ayuda

${bold('Agentes')}  claude · antigravity · codex · copilot · cursor · devin (opcional)

${bold('Ejemplos')}
  omk setup                     ${dim('todo de una vez; pregunta antes de aprobar el plugin')}
  npx orca-multiagent-kit install --dry-run
  omk install
  omk init ~/Dev/mi-app
  omk team set --provider claude --provider codex --role casandra=codex
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

/** Ejecuta install.sh dibujando su salida; resuelve con su código de salida. */
function installer(args) {
  const child = spawn(findBash(), [path.join(KIT, 'install.sh'), ...args], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, OMK_CLI: '1', OMK_EVENTS: '1' },
  });
  child.on('error', (e) => die(e.message));
  // Ctrl+C: deja la terminal limpia (sin el spinner a medias)
  const onInterrupt = () => { process.stdout.write('\r\x1b[2K'); child.kill('SIGINT'); process.exit(130); };
  process.on('SIGINT', onInterrupt);
  return require('./ui').render(child).finally(() => process.off('SIGINT', onInterrupt));
}

function runInstaller(args) {
  installer(args).then((code) => process.exit(code));
}

// Un fallo inesperado de setup/plugin se cuenta y sale con error; nunca se queda a medias en silencio.
function finish(promise) {
  const { pauseIfAsked } = require('./setup');
  promise
    .catch((e) => { process.stderr.write(`omk: ${e.message}\n`); return 1; })
    .then(pauseIfAsked)
    .then((code) => process.exit(code));
}

function listBackups() {
  const dir = path.join(AGENTS_HOME, 'backups');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((d) => /^\d{8}-\d{6}$/.test(d)).sort();
}

const [cmd = 'help', ...rest] = process.argv.slice(2);

switch (cmd) {
  case 'setup':
    finish(require('./setup').setup({ kit: KIT, args: rest, installer, standalone: STANDALONE }));
    break;

  case 'plugin':
    finish(require('./setup').plugin({ kit: KIT, args: rest }));
    break;

  case 'team':
    // exitCode y no exit(): deja terminar de escribir la salida cuando va a una tubería.
    process.exitCode = require('./team').main(rest);
    break;

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
    if (STANDALONE) {
      // El ejecutable no se actualiza solo: la versión nueva es otro binario que se descarga.
      console.log(`${lime('›')} Este omk es el ejecutable autónomo v${VERSION}. La última versión está en ${RELEASES}`);
      console.log(dim('  Descárgala y ejecútala (o «omk setup» con ella). Reaplicando ahora la instalación de esta versión…'));
      runInstaller(rest.filter((a) => a !== '--force'));
      break;
    }
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const sh = { encoding: 'utf8', shell: process.platform === 'win32' };
    const latest = (spawnSync(npm, ['view', REPO, 'version'], sh).stdout || '').trim();
    if (!latest) die('no se pudo consultar npm. ¿Hay conexión?');
    if (latest === VERSION && !rest.includes('--force')) {
      console.log(`${lime('✓')} Ya tienes la última versión (${VERSION}). Reaplicando la instalación…`);
    } else {
      console.log(`${lime('›')} Actualizando ${dim(VERSION)} → ${lime(latest)}`);
      const prefix = (spawnSync(npm, ['prefix', '-g'], sh).stdout || '').trim();
      const libdir = process.platform === 'win32' ? prefix : path.join(prefix, 'lib', 'node_modules');
      let writable = true;
      try {
        fs.accessSync(libdir, fs.constants.W_OK);
        if (fs.existsSync(path.join(libdir, REPO))) fs.accessSync(path.join(libdir, REPO), fs.constants.W_OK);
      } catch { writable = false; }
      if (!writable) {
        die(`no tienes permiso para escribir en ${libdir} (instalaste omk con sudo o Node está en una carpeta del sistema).

  Rápido:       sudo npm i -g ${REPO}@latest && omk install
  Recomendado:  que npm instale en tu carpeta de usuario, una sola vez:
                  mkdir -p ~/.npm-global && npm config set prefix ~/.npm-global
                  echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
                  sudo npm rm -g ${REPO} && npm i -g ${REPO}`);
      }
      const u = spawnSync(npm, ['install', '-g', `${REPO}@latest`], { stdio: 'inherit', shell: sh.shell });
      if (u.status !== 0) die('no se pudo actualizar con npm. Prueba: npx ' + REPO + '@latest install');
    }
    const r = spawnSync('omk', ['install', ...rest.filter((a) => a !== '--force')], { stdio: 'inherit', shell: process.platform === 'win32' });
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
