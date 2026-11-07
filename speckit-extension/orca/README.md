# Extensión de spec-kit: orca

Hace que `/speckit.implement` reparta las user stories entre varios agentes cuando compensa. Usa el hook `before_implement`, que es obligatorio.

## Instalar en un proyecto
- Con **Orca Multiagent Kit** instalado: abre tu agente en el proyecto y escribe «inicializa el proyecto» (`kit-init`), o ejecuta `omk init`.
- A mano, con el CLI de spec-kit:
  ```bash
  specify extension add --dev ~/.agents/speckit-ext/orca
  ```

El comando `speckit.orca.implement` delega en la skill global `orca` del kit, que tiene que estar instalada (`omk install`).

## Desactivar
En `.specify/extensions.yml`, pon `enabled: false` en el hook `before_implement` de `orca`. `/speckit.implement` volverá a ser secuencial.
