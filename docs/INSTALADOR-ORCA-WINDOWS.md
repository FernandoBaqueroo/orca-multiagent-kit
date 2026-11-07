# Instalador en la app Orca y en Windows

Este documento explica qué fallaba al instalar el kit desde una terminal de Orca o desde Git Bash en Windows, qué cambia y cómo instalarlo ahora.

## Resumen

| Antes | Ahora |
|:--|:--|
| Dentro de Orca, el instalador escribía en el perfil de Claude que gestiona Orca | Detecta el perfil, instala en `~/.claude` (que el perfil importa) y no toca el perfil |
| Las rutas `C:\…` rompían los backups (`backups/<fecha>/C:/Users/…`) | Se normalizan a formato POSIX antes de usarlas |
| Git Bash copiaba en vez de enlazar, en silencio | Crea enlaces nativos de Windows o se para antes de tocar nada |
| Un backup de una ruta fuera de `$HOME` se restauraba dentro de `$HOME` | Se guarda bajo `_abs/` y vuelve a su sitio |
| `--restore` borraba cualquier enlace que encontrara en la ruta (también los tuyos) | Solo quita enlaces que apuntan a `~/.agents` |
| `--verify` decía «no enlaza» también cuando había una copia | Dice «es una copia» o «skills copiadas en vez de enlazadas», que es lo que hay que arreglar |
| `omk` podía usar el `bash` de WSL e instalar en Linux | Solo usa Git Bash (o el que indiques en `OMK_BASH`) |
| Las pruebas escribían en la configuración real si Orca había definido `CLAUDE_CONFIG_DIR` | Aíslan esas variables antes de empezar |

## El problema

### 1. Orca lanza Claude con un perfil propio

La app Orca arranca Claude Code con estas variables:

```
CLAUDE_CONFIG_DIR=C:\Users\<tú>\AppData\Roaming\orca\claude-profiles\<id>\home
ORCA_CLAUDE_INJECTED_CONFIG_DIR=<la misma ruta>
```

Ese directorio es de Orca. Su `CLAUDE.md` contiene una sola línea, `@~/.claude/CLAUDE.md`, y `skills/`, `rules/`, `output-styles/`… son enlaces a `~/.claude`. Es decir, el perfil **ya hereda** lo que haya en `~/.claude`.

El instalador usaba `CLAUDE_CONFIG_DIR` tal cual, así que desde una terminal de Orca:
- escribía el bloque `AGENTS` en el `CLAUDE.md` del perfil, que Orca puede regenerar;
- movía las reglas de CSR v1 a través de los enlaces del perfil (o sea, las de `~/.claude/rules`), con rutas de backup rotas (siguiente punto).

### 2. Rutas de Windows

`CLAUDE_CONFIG_DIR` llega como `C:\Users\…`, mientras que en Git Bash `$HOME` es `/c/Users/…`. El backup calculaba la ruta relativa con `${p#$HOME/}`, que no recortaba nada, y guardaba en `backups/<fecha>/C:/Users/…`. Después, `--restore` lo devolvía a `$HOME/C:/Users/…`, que no existe.

Lo mismo pasaba con cualquier ruta fuera de `$HOME` (`CLAUDE_CONFIG_DIR=/opt/claude`, `CODEX_HOME` en otro disco…).

### 3. `ln -s` en Git Bash copia

Por defecto, MSYS (Git Bash) no crea enlaces simbólicos: copia el fichero o la carpeta. El kit dejaba copias en `~/.claude/skills`, `~/.gemini/GEMINI.md`, etc. Funcionaba el primer día y divergía en cuanto actualizabas `~/.agents`, que es justo lo que el kit existe para evitar.

### 4. Las pruebas no estaban aisladas

`tests/test_install.sh` cambiaba `HOME` a una carpeta desechable, pero heredaba `CLAUDE_CONFIG_DIR`. Al ejecutarlo dentro de Orca, instalaba sobre la configuración real de Claude (perfil de Orca y, a través de sus enlaces, `~/.claude`). Esto pasó al preparar este cambio; se restauró desde el backup que había dejado el propio instalador.

## Qué cambia

`install.sh`:
- `to_posix()` normaliza `AGENT_KIT_HOME`, `CLAUDE_CONFIG_DIR`, `GEMINI_DIR`, `CODEX_HOME`, `--project` y `--adopt`. Usa `cygpath` (Git Bash, Cygwin) o `wslpath` (WSL) y, si no hay ninguno, una conversión mínima (`C:\a\b` → `/c/a/b`).
- **Perfil de Orca**: si `CLAUDE_CONFIG_DIR` está bajo `…/orca/claude-profiles/…` o coincide con `ORCA_CLAUDE_INJECTED_CONFIG_DIR`:
  - si su `CLAUDE.md` importa `@~/.claude/CLAUDE.md`, instala en `~/.claude` y lo dice en una línea;
  - si no lo importa, no toca Claude (el resto de agentes sí se instala), avisa y `--verify` lo marca `MAL`.
