// omk team: el equipo de roles del proyecto en ORCHESTRATION.md §1 (proveedores activos, revisión
// cruzada, las filas «Rol <nombre>» de la tabla de excepciones y los roles propios del proyecto).
// El panel Equipo del plugin lo usa con --data.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Roles de Olimpo que se fijan a un proveedor (skills/orca/references/olimpo.md); Hefesto coordina. */
const ROLES = [
  ['dedalo', 'Dédalo'], ['casandra', 'Casandra'], ['temis', 'Temis'], ['ariadna', 'Ariadna'],
  ['persefone', 'Perséfone'], ['proteo', 'Proteo'], ['narciso', 'Narciso'], ['icaro', 'Ícaro'],
  ['argos', 'Argos'], ['atlas', 'Atlas'], ['clio', 'Clío'],
];
const ROLE_NAME = new Map(ROLES);
const RESERVED = new Set(['Hefesto', ...ROLE_NAME.values()].map((name) => name.toLocaleLowerCase('es')));
const CROSS = { sensibles: 'unidades L y sensibles', todas: 'todas', nunca: 'nunca' };
const LEVELS = ['alto', 'medio', 'bajo'];
// Columna «Revisión» de los roles propios, como la escribe olimpo.md.
const REVIEW = { propia: 'propia', cross: '`cross`', argos: 'Argos', casandra: 'Casandra' };
const AGENT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const CUSTOM_NAME = /^\p{L}[\p{L}\p{M}\p{N} -]{0,29}$/u;
const MAX_PROVIDERS = 8;
const MAX_CUSTOM = 10;
const WORK_MAX = 80;
const GUARD_MAX = 120;
// Las filas que escribe omk team: las demás son del usuario y no se tocan.
const MARK = 'equipo (omk team)';
const CUSTOM_MARK = '<!-- omk team -->';

const PROVIDERS_LINE = /^(\s*- Proveedores activos:)[ \t]*(.*?)([ \t]*<!--.*-->)?[ \t]*$/;
const CROSS_LINE = /^(\s*- Revisión cruzada[^:]*:)[ \t]*(.*?)[ \t]*$/;
const EXCEPTIONS_LINE = /^\s*- Excepciones al reparto/;
const CUSTOM_LINE = /^\s*- Roles propios del proyecto/;
const TABLE_LINE = /^\s*\|/;

const HELP = `Uso:
  omk team [show] [--file ruta]      Enseña el equipo de ORCHESTRATION.md
  omk team set [opciones]            Lo cambia
    --provider <id>                  Proveedor activo (repetible; sustituye la lista)
    --cross sensibles|todas|nunca    Qué unidades revisa otro proveedor
    --role <rol>=<id>|auto           Fija el proveedor de un rol (repetible); auto lo quita
    --reset-roles                    Quita antes los roles fijados por omk team
    --data <base64url>               El equipo entero en JSON (lo usa el panel del plugin);
                                     sustituye proveedores, revisión, roles fijados y roles propios
    --file <ruta>                    Otro ORCHESTRATION.md (por defecto, el de la carpeta actual)
Roles: ${ROLES.map(([id]) => id).join(', ')}`;

class TeamError extends Error {}

