# ORCHESTRATION.md — Cómo se reparte el trabajo entre agentes
> La lee la skill `orca` (coordinador) antes de repartir trabajo. Generar o actualizar: «inicializa el proyecto» (`kit-init`).
> Mantenla corta (≤ ~80 líneas). Complementa a `STACK.md`; no repite sus comandos.

## 0. Autonomía
- Nivel: semi        <!-- manual | semi | auto -->
  - manual: confirmas el plan de rondas, cada ronda y cada merge
  - semi: confirmas el plan de rondas y el merge final (recomendado)
  - auto: solo confirmas el merge final
- Nunca se mergea a la rama por defecto ni se hace push sin confirmación, en ningún nivel.

## 1. Agentes
| Capa / área | Agente por defecto | Alternativa | Motivo |
|---|---|---|---|
| UI (componentes, páginas, estilos) | | | |
| API / lógica de servidor | | | |
| Datos (esquema, migraciones, SQL) | coordinador | — | toca `shared` |
| Tests E2E / verificación en navegador | | | |
| Revisión de diffs al integrar | | | segundo proveedor = segunda opinión |
- Máximo de workers simultáneos: 3
- Motor preferido: orca | subagents | manual
- Commits locales de workers: sí | no

## 2. Shared — ficheros que solo toca una unidad por ronda o el coordinador
```
# rutas o globs estrechos, uno por línea
package.json
pnpm-lock.yaml
```

## 3. Entorno de worktree
- Dependencias: symlink vía `orca.yaml` (`sharedDirectories`) | `pnpm install` en setup
- Variables de entorno: `.worktreeinclude` copia → `.env.local` (solo desarrollo)
- Base de datos: compartida, migra solo una unidad por ronda | una BD/esquema por worktree (`DATABASE_URL=..._<unit>`)
- `PORT_BASE`: 3100 (worker n usa 3100+n)
- Setup tras crear worktree (si no lo hace Orca):
```
TODO:
```

## 4. Flujo por defecto
- Entrada habitual: spec-kit | plan por sprints | chat
- Rama de integración: `feat/<feature>` (nunca directo a la rama por defecto)
- Quién mergea: coordinador tras "sí" del usuario

## 5. No delegar nunca
- Migraciones destructivas, cambios de auth/permisos, despliegues, rotación de secretos.

## 6. Última actualización: YYYY-MM-DD
