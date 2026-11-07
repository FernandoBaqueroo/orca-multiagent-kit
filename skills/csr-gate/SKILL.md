---
name: csr-gate
description: Ejecuta la puerta de validez completa (autorrevision adversarial, seguridad, tests, format, lint, typecheck, build, cobertura, escaneo y dependencias) y reporta PASS/FAIL/SKIPPED/N/A antes de dar una tarea por terminada.
---

# csr-gate — Puerta de validez

Procedimiento: `~/.agents/rules/50-done-gate.md`. Este fichero solo fija el orden de ejecución sobre el diff actual.

1. **Comandos**: `STACK.md` §3. Si no hay `STACK.md`, dedúcelos del manifiesto (`package.json` scripts, `Makefile`, `pyproject.toml`, jobs del CI), dilo en una línea (`ASSUMPTION: comandos deducidos de …`) y ofrece `csr-stack` al final. No inventes comandos que no estén en el repo.
2. **Alcance**: el diff contra la rama base (`git diff <base>...HEAD` más lo no commiteado). Si no hay diff, dilo y para.
3. **Fase 4** (autorrevisión adversarial): las 7 preguntas, una línea cada una, sobre ese diff.
4. **Fase 5** (seguridad): si el diff toca entrada de usuario, auth, autorización, cripto, ficheros, red, SQL, procesos, deserialización o dependencias ⇒ `31-security-audit.md`; si llama a un LLM o define agentes, herramientas o MCP ⇒ `32-ai-security.md`. Si no, `sec: N/A (motivo)`.
5. **Fase 6** (tests): comprueba que existen para el código nuevo y que no se ha relajado ninguno.
6. **Fase 7** (gates), en este orden: `format → lint → typecheck → build → test → coverage → sec-scan → deps-audit`. En el primer fallo, arregla la causa raíz si está dentro del alcance y reejecuta desde ese gate; si no, `FAIL` y los siguientes `SKIPPED (bloqueado por <gate>)`.
   - Herramienta ausente: `SKIPPED (no instalado: <herramienta>)`. No la instales sin permiso.
   - Gate que no aplica al stack: `N/A`.
7. **Fase 8**: tabla de gates (`50-done-gate.md` §8) y nada más de prosa.

**Regla absoluta**: un gate que no se ejecutó se reporta `SKIPPED (motivo)`. Nunca `PASS`.
