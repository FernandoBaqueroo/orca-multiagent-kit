# Motor: manual (worktrees + humano)

Para cuando no hay Orca ni subagentes, o se mezclan proveedores sin Orca.

## 1. Crear worktrees
Desde el checkout principal, por cada unidad de la ronda:
```bash
git worktree add ../<repo>-wt/<run>-u2 -b maw/<run>/u2 <sha-base>
```
Después, en cada worktree, el setup de `ORCHESTRATION.md` §Entorno (por ejemplo copiar `.env.local` de desarrollo, `pnpm install` o symlink de `node_modules`).

## 2. Dejar el brief
Escribe el mensaje de despacho en `<worktree>/.work/BRIEF.md` (dentro del worktree, ignorado por git) y en `.work/runs/<run>/briefs/<unit>.md` del principal.

## 3. Instrucciones al usuario (una sola vez, en bloque)
```
Abre un agente en cada carpeta y pégale: «Ejecuta .work/BRIEF.md con la skill maw-worker»
U1 → ../<repo>-wt/<run>-u1  (Claude Code)
U2 → ../<repo>-wt/<run>-u2  (Antigravity)
Cuando terminen, dime «ronda lista».
```

## 4. Recoger
Cada worker escribe su informe en `<worktree>/.work/REPORT.md`. Léelos, cópialos a `.work/runs/<run>/reports/` y pasa a `maw-integrate`.

## 5. Limpieza (tras integrar, con confirmación)
```bash
git worktree remove ../<repo>-wt/<run>-u2
git branch -d maw/<run>/u2          # -d, no -D: falla si no está mergeada
```
