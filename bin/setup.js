// omk setup y omk plugin: deja Orca listo para el kit (kit instalado, plugins encendidos, plugin del
// kit instalado y su panel abierto) y, en el ejecutable autónomo, pone omk en el PATH.
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { applyHooks } = require('./hooks');
const orcaCli = require('./orca');
const { c, sym } = require('./ui');

const out = (s = '') => process.stdout.write(s + '\n');
const ok = (s) => out(`  ${sym.ok} ${s}`);
const warn = (s) => out(`  ${sym.warn} ${s}`);
const fail = (s) => out(`  ${sym.fail} ${c.red(s)}`);
const todo = (s) => out(`      ${sym.todo} ${s}`);
const detail = (s) => out(`      ${sym.info} ${c.grey(s)}`);
const heading = (s) => { out(); out(`  ${c.lime('◆')} ${c.bold(s)}`); };

/** Separa las opciones propias de omk setup/plugin de las que van a install.sh. */
function parseOptions(args) {
  const own = { yes: false, dryRun: false, noPlugin: false, noPath: false, noHooks: false };
  const rest = [];
  for (const a of args) {
    if (a === '--yes' || a === '-y') own.yes = true;
    else if (a === '--no-plugin') own.noPlugin = true;
    else if (a === '--no-path') own.noPath = true;
    else if (a === '--no-hooks') own.noHooks = true;
    else { if (a === '--dry-run') own.dryRun = true; rest.push(a); }
  }
  return { ...own, rest };
}

// Una aprobación que nadie contesta no deja omk colgado para siempre: el plugin de Orca lo lanza en un
// terminal que puede no estar a la vista.
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

/** Pregunta de sí o no. Con `timeoutMs`, pasado ese tiempo sin respuesta cuenta como «no» y lo dice. */
async function ask(question, { timeoutMs = 0, input = process.stdin } = {}) {
  const rl = readline.createInterface({ input, output: process.stdout });
  let timer = null;
  try {
    const answer = await new Promise((resolve) => {
      rl.question(question, resolve);
      if (timeoutMs > 0) timer = setTimeout(() => resolve(null), timeoutMs);
    });
    if (answer === null) {
      out();
      warn(`Sin respuesta en ${Math.max(1, Math.round(timeoutMs / 60000))} min: no apruebo nada.`);
      return false;
    }
    return /^(s|si|sí|y|yes)$/i.test(String(answer).trim());
  } finally {
    clearTimeout(timer);
    rl.close();
  }
}

// Orca exige una aprobación explícita del usuario para un plugin que ejecuta código: se enseña lo que
// concede y se pregunta. --yes es esa aprobación dada de antemano.
const confirmWith = (yes) => async (grants, data) => {
  out();
  out(`  ${c.amber(c.bold('Orca pide tu aprobación'))} ${c.grey(orcaCli.clean(`para ${data.name || 'el plugin'} ${data.version || ''}`))}`);
  for (const g of grants) detail(g);
  if (yes) { ok('Aprobado (--yes)'); return true; }
  if (!process.stdin.isTTY) {
    warn('Sin terminal interactivo no puedo preguntarte. Repite con --yes para aprobarlo.');
    return false;
  }
  return ask(`  ${sym.todo} ¿Apruebas este acceso? [s/N] `, { timeoutMs: APPROVAL_TIMEOUT_MS });
};

function listPlugin(orca) {
  const list = orcaCli.runOrca(orca, ['plugin', 'list']);
  if (list.code !== 0) throw new Error(`no pude listar los plugins de Orca (${list.problem})`);
  return orcaCli.findInstalled(list.json);
}

const PLAN_ARGS = {
  install: (dir) => ['plugin', 'install', dir],
  update: (dir, installed) => ['plugin', 'update', installed.pluginKey],
  enable: (dir, installed) => ['plugin', 'enable', installed.pluginKey],
};

const PLAN_TEXT = {
  install: 'instalaría el plugin',
  update: 'actualizaría el plugin',
  enable: 'pediría la aprobación del plugin',
  current: 'el plugin ya está instalado y activo',
  disabled: 'el plugin está desactivado y se deja así',
  foreign: 'hay otra versión del plugin instalada desde otra carpeta y no se toca',
};

