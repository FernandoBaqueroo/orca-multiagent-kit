# ORCHESTRATION.md — Cómo se reparte el trabajo entre agentes
> La lee la skill `orca` (coordinador) antes de repartir trabajo. Generar o actualizar: «inicializa el proyecto» (`kit-init`).
> Mantenla corta (≤ ~80 líneas). Complementa a `STACK.md`; no repite sus comandos.
> Aquí va solo lo propio de **este** proyecto. Qué rol hace cada unidad y con qué nivel de modelo lo decide la skill (`references/olimpo.md`); qué modelo es cada nivel está en `~/.agents/models.md`. No escribas nombres de modelos aquí.

## 0. Autonomía
- Nivel: semi        <!-- manual | semi | auto -->
  - manual: confirmas el plan de rondas, cada ronda, cada merge y la limpieza
  - semi: confirmas el plan de rondas, el merge final y la limpieza (recomendado)
  - auto: solo confirmas el merge final y la limpieza
- Nunca se mergea a la rama por defecto, se hace push ni se borran worktrees o ramas sin confirmación, en ningún nivel.

## 1. Reparto
- Proveedores activos: claude        <!-- ids de agente separados por comas, p. ej. claude, antigravity, codex -->
- Dominios sensibles de este proyecto (rol Ariadna, nivel alto, revisión cruzada):
  - auth, permisos, cripto, pagos     <!-- añade los tuyos: cálculo fiscal, tenancy, facturación… con sus rutas -->
- Excepciones al reparto por roles (vacío = se aplica `olimpo.md` tal cual):
  | Unidad, capa o ruta | Rol / proveedor fijado | Motivo |
  |---|---|---|
  | | | |
- Roles propios del proyecto (opcional; mismas columnas que `olimpo.md`):
  | Rol | Trabajo | Nivel | Revisión | Guardarraíl |
  |---|---|---|---|---|
  | | | | | |
- Máximo de workers simultáneos: 3
- Commits locales de workers: sí | no
- Revisión cruzada (otro proveedor revisa el diff): unidades L y sensibles | todas | nunca
- Reintentos automáticos por unidad: 1
- Presupuesto por unidad: por talla (S 15 min · M 60 min · L dividir) | <minutos fijos>

## 2. Shared — ficheros que solo toca una unidad por ronda o el coordinador
```
# rutas o globs estrechos, uno por línea
package.json
pnpm-lock.yaml
```

## 3. Entorno de worktree
Todo worktree nuevo queda listo para probar en local antes de que el worker edite nada.
- Rama padre (destino del merge final): la de por defecto        <!-- o develop, release/x… Siempre se parte de origin/<padre> actualizado -->
- Ficheros de entorno que se copian (solo desarrollo): los de `.worktreeinclude`
- Dependencias: instalar en cada worktree | symlink vía `orca.yaml` (`sharedDirectories`)
- Base de datos: compartida, migra solo una unidad por ronda | una BD/esquema por worktree (`DATABASE_URL=..._<unit>`)
- `PORT_BASE`: 3100 (worker n usa 3100+n)
- Setup de cada worktree (lo ejecuta Orca desde `orca.yaml`; sin Orca, viaja en el bloque `SETUP` del despacho):
```
# 1. copiar desde el checkout principal los ficheros de .worktreeinclude
# 2. <comando install de STACK.md §3>
```
- Comprobación de que el entorno arranca: `<comando typecheck o test rápido de STACK.md §3>`

## 4. Flujo por defecto
- Entrada habitual: spec-kit | plan por sprints | chat
- Rama de integración: `feat/<feature>`, creada desde `origin/<padre>` (nunca directo a la rama por defecto)
- Quién mergea: coordinador tras "sí" del usuario
- Limpieza tras el merge final: el coordinador enseña worktrees, ramas y copias de entorno, y los borra tras "sí" del usuario
- Estado del run: `.work/runs/<run>/run.md` (lo escribe solo el coordinador; permite reanudar)

## 5. No delegar nunca
- Migraciones destructivas, cambios de auth/permisos, despliegues, rotación de secretos.

## 6. Última actualización: YYYY-MM-DD
