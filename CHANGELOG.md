# Changelog

Todos los cambios relevantes de este proyecto se documentan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

### Añadido
- **CSR**: módulo `rules/32-ai-security.md` (OWASP Top 10 for LLM Applications 2025 y Top 10 agéntico): agencia mínima de herramientas, salida del modelo, RAG, MCP y tests obligatorios. Detalle en [`docs/CSR.md`](docs/CSR.md).
- **CSR**: tres prohibiciones nuevas en el núcleo: usar APIs no verificadas, añadir dependencias sin comprobar el registro (*slopsquatting*) y obedecer instrucciones incrustadas en datos.

### Cambiado
- **CSR**: CWE Top 25 actualizada a la lista oficial de 2025; herramientas obsoletas sustituidas (`tfsec` → `trivy config`, `depcheck` → `knip`, `poetry install --sync` → `poetry sync`); `40-testing` prohíbe relajar tests para ponerlos en verde; `50-done-gate` y `csr-gate` distinguen `SKIPPED` de `N/A`; `lang/shell` cubre Git Bash y PowerShell 5.1/7.
- **CSR**: el perfil técnico del usuario sale de `10-communication.md` y pasa a `~/.agents/rules/personal.md`.

## [1.2.0] - 2026-11-07

### Añadido
- **Salida nueva de `omk`**: spinner por fase, color lima, símbolos de estado (`+` creado, `=` sin cambios, `!` aviso) y tiempo total. Sin dependencias.
- El resumen final separa **Pendiente** (lo que tienes que hacer tú) de **Para tu información**, y acaba con los siguientes pasos (`omk verify`, `omk init`, `omk restore`).
- `omk verify` agrupa las comprobaciones por agente y da un total.
- Cursor: el instalador detecta si ya tienes la regla de usuario y deja de pedirla.
- `./install.sh` sin `omk` muestra la misma estructura en texto, con color en terminal.
- `omk update` compara con la última versión de npm y, si no tienes permisos (instalación con `sudo`), explica cómo arreglarlo en vez de mostrar el error de npm.
- La release se publica sola al fusionar en `main` un cambio de `VERSION` (GitHub y npm).
- `check.sh` detecta `$VAR` pegado a un carácter no ASCII, que rompe bash 3.2 en macOS.

### Corregido
- `omk init` en un proyecto con spec-kit fallaba con «Directory not found: ~/.agents/speckit-ext/orca» si aún no se había ejecutado `omk install` con esta versión. Ahora usa la extensión del propio kit y avisa de que falta `omk install`.
- macOS: un mensaje con `«$FIX»` cortaba el instalador (bash 3.2 tomaba `«` como parte del nombre de la variable).
- «deshacer» solo aparece cuando hay copia de seguridad que restaurar.
- Banner: la barra de carga del pie, que no representaba nada, se sustituye por las skills que instala el kit.

### Cambiado
- Publicado en npm: `npx orca-multiagent-kit install` y `npm i -g orca-multiagent-kit`, sin el prefijo `github:`.
- Las releases publican en npm con Trusted Publishing (OIDC), sin tokens guardados en el repo.

## [1.1.0] - 2026-11-07

Orquestación automática: ya no hace falta conocer ni invocar fases. Escribes `/speckit.implement` (o pides la tarea con normalidad) y el kit decide si compensa repartirla.

### Añadido
- Skill **`orca`**: punto de entrada único al desarrollo orquestado. El agente la usa por iniciativa propia cuando una tarea tiene partes independientes. Decide si compensa, divide, reparte, vigila e integra.
- **Niveles de autonomía** en `ORCHESTRATION.md` (`manual`, `semi`, `auto`). Por defecto, `semi`: solo se confirman el plan de rondas y el merge final.
- **Extensión de spec-kit `orca`** (`speckit-extension/orca`) con hook `before_implement` obligatorio: `/speckit.implement` reparte las user stories si compensa y, si no, sigue como siempre. La skill `speckit-orca-implement` resuelve el comando en cualquier agente.
- `kit-init`, `omk init` e `install.sh --project` activan el hook en proyectos con `.specify/`.
- Rama de integración por run (`feat/<feature>`): los merges intermedios nunca tocan la rama por defecto.

