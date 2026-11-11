// Punto de entrada del ejecutable autónomo (Node SEA, scripts/build-exe.js): extrae el kit que lleva
// dentro a una carpeta estable y ejecuta omk desde ahí. Sin argumentos (doble clic) hace `omk setup`.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');
const sea = require('node:sea');

const ASSET = 'kit.json.gz';
const STAMP = '.omk-build';
// Marca de una extracción a medias: solo se borra una carpeta .new que la tenga.
const PARTIAL = '.omk-partial';

/** Carpeta del kit extraído: OMK_HOME, o la de usuario de cada sistema. */
function kitHome(env = process.env, platform = process.platform, home = os.homedir()) {
  if (env.OMK_HOME) return path.resolve(env.OMK_HOME);
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Programs', 'orca-multiagent-kit', 'kit');
  return path.join(home, '.local', 'share', 'orca-multiagent-kit');
}

const isKitCopy = (dir) => fs.existsSync(path.join(dir, 'VERSION')) && fs.existsSync(path.join(dir, 'install.sh'));

// Las rutas vienen del propio ejecutable, pero se comprueban igual: ninguna sale de la carpeta destino.
function safeJoin(base, rel) {
  const target = path.resolve(base, rel);
  if (path.isAbsolute(rel) || !target.startsWith(base + path.sep)) throw new Error(`ruta no válida en el kit embebido: ${rel}`);
  return target;
}

function removeOwned(dir, marker) {
  if (!fs.existsSync(dir)) return;
  if (!fs.existsSync(path.join(dir, marker)) && !isKitCopy(dir)) throw new Error(`${dir} existe y no es una copia del kit: no la toco`);
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Extrae el kit embebido en `dest` si no está ya esta misma build. Devuelve `dest`. */
function extractKit(dest) {
  const archive = Buffer.from(sea.getAsset(ASSET));
  const build = crypto.createHash('sha256').update(archive).digest('hex');
  try {
    if (fs.readFileSync(path.join(dest, STAMP), 'utf8').trim() === build) return dest;
  } catch {
    // Sin sello: primera vez, o una copia que no salió de este ejecutable. Se extrae.
  }
  if (fs.existsSync(dest) && !isKitCopy(dest)) {
    throw new Error(`${dest} existe y no es una copia del kit: no la toco. Define OMK_HOME con otra carpeta.`);
  }
  const { files } = JSON.parse(zlib.gunzipSync(archive).toString('utf8'));
  const fresh = `${dest}.new`;
  removeOwned(fresh, PARTIAL);
  fs.mkdirSync(fresh, { recursive: true });
  fs.writeFileSync(path.join(fresh, PARTIAL), '');
  for (const [rel, mode, data] of files) {
    const target = safeJoin(fresh, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(data, 'base64'), { mode });
  }
  fs.writeFileSync(path.join(fresh, STAMP), build + '\n');
  fs.rmSync(path.join(fresh, PARTIAL));
  // Cambio casi atómico: la copia anterior solo se borra cuando la nueva ya está en su sitio.
  const old = `${dest}.old`;
  removeOwned(old, STAMP);
  if (fs.existsSync(dest)) fs.renameSync(dest, old);
  fs.renameSync(fresh, dest);
  fs.rmSync(old, { recursive: true, force: true });
  return dest;
}

function main() {
  // El ejecutable recibe [ejecutable, ejecutable, ...args]: omk.js lee desde el tercero.
  if (process.argv.length <= 2) {
    process.argv.push('setup');
    process.env.OMK_PAUSE = '1';
  }
  let kit;
  try {
    kit = extractKit(kitHome());
  } catch (error) {
    process.stderr.write(`omk: no pude preparar el kit: ${error.message}\n`);
    process.exitCode = 1;
    // Abierto con doble clic, la ventana se cerraría antes de poder leer el error.
    if (process.env.OMK_PAUSE === '1' && process.stdin.isTTY) {
      process.stdout.write('\nPulsa Enter para cerrar ');
      process.stdin.once('data', () => process.exit(1));
    }
    return;
  }
  createRequire(path.join(kit, 'bin', 'omk.js'))('./omk.js');
}

main();