/** Texto de una celda de tabla: una línea, sin `|`, `<`, `>` ni caracteres de control o formato. */
function cellText(value, max, field) {
  if (typeof value !== 'string') throw new TeamError(`--data: ${field} no es texto`);
  const clean = value.replace(/[|<>\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length > max) throw new TeamError(`--data: ${field} pasa de ${max} caracteres`);
  return clean;
}

/** El equipo que manda el panel, validado entero; nada que no encaje llega al fichero. */
function parseData(encoded) {
  if (!/^[A-Za-z0-9_-]{1,8000}$/.test(encoded)) throw new TeamError('--data no es base64url');
  let data;
  try {
    data = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch (e) {
    throw new TeamError(`--data no es un equipo en JSON: ${e.message}`);
  }
  if (!data || typeof data !== 'object' || data.v !== 1) throw new TeamError('--data: versión de equipo desconocida');
  const { providers, cross, roles, custom } = data;
  if (!Array.isArray(providers) || !providers.length || providers.length > MAX_PROVIDERS
    || !providers.every((id) => typeof id === 'string' && AGENT_ID.test(id)) || new Set(providers).size !== providers.length) {
    throw new TeamError('--data: proveedores no válidos');
  }
  if (!Object.hasOwn(CROSS, cross)) throw new TeamError('--data: revisión cruzada no válida');
  if (!roles || typeof roles !== 'object' || Array.isArray(roles)) throw new TeamError('--data: roles no válidos');
  const fixed = new Map();
  for (const [role, provider] of Object.entries(roles)) {
    if (!ROLE_NAME.has(role) || !providers.includes(provider)) throw new TeamError(`--data: rol no válido: ${role}`);
    fixed.set(role, provider);
  }
  if (!Array.isArray(custom) || custom.length > MAX_CUSTOM) throw new TeamError('--data: roles propios no válidos');
  const names = new Set();
  const own = custom.map((role, i) => {
    const field = (name) => `rol propio ${i + 1}: ${name}`;
    if (!role || typeof role !== 'object') throw new TeamError(`--data: ${field('no es un objeto')}`);
    const name = typeof role.name === 'string' ? role.name.trim() : '';
    const key = name.toLocaleLowerCase('es');
    if (!CUSTOM_NAME.test(name) || RESERVED.has(key) || names.has(key)) throw new TeamError(`--data: ${field('nombre no válido o repetido')}`);
    names.add(key);
    const work = cellText(role.work, WORK_MAX, field('qué hace'));
    if (!work) throw new TeamError(`--data: ${field('falta qué hace')}`);
    if (!LEVELS.includes(role.level)) throw new TeamError(`--data: ${field('nivel no válido')}`);
    if (!Object.hasOwn(REVIEW, role.review)) throw new TeamError(`--data: ${field('revisión no válida')}`);
    if (role.provider !== null && !providers.includes(role.provider)) throw new TeamError(`--data: ${field('proveedor no activo')}`);
    return { name, work, level: role.level, review: role.review, guard: cellText(role.guard, GUARD_MAX, field('guardarraíl')), provider: role.provider };
  });
  return { providers, cross, roles: fixed, custom: own };
}

function parseArgs(args) {
  const [first, ...rest] = args;
  const action = first === 'set' ? 'set' : 'show';
  const opts = { action, file: null, providers: [], cross: null, roles: new Map(), resetRoles: false, custom: null };
  const list = first === 'set' || first === 'show' ? rest : args;
  for (let i = 0; i < list.length; i += 1) {
    const arg = list[i];
    const value = () => {
      const next = list[i + 1];
      if (next === undefined || next.startsWith('--')) throw new TeamError(`falta el valor de ${arg}`);
      i += 1;
      return next;
    };
    if (arg === '--file') opts.file = value();
    else if (action === 'show') throw new TeamError(`opción desconocida para omk team: ${arg}\n${HELP}`);
    else if (arg === '--reset-roles') opts.resetRoles = true;
    else if (arg === '--data') {
      const data = parseData(value());
      opts.providers = data.providers;
      opts.cross = data.cross;
      opts.roles = data.roles;
      opts.resetRoles = true;
      opts.custom = data.custom;
    } else if (arg === '--provider') {
      const id = value();
      if (!AGENT_ID.test(id)) throw new TeamError(`«${id}» no es un id de agente (minúsculas, números y guiones)`);
      if (!opts.providers.includes(id)) opts.providers.push(id);
    } else if (arg === '--cross') {
      const mode = value();
      if (!Object.hasOwn(CROSS, mode)) throw new TeamError(`--cross admite sensibles, todas o nunca, no «${mode}»`);
      opts.cross = mode;
    } else if (arg === '--role') {
      const [role, provider, extra] = value().split('=');
      if (!ROLE_NAME.has(role)) throw new TeamError(`rol desconocido: «${role}». Roles: ${ROLES.map(([id]) => id).join(', ')}`);
      if (extra !== undefined || provider === undefined || (provider !== 'auto' && !AGENT_ID.test(provider))) {
        throw new TeamError('--role espera <rol>=<id de agente> o <rol>=auto');
      }
      opts.roles.set(role, provider);
    } else throw new TeamError(`opción desconocida: ${arg}\n${HELP}`);
  }
  if (action === 'set' && !opts.providers.length && !opts.cross && !opts.roles.size && !opts.resetRoles) {
    throw new TeamError(`omk team set sin cambios\n${HELP}`);
  }
  return opts;
}

const cells = (line) => line.replace(CUSTOM_MARK, '').trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
const isEmptyRow = (line) => cells(line).every((cell) => cell === '');

/** La tabla que sigue a la línea `heading` de §1: índices de su primera fila de datos y de su final. */
function tableAfter(lines, heading) {
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && TABLE_LINE.test(lines[end])) end += 1;
  // Cabecera y separador: las filas empiezan detrás.
  if (end - start - 1 < 2) return null;
  return { rows: start + 3, end, indent: lines[start + 1].match(/^\s*/)[0], columns: cells(lines[start + 1]).length };
}

/** Una fila de excepción escrita por omk team: «Rol X | X / proveedor | equipo (omk team)». */
function managedRow(line) {
  const [rol, fixed, reason] = cells(line);
  if (reason !== MARK || !rol || !fixed) return null;
  const [name, provider] = fixed.split('/').map((part) => part.trim());
  return name && provider ? { name, provider } : null;
}

const isCustomRow = (line) => line.includes(CUSTOM_MARK);

function customRow(line) {
  const [name, work, level, review, guard = ''] = cells(line);
  return { name: name.replace(/^\*\*|\*\*$/g, ''), work, level, review, guard };
}

/** Lo que dice ORCHESTRATION.md del equipo; `null` en lo que no encuentra. */
function readTeam(text) {
  const lines = text.split(/\r?\n/);
  const providersLine = lines.find((line) => PROVIDERS_LINE.test(line));
  const crossLine = lines.find((line) => CROSS_LINE.test(line));
  const exceptions = tableAfter(lines, EXCEPTIONS_LINE);
  const rows = exceptions ? lines.slice(exceptions.rows, exceptions.end) : [];
  const fixed = rows.map(managedRow).filter(Boolean);
  const customTable = tableAfter(lines, CUSTOM_LINE);
  const custom = customTable ? lines.slice(customTable.rows, customTable.end).filter(isCustomRow).map(customRow) : [];
  return {
    providers: providersLine
      ? providersLine.match(PROVIDERS_LINE)[2].split(/[\s,]+/).filter((id) => id !== '')
      : null,
    cross: crossLine ? crossLine.match(CROSS_LINE)[2] : null,
    roles: fixed
      .map(({ name, provider }) => ({ id: ROLES.find(([, roleName]) => roleName === name)?.[0], provider }))
      .filter(({ id }) => id),
    custom: custom.map((role) => ({ ...role, provider: fixed.find(({ name }) => name === role.name)?.provider ?? null })),
    others: rows.filter((line) => !managedRow(line) && !isEmptyRow(line)).length,
    hasTable: exceptions !== null,
    hasCustomTable: customTable !== null,
  };
}

/** Sustituye las filas de una tabla por `rows`, o deja la fila vacía de la plantilla si no hay ninguna. */
function replaceRows(lines, table, rows) {
  const empty = `${table.indent}|${' |'.repeat(table.columns)}`;
  lines.splice(table.rows, table.end - table.rows, ...(rows.length ? rows : [empty]));
}

/** El texto con los cambios de `opts` aplicados; mismo final de línea que el original. */
function applyTeam(text, opts) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const current = readTeam(text);

  if (opts.providers.length) {
    const at = lines.findIndex((line) => PROVIDERS_LINE.test(line));
    if (at === -1) throw new TeamError('ORCHESTRATION.md no tiene la línea «- Proveedores activos:» de §1 (regenérala con kit-init)');
    const [, label, , comment = ''] = lines[at].match(PROVIDERS_LINE);
    lines[at] = `${label} ${opts.providers.join(', ')}${comment}`;
  }
  if (opts.cross) {
    const at = lines.findIndex((line) => CROSS_LINE.test(line));
    if (at === -1) throw new TeamError('ORCHESTRATION.md no tiene la línea «- Revisión cruzada …:» de §1 (regenérala con kit-init)');
    lines[at] = `${lines[at].match(CROSS_LINE)[1]} ${CROSS[opts.cross]}`;
  }

  const active = opts.providers.length ? opts.providers : current.providers;
  for (const [role, provider] of opts.roles) {
    if (provider !== 'auto' && active && !active.includes(provider)) {
      throw new TeamError(`${ROLE_NAME.get(role)}: «${provider}» no está entre los proveedores activos (${active.join(', ')})`);
    }
  }

  // Roles propios: la tabla de §1 y, para los que llevan proveedor, su fila de excepción.
  let custom = current.custom.map(({ name, provider }) => ({ name, provider }));
  if (opts.custom) {
    const table = tableAfter(lines, CUSTOM_LINE);
    if (!table) throw new TeamError('ORCHESTRATION.md no tiene la tabla «Roles propios del proyecto» de §1 (regenérala con kit-init)');
    const own = lines.slice(table.rows, table.end).filter((line) => !isCustomRow(line) && !isEmptyRow(line));
    const rows = opts.custom.map(({ name, work, level, review, guard }) =>
      `${table.indent}| **${name}** | ${work} | ${level} | ${REVIEW[review]} | ${guard} | ${CUSTOM_MARK}`);
    replaceRows(lines, table, [...own, ...rows]);
    custom = opts.custom;
  }

  if (opts.roles.size || opts.resetRoles || opts.custom) {
    const table = tableAfter(lines, EXCEPTIONS_LINE);
    if (!table) throw new TeamError('ORCHESTRATION.md no tiene la tabla «Excepciones al reparto por roles» de §1 (regenérala con kit-init)');
    const fixed = new Map(opts.resetRoles ? [] : current.roles.map(({ id, provider }) => [id, provider]));
    for (const [role, provider] of opts.roles) {
      if (provider === 'auto') fixed.delete(role);
      else fixed.set(role, provider);
    }
    // Las excepciones del usuario se quedan; las de omk team se reescriben: Olimpo y luego los propios.
    const own = lines.slice(table.rows, table.end).filter((line) => !managedRow(line) && !isEmptyRow(line));
    const row = (name, provider) => `${table.indent}| Rol ${name} | ${name} / ${provider} | ${MARK} |`;
    const team = [
      ...ROLES.filter(([id]) => fixed.has(id)).map(([id, name]) => row(name, fixed.get(id))),
      ...custom.filter(({ provider }) => provider).map(({ name, provider }) => row(name, provider)),
    ];
    replaceRows(lines, table, [...own, ...team]);
  }
  return lines.join(eol);
}

