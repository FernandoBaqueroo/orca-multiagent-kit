<div align="center">

<img src="assets/banner.svg" alt="MULTIAGENT_KIT — Orca · CSR + MAW: una fuente de reglas y skills para Claude, Gemini, Codex, Copilot y Cursor" width="100%">

# Orca Multiagent Kit

**Una sola fuente de reglas y skills para todos tus agentes de programación.<br>Calidad profesional en cada tarea, y varios agentes trabajando en paralelo sin pisarse.**

[![Release](https://img.shields.io/github/v/release/FernandoBaqueroo/orca-multiagent-kit?style=for-the-badge&labelColor=0b0f1a&color=ffcc4d&label=release)](https://github.com/FernandoBaqueroo/orca-multiagent-kit/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/FernandoBaqueroo/orca-multiagent-kit/ci.yml?branch=main&style=for-the-badge&labelColor=0b0f1a&label=CI)](https://github.com/FernandoBaqueroo/orca-multiagent-kit/actions/workflows/ci.yml)
[![Licencia MIT](https://img.shields.io/badge/licencia-MIT-c9d1ff?style=for-the-badge&labelColor=0b0f1a)](LICENSE)
[![Descargas](https://img.shields.io/github/downloads/FernandoBaqueroo/orca-multiagent-kit/total?style=for-the-badge&labelColor=0b0f1a&color=10a37f&label=descargas)](https://github.com/FernandoBaqueroo/orca-multiagent-kit/releases)

![Claude Code](https://img.shields.io/badge/Claude_Code-d97757?style=flat-square&logo=anthropic&logoColor=white)
![Antigravity](https://img.shields.io/badge/Antigravity-5b7cfa?style=flat-square&logo=googlegemini&logoColor=white)
![Codex](https://img.shields.io/badge/Codex-10a37f?style=flat-square&logo=openai&logoColor=white)
![Copilot CLI](https://img.shields.io/badge/Copilot_CLI-2a3557?style=flat-square&logo=githubcopilot&logoColor=white)
![Cursor](https://img.shields.io/badge/Cursor-0b0f1a?style=flat-square&logo=cursor&logoColor=white)
![Orca](https://img.shields.io/badge/Orca-worktrees-0b0f1a?style=flat-square&labelColor=0b0f1a&color=2a3557)
![spec-kit](https://img.shields.io/badge/spec--kit-compatible-2a3557?style=flat-square&logo=github&logoColor=white)

[**⬇ Descargar ZIP**](https://github.com/FernandoBaqueroo/orca-multiagent-kit/releases/latest/download/orca-multiagent-kit.zip) · [Releases](https://github.com/FernandoBaqueroo/orca-multiagent-kit/releases) · [Guía visual](GUIA.html) · [Manual](docs/MANUAL.md) · [Changelog](CHANGELOG.md)

</div>

```text
> INSERT COIN_
> PLAYER 1: CLAUDE CODE     PLAYER 2: ANTIGRAVITY     PLAYER 3: CODEX
> UNA FUENTE DE REGLAS · CADA AGENTE EN SU WORKTREE · NADA SE MERGEA SIN TU «SÍ»
```

---

## Índice

- [Qué es](#-qué-es)
- [Descargar](#-descargar)
- [Inicio rápido](#-inicio-rápido)
- [Agentes soportados](#-agentes-soportados)
- [Skills](#-skills)
- [Flujo de trabajo](#-flujo-de-trabajo)
- [Estructura del repositorio](#-estructura-del-repositorio)
- [Documentación](#-documentación)
- [Contribuir](#-contribuir)
- [Autores](#-autores)
- [Licencia](#-licencia)

---

<img src="assets/d-que.svg" alt="" width="100%">

## 🕹 Qué es

**Orca Multiagent Kit** reúne en `~/.agents/` las reglas y skills de todos tus agentes de programación. Tiene dos partes:

| | Parte | Qué aporta |
|:--:|:--|:--|
| 🛡 | **CSR — Claude Session Rules** | Código de calidad profesional, auditado en seguridad (OWASP Top 10 2025, ASVS 5.0, CWE Top 25) y con tests. Una puerta de validez en 8 fases y una tabla de gates al cerrar cada tarea. Respuestas mínimas: el agente gasta tokens en pensar, no en hablar. |
| 👾 | **MAW — Multi-Agent Work** | Varios agentes a la vez sin pisarse. Cualquier entrada (chat, plan, spec-kit o diseño) se convierte en unidades de trabajo; cada unidad va a su worktree y a su rama; la integración se hace con revisión y tu confirmación. Funciona con [Orca](https://www.onorca.dev), con subagentes nativos o con worktrees a mano. |

**Por qué existe:**

| Sin el kit | Con el kit |
|:--|:--|
| Una copia de las reglas por agente, que acaban divergiendo | **Una fuente**: cada agente importa o enlaza `~/.agents` |
| Claude cargaba todas las reglas en **cada mensaje** | Reglas **bajo demanda**; solo un núcleo de ~80 líneas está siempre cargado |
| Un agente, una tarea cada vez | Varios agentes en paralelo, con coordinador, informes e integración segura |

<img src="assets/d-descargar.svg" alt="" width="100%">

## ⬇ Descargar

| Opción | Cómo |
|:--|:--|
| **ZIP de la última versión** | [`orca-multiagent-kit.zip`](https://github.com/FernandoBaqueroo/orca-multiagent-kit/releases/latest/download/orca-multiagent-kit.zip) |
| **Versión concreta** | En [Releases](https://github.com/FernandoBaqueroo/orca-multiagent-kit/releases), cada versión publica `orca-multiagent-kit-vX.Y.Z.zip` con su `SHA256SUMS` |
| **Git** | `git clone https://github.com/FernandoBaqueroo/orca-multiagent-kit.git` |

Para comprobar la integridad del zip: `shasum -a 256 -c SHA256SUMS` (macOS) o `sha256sum -c SHA256SUMS` (Linux).

<img src="assets/d-inicio.svg" alt="" width="100%">

## 🚀 Inicio rápido

```bash
# 1 · Descarga y entra
curl -LO https://github.com/FernandoBaqueroo/orca-multiagent-kit/releases/latest/download/orca-multiagent-kit.zip
unzip orca-multiagent-kit.zip && cd orca-multiagent-kit

# 2 · Mira qué haría, instala y verifica
./install.sh --dry-run
./install.sh
./install.sh --verify
```

Después reinicia tus agentes y, en cada proyecto, escribe:

```text
inicializa el proyecto
```

La skill `kit-init` detecta el stack leyendo el repo, crea `AGENTS.md`, `STACK.md` y `ORCHESTRATION.md`, y te hace como mucho 4 preguntas.

<details>
<summary><b>Todas las opciones del instalador</b></summary>

| Comando | Qué hace |
|:--|:--|
| `./install.sh` | Instala para los agentes detectados. Migra CSR v1 / MAW v1 con backup |
| `./install.sh --dry-run` | Muestra lo que haría sin escribir nada |
| `./install.sh --verify` | Comprueba enlaces, imports y que no queden copias divergentes |
| `./install.sh --agents claude,codex` | Solo esos agentes (`claude antigravity codex copilot cursor devin`) |
| `./install.sh --project <ruta>` | Además, migra o prepara un proyecto |
| `./install.sh --adopt <carpeta-skill>` | Convierte una skill externa (p. ej. impeccable) en una sola copia que ven todos los agentes |
| `./install.sh --restore <fecha>` | Deshace una instalación desde su backup en `~/.agents/backups/` |

Requisitos: macOS, Linux, WSL o Git Bash con bash ≥ 3.2. Sin dependencias.
</details>

<img src="assets/d-agentes.svg" alt="" width="100%">

## 🤖 Agentes soportados

| Agente | Reglas globales | Skills | Estado |
|:--|:--|:--|:--:|
| ![](https://img.shields.io/badge/-Claude_Code-d97757?style=flat-square&logo=anthropic&logoColor=white) | `@~/.agents/AGENTS.md` importado en `~/.claude/CLAUDE.md` | enlaces en `~/.claude/skills` | ✅ |
| ![](https://img.shields.io/badge/-Antigravity-5b7cfa?style=flat-square&logo=googlegemini&logoColor=white) | `~/.gemini/GEMINI.md` → enlace | enlaces en `~/.gemini/config/skills` | ✅ |
| ![](https://img.shields.io/badge/-Codex-10a37f?style=flat-square&logo=openai&logoColor=white) | `~/.codex/AGENTS.md` → enlace | nativo en `~/.agents/skills` | ✅ |
| ![](https://img.shields.io/badge/-Copilot_CLI-2a3557?style=flat-square&logo=githubcopilot&logoColor=white) | `~/.copilot/copilot-instructions.md` → enlace | nativo en `~/.agents/skills` | ✅ |
| ![](https://img.shields.io/badge/-Cursor-0b0f1a?style=flat-square&logo=cursor&logoColor=white) | una línea en *Settings → Rules* (no usa ficheros) | nativo en `~/.agents/skills` | ✅ |
| ![](https://img.shields.io/badge/-Devin_CLI-2a3557?style=flat-square) | `~/.config/devin/AGENTS.md` → enlace | — | opcional (`--agents devin`) |

En cada proyecto, las reglas van en `AGENTS.md`, que leen todos los agentes. `CLAUDE.md` solo contiene `@AGENTS.md`.

<img src="assets/d-skills.svg" alt="" width="100%">

## 🧰 Skills

| Skill | Para qué | Pídelo así |
|:--|:--|:--|
| `kit-init` | Prepara o migra un proyecto: reglas, stack y orquestación | «inicializa el proyecto» |
| `csr-stack` | Genera `STACK.md` detectando lenguajes, comandos y riesgos | «genera el STACK.md» |
| `csr-gate` | Puerta de validez: format → lint → tipos → build → tests → cobertura → seguridad | «pasa los gates» |
| `csr-audit` | Auditoría de seguridad OWASP / ASVS / CWE | «audita la seguridad del diff» |
| `maw-route` | Elige modo (directo · plan · spec · carrera · diseño) y motor | automático |
| `maw-brief` | Convierte chat, plan, spec-kit o mockup en unidades de trabajo | «conviértelo en unidades» |
| `maw-plan` | Plan maestro por sprints con aprobación humana o en paralelo | «planifica X en sprints» |
| `maw-dispatch` | Coordinador: U0, reparto y supervisión (Orca · subagentes · manual) | «reparte las user stories» |
| `maw-worker` | Contrato de cada worker e informe con formato fijo | automático |
| `maw-integrate` | Revisión, merge con tu «sí» y gates del conjunto | «integra la ronda» |
| `maw-race` | El mismo problema a 2–3 agentes; gana el mejor diff | «carrera entre Claude y Gemini» |
| `maw-setup` | `ORCHESTRATION.md`, `orca.yaml`, `.worktreeinclude` | «prepara la orquestación» |

Convive con skills externas como **impeccable**, **supabase**, **spec-kit** y las de **Orca**: cada una manda en su terreno, y la puerta de validez y las prohibiciones se aplican siempre.

<img src="assets/d-flujo.svg" alt="" width="100%">

## 🔁 Flujo de trabajo

```mermaid
flowchart LR
    IN["Entrada<br/>chat · plan · spec-kit · diseño"] --> R{"maw-route"}
    R -- "cambio pequeño" --> D["Directo<br/>+ csr-gate"]
    R -- "varias unidades" --> B["maw-brief<br/>unidades"]
    B --> U0["U0 · coordinador<br/>base común + commit"]
    U0 --> W1["U1 · Claude Code<br/>worktree propio"]
    U0 --> W2["U2 · Antigravity<br/>worktree propio"]
    U0 --> W3["U3 · Codex<br/>worktree propio"]
    W1 & W2 & W3 --> I["maw-integrate<br/>revisión · tu «sí» · gates"]
```

**Las reglas que nunca se rompen:** una unidad = un worktree = una rama · los ficheros compartidos los toca una unidad por ronda · los workers no editan `tasks.md`, planes ni `STACK.md`, ni hacen merge · sin informe no hay unidad · nunca `PASS` de algo no ejecutado · lo pequeño no se orquesta.

Con **spec-kit**: tú decides (`specify → clarify → plan → tasks → analyze`); Setup + Foundational es la U0, cada user story es una unidad y el coordinador marca `[x]` al integrar.

<img src="assets/d-dentro.svg" alt="" width="100%">

## 📁 Estructura del repositorio

```text
orca-multiagent-kit/
├── core/AGENTS.md          núcleo siempre cargado (~80 líneas)
├── rules/                  00-router … 95-multi-agent  +  lang/ (17 lenguajes)
├── skills/                 kit-init · csr-* · maw-*
├── templates/              AGENTS.md · CLAUDE.md · STACK.md · ORCHESTRATION.md · orca.yaml · .worktreeinclude
├── output-styles/          csr-minimal (Claude Code)
├── install.sh              instala · migra · verifica · restaura · adopta
├── GUIA.html               guía visual del flujo
├── AI_INSTALL.md           instrucciones para que una IA lo instale
├── docs/MANUAL.md          manual completo
├── tests/                  pruebas del instalador en un $HOME desechable
├── scripts/                check.sh · build-release.sh · banner.py
└── .github/                CI (Linux + macOS), release con zip, plantillas de issues y PR
```

<img src="assets/d-docs.svg" alt="" width="100%">

## 📚 Documentación

| Documento | Para quién |
|:--|:--|
| [`GUIA.html`](GUIA.html) | Visión general visual (descárgala y ábrela en el navegador) |
| [`docs/MANUAL.md`](docs/MANUAL.md) | Instalación detallada, migración, convivencia, avisos y problemas frecuentes |
| [`AI_INSTALL.md`](AI_INSTALL.md) | Una IA que tiene que instalar o integrar el kit |
| [`CHANGELOG.md`](CHANGELOG.md) | Historial de versiones ([SemVer](https://semver.org/lang/es/)) |

## 🤝 Contribuir

Las contribuciones son bienvenidas: lee [`CONTRIBUTING.md`](CONTRIBUTING.md) (principios, cómo añadir skills o reglas, versionado y releases). Antes de abrir un PR:

```bash
bash scripts/check.sh && bash tests/test_install.sh
```

[Código de conducta](CODE_OF_CONDUCT.md) · [Seguridad](SECURITY.md) · [Soporte](SUPPORT.md)

<img src="assets/d-autores.svg" alt="" width="100%">

## 👥 Autores

<table>
  <tr>
    <td align="center" width="50%" valign="top">
      <a href="https://github.com/Necro-Coder"><img src="https://github.com/Necro-Coder.png?size=160" width="100" alt="Necro-Coder"><br><b>Necro-Coder</b></a><br>
      <sub>Autor de <b>CSR — Claude Session Rules</b></sub>
      <p align="left"><sub>Diseñó la base de calidad del kit: el protocolo de respuesta de consumo mínimo, la carga progresiva de reglas, la puerta de validez en 8 fases, los módulos de clean code, seguridad (OWASP, ASVS, CWE), testing, rendimiento, fiabilidad y cadena de suministro, las 17 guías por lenguaje y las skills <code>csr-stack</code>, <code>csr-gate</code> y <code>csr-audit</code>.</sub></p>
    </td>
    <td align="center" width="50%" valign="top">
      <a href="https://github.com/FernandoBaqueroo"><img src="https://github.com/FernandoBaqueroo.png?size=160" width="100" alt="Fernando Baquero"><br><b>Fernando Baquero</b></a><br>
      <sub>Autor de <b>Orca Multiagent Kit</b> y <b>MAW — Multi-Agent Work</b></sub>
      <p align="left"><sub>Convirtió CSR en una fuente única para varios proveedores (Claude Code, Antigravity, Codex, Copilot, Cursor y Devin). Creó la capa de orquestación multiagente (unidades de trabajo, worktrees, Orca y spec-kit), <code>kit-init</code>, el instalador con migración, verificación y restauración, y la guía visual.</sub></p>
    </td>
  </tr>
</table>

<img src="assets/d-licencia.svg" alt="" width="100%">

## 📄 Licencia

[MIT](LICENSE) © 2026 Fernando Baquero y Necro-Coder.

Las marcas Claude, Gemini/Antigravity, Codex/OpenAI, GitHub Copilot, Cursor y Orca pertenecen a sus respectivos propietarios. Se usan solo para indicar compatibilidad; este proyecto no está afiliado a ninguno de ellos.

<div align="center">

```text
> GAME OVER? NO: ./install.sh --verify
> PRESS START_
```

</div>