- **Enlaces en Windows**: en MSYS/Cygwin exporta `winsymlinks:nativestrict`. Antes de mover nada comprueba que puede crear un enlace; si no puede, se para con instrucciones. Si un enlace falla a mitad, el mensaje incluye el comando `--restore` de ese backup.
- **Backups**: las rutas de `$HOME` siguen igual (`backups/<fecha>/<ruta relativa>`), así que los backups antiguos se restauran como antes. Las de fuera van a `backups/<fecha>/_abs/<ruta absoluta>`.
- **`--restore`**: solo elimina directorios padre que sean enlaces a `~/.agents` (los que creó el kit). Si tu `~/.claude` es un enlace a tus dotfiles, se respeta.
- **`--verify`**: «… es una copia, no un enlace» (ficheros de reglas globales) y «skills copiadas en vez de enlazadas: …» (skills), separadas de las que faltan.

`bin/omk.js`: en Windows busca Git Bash en `%ProgramFiles%`, `%ProgramFiles(x86)%` y `%LOCALAPPDATA%\Programs` (instalación por usuario). Solo acepta el `bash` del `PATH` si `uname -s` es MINGW/MSYS/CYGWIN. El de WSL tiene otro `$HOME` y no entiende rutas `C:\`. `OMK_BASH` sigue mandando sobre todo.

`tests/`: las dos suites hacen `unset` de `CLAUDE_CONFIG_DIR CODEX_HOME GEMINI_DIR AGENT_KIT_HOME ORCA_CLAUDE_INJECTED_CONFIG_DIR`. Hay casos nuevos: perfil de Orca con y sin import, detección por `ORCA_CLAUDE_INJECTED_CONFIG_DIR`, ruta `C:\…` (solo si hay `cygpath`), backup y restauración fuera de `$HOME`, y copia detectada por `--verify`. `test_cli.sh` funciona también en Windows (binario de npm en `<prefix>/omk` y `$HOME` de Node en `USERPROFILE`).

## Cómo instalar ahora

**macOS, Linux, WSL**: sin cambios.

**Windows con Git Bash**, también desde una terminal de Orca:

1. Activa el *Modo de desarrollador* (Configuración → Sistema → Para programadores), o abre Git Bash como administrador. Solo hace falta para crear enlaces.
2. Instala:
   ```bash
   ./install.sh --dry-run   # dentro de Orca, en «Para tu información»: «perfil de Orca detectado (…); se instala en ~/.claude»
   ./install.sh
   ./install.sh --verify
   ```
   O con Node: `npx orca-multiagent-kit install`.
3. Abre una sesión nueva de Claude en Orca. El perfil importa `~/.claude/CLAUDE.md`, que a su vez importa `~/.agents/AGENTS.md`.

Si en el paso 2 sale «Este Windows no deja crear enlaces simbólicos», no se ha tocado nada: haz el paso 1 y repite.

## Cómo probarlo

```bash
bash scripts/check.sh
bash tests/test_install.sh   # las secciones 10 a 13 son las nuevas
bash tests/test_cli.sh
```

A mano, dentro de Orca, sin riesgo (`--dry-run` no escribe):
```bash
./install.sh --dry-run | grep "perfil de Orca"
cat "$CLAUDE_CONFIG_DIR/CLAUDE.md"   # debe seguir siendo @~/.claude/CLAUDE.md
```

## Riesgos y límites

- La detección del perfil se basa en la ruta `orca/claude-profiles` y en `ORCA_CLAUDE_INJECTED_CONFIG_DIR`. Si Orca cambia ese esquema, el instalador volvería a tratar el perfil como un `CLAUDE_CONFIG_DIR` normal. En ese caso, define `CLAUDE_CONFIG_DIR="$HOME/.claude"` antes de instalar.
- Si un enlace falla a mitad (por ejemplo, el disco destino no admite enlaces), lo ya movido está en el backup y el mensaje da el `--restore` exacto.
- La CI solo corre en Linux y macOS. Los casos de Windows (secciones 11 y 13 con enlaces nativos, `test_cli.sh` con el binario de npm en Windows) se han probado en Windows 11 con Git Bash, pero no en CI.
