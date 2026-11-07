# 80 — Dependencias, cadena de suministro y CI/CD
(OWASP A03:2025 — Software Supply Chain Failures)

## Antes de añadir una dependencia — YOU MUST preguntar
1. ¿Se resuelve con la librería estándar o con 20 líneas propias? Entonces no la añadas.
2. ¿**Existe** con ese nombre exacto en el registro oficial y es la del proyecto que crees? Compruébalo (`npm view <pkg> repository`, la página de PyPI/crates.io/pkg.go.dev, el README del repo oficial) antes de instalar. Los nombres que propone un modelo pueden ser inventados, y los atacantes registran esos nombres (*slopsquatting*) y los parecidos (*typosquatting*).
3. ¿Mantenida? (commit en los últimos ~12 meses, issues atendidos, >1 mantenedor). ¿Publicada hace días, con pocas descargas o con un mantenedor recién cambiado? Señal de alarma.
4. ¿CVE abiertos? ¿Historial de incidentes?
5. ¿Cuántas transitivas arrastra? ¿Peso en el bundle?
6. ¿Licencia compatible con el proyecto? (Copyleft fuerte en producto cerrado = no). ¿Ha cambiado de licencia en la versión que vas a usar?
7. ¿Ejecuta scripts en la instalación? Revísalos.
Deja constancia de la decisión en el commit o en un ADR si es estructural.

## Instalación
- Scripts de instalación desactivados por defecto donde se pueda: `npm ci --ignore-scripts` (y habilitar solo los necesarios); pnpm ≥10 ya no ejecuta los de dependencias salvo los permitidos en `onlyBuiltDependencies`.
- Retraso de adopción para versiones recién publicadas (la mayoría de paquetes maliciosos se retiran en horas o días): `minimumReleaseAge` en pnpm, `exclude-newer` en uv.
- Nunca `curl … | sh` ni instaladores sin checksum o firma verificada.

## Higiene continua
- Lockfile commiteado siempre (`package-lock.json`, `pnpm-lock.yaml`, `bun.lock`, `poetry.lock`, `uv.lock`, `Cargo.lock`, `go.sum`, `composer.lock`, `Gemfile.lock`).
- Versiones fijadas en producción; rangos solo en desarrollo.
- Instalación reproducible en CI: `npm ci`, `pnpm install --frozen-lockfile`, `uv sync --locked`, `poetry sync` (Poetry ≥2), `cargo build --locked`, `go mod verify`.
- Auditoría periódica: `osv-scanner -r .`, `npm audit`, `npm audit signatures`, `pip-audit`, `cargo audit`, `govulncheck`, `dotnet list package --vulnerable`, `composer audit`.
- Actualizaciones automatizadas (Renovate/Dependabot) con tests verdes como condición de merge.
- SBOM (CycloneDX/SPDX) generado en release si el proyecto se distribuye.
- Elimina lo que no se usa: `knip` (JS/TS; `depcheck` ya no se mantiene), `cargo-udeps`/`cargo-machete`, `deptry` (Python).

## CI/CD
- Acciones/plugins de terceros **anclados por SHA**, no por tag móvil.
- Permisos mínimos del token (`permissions: contents: read`), sin secretos expuestos a PR de forks; `actions/checkout` con `persist-credentials: false` si el job no necesita hacer push.
- Secretos solo por el gestor de secretos del runner; nunca en `env` de logs ni en `echo`.
- Los workflows no ejecutan código de un PR no confiable con permisos de escritura (`pull_request_target` y `workflow_run` son peligrosos). Sin interpolar `${{ github.event.* }}` en `run:`: pásalo por `env`.
- Analiza los workflows: `zizmor .` y `actionlint`.
- Gates de calidad bloqueantes: format, lint, typecheck, build, test, cobertura, `gitleaks`, SAST, auditoría de deps.
- Publicación con identidad federada (OIDC / Trusted Publishing) y procedencia (`npm publish --provenance`) en vez de tokens de larga duración.
- Build reproducible y artefactos firmados/con checksum si se publican.
- Caché de CI con clave por lockfile, nunca compartida entre ramas no confiables.

## Runtime
- Imagen base mínima y fijada por digest; usuario no root; sin secretos en capas; multi-stage.
- Escaneo de imagen (`trivy image`) antes de publicar.
- Actualiza runtimes fuera de soporte: un runtime EOL es una vulnerabilidad permanente.
