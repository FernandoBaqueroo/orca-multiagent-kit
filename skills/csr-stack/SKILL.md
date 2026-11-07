---
name: csr-stack
description: Genera o actualiza el STACK.md del repositorio actual detectando lenguajes, frameworks, comandos y riesgos. Usar al abrir un proyecto sin STACK.md, o cuando el stack haya cambiado.
---

# csr-stack — Ficha de stack del proyecto

## Procedimiento
1. **Detecta** sin preguntar lo que se puede leer:
   - Manifiestos: `package.json`, `pnpm-workspace.yaml`, `Cargo.toml`, `pyproject.toml`, `requirements*.txt`, `go.mod`, `pom.xml`, `build.gradle*`, `*.csproj`, `composer.json`, `Gemfile`, `pubspec.yaml`, `Package.swift`, `CMakeLists.txt`, `mix.exs`.
   - Config: `tsconfig.json`, `.eslintrc*`, `ruff.toml`, `.golangci.yml`, `Makefile`, `Taskfile.yml`, `justfile`, `docker-compose*.yml`, `Dockerfile`, `.github/workflows/*`, `terraform/`, `k8s/`.
   - Versiones reales: `.nvmrc`, `.tool-versions`, `rust-toolchain.toml`, `.python-version`, campos `engines`/`edition`/`target-framework`.
   - Comandos reales: scripts del manifiesto, targets del Makefile, jobs del CI. **No inventes ninguno**: lo que no exista va como `N/A`.
2. **Infiera** tipo de proyecto, base de datos, framework de tests, gestor de paquetes (por el lockfile presente).
3. **Escribe** `STACK.md` en la raíz usando la plantilla `~/.agents/templates/STACK.md`.
4. **Marca** con `TODO:` solo lo que no se puede deducir del repo (nivel ASVS, amenazas, presupuestos, decisiones cerradas) y pregunta al usuario **como máximo 3** de esos puntos, en una sola tanda.
5. **Selecciona** los módulos CSR activos (§9) según los lenguajes detectados.
6. Reporta en 2 líneas: stack detectado y qué quedó como `TODO:`.

## Reglas
- Si ya existe `STACK.md`, **actualiza** preservando lo escrito a mano (§5–§8); no lo sobrescribas entero.
- Versiones exactas, no rangos, cuando el repo las fije.
- Si hay monorepo, una tabla por paquete relevante, no una ficha por paquete.