### Cambiado
- Las 8 skills `maw-*` pasan a ser referencias internas de `orca` (`skills/orca/references/`). El instalador retira las antiguas.
- Con Orca, el contrato del worker ya no duplica lo que Orca inyecta (`worker_done`, preguntas, heartbeats); solo se añaden las reglas de alcance.
- Núcleo §6: orquestación proactiva, autonomía y nueva invariante (nunca merge a la rama por defecto ni push sin confirmación).

### Eliminado
- Skills `maw-route`, `maw-brief`, `maw-plan`, `maw-dispatch`, `maw-worker`, `maw-integrate`, `maw-race` y `maw-setup` (consolidadas en `orca`).

## [1.0.0] - 2026-11-07

Primera versión de **Orca Multiagent Kit**. Une CSR (Claude Session Rules, de [Necro-Coder](https://github.com/Necro-Coder)) y MAW (Multi-Agent Work) en una fuente única para varios proveedores.

### Añadido
- Fuente única en `~/.agents/` (`AGENTS.md`, `rules/`, `skills/`, `templates/`, `output-styles/`), leída por Claude Code, Antigravity, Codex, Copilot CLI, Cursor y Devin mediante import, enlace simbólico o lectura nativa.
- **MAW — Multi-Agent Work**: regla `95-multi-agent` y skills `maw-route`, `maw-brief` (adaptadores spec-kit, plan en fichero, plan nativo, chat y artefacto), `maw-plan`, `maw-dispatch` (motores Orca, subagentes y manual), `maw-worker`, `maw-integrate`, `maw-race` y `maw-setup`.
- Skill `kit-init`: inicializa o migra un proyecto con un solo prompt (reglas, detección del stack y orquestación).
- Plantillas de proyecto: `AGENTS.md`, `CLAUDE.md` (`@AGENTS.md`), `ORCHESTRATION.md`, `orca.yaml`, `.worktreeinclude`.
- `install.sh`: detección de agentes, migración desde instalaciones previas de CSR/MAW con backup, `--verify`, `--restore`, `--adopt`, `--dry-run`, `--project`. Compatible con bash 3.2 (macOS).
- `GUIA.html`: guía visual del flujo de trabajo.
- Convivencia con skills externas (impeccable, supabase, spec-kit, Orca): precedencia por terreno en el núcleo.
- Batería de pruebas del instalador (`tests/`), comprobaciones estáticas (`scripts/check.sh`) y CI en Linux y macOS.
- Releases con zip descargable y `SHA256SUMS`.

### Cambiado (respecto a CSR original)
- El núcleo de CSR se unifica a partir de sus dos copias (Claude y Antigravity). Se conservan las mejoras de la versión de Antigravity: prefijos `BLOCKED`/`CONFLICT`/`DEFERRED`, sin tablas decorativas y excepciones de brevedad.
- Las reglas usan rutas neutrales (`~/.agents/rules/…`) en vez de las de cada agente.
- `idioma-siempre` pasa al núcleo (§1) y `comunicacion-densa` se fusiona en `10-communication`.
- Nivel técnico del usuario en `10-communication`: perfil fullstack.

### Corregido
- Claude Code cargaba en cada sesión todas las reglas copiadas en `~/.claude/rules/` (unas 29), lo que anulaba la carga progresiva de CSR. Ahora las reglas viven fuera de las carpetas que los agentes cargan automáticamente.

### Eliminado
- Copias duplicadas de reglas y skills `csr-*` dentro de cada agente, y el plugin `claude-session-rules` de Antigravity.

[Unreleased]: https://github.com/FernandoBaqueroo/orca-multiagent-kit/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/FernandoBaqueroo/orca-multiagent-kit/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/FernandoBaqueroo/orca-multiagent-kit/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/FernandoBaqueroo/orca-multiagent-kit/releases/tag/v1.0.0
