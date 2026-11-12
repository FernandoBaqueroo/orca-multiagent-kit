# 50 — Puerta de validez (Definition of Done)

El núcleo (`~/.agents/AGENTS.md` §4) fija las 8 fases y su orden. Aquí está **cómo** se cumple cada una y el formato del reporte. Si una fase no se puede ejecutar, se declara `SKIPPED (motivo)`; ninguna se salta en silencio.

## Fase 1 — Contexto
- [ ] `STACK.md` leído (si falta: `csr-stack`, o comandos deducidos del manifiesto y dicho en una línea).
- [ ] Leído el código colindante y sus convenciones; buscado si ya existe algo equivalente (`grep` del concepto, no solo del nombre).
- [ ] Alcance acotado: qué entra, qué queda fuera (`DEFERRED:`).

## Fase 2 — Diseño
- [ ] Caso feliz, errores, límites, vacío, concurrencia y entrada hostil contemplados.
- [ ] Contrato definido: entradas, salidas, errores, invariantes, efectos secundarios.
- [ ] Impacto en datos existentes (migración, compatibilidad hacia atrás, rollback).
- [ ] Alternativa más simple descartada conscientemente.

## Fase 3 — Implementación
- [ ] `20-clean-code.md` y `lang/<lenguaje>.md` aplicados; `30-security.md` aplicado.
- [ ] Cada API, import, flag o paquete nuevo verificado contra la versión instalada (tipos, `--help`, docs) y, si es una dependencia nueva, contra el registro (`80-supply-chain.md`).
- [ ] Diff revisado línea a línea (`git diff`): sin TODOs, código muerto, prints de depuración, secretos ni cambios ajenos al alcance.
- [ ] Cada supresión de lint/tipo justificada en línea.

## Fase 4 — Autorrevisión adversarial (pensar, no ejecutar)
Responde por escrito, en una línea cada una, **sobre el diff concreto** (no en abstracto):
1. ¿Cómo rompo esto siendo un atacante?
2. ¿Qué entrada hace que esto se comporte mal y no está probada?
3. ¿Qué pasa si la dependencia externa falla, tarda o devuelve basura?
4. ¿Qué pasa con 0 elementos, 1 elemento, 10 millones?
5. ¿Qué pasa si se ejecuta dos veces a la vez? ¿Y dos veces seguidas?
6. ¿Qué he asumido sin verificar? ¿Qué fichero no he leído y debería?
7. ¿Qué parte de esto no entiendo del todo?
Cualquier respuesta incómoda ⇒ vuelve a Fase 2 o 3. "Nada" en las siete es sospechoso: busca una más.

## Fase 5 — Seguridad
- [ ] Si toca entrada, auth, cripto, ficheros, red, SQL, procesos, deserialización o deps ⇒ `31-security-audit.md` completo.
- [ ] Si llama a un LLM o define agentes, herramientas o MCP ⇒ `32-ai-security.md`.
- [ ] Si no toca nada de eso, declarar: `sec: N/A (solo lógica interna pura)`.

## Fase 6 — Tests
- [ ] `40-testing.md`: casos obligatorios cubiertos, test de regresión si era un bug.
- [ ] Los tests nuevos **fallan sin el cambio**. Verifícalo ejecutándolos contra el código anterior (revierte temporalmente la corrección o usa el commit base en un worktree); si no es posible, razónalo en una línea.
- [ ] Ningún test existente se ha relajado, saltado o borrado para quedar en verde (`40-testing.md` §El test defiende el requisito).

## Fase 7 — Gates automáticos (ejecutar de verdad)
Orden y comandos exactos desde `STACK.md` §3: `format → lint → typecheck → build → test → coverage → sec-scan → deps-audit`.
- Si falla, arregla la causa raíz y reejecuta **desde ese gate**. Si la causa queda fuera de alcance: ese gate `FAIL`, los siguientes `SKIPPED (bloqueado por <gate>)`, y `BLOCKED:`.
- Herramienta no instalada: `SKIPPED (no instalado: <herramienta>)`. No la instales sin permiso ni la sustituyas por otra sin decirlo.
- Sin red: `SKIPPED (sin red)`. Gate que no existe en este stack (`N/A` en `STACK.md` §3): `N/A`.
- Ejecuta en la shell que tengas (bash, Git Bash, PowerShell); si un comando de `STACK.md` no funciona en ella, dilo en vez de reescribirlo a ciegas.

## Fase 8 — Reporte final (formato fijo, sin prosa extra)
```
<qué se hizo, 1 línea>
ficheros: N (+X/-Y)
gate       | cmd                  | estado
format     | pnpm format:check    | PASS
lint       | pnpm lint            | PASS
typecheck  | tsc --noEmit         | PASS
build      | pnpm build           | PASS
test       | pnpm test            | PASS 128/128
coverage   | pnpm test:cov        | 86% cambiado
sec-scan   | semgrep --config=auto| SKIPPED (no instalado: semgrep)
deps-audit | npm audit            | SKIPPED (sin red)
RISK: <si aplica>
DEFERRED: <si aplica>
```
Estados válidos: `PASS` (ejecutado y en verde) · `FAIL` (ejecutado y en rojo) · `SKIPPED (motivo)` (aplica, no se ejecutó) · `N/A` (no aplica a este stack).

## Honestidad
Lo que no se terminó se dice con `BLOCKED:` o `DEFERRED:` y se entrega el resto completo. Un fallo no se rebaja a advertencia.
