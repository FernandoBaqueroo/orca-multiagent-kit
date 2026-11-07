---
name: csr-stack
description: Genera o actualiza el STACK.md del repositorio actual detectando lenguajes, frameworks, comandos y riesgos. Usar al abrir un proyecto sin STACK.md, o cuando el stack haya cambiado.
---

# csr-stack — Ficha de stack del proyecto

## Procedimiento
1. **Detecta** sin preguntar lo que se puede leer:
   - Manifiestos: `package.json`, `pnpm-workspace.yaml`, `Cargo.toml`, `pyproject.toml`, `requirements*.txt`, `go.mod`, `pom.xml`, `build.gradle*`, `*.csproj`, `composer.json`, `Gemfile`, `pubspec.yaml`, `Package.swift`, `CMakeLists.txt`, `mix.exs`.
   - Config: `tsconfig.json`, `eslint.config.*`, `.eslintrc*`, `biome.json`, `ruff.toml`, `.golangci.yml`, `Makefile`, `Taskfile.yml`, `justfile`, `docker-compose*.yml`, `Dockerfile`, `.github/workflows/*`, `terraform/`, `k8s/`.
   - Versiones reales: `.nvmrc`, `.node-version`, `.tool-versions`, `mise.toml`, `rust-toolchain.toml`, `.python-version`, `global.json`, campos `engines`/`packageManager`/`edition`/`target-framework`.
   - Gestor de paquetes por el lockfile presente (`pnpm-lock.yaml`, `package-lock.json`, `bun.lock`, `yarn.lock`, `uv.lock`, `poetry.lock`…); si hay dos, `RISK:`.
   - IA: SDKs de modelos (`openai`, `@anthropic-ai/sdk`, `anthropic`, `langchain*`, `@modelcontextprotocol/*`, `mcp`…) ⇒ activa `32-ai-security` en §9.
   - Comandos reales: scripts del manifiesto, targets del Makefile, jobs del CI. **No inventes ninguno**: lo que no exista va como `N/A`.
2. **Infiera** tipo de proyecto, base de datos, framework de tests, gestor de paquetes (por el lockfile presente).
3. **Escribe** `STACK.md` en la raíz usando la plantilla `~/.agents/templates/STACK.md`.
4. **Marca** con `TODO:` solo lo que no se puede deducir del repo (nivel ASVS, amenazas, presupuestos, decisiones cerradas) y pregunta al usuario **como máximo 3** de esos puntos, en una sola tanda.
5. **Selecciona** los módulos CSR activos (§9) según los lenguajes detectados.
6. Reporta en 2 líneas: stack detectado y qué quedó como `TODO:`.

## Reglas
- Si ya existe `STACK.md`, **actualiza** preservando lo escrito a mano (§1 nivel ASVS, §5–§8, §10); no lo sobrescribas entero.
- Comprueba cada comando que escribas en §3 contra el manifiesto o el CI; si puedes ejecutarlo sin efectos (`--help`, `--version`), hazlo.
- Versiones exactas, no rangos, cuando el repo las fije.
- Si hay monorepo, una tabla por paquete relevante, no una ficha por paquete.
