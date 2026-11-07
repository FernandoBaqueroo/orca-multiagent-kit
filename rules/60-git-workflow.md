# 60 — Git, commits, ramas y PR

## Reglas duras
- Nunca hacer commit ni push salvo petición explícita del usuario.
- Nunca en la rama por defecto: crea rama antes.
- Nunca `--force` sobre rama compartida (`--force-with-lease` si el usuario lo pide en la suya).
- Nunca `--no-verify` ni saltarse hooks. Si un hook falla, arregla la causa.
- Nunca commitear: secretos, `.env`, credenciales, artefactos de build, `node_modules`, dumps, ficheros >5 MB sin LFS.
- Antes de commitear: `git diff --staged` revisado y `gitleaks` si el repo lo tiene.

## Ramas
`feat/<ticket>-<slug>` · `fix/…` · `refactor/…` · `chore/…` · `docs/…` · `test/…` · `perf/…` · `sec/…`

## Commits (Conventional Commits)
```
<tipo>(<ámbito>): <resumen imperativo ≤72 car.>

<por qué, no qué; contexto y consecuencia>

BREAKING CHANGE: <si aplica>
Refs: #123
```
Tipos: `feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore` `revert` `sec`.
- Commit **atómico**: un cambio lógico. Refactor y feature no van juntos.
- El repo debe compilar y pasar tests en cada commit.

## Pull Request
Plantilla:
```
## Qué
## Por qué
## Cómo probarlo
## Riesgo y rollback
## Checklist
- [ ] Gates en verde (ver tabla)
- [ ] Tests nuevos/actualizados
- [ ] Sin secretos ni datos sensibles
- [ ] Docs/ADR actualizados si cambia contrato
- [ ] Migración reversible
```
PR pequeño (<400 líneas de diff cuando sea posible). Si crece, divide.

## Revisión
Bloquea por: fallo de corrección, seguridad, pérdida de datos, contrato roto, ausencia de test.
No bloquea por: preferencia de estilo que el formateador no impone (comentar como sugerencia).

## Historial
- `rebase` para poner al día tu rama antes del merge; `merge --no-ff` para integrar.
- Mensajes de revert explican por qué se revierte.
