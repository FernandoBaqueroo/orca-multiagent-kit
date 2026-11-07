---
name: csr-gate
description: Ejecuta la puerta de validez completa (format, lint, typecheck, build, test, cobertura, seguridad, dependencias) y reporta PASS/FAIL/SKIPPED antes de dar una tarea por terminada.
---

# csr-gate — Puerta de validez

1. Lee `STACK.md` §3 para los comandos. Si falta, deduce del manifiesto y dilo.
2. Lee `~/.agents/rules/50-done-gate.md` y ejecuta las fases 4 a 8.
3. Ejecuta en este orden, parando y arreglando la causa raíz en el primer fallo:
   `format → lint → typecheck → build → test → coverage → sec-scan → deps-audit`
4. Autorrevisión adversarial (fase 4 del done-gate): responde las 7 preguntas en una línea cada una, solo para el diff actual.
5. Si el diff toca entrada de usuario, autenticación, autorización, criptografía, ficheros, red, SQL, procesos, deserialización o dependencias, ejecuta además `~/.agents/rules/31-security-audit.md`.
6. Reporta la tabla de gates (`50-done-gate.md` §8). Nada de prosa adicional.

**Regla absoluta**: un gate que no se ejecutó se reporta `SKIPPED (motivo)`. Nunca `PASS`.