/** Instala, actualiza o aprueba el plugin del kit. Devuelve su clave, o null si no quedó instalado. */
async function ensurePlugin(orca, kit, { yes, dryRun }) {
  const dir = path.join(kit, 'orca-plugin');
  const { version } = orcaCli.readManifest(dir);
  const installed = listPlugin(orca);
  const plan = orcaCli.planPlugin(installed, dir, version);
  if (dryRun) { detail(`Simulación: ${PLAN_TEXT[plan]} (v${version}).`); return null; }

  if (plan === 'disabled') {
    warn(`Plugin ${installed.pluginKey} v${version} desactivado: lo respeto.`);
    todo(`Para activarlo: orca plugin enable ${installed.pluginKey}`);
    return installed.pluginKey;
  }
  if (plan === 'foreign') {
    warn(`Ya hay ${installed.pluginKey} v${installed.version} instalado desde otra carpeta; este kit trae la v${version}.`);
    todo('Para cambiarlo por el de este kit: omk plugin uninstall && omk plugin install');
    return installed.pluginKey;
  }
  if (plan !== 'current') {
    const result = await orcaCli.withApproval(orca, PLAN_ARGS[plan](dir, installed), confirmWith(yes));
    if (result.declined) { fail('Plugin sin instalar: no se aprobó el acceso.'); return null; }
    if (result.code !== 0) { fail(`Orca no instaló el plugin: ${result.problem}`); return null; }
  }

  const now = listPlugin(orca);
  if (!now || now.version !== version) { fail(`Orca no lista el plugin v${version} después de instalarlo.`); return null; }
  if (now.status === 'errored' || now.status === 'invalid') {
    warn(`Plugin ${now.pluginKey} v${version} instalado, pero Orca lo marca como ${now.status}.`);
    todo(`Detalle: orca plugin logs ${now.pluginKey}`);
    return now.pluginKey;
  }
  ok(`Plugin ${now.pluginKey} v${version} ${plan === 'current' ? 'ya estaba instalado' : 'instalado'} ${c.grey('(' + now.status + ')')}`);
  return now.pluginKey;
}

function requireOrca(manifestDir) {
  const orca = orcaCli.findOrca();
  if (!orca) {
    fail(process.env.OMK_ORCA ? `OMK_ORCA=${process.env.OMK_ORCA} no responde a «orca --version».` : 'No encuentro el CLI de Orca.');
    todo('Instala Orca (https://www.onorca.dev), ábrelo una vez y vuelve a ejecutar esto. Si ya lo tienes, define OMK_ORCA con la ruta de su CLI.');
    return null;
  }
  const need = (orcaCli.readManifest(manifestDir).engines || {}).orca;
  if (!orcaCli.satisfies(orca.version, need)) {
    fail(`Orca ${orca.version}: el plugin necesita ${need}. Actualiza Orca y repite.`);
    return null;
  }
  ok(`Orca ${orca.version} ${c.grey(orca.path)}`);
  return orca;
}

function ensureRuntime(orca) {
  const status = orcaCli.runOrca(orca, ['status']);
  const runtime = status.json && status.json.result && status.json.result.runtime;
  if (runtime && runtime.reachable) return true;
  detail('Orca no está abierto: lo abro y espero a que arranque…');
  const opened = orcaCli.runOrca(orca, ['open'], orcaCli.OPEN_TIMEOUT_MS);
  if (opened.code === 0) { ok('Orca abierto'); return true; }
  fail(`No pude abrir Orca: ${opened.problem}`);
  return false;
}

// --------------------------------------------------------------------- ejecutable en el PATH

/** Carpeta donde el ejecutable autónomo se copia a sí mismo. */
function binDir(env = process.env, platform = process.platform, home = os.homedir()) {
  if (env.OMK_BIN_DIR) return path.resolve(env.OMK_BIN_DIR);
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Programs', 'orca-multiagent-kit');
  return path.join(home, '.local', 'bin');
}

const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

// Solo se reemplaza un `omk` que sea este mismo ejecutable (otra versión): nunca otra herramienta con ese nombre.
function isKitExecutable(file) {
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile()) return false;
    const bytes = fs.readFileSync(file);
    return bytes.includes(SEA_FUSE) && bytes.includes('orca-multiagent-kit');
  } catch {
    return false;
  }
}

const onPath = (dir, envPath = process.env.PATH || '') =>
  envPath.split(path.delimiter).filter(Boolean).some((p) => orcaCli.samePath(p, dir));

// Añade la carpeta al Path del usuario (HKCU\Environment) conservando su tipo (REG_EXPAND_SZ) y las
// variables sin expandir, y avisa a Windows del cambio. La ruta llega por OMK_BIN_DIR, nunca en el script.
const WIN_ADD_TO_PATH = `
$ErrorActionPreference = 'Stop'
$dir = $env:OMK_BIN_DIR
$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
try {
  $current = $key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  $parts = @($current -split ';' | Where-Object { $_ })
  if ($parts -contains $dir) { 'present'; exit 0 }
  $kind = if ($current) { $key.GetValueKind('Path') } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }
  $key.SetValue('Path', (($parts + $dir) -join ';'), $kind)
} finally { $key.Close() }
Add-Type -Namespace OmkWin -Name Env -MemberDefinition '[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern System.IntPtr SendMessageTimeout(System.IntPtr hWnd, uint msg, System.UIntPtr wParam, string lParam, uint flags, uint timeout, out System.UIntPtr result);'
$ignored = [UIntPtr]::Zero
[void][OmkWin.Env]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$ignored)
'added'
`;

