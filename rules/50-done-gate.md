# 50 — Puerta de validez (Definition of Done)

Un cambio es válido solo si ha superado las 8 fases. No se salta ninguna; si una no se puede ejecutar, se declara `SKIPPED (motivo)`.

## Fase 1 — Contexto
- [ ] `STACK.md` leído (o generado con `/csr-stack` si falta).
- [ ] Leído el código colindante y sus convenciones; buscado si ya existe algo equivalente (no duplicar).
- [ ] Alcance acotado: qué entra, qué queda fuera (`DEFERRED:`).

## Fase 2 — Diseño
- [ ] Caso feliz, errores, límites, vacío, concurrencia y entrada hostil contemplados.
- [ ] Contrato definido: entradas, salidas, errores, invariantes, efectos secundarios.
- [ ] Impacto en datos existentes (migración, compatibilidad hacia atrás, rollback).
- [ ] Alternativa más simple descartada conscientemente.

## Fase 3 — Implementación
- [ ] `20-clean-code.md` y `rules/lang/<lenguaje>.md` aplicados.
- [ ] `30-security.md` aplicado.
- [ ] Sin TODOs, sin código muerto, sin prints de depuración, sin secretos.
- [ ] Cada supresión de lint/tipo justificada en línea.

## Fase 4 — Autorrevisión adversarial (pensar, no ejecutar)
Responde por escrito, en una línea cada una:
1. ¿Cómo rompo esto siendo un atacante?
2. ¿Qué entrada hace que esto se comporte mal y no está probada?
3. ¿Qué pasa si la dependencia externa falla, tarda o devuelve basura?
4. ¿Qué pasa con 0 elementos, 1 elemento, 10 millones?
5. ¿Qué pasa si se ejecuta dos veces a la vez? ¿Y dos veces seguidas?
6. ¿Qué he asumido sin verificar? ¿Qué fichero no he leído y debería?
7. ¿Qué parte de esto no entiendo del todo?
Cualquier respuesta incómoda ⇒ vuelve a Fase 2 o 3.

## Fase 5 — Seguridad
- [ ] Si toca entrada, auth, cripto, ficheros, red, SQL, procesos, deserialización o deps ⇒ `31-security-audit.md` completo.
- [ ] Si no toca nada de eso, declarar: `sec: N/A (solo lógica interna pura)`.

## Fase 6 — Tests
- [ ] `40-testing.md`: casos obligatorios cubiertos, test de regresión si era un bug.
- [ ] Los tests fallan si deshaces el cambio (verificado o razonado).

## Fase 7 — Gates automáticos (ejecutar de verdad)
Orden y comandos exactos desde `STACK.md`:
`format → lint → typecheck → build → test → coverage → sec-scan → deps-audit`
Regla: **un gate no ejecutado nunca se reporta como PASS**. Si falla, se arregla la causa raíz y se reejecuta desde ese gate.

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
sec-scan   | semgrep --config=auto| PASS
deps       | npm audit            | SKIPPED (sin red)
RISK: <si aplica>
DEFERRED: <si aplica>
```

## Honestidad — YOU MUST
- No afirmes que algo funciona si no lo ejecutaste.
- No maquilles un fallo como advertencia.
- Si el usuario pidió algo que no pudiste terminar, dilo con `BLOCKED:` o `DEFERRED:` y entrega el resto completo.
