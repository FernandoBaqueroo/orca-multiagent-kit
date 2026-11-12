// Pone al día un fichero de proyecto generado desde una plantilla del kit (ORCHESTRATION.md, STACK.md)
// con las secciones y los campos que la plantilla tiene y el fichero no. Solo añade: nada de lo escrito
// en el proyecto se cambia, se mueve ni se borra. Lo usa «omk update».
// Al final del fichero deja un sello con los apartados de la plantilla que ya ha ofrecido: así, lo que
// el proyecto borre a propósito no vuelve en la siguiente actualización y solo entra lo que la
// plantilla estrena.
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

const HEADING = /^##\s+(.+?)\s*$/;
const FENCE = /^\s*(```|~~~)/;
// Un campo: una viñeta de primer nivel, con el guion de la plantilla o con «*» o «+».
const ITEM = /^[-*+] \S/;
const LABEL_MAX = 80;
const STAMP = /^<!-- omk:plantilla((?: [0-9a-f]{6})*) .*-->$/;
const STAMP_NOTE = 'apartados de la plantilla del kit ya ofrecidos: lo que borres no vuelve con «omk update»';

/** Texto comparable: sin comentarios, paréntesis, formato, tildes ni signos. */
const norm = (text) => text
  .replace(/<!--.*?-->/g, ' ')
  .replace(/\([^)]*\)/g, ' ')
  .replace(/[`*_]/g, '')
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

/** Identificador corto y estable de un apartado de la plantilla, para el sello. */
const idOf = (section, field = '') => crypto.createHash('sha256').update(`${section}\n${field}`).digest('hex').slice(0, 6);

/** «3. Entorno de worktree» -> su número y su nombre comparable; lo que sigue a «:» es un valor. */
function sectionId(title) {
  const m = /^(\d+)[.)]?\s*(.*)$/.exec(title);
  return { number: m ? m[1] : null, name: norm((m ? m[2] : title).split(':')[0]) };
}

/** La etiqueta de un campo «- Etiqueta (aclaración): valor»; sin «:», la línea entera. */
function labelOf(line) {
  const text = line.slice(2).replace(/<!--.*?-->/g, ' ').replace(/\([^)]*\)/g, ' ');
  const colon = text.indexOf(':');
  return norm(colon === -1 ? text : text.slice(0, colon)).slice(0, LABEL_MAX);
}

/** Lo que se enseña de un campo añadido: su etiqueta como está en la plantilla, sin la aclaración. */
function labelText(line) {
  const text = line.slice(2).replace(/<!--.*?-->/g, ' ').replace(/\([^)]*\)/g, ' ');
  const colon = text.indexOf(':');
  return (colon === -1 ? text : text.slice(0, colon)).replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX);
}

/** La misma etiqueta, o una que empieza igual con dos palabras o más (alguien la acortó o la alargó). */
function sameLabel(a, b) {
  if (a === '' || b === '') return false;
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.split(' ').length >= 2 && long.startsWith(`${short} `);
}

/** Las líneas en secciones «## …»; la primera (sin `heading`) es lo que va antes de todas. */
function parse(lines) {
  const sections = [];
  let current = { heading: null, number: null, name: '', lines: [] };
  let fenced = false;
  for (const line of lines) {
    if (FENCE.test(line)) fenced = !fenced;
    const m = fenced ? null : HEADING.exec(line);
    if (m) {
      sections.push(current);
      current = { heading: line, ...sectionId(m[1]), lines: [] };
    } else current.lines.push(line);
  }
  sections.push(current);
  return sections;
}

/** Separa las líneas en blanco del final. */
function splitTail(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end -= 1;
  return { body: lines.slice(0, end), tail: lines.slice(end) };
}

/** Los campos de una sección: cada viñeta de primer nivel con lo que cuelga de ella. El primero es lo de antes. */
function blocksOf(lines) {
  const blocks = [{ key: '', lines: [] }];
  let fenced = false;
  for (const line of lines) {
    const fence = FENCE.test(line);
    const key = !fenced && !fence && ITEM.test(line) ? labelOf(line) : '';
    if (fence) fenced = !fenced;
    if (key) blocks.push({ key, lines: [line] });
    else blocks[blocks.length - 1].lines.push(line);
  }
  return blocks;
}

/**
 * Añade a la sección del proyecto los campos de la plantilla que le faltan y que `wants(id)` deja
 * pasar, cada uno tras su vecino. Apunta en `known` todos los campos de la plantilla.
 */
function mergeFields(template, project, { added, known, wants }) {
  const { body, tail } = splitTail(project.lines);
  const wanted = blocksOf(splitTail(template.lines).body);
  const have = blocksOf(body);
  const indexOf = (key) => have.findIndex((block) => sameLabel(block.key, key));
  wanted.forEach((block, i) => {
    if (i === 0) return;
    const id = idOf(template.name, block.key);
    known.add(id);
    if (indexOf(block.key) !== -1 || !wants(id)) return;
    let at = 1;
    for (let j = i - 1; j >= 1; j -= 1) {
      const anchor = indexOf(wanted[j].key);
      if (anchor !== -1) { at = anchor + 1; break; }
    }
    have.splice(at, 0, { key: block.key, lines: [...block.lines] });
    added.push(`${project.heading.replace(/^##\s+/, '§')} · «${labelText(block.lines[0])}»`);
  });
  project.lines = [...have.flatMap((block) => block.lines), ...tail];
}

