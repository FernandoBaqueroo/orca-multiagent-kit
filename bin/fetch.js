// De dónde sale la versión nueva del kit en «omk update», según cómo se instaló:
// - npm: `npm install -g orca-multiagent-kit@latest`.
// - ejecutable autónomo: descarga el de la última release de GitHub, comprueba su SHA-256 con el
//   `.sha256` publicado al lado y se sustituye a sí mismo.
// - una copia suelta (un clon de git, el zip): no se toca; se actualiza como se obtuvo.
// También deja omk instalado de forma permanente cuando se lanza con npx (`omk setup`).
'use strict';

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const orcaCli = require('./orca');

const REPO = 'orca-multiagent-kit';
const RELEASE_BASE = 'https://github.com/FernandoBaqueroo/orca-multiagent-kit';
// Los ejecutables que publica la release (.github/workflows/release.yml, job exe).
const EXE_ASSETS = { 'win32-x64': 'omk-windows-x64.exe', 'darwin-arm64': 'omk-macos-arm64', 'linux-x64': 'omk-linux-x64' };
const EXE_MAX_BYTES = 400 * 1024 * 1024;
const TEXT_MAX_BYTES = 4096;
const IDLE_TIMEOUT_MS = 60 * 1000;
const MAX_REDIRECTS = 5;