function describe(file, team) {
  const pad = (label) => `  ${label.padEnd(21)}`;
  const out = [`Equipo de ${file}`];
  out.push(`${pad('Proveedores activos')}${team.providers?.length ? team.providers.join(', ') : 'sin línea en §1'}`);
  const cross = team.cross === null ? 'sin línea en §1' : team.cross.includes('|') ? `sin elegir (${team.cross})` : team.cross;
  out.push(`${pad('Revisión cruzada')}${cross}`);
  if (!team.hasTable) out.push(`${pad('Roles fijados')}sin tabla de excepciones en §1`);
  else if (!team.roles.length) out.push(`${pad('Roles fijados')}ninguno: todos los elige el coordinador (olimpo.md)`);
  else {
    const names = team.roles.map(({ id, provider }) => `${ROLE_NAME.get(id)} → ${provider}`).join(', ');
    out.push(`${pad('Roles fijados')}${names}`);
    out.push(`${pad('')}los demás los elige el coordinador (olimpo.md)`);
  }
  if (team.custom.length) {
    team.custom.forEach(({ name, work, level, provider }, i) => {
      out.push(`${pad(i === 0 ? 'Roles propios' : '')}${name} (${level}): ${work}${provider ? ` → ${provider}` : ''}`);
    });
  } else if (team.hasCustomTable) out.push(`${pad('Roles propios')}ninguno de omk team`);
  if (team.others) out.push(`${pad('Otras excepciones')}${team.others} (tuyas; omk team no las toca)`);
  return out.join('\n');
}

