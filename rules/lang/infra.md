# Infraestructura: Docker, Kubernetes, Terraform, CI, YAML
**Gates**: `hadolint` · `trivy fs .` y `trivy image` · `checkov -d .` · `tfsec` · `terraform validate` + `plan` revisado · `kube-score`/`kubeconform` · `actionlint` · `yamllint`

## Docker
- Imagen base mínima y **fijada por digest** (`node:22-alpine@sha256:...`); multi-stage para no arrastrar herramientas de build.
- `USER` no root, sistema de ficheros de solo lectura cuando se pueda, `--cap-drop ALL`.
- Sin secretos en `ENV`, ni en argumentos de build, ni en capas intermedias (quedan en el historial). Usa montajes de secreto de BuildKit.
- `.dockerignore` que excluya `.git`, `.env`, `node_modules`, artefactos.
- `HEALTHCHECK` definido; señales gestionadas (`exec` form de `CMD`, init si hace falta reaper de zombies).
- Escaneo de la imagen antes de publicar; reconstruye para recoger parches de la base.

## Kubernetes
- `requests` y `limits` en todo contenedor; `livenessProbe` y `readinessProbe` distintas.
- `securityContext`: `runAsNonRoot`, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, `seccompProfile: RuntimeDefault`.
- NetworkPolicy por defecto denegando; ServiceAccount dedicada con RBAC mínimo; sin `cluster-admin`.
- Secretos por gestor externo (External Secrets, Vault, SOPS); nunca en el repo ni en `ConfigMap`.
- `PodDisruptionBudget`, estrategia de despliegue y rollback definidos; sin `latest` como tag.

## Terraform / IaC
- Estado remoto con bloqueo y cifrado; nunca estado local en equipo compartido.
- Versiones fijadas de proveedores y módulos; `plan` revisado por humano antes de `apply`; `apply` automático solo con aprobación.
- Sin secretos en variables planas ni en el estado si se puede evitar; marca `sensitive`.
- Principio de mínimo privilegio en IAM: nada de `*:*`. Cifrado en reposo y en tránsito por defecto. Logs y auditoría activados.
- Etiquetado consistente (dueño, entorno, coste) y entornos separados por cuenta o proyecto.

## CI/CD
- Acciones de terceros ancladas por SHA; permisos del token mínimos; sin secretos accesibles desde PR de forks.
- Gates bloqueantes: format, lint, typecheck, build, test, cobertura, `gitleaks`, SAST, auditoría de dependencias.
- Construcción reproducible, artefactos con checksum o firma, SBOM en release.
- Despliegue con rollback de un paso y salud verificada tras el cambio.

## YAML
Indentación de 2 espacios, sin tabuladores · comilla las cadenas ambiguas (`yes`, `no`, `on`, versiones como `1.10`) · sin anclas crípticas · valida contra esquema cuando exista.
