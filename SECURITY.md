# Política de seguridad

## Versiones con soporte

| Versión | Soporte |
|---|---|
| 2.x | ✅ |
| < 2.0 (CSR v1, MAW v1) | ❌ Migra con `./install.sh` |

## Qué cuenta como vulnerabilidad aquí

Este kit no es un servicio, pero escribe en tu carpeta personal y da instrucciones a agentes que ejecutan comandos. Por eso nos importan especialmente:

- `install.sh` borrando, sobrescribiendo o exponiendo ficheros fuera de lo documentado (por ejemplo `~/.ssh` o credenciales), o siguiendo enlaces simbólicos de forma insegura.
- Reglas o skills que inciten a un agente a filtrar secretos, saltarse confirmaciones de acciones destructivas o copiar credenciales de producción a worktrees.
- Plantillas (`.worktreeinclude`, `orca.yaml`, `settings.json`) con valores por defecto inseguros.

## Cómo informar

**No abras un issue público.** Usa **[Report a vulnerability](https://github.com/FernandoBaqueroo/orca-multiagent-kit/security/advisories/new)** (GitHub Security Advisories) con:
- versión (`cat VERSION`), sistema operativo y agentes instalados;
- pasos para reproducirlo y el impacto;
- si es posible, una propuesta de corrección.

Respondemos en un plazo de 7 días y publicamos la corrección con su advisory y una entrada en `CHANGELOG.md`.
