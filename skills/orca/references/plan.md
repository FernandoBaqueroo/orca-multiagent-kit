# Planificar por sprints (sustituye a «planificar»)

Para peticiones grandes sin plan ni spec. Mantiene los dos modos de `planificar` (plan maestro y sprint con visto bueno) y añade el paralelo.

## MODO 1 — Plan maestro
Disparador: idea grande, refactor o feature compleja sin plan previo.
1. Analiza dependencias, ficheros y lógica afectados (búsqueda dirigida; `STACK.md`, `ORCHESTRATION.md`, `AGENTS.md`).
2. Divide en sprints. Cada sprint = incremento verificable por sí solo. Prefiere sprints verticales (una funcionalidad completa) a horizontales (toda la BD, luego toda la API…), salvo un Sprint 0 de base común.
3. Escribe `planes/<feature>.md` (o `.plans/` si el proyecto lo indica) con este formato exacto:
```markdown
# Plan: <feature>
Objetivo: <1–2 líneas> · Creado: AAAA-MM-DD · Estado: en curso

## Sprint 0 — Base común            <!-- solo si hace falta -->
- Objetivo:
- Archivos: crear [..] · modificar [..]
- Depende de: —
- Paralelo: no (lo hace el coordinador)
- Criterios de aceptación:
  - ...
- Verificación: <comandos de STACK.md §3>

## Sprint 1 — <título>
- Objetivo:
- Archivos: crear [..] · modificar [..]
- Depende de: Sprint 0
- Paralelo: sí (con Sprint 2)      <!-- sí solo si sus Archivos no se cortan con los del otro -->
- Agente sugerido: claude | antigravity | cualquiera
- Criterios de aceptación:
  - ...
- Verificación:
```
4. Al usuario: ruta del plan + tabla `sprint | depende | paralelo` (nada más). Pregunta una sola cosa: ¿sprint a sprint con visto bueno (modo 2) o en paralelo con orca (modo 3)?

## MODO 2 — Ejecutar un sprint (secuencial, human-in-the-loop)
Disparador: "comienza el Sprint N de planes/<feature>.md".
1. Lee el plan y el sprint. No toques código todavía.
2. Presenta el plan de implementación del sprint: arquitectura, funciones, y los fragmentos de código finales (o el diff propuesto si es largo, por fichero).
3. Pregunta: «¿Me das tu visto bueno para aplicar este sprint?». Solo con un sí:
4. Aplica, pasa `csr-gate`, y marca el sprint `[completado]` en el plan con fecha.

## MODO 3 — Ejecutar en paralelo
Disparador: el usuario elige paralelo, o "lanza los sprints N y M". Vuelve a `SKILL.md` §2 con el adaptador `plan-file`. La aprobación pasa del código propuesto al plan de rondas y al merge final. El plan lo actualiza solo el coordinador.

## Reglas
- Un sprint que toca >10 ficheros o varias capas sin contrato entre ellas: divídelo.
- `Paralelo: sí` es una promesa: compruébala con los `Archivos` reales antes de escribirla.
- El plan es documentación viva: si un sprint cambia de alcance al implementarse, actualiza su sección (coordinador) y anótalo.