/** Si la versión `a` es posterior a `b` (x.y.z). */
function newer(a, b) {
  const x = orcaCli.parseVersion(a);
  const y = orcaCli.parseVersion(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/** Cómo llegó esta copia del kit: 'exe' (ejecutable autónomo), 'npm' (bajo node_modules) o 'copy'. */
function kitSource(kit, standalone) {
  if (standalone) return 'exe';
  return kit.split(/[\\/]/).includes('node_modules') ? 'npm' : 'copy';
}

/** Si el kit corre desde la caché de npx: una copia que npm puede borrar cuando quiera. */
const isTransientCopy = (kit) => kit.split(/[\\/]/).includes('_npx');

// En Windows npm es un .cmd y Node solo lo lanza a través de una shell. Los argumentos son siempre
// literales de este fichero (o la versión del kit, ya validada), nunca texto de fuera: van en una sola
// cadena, que es como Node pide llamar a una shell sin que avise de argumentos sin escapar.
const SAFE_ARG = /^[\w@.\-]+$/;
function npm(args, options = {}) {
  if (!args.every((arg) => SAFE_ARG.test(arg))) throw new Error(`argumento de npm no admitido: ${args.join(' ')}`);
  return process.platform === 'win32'
    ? spawnSync(`npm.cmd ${args.join(' ')}`, { encoding: 'utf8', shell: true, ...options })
    : spawnSync('npm', args, { encoding: 'utf8', ...options });
}

/**
 * Carpetas donde npm puede haber dejado un paquete global, de la más fiable a la menos. Primero las
 * que npm pasa por el entorno a lo que lanza (npx): lo que imprime `npm root -g` no siempre vale,
 * porque npm tapa con «***» los tramos de una ruta que le parecen un secreto (un UUID, por ejemplo).
 */
function globalRoots(env = process.env, platform = process.platform) {
  const roots = [];
  for (const prefix of [env.npm_config_global_prefix, env.npm_config_prefix]) {
    if (prefix) roots.push(platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib', 'node_modules'));
  }
  const printed = (npm(['root', '-g']).stdout || '').trim();
  if (printed) roots.push(printed);
  return [...new Set(roots)];
}

/**
 * Trae la última versión del paquete de npm. Devuelve `true` si se instaló una nueva (y hay que
 * seguir con el omk nuevo) o `false` si esta ya es la última.
 */
function fetchPackage(version, force, say) {
  const latest = (npm(['view', REPO, 'version']).stdout || '').trim();
  if (!latest) throw new Error('no se pudo consultar npm. ¿Hay conexión? Para reaplicar esta versión sin red: omk update --offline');
  if (!force && !newer(latest, version)) {
    say.current(version, newer(version, latest) ? `npm publica la ${latest}; esta copia va por delante` : '');
    return false;
  }
  say.updating(version, latest);
  // Si no se sabe dónde instala npm (ver globalRoots), no se adivina: npm dirá lo suyo si no puede escribir.
  const libdir = globalRoots().find((root) => fs.existsSync(root));
  let writable = true;
  try {
    if (libdir) fs.accessSync(libdir, fs.constants.W_OK);
    if (libdir && fs.existsSync(path.join(libdir, REPO))) fs.accessSync(path.join(libdir, REPO), fs.constants.W_OK);
  } catch {
    // Sin permiso de escritura: se explica abajo cómo arreglarlo.
    writable = false;
  }
  if (!writable) {
    throw new Error(`no tienes permiso para escribir en ${libdir} (instalaste omk con sudo o Node está en una carpeta del sistema).

  Rápido:       sudo npm i -g ${REPO}@latest && omk update --offline
  Recomendado:  que npm instale en tu carpeta de usuario, una sola vez:
                  mkdir -p ~/.npm-global && npm config set prefix ~/.npm-global
                  echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
                  sudo npm rm -g ${REPO} && npm i -g ${REPO}`);
  }
  const installed = npm(['install', '-g', `${REPO}@latest`], { stdio: 'inherit' });
  if (installed.status !== 0) throw new Error(`no se pudo actualizar con npm. Prueba: npx ${REPO}@latest setup`);
  return true;
}

/** El `bin/omk.js` del paquete instalado en global, o `undefined` si no se encuentra. */
function globalEntry(roots = globalRoots()) {
  return roots.map((root) => path.join(root, REPO, 'bin', 'omk.js')).find((file) => fs.existsSync(file));
}

/**
 * Instala esta versión de omk de forma permanente (`npm install -g`) y devuelve la ruta de su
 * `bin/omk.js`. Para cuando se lanza con npx: el plugin de Orca necesita `omk` en el PATH y una
 * carpeta del kit que no desaparezca.
 */
function installGlobal(version) {
  // `version` sale del fichero VERSION del propio kit: solo dígitos y puntos.
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`versión del kit no válida: ${version}`);
  const installed = npm(['install', '-g', `${REPO}@${version}`], { stdio: 'inherit' });
  if (installed.status !== 0) throw new Error(`no se pudo instalar omk con npm. Prueba: npm install -g ${REPO} && omk setup`);
  const roots = globalRoots();
  const entry = globalEntry(roots);
  if (!entry) throw new Error(`npm instaló ${REPO}, pero no lo encuentro en ${roots.join(' ni en ') || 'su carpeta global'}. Sigue con: omk setup`);
  return entry;
}

// Solo HTTPS. HTTP se admite únicamente contra esta misma máquina, para las pruebas: OMK_RELEASE_BASE
// cambia de dónde se descarga, pero no puede apuntar por HTTP a otra máquina.
function checkedUrl(text) {
  const url = new URL(text);
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error(`no descargo de ${url.protocol}//${url.hostname}: solo HTTPS`);
  return url;
}

/** Abre `url` y resuelve con la respuesta, siguiendo hasta `redirects` redirecciones a URLs admitidas. */
function open(urlText, redirects = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const url = checkedUrl(urlText);
    const req = (url.protocol === 'https:' ? https : http).get(url, { headers: { 'user-agent': 'omk' } }, (res) => {
      const { statusCode = 0, headers } = res;
      if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
        res.resume();
        if (redirects === 0) { reject(new Error(`demasiadas redirecciones al descargar ${url.href}`)); return; }
        resolve({ redirect: new URL(headers.location, url).href, redirects: redirects - 1 });
        return;
      }
      if (statusCode !== 200) { res.resume(); reject(new Error(`${url.href} respondió ${statusCode}`)); return; }
      resolve({ res });
    });
    req.setTimeout(IDLE_TIMEOUT_MS, () => req.destroy(new Error(`sin respuesta de ${url.hostname}`)));
    req.on('error', reject);
  });
}

