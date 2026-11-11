#!/usr/bin/env node
// Construye el ejecutable autónomo de omk para el sistema y la arquitectura donde se ejecuta, con el
// Node que lo ejecuta (Node SEA, https://nodejs.org/api/single-executable-applications.html):
//   node scripts/build-exe.js        -> dist/omk-<sistema>-<arquitectura>[.exe] y su .sha256
// El kit va dentro como un único recurso (kit.json.gz); bin/sea.js lo extrae al arrancar.
// Necesita red la primera vez: postject (de nodejs) se descarga con npx, fijado a una versión.
'use strict';

const { execFileSync, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const WORK = path.join(DIST, 'sea');
const POSTJECT = 'postject@1.0.0-alpha.6';
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
// Lo mismo que lleva el zip de la release (scripts/build-release.sh).
const CONTENT = ['README.md', 'LICENSE', 'CHANGELOG.md', 'AI_INSTALL.md', 'GUIA.html', 'VERSION', 'install.sh', 'package.json',
  'bin', 'speckit-extension', 'core', 'rules', 'skills', 'templates', 'output-styles', 'docs', 'assets', 'orca-plugin'];
const SKIP = new Set(['.orca', 'node_modules', '.DS_Store']);
const PLATFORM = { win32: 'windows', darwin: 'macos', linux: 'linux' };

function fail(message) {
  process.stderr.write(`build-exe: ${message}\n`);
  process.exit(1);
}

// Los recursos de SEA (sea.getAsset) llegaron en Node 20.12 y 21.7.
function checkNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 20 || (major === 20 && minor < 12)) fail(`hace falta Node >= 20.12 (este es ${process.versions.node})`);
  if (!PLATFORM[process.platform]) fail(`sistema no soportado: ${process.platform}`);
}

function* walk(rel) {
  const abs = path.join(ROOT, rel);
  if (fs.statSync(abs).isFile()) { yield rel; return; }
  for (const entry of fs.readdirSync(abs).sort()) {
    if (!SKIP.has(entry)) yield* walk(path.join(rel, entry));
  }
}

// Git en Windows no guarda el bit de ejecución: se decide por tipo de fichero.
const modeOf = (rel) => (/\.sh$/.test(rel) || /^bin[\\/].*\.js$/.test(rel) ? 0o755 : 0o644);

function packKit() {
  const files = [];
  for (const top of CONTENT) {
    for (const rel of walk(top)) files.push([rel.split(path.sep).join('/'), modeOf(rel), fs.readFileSync(path.join(ROOT, rel)).toString('base64')]);
  }
  const archive = zlib.gzipSync(JSON.stringify({ files }), { level: 9 });
  const file = path.join(WORK, 'kit.json.gz');
  fs.writeFileSync(file, archive);
  return { file, count: files.length, bytes: archive.length };
}

function run(file, args) {
  execFileSync(file, args, { stdio: 'inherit' });
}

// npx es npx.cmd en Windows, que Node solo lanza a través de cmd: los argumentos son nuestros y se
// comprueba que ninguno lleve comillas antes de componer la línea.
function npx(args) {
  if (process.platform !== 'win32') return run('npx', args);
  if (args.some((a) => a.includes('"'))) fail('argumento con comillas para npx');
  // El nombre va sin comillas: entre comillas, npx.cmd calcula mal su propia carpeta (%~dp0).
  const r = spawnSync(['npx.cmd', ...args.map((a) => `"${a}"`)].join(' '), { stdio: 'inherit', shell: true });
  if (r.status !== 0) fail(`npx salió con ${r.status}`);
}

function build() {
  checkNode();
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });

  const kit = packKit();
  console.log(`kit v${version}: ${kit.count} ficheros, ${(kit.bytes / 1024).toFixed(0)} KiB comprimidos`);

  const blob = path.join(WORK, 'sea-prep.blob');
  const config = path.join(WORK, 'sea-config.json');
  fs.writeFileSync(config, JSON.stringify({
    main: path.join(ROOT, 'bin', 'sea.js'),
    output: blob,
    disableExperimentalSEAWarning: true,
    // La caché de código y la instantánea atan el binario a la versión exacta de V8; sin ellas arranca igual.
    useSnapshot: false,
    useCodeCache: false,
    assets: { 'kit.json.gz': kit.file },
  }, null, 2));
  run(process.execPath, ['--experimental-sea-config', config]);

  const exe = path.join(DIST, `omk-${PLATFORM[process.platform]}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`);
  fs.rmSync(exe, { force: true });
  fs.copyFileSync(process.execPath, exe);
  fs.chmodSync(exe, 0o755);
  if (process.platform === 'darwin') run('codesign', ['--remove-signature', exe]);
  npx(['--yes', POSTJECT, exe, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', FUSE,
    ...(process.platform === 'darwin' ? ['--macho-segment-name', 'NODE_SEA'] : [])]);
  // macOS no ejecuta un binario sin firmar en Apple Silicon: firma ad hoc (sin identidad de desarrollador).
  if (process.platform === 'darwin') run('codesign', ['--sign', '-', exe]);

  const sum = crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex');
  fs.writeFileSync(`${exe}.sha256`, `${sum}  ${path.basename(exe)}\n`);
  fs.rmSync(WORK, { recursive: true, force: true });
  console.log(`${path.relative(ROOT, exe)}  ${(fs.statSync(exe).size / 1048576).toFixed(1)} MiB  sha256 ${sum}`);
}

build();
