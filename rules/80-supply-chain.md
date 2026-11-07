# 80 — Dependencias, cadena de suministro y CI/CD
(OWASP A03:2025 — Software Supply Chain Failures)

## Antes de añadir una dependencia — YOU MUST preguntar
1. ¿Se resuelve con la librería estándar o con 20 líneas propias? Entonces no la añadas.
2. ¿Mantenida? (commit en los últimos ~12 meses, issues atendidos, >1 mantenedor).
3. ¿CVE abiertos? ¿Historial de incidentes?
4. ¿Cuántas transitivas arrastra? ¿Peso en el bundle?
5. ¿Licencia compatible con el proyecto? (Copyleft fuerte en producto cerrado = no).
6. ¿Nombre correcto? Verifica typosquatting y que el paquete corresponde al repo oficial.
7. ¿Ejecuta scripts en la instalación? Revísalos.
Deja constancia de la decisión en el commit o en un ADR si es estructural.

## Higiene continua
- Lockfile commiteado siempre (`package-lock.json`, `pnpm-lock.yaml`, `poetry.lock`, `uv.lock`, `Cargo.lock`, `go.sum`, `composer.lock`, `Gemfile.lock`).
- Versiones fijadas en producción; rangos solo en desarrollo.
- Instalación reproducible en CI: `npm ci`, `pnpm i --frozen-lockfile`, `poetry install --sync`, `cargo build --locked`, `go mod verify`.
- Auditoría periódica: `osv-scanner -r .`, `npm audit`, `pip-audit`, `cargo audit`, `govulncheck`, `dotnet list package --vulnerable`, `composer audit`.
- Actualizaciones automatizadas (Renovate/Dependabot) con tests verdes como condición de merge.
- SBOM (CycloneDX/SPDX) generado en release si el proyecto se distribuye.
- Elimina lo que no se usa: `depcheck`, `knip`, `cargo-udeps`, `pip-check`.

## CI/CD
- Acciones/plugins de terceros **anclados por SHA**, no por tag móvil.
- Permisos mínimos del token (`permissions: contents: read`), sin secretos expuestos a PR de forks.
- Secretos solo por el gestor de secretos del runner; nunca en `env` de logs ni en `echo`.
- Los workflows no ejecutan código de un PR no confiable con permisos de escritura (`pull_request_target` es peligroso).
- Gates de calidad bloqueantes: format, lint, typecheck, build, test, cobertura, `gitleaks`, SAST, auditoría de deps.
- Build reproducible y artefactos firmados/con checksum si se publican.
- Caché de CI con clave por lockfile, nunca compartida entre ramas no confiables.

## Runtime
- Imagen base mínima y fijada por digest; usuario no root; sin secretos en capas; multi-stage.
- Escaneo de imagen (`trivy image`) antes de publicar.
- Actualiza runtimes fuera de soporte: un runtime EOL es una vulnerabilidad permanente.