function addToWindowsPath(dir) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WIN_ADD_TO_PATH], {
    encoding: 'utf8', env: { ...process.env, OMK_BIN_DIR: dir }, timeout: 60000, windowsHide: true,
  });
  if (r.error || r.status !== 0) throw new Error(`no pude añadir ${dir} al PATH del usuario: ${(r.stderr || (r.error && r.error.message) || '').trim()}`);
  return r.stdout.trim();
}

/** Copia el ejecutable autónomo a binDir() y se asegura de que esa carpeta está en el PATH. */
function installSelf({ noPath }) {
  const dir = binDir();
  const target = path.join(dir, process.platform === 'win32' ? 'omk.exe' : 'omk');
  heading('omk en el PATH');
  if (!orcaCli.samePath(process.execPath, target)) {
    if (fs.existsSync(target) && !isKitExecutable(target)) {
      warn(`${target} existe y no es el ejecutable del kit: no lo toco.`);
      todo('Define OMK_BIN_DIR con otra carpeta y repite, o borra ese fichero si es una copia vieja.');
      return false;
    }
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${target}.new`;
    fs.copyFileSync(process.execPath, tmp);
    fs.chmodSync(tmp, 0o755);
    fs.renameSync(tmp, target);
    ok(`omk copiado en ${target}`);
  } else {
    ok(`omk ya está en ${target}`);
  }
  if (onPath(dir)) { ok('Su carpeta ya está en el PATH'); return true; }
  if (noPath) { todo(`Añade ${dir} al PATH para usar omk en cualquier terminal.`); return true; }
  if (process.platform === 'win32') {
    const result = addToWindowsPath(dir);
    ok(result === 'present' ? 'Su carpeta ya estaba en el PATH del usuario' : `${dir} añadido al PATH del usuario`);
    todo('Cierra y vuelve a abrir Orca (y los terminales abiertos) para que vean omk.');
  } else {
    todo(`Añade ${dir} al PATH: echo 'export PATH="${dir}:$PATH"' >> ~/.zshrc  (o ~/.bashrc)`);
  }
  return true;
}

// --------------------------------------------------------------------------------- comandos

/**
 * omk setup: kit global, Orca abierto, plugins encendidos, plugin del kit instalado y su panel
 * abierto. Devuelve el código de salida.
 */
async function setup({ kit, args, installer, standalone, agentsHome }) {
  const opts = parseOptions(args);
  const code = await installer(opts.rest);
  if (code !== 0) return code;
  if (!applyHooks({ kit, agentsHome, dryRun: opts.dryRun, skip: opts.noHooks })) return 1;
  if (standalone && opts.dryRun) {
    heading('omk en el PATH');
    detail(`Simulación: copiaría omk a ${binDir()} y comprobaría que está en el PATH.`);
  } else if (standalone) {
    try {
      if (!installSelf(opts)) return 1;
    } catch (e) {
      fail(e.message);
      return 1;
    }
  }
  if (opts.noPlugin) return 0;

  heading('Orca');
  const orca = requireOrca(path.join(kit, 'orca-plugin'));
  if (!orca) return 1;
  if (opts.dryRun) {
    detail('Simulación: abriría Orca si no está abierto y encendería los plugins.');
    await ensurePlugin(orca, kit, opts);
    out();
    return 0;
  }
  if (!ensureRuntime(orca)) return 1;
  const on = orcaCli.runOrca(orca, ['plugin', 'system', 'on']);
  if (on.code !== 0) { fail(`No pude encender los plugins de Orca: ${on.problem}`); return 1; }
  ok('Plugins de Orca encendidos');

  const key = await ensurePlugin(orca, kit, opts);
  if (!key) return 1;
  const shown = orcaCli.runOrca(orca, ['plugin', 'open', key, '--panel', orcaCli.PANEL_ID]);
  if (shown.code === 0) ok('Panel «Multiagent Kit» abierto en la barra lateral derecha de Orca');
  else warn(`No pude abrir el panel (${shown.problem}). Está en la barra lateral derecha de Orca.`);

  out();
  out(`  ${sym.ok} ${c.bold('Entorno de Orca listo')}`);
  for (const [k, v] of [
    ['ajustes', 'panel «Multiagent Kit» o Settings → Plugins → Orca Multiagent Kit'],
    ['paleta', '«Orca Multiagent Kit: …» (verificar, inicializar, actualizar)'],
    ['proyecto', 'en el agente: «inicializa el proyecto»'],
  ]) out(`    ${c.grey(k.padEnd(10))} ${c.lime(v)}`);
  out();
  return 0;
}

/**
 * Deja el plugin del kit en la versión de este kit si ya está instalado en Orca (con el mismo flujo
 * de aprobación que setup). Es el paso de plugin de «omk update» y de «omk install». No abre Orca ni
 * instala un plugin que no estaba: eso es de «omk setup». Con `quiet` no dice nada cuando no hay
 * Orca, está cerrado o no hay plugin que actualizar. Devuelve `false` solo si algo falló.
 */
async function refreshPlugin({ kit, yes, dryRun, quiet = false }) {
  let headed = false;
  const head = () => { if (!headed) heading('Plugin de Orca'); headed = true; };
  const dir = path.join(kit, 'orca-plugin');
  const orca = orcaCli.findOrca();
  if (!orca) {
    if (process.env.OMK_ORCA) { head(); fail(`OMK_ORCA=${process.env.OMK_ORCA} no responde a «orca --version».`); return false; }
    if (!quiet) { head(); detail('No encuentro el CLI de Orca: no hay plugin que actualizar.'); }
    return true;
  }
  const status = orcaCli.runOrca(orca, ['status']);
  const runtime = status.json && status.json.result && status.json.result.runtime;
  if (!runtime || !runtime.reachable) {
    if (!quiet) {
      head();
      warn('Orca está cerrado: su plugin no se ha comprobado.');
      todo('Ábrelo y repite «omk update» (u «omk setup», que lo abre e instala el plugin).');
    }
    return true;
  }
  let installed;
  try {
    installed = listPlugin(orca);
  } catch (e) {
    head();
    fail(e.message);
    return false;
  }
  if (!installed) {
    if (!quiet) {
      head();
      detail('El plugin del kit no está instalado en Orca.');
      todo('Para instalarlo y abrir su panel: omk setup');
    }
    return true;
  }
  head();
  const need = (orcaCli.readManifest(dir).engines || {}).orca;
  if (!orcaCli.satisfies(orca.version, need)) {
    warn(`Orca ${orca.version}: el plugin de este kit necesita ${need}. Actualiza Orca y repite «omk update».`);
    return true;
  }
  const key = await ensurePlugin(orca, kit, { yes, dryRun });
  return dryRun || key !== null;
}

/** omk plugin <install|status|uninstall>. Devuelve el código de salida. */
async function plugin({ kit, args }) {
  const [sub = 'status', ...rest] = args;
  if (!['install', 'status', 'uninstall'].includes(sub)) {
    fail(`subcomando desconocido: ${sub} (install, status, uninstall)`);
    return 2;
  }
  const opts = parseOptions(rest);
  heading(`Plugin de Orca · ${sub}`);
  const orca = requireOrca(path.join(kit, 'orca-plugin'));
  if (!orca) return 1;
  const installed = listPlugin(orca);
  const { version } = orcaCli.readManifest(path.join(kit, 'orca-plugin'));

  switch (sub) {
    case 'install': {
      if (!opts.dryRun) {
        const on = orcaCli.runOrca(orca, ['plugin', 'system', 'on']);
        if (on.code !== 0) { fail(`No pude encender los plugins de Orca: ${on.problem}`); return 1; }
      }
      const key = await ensurePlugin(orca, kit, opts);
      return key || opts.dryRun ? 0 : 1;
    }
    case 'status':
      if (!installed) { warn(`No instalado. Este kit trae la v${version}: omk plugin install`); return 1; }
      ok(`${installed.pluginKey} v${installed.version} ${c.grey('(' + installed.status + ')')}`);
      if (installed.version !== version) todo(`Este kit trae la v${version}: omk plugin install`);
      return 0;
    case 'uninstall': {
      if (!installed) { ok('No estaba instalado'); return 0; }
      const r = orcaCli.runOrca(orca, ['plugin', 'uninstall', installed.pluginKey]);
      if (r.code !== 0) { fail(`Orca no lo desinstaló: ${r.problem}`); return 1; }
      ok(`${installed.pluginKey} desinstalado`);
      return 0;
    }
  }
}

/** Con el ejecutable abierto con doble clic, espera a Enter para que la ventana no se cierre sola. */
async function pauseIfAsked(code) {
  if (process.env.OMK_PAUSE === '1' && process.stdin.isTTY) {
    await ask(`\n  ${c.grey('Pulsa Enter para cerrar')} `);
  }
  return code;
}

module.exports = { setup, plugin, refreshPlugin, pauseIfAsked, parseOptions, binDir, ask };
