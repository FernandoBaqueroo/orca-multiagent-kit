// Copias de seguridad de lo que omk cambia fuera de install.sh (ficheros de proyecto, settings.json
// de Claude Code), en el mismo sitio y con el mismo formato que las de install.sh: «omk restore
// <fecha>» las deshace igual.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const stampNow = () => {
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
};

/**
 * Ruta de un fichero dentro de una copia de seguridad, como la escribe install.sh (backup_rel):
 * relativa a la carpeta del usuario si cuelga de ella; si no, bajo `_abs/` con su ruta absoluta
 * (en Windows, con la unidad como la ve Git Bash: C:\x -> _abs/c/x).
 */
function backupRel(file, home = process.env.HOME || os.homedir(), platform = process.platform) {
  const rel = path.relative(home, file);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel.split(path.sep).join('/');
  const posix = file.split(path.sep).join('/');
  if (platform !== 'win32') return `_abs${posix}`;
  const drive = /^([A-Za-z]):\/(.*)$/.exec(posix);
  if (!drive) throw new Error(`no sé respaldar una ruta sin unidad: ${file}`);
  return `_abs/${drive[1].toLowerCase()}/${drive[2]}`;
}

/** Una copia de seguridad nueva en `<agentsHome>/backups/<fecha>`: su fecha y la función que copia un fichero a ella. */
function makeBackup(agentsHome) {
  const stamp = stampNow();
  return {
    stamp,
    backup(file) {
      const target = path.join(agentsHome, 'backups', stamp, backupRel(file));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file, target);
    },
  };
}

module.exports = { backupRel, makeBackup };