/** Qué sección del proyecto corresponde a cada una de la plantilla: por nombre y, si no, por número. */
function matchSections(template, project) {
  const match = new Map();
  const taken = new Set();
  const pair = (same) => template.forEach((section, ti) => {
    if (ti === 0 || match.has(ti)) return;
    const pi = project.findIndex((candidate, i) => i > 0 && !taken.has(i) && same(section, candidate));
    if (pi !== -1) { match.set(ti, pi); taken.add(pi); }
  });
  pair((a, b) => sameLabel(a.name, b.name));
  pair((a, b) => a.number !== null && a.number === b.number);
  return match;
}

/**
 * El fichero del proyecto con lo que la plantilla tiene de más y su sello al día.
 *
 * - Con sello: entra solo lo que la plantilla estrena desde entonces. Lo que el sello ya conocía y
 *   el fichero no tiene se borró a propósito y no vuelve.
 * - Sin sello (primera vez): con `firstRun: 'add'` entra todo lo que falte; con `'stamp'` no entra
 *   nada y solo se sella (para un fichero del que se pide borrar lo que no aplique, como STACK.md).
 *
 * Devuelve `text` (con los finales de línea del proyecto), `added` (lo añadido) y `changed`.
 */
function syncTemplate(templateText, projectText, { firstRun = 'add' } = {}) {
  const lines = projectText.split(/\r?\n/);
  const endsWithNewline = /\n$/.test(projectText);
  if (endsWithNewline) lines.pop();
  // El sello es la última línea con contenido; lo demás es el documento.
  const { body: content } = splitTail(lines);
  const stamped = content.length > 0 ? STAMP.exec(content[content.length - 1]) : null;
  const document = stamped ? splitTail(content.slice(0, -1)).body : content;
  const offered = stamped ? new Set(stamped[1].trim().split(' ').filter(Boolean)) : null;
  const wants = (id) => (offered ? !offered.has(id) : firstRun === 'add');

  const template = parse(templateText.split(/\r?\n/));
  const project = parse(document);
  const match = matchSections(template, project);
  const added = [];
  const known = new Set();
  // Secciones nuevas: cada una va detrás de la sección del proyecto que la precede en la plantilla.
  const inserts = new Map();
  let anchor = 0;
  template.forEach((section, ti) => {
    if (ti === 0) return;
    const id = idOf(section.name);
    known.add(id);
    const pi = match.get(ti);
    if (pi !== undefined) {
      mergeFields(section, project[pi], { added, known, wants });
      anchor = pi;
      return;
    }
    // Sus campos también quedan ofrecidos: si la sección entra ahora y luego se borra uno, no vuelve.
    for (const block of blocksOf(section.lines).slice(1)) known.add(idOf(section.name, block.key));
    if (!wants(id)) return;
    inserts.set(anchor, [...(inserts.get(anchor) || []), section]);
    added.push(`sección «${section.heading.replace(/^##\s+/, '')}»`);
  });

  const out = [];
  project.forEach((section, pi) => {
    if (section.heading !== null) out.push(section.heading);
    out.push(...section.lines);
    for (const extra of inserts.get(pi) || []) {
      if (out.length > 0 && out[out.length - 1].trim() !== '') out.push('');
      out.push(extra.heading, ...splitTail(extra.lines).body, '');
    }
  });
  const stamp = `<!-- omk:plantilla ${[...known].sort().join(' ')} · ${STAMP_NOTE} -->`;
  const eol = projectText.includes('\r\n') ? '\r\n' : '\n';
  const text = [...splitTail(out).body, '', stamp].join(eol) + (endsWithNewline ? eol : '');
  return { text, added, changed: text !== projectText };
}

/**
 * Pone al día `file` con `templateFile`. Devuelve `{ added, changed }`. Antes de escribir llama a
 * `backup(file)`; la escritura es atómica. Con `dryRun` no escribe nada.
 */
function syncFile(templateFile, file, { dryRun = false, backup = null, firstRun = 'add' } = {}) {
  if (!fs.lstatSync(file).isFile()) throw new Error(`${file} no es un fichero normal (¿un enlace?): no lo toco`);
  const current = fs.readFileSync(file, 'utf8');
  const { text, added, changed } = syncTemplate(fs.readFileSync(templateFile, 'utf8'), current, { firstRun });
  if (!changed || dryRun) return { added, changed };
  if (backup) backup(file);
  const tmp = `${file}.omk-${process.pid}.tmp`;
  // «wx»: si ya hay algo con ese nombre (también un enlace), falla en vez de escribir a través de él.
  fs.writeFileSync(tmp, text, { flag: 'wx' });
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  return { added, changed };
}

module.exports = { syncTemplate, syncFile };