/** omk team: devuelve el código de salida. */
function main(args, { cwd = process.cwd(), out = console.log, err = console.error } = {}) {
  try {
    if (args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
      out(HELP);
      return 0;
    }
    const opts = parseArgs(args);
    const file = path.resolve(cwd, opts.file || 'ORCHESTRATION.md');
    if (!fs.existsSync(file)) {
      throw new TeamError(`no hay ${path.basename(file)} en ${path.dirname(file)}: prepara el proyecto con «inicializa el proyecto» (kit-init) u «omk init»`);
    }
    const text = fs.readFileSync(file, 'utf8');
    if (opts.action === 'set') {
      const next = applyTeam(text, opts);
      if (next !== text) {
        // Escritura atómica: un corte a medias no deja ORCHESTRATION.md truncado.
        const tmp = `${file}.omk-${process.pid}.tmp`;
        fs.writeFileSync(tmp, next);
        try {
          fs.renameSync(tmp, file);
        } catch (e) {
          fs.rmSync(tmp, { force: true });
          throw e;
        }
      }
      out(next === text ? 'Sin cambios: el equipo ya era ese.' : 'Equipo guardado.');
      out(describe(file, readTeam(next)));
      return 0;
    }
    out(describe(file, readTeam(text)));
    return 0;
  } catch (e) {
    // 2: lo pedido no vale; 1: no se pudo leer o escribir el fichero.
    err(`omk team: ${e.message}`);
    return e instanceof TeamError ? 2 : 1;
  }
}

module.exports = { main, parseArgs, readTeam, applyTeam, ROLES, MARK };
