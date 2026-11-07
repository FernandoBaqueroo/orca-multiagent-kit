# 00 — Router de reglas CSR

Carga progresiva: el núcleo (`~/.agents/AGENTS.md`) está siempre en contexto; todo lo demás se lee **solo cuando el disparador se cumple**. Objetivo: máxima calidad por token.

| Fichero (`~/.agents/rules/`) | Disparador | Coste aprox. |
|---|---|---|
| `10-communication.md` | El usuario se queja del formato, pide verbosidad, o dudas de estilo | ~600 tok |
| `20-clean-code.md` | Escribir, revisar o refactorizar cualquier código | ~1.100 tok |
| `30-security.md` | Siempre que se escriba código de producción | ~1.300 tok |
| `31-security-audit.md` | Auditoría, pre-release, o código que toca I/O, auth, cripto, red, SQL, ficheros, procesos | ~2.100 tok |
| `32-ai-security.md` | Código que llama a un LLM, construye prompts, hace RAG o define agentes, herramientas o MCP | ~1.800 tok |
| `40-testing.md` | Escribir/arreglar tests o definir cobertura | ~1.200 tok |
| `50-done-gate.md` | Antes de declarar una tarea terminada | ~1.100 tok |
| `60-git-workflow.md` | Commit, rama, PR, release | ~700 tok |
| `70-performance.md` | Queja de lentitud, bucles calientes, consultas, bundle, memoria | ~1.000 tok |
| `75-reliability.md` | Errores, reintentos, timeouts, logging, métricas, migraciones | ~900 tok |
| `80-supply-chain.md` | Añadir/actualizar dependencia, tocar CI/CD, publicar artefacto | ~900 tok |
| `90-docs-comments.md` | README, ADR, comentarios, changelog, API docs | ~700 tok |
| `95-multi-agent.md` | Repartir trabajo entre varios agentes, worktrees, Orca | ~1.200 tok |
| `lang/<x>.md` | Se edita un fichero de ese lenguaje | 400-900 tok c/u |

## Lenguajes disponibles (`~/.agents/rules/lang/`)
`rust` · `typescript` (TS+JS+Node) · `react` · `python` · `go` · `java` · `csharp` · `cpp` · `php` · `ruby` · `kotlin` · `swift` · `dart-flutter` · `sql` · `shell` (bash+PowerShell) · `web` (HTML/CSS/a11y) · `infra` (Docker/K8s/Terraform/YAML/CI)

## Regla de economía
1. `STACK.md` primero: dice qué módulos están activos en este repo.
2. Un módulo por necesidad real, no "por si acaso".
3. Si ya leíste un módulo en esta sesión, no lo releas.
4. Cita reglas por identificador (`30-security §Cripto`), no copiando el texto.