async function follow(urlText) {
  let next = { redirect: urlText, redirects: MAX_REDIRECTS };
  while (next.redirect) next = await open(next.redirect, next.redirects);
  return next.res;
}

/** La versión de la última release: a dónde redirige `<base>/releases/latest` (…/releases/tag/vX.Y.Z). */
async function latestRelease(base) {
  const first = await open(`${base}/releases/latest`, MAX_REDIRECTS);
  const tag = /\/releases\/tag\/v(\d+\.\d+\.\d+)$/.exec(first.redirect || '');
  if (first.res) first.res.resume();
  if (!tag) throw new Error('no pude saber cuál es la última release (GitHub no redirigió a su tag)');
  return tag[1];
}

async function fetchText(urlText, maxBytes) {
  const res = await follow(urlText);
  const chunks = [];
  let size = 0;
  for await (const chunk of res) {
    size += chunk.length;
    if (size > maxBytes) { res.destroy(); throw new Error(`${urlText} es más grande de lo esperado`); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Descarga `urlText` en `file` (que no debe existir) y devuelve su SHA-256. */
async function download(urlText, file, maxBytes) {
  const res = await follow(urlText);
  const hash = crypto.createHash('sha256');
  // «wx»: no escribe a través de algo que ya esté ahí.
  const fd = fs.openSync(file, 'wx', 0o755);
  let size = 0;
  try {
    for await (const chunk of res) {
      size += chunk.length;
      if (size > maxBytes) { res.destroy(); throw new Error(`${urlText} es más grande de lo esperado`); }
      hash.update(chunk);
      fs.writeSync(fd, chunk);
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/**
 * Sustituye el ejecutable `target` por el de la última release si es posterior a `version` (o con
 * `force`). Lo descarga junto a él, comprueba que su SHA-256 es el del `.sha256` publicado y solo
 * entonces lo cambia; si algo falla, `target` queda como estaba. Devuelve la versión instalada, o
 * `null` si ya era la última.
 */
async function fetchExecutable({ version, target, force = false, base = process.env.OMK_RELEASE_BASE || RELEASE_BASE, platform = process.platform, arch = process.arch }) {
  const asset = EXE_ASSETS[`${platform}-${arch}`];
  if (!asset) throw new Error(`no hay ejecutable publicado para ${platform}-${arch}: actualiza con npm (npm install -g ${REPO})`);
  const latest = await latestRelease(base);
  if (!force && !newer(latest, version)) return null;
  const from = `${base}/releases/download/v${latest}/${asset}`;
  const expected = /^([0-9a-f]{64})\b/.exec((await fetchText(`${from}.sha256`, TEXT_MAX_BYTES)).trim());
  if (!expected) throw new Error(`la release v${latest} no publica un SHA-256 válido de ${asset}: no lo instalo`);
  const fresh = `${target}.new`;
  fs.rmSync(fresh, { force: true });
  try {
    const actual = await download(from, fresh, EXE_MAX_BYTES);
    if (actual !== expected[1]) throw new Error(`el ${asset} descargado no coincide con su SHA-256 publicado: no lo instalo`);
    if (platform === 'win32') {
      // Windows no deja sobrescribir un ejecutable en marcha, pero sí renombrarlo.
      const old = `${target}.old`;
      fs.rmSync(old, { force: true });
      fs.renameSync(target, old);
      try {
        fs.renameSync(fresh, target);
      } catch (e) {
        fs.renameSync(old, target);
        throw e;
      }
    } else {
      fs.renameSync(fresh, target);
    }
  } catch (e) {
    fs.rmSync(fresh, { force: true });
    throw e;
  }
  return latest;
}

module.exports = { REPO, RELEASE_BASE, newer, kitSource, isTransientCopy, globalRoots, globalEntry, fetchPackage, installGlobal, fetchExecutable };
