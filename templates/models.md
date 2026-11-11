# models.md — Qué modelo usa cada nivel, por proveedor
> Fichero **tuyo**: el kit lo crea una vez en `~/.agents/models.md` y no lo vuelve a tocar al reinstalar.
> Lo lee la skill `orca` antes de cada plan de rondas (`references/olimpo.md` §Modelos). Es el único sitio donde aparece el nombre de un modelo.
> Qué es cada nivel: `alto` = arquitectura, seguridad, normativa, revisión crítica y código sensible · `medio` = implementación, tests, infraestructura · `bajo` = tareas mecánicas.

## Cómo se rellena una fila
- `modelo`: un alias estable del proveedor, un id exacto o un patrón con `*`. Con patrón, si casan varios ids de la lista del proveedor, se usa el de versión más alta.
- `esfuerzo` (opcional): nivel de razonamiento, si el proveedor lo admite aparte del modelo.
- Celda vacía = ese nivel no tiene modelo en ese proveedor: las unidades `alto` irán a otro; las demás se lanzan con el modelo por defecto del proveedor.

## claude
- descubrir: —            <!-- usa alias: apuntan solos al modelo vigente, no hay nada que actualizar -->
| nivel | modelo | esfuerzo |
|---|---|---|
| alto | opus | |
| medio | sonnet | |
| bajo | haiku | |

## antigravity
- descubrir: agy models   <!-- la skill la ejecuta en cada run y compara con «vistos» -->
- vistos:                 <!-- lo escribe la skill: ids de la última comprobación -->
- comprobado:             <!-- lo escribe la skill: AAAA-MM-DD -->
| nivel | modelo | esfuerzo |
|---|---|---|
| alto | | |
| medio | | |
| bajo | | |

<!-- Otro proveedor (codex, cursor…): copia un bloque, pon su id de agente como título y, si su CLI lista modelos, la orden en «descubrir». -->
