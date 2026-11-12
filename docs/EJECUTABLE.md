# Ejecutable y `omk setup`: Orca listo de una vez

`omk setup` deja [Orca](https://www.onorca.dev) preparado para el kit con una sola orden. El ejecutable autónomo (`omk-windows-x64.exe`, `omk-macos-arm64`, `omk-linux-x64`) es lo mismo para quien no tiene Node: se descarga, se abre y hace `omk setup`.

## Qué hace `omk setup`

| Paso | Qué pasa | Si falla |
|---|---|---|
| 0. Solo con npx | El kit corre desde una caché que npm borra cuando quiere: instala `omk` de forma permanente (`npm install -g orca-multiagent-kit@<versión>`) y sigue desde ahí | Dice cómo hacerlo a mano y sale con error |
| 1. Kit | Reglas y skills en `~/.agents` (con backup, como siempre; acepta `--agents` y `--dry-run`) | Se para con el código de `install.sh` |
| 1b. Reparto en Claude Code | Si usas Claude Code, fusiona en `~/.claude/settings.json` los hooks que recuerdan la puerta de reparto y la puerta obligatoria (`--no-hooks` para omitirlo). Sin Node en el PATH, la puerta se ejecuta con el propio `omk` (`omk gate hook`) | Un `settings.json` que no es JSON no se toca, y lo dice |
| 2. `omk` en el `PATH` (solo el ejecutable) | Se copia a sí mismo a `%LOCALAPPDATA%\Programs\orca-multiagent-kit\omk.exe` (Windows) o `~/.local/bin/omk`, y en Windows añade esa carpeta al `Path` de tu usuario | No pisa un `omk` que no sea el del kit; lo dice y sale con error |
| 3. Orca | Busca su CLI (`PATH`, o donde lo deja el instalador de Orca; `OMK_ORCA` para indicar otro) y comprueba que su versión cumple `engines.orca` del plugin | Dice qué falta (instalar o actualizar Orca) y sale con error |
| 4. App | Si Orca no está abierto, `orca open` y espera a que arranque | Sale con error |
| 5. Plugins | `orca plugin system on` (el mismo interruptor que *Settings → Plugins → Turn on plugins*; no aprueba nada) | Sale con error |
| 6. Plugin del kit | Instala, actualiza o aprueba el plugin, según lo que haya ([detalle](PLUGIN-ORCA.md#instalar)). Orca enseña lo que concede y **omk te pregunta** antes de aprobarlo | Sin tu sí no se instala, y sale con error |
| 7. Panel | `orca plugin open local.multiagent-kit --panel kit`: el panel *Multiagent Kit* queda abierto en la barra lateral derecha | Solo avisa |

```bash
omk setup --dry-run      # qué haría, sin escribir ni instalar nada
omk setup                # pregunta antes de aprobar el plugin
omk setup --yes          # aprueba el acceso del plugin sin preguntar (lo que liste Orca)
omk setup --no-plugin    # solo el kit (y omk en el PATH, con el ejecutable)
omk setup --no-path      # el ejecutable no toca el PATH; te dice qué añadir
```

Con doble clic, el ejecutable hace `omk setup` y espera a que pulses Enter antes de cerrar la ventana.

**Ajustes del plugin**: en el panel *Multiagent Kit* o en *Settings → Plugins → Orca Multiagent Kit*, que Orca construye con los ajustes que declara el manifiesto. Son los mismos valores en los dos sitios.

## El ejecutable

Es un [Node SEA](https://nodejs.org/api/single-executable-applications.html): el Node oficial con el kit dentro. Al arrancar extrae el kit a una carpeta estable y ejecuta `omk` desde ella:

| Sistema | Kit extraído | `omk` |
|---|---|---|
| Windows | `%LOCALAPPDATA%\Programs\orca-multiagent-kit\kit` | `%LOCALAPPDATA%\Programs\orca-multiagent-kit\omk.exe` |
| macOS, Linux | `~/.local/share/orca-multiagent-kit` | `~/.local/bin/omk` |

`OMK_HOME` y `OMK_BIN_DIR` cambian esas carpetas. La carpeta del kit tiene que existir para que Orca pueda actualizar el plugin (`orca plugin update` vuelve a copiar la carpeta desde la que se instaló).

- Solo extrae cuando cambia la build (sello `.omk-build` con el SHA-256 del kit embebido). Extrae en `<carpeta>.new` y la cambia por la anterior al final: una extracción a medias no deja un kit roto.
- No pisa una carpeta que no sea una copia del kit (sin `VERSION` e `install.sh`). En macOS y Linux es la misma carpeta que usa `scripts/get.sh`: la versión que quede es la del último que se ejecutó.
- `omk update` en el ejecutable se actualiza a sí mismo: mira cuál es la última release, descarga el ejecutable de tu sistema junto al que está en marcha (`omk.new`), comprueba que su SHA-256 es el del `.sha256` publicado y solo entonces lo cambia (en Windows renombra el que está en marcha a `omk.exe.old`, que se borra en la siguiente actualización). Después el ejecutable nuevo extrae su kit y pone al día `~/.agents`, el proyecto de la carpeta actual y el plugin de Orca. Si la descarga o la comprobación fallan, el ejecutable queda como estaba. Solo descarga por HTTPS de GitHub. `omk update --offline` no descarga nada.
- Sigue necesitando bash para `install.sh`: en Windows, Git for Windows (Orca usa Git para los worktrees, así que suele estar ya).
- Pesa ~90 MiB, porque lleva Node entero.

**PATH en Windows.** Escribe en `HKCU\Environment\Path` con la API del registro, sin expandir las variables que ya tenga (`%USERPROFILE%\…`) y conservando su tipo (`REG_EXPAND_SZ`), y avisa a Windows del cambio. Orca y los terminales abiertos antes no lo ven: **cierra y vuelve a abrir Orca** para que los comandos del plugin encuentren `omk`. En macOS y Linux no toca tus ficheros de shell: te dice la línea que tienes que añadir si `~/.local/bin` no está en el `PATH`.

**Firma.** Los binarios de la release no están firmados con un certificado de desarrollador. Windows SmartScreen puede avisar al abrirlo (*Más información → Ejecutar de todas formas*), y en macOS lleva solo firma ad hoc: si Gatekeeper lo bloquea, `xattr -d com.apple.quarantine omk-macos-arm64`. Comprueba la integridad con su `.sha256` antes de abrirlo.

## Construirlo

```bash
node scripts/build-exe.js      # o: npm run build:exe
bash tests/test_exe.sh         # pruebas del ejecutable, en carpetas desechables y con un doble de Orca
```

Construye el ejecutable del sistema y la arquitectura donde se ejecuta, con el Node que lo ejecuta (≥ 20.12; la CI usa 22). Deja `dist/omk-<sistema>-<arquitectura>[.exe]` y su `.sha256`. Node SEA no compila para otro sistema: la release construye cada uno en su runner (`.github/workflows/release.yml`, job `exe`).

Pasos: empaqueta en `kit.json.gz` lo mismo que el zip de la release; genera el blob con `node --experimental-sea-config`; copia el binario de Node; inyecta el blob con [`postject`](https://github.com/nodejs/postject) (de nodejs, fijado a `1.0.0-alpha.6`, se descarga con `npx` al construir y no va dentro del ejecutable); en macOS quita la firma de Node antes y firma ad hoc después.

## Pruebas

- `tests/test_orca.sh`: `omk setup` y `omk plugin` contra `tests/fixtures/fake-orca.js`, un doble del CLI de Orca (`OMK_ORCA` apunta siempre a él: las pruebas nunca hablan con tu Orca). Cubre la aprobación (sin `--yes` ni terminal no aprueba; con `--yes` usa la huella de Orca; una huella con formato inesperado se rechaza), cada estado del plugin, Orca ausente o antigua, y `setup` completo, en simulación y sin aprobación.
- `tests/test_exe.sh`: el ejecutable (extracción, sello, carpeta ajena, `install --dry-run`, `update --offline`, `setup` copiándose a `OMK_BIN_DIR` sin tocar el `PATH`, un `omk` ajeno que no se pisa, y la autoactualización de extremo a extremo: una «release» servida en la propia máquina (`OMK_RELEASE_BASE`, que solo admite HTTPS o HTTP contra `127.0.0.1`) de la que el ejecutable en marcha se descarga, se comprueba, se sustituye y sigue).
- La CI ejecuta las dos en Linux, macOS y Windows (job `exe`).

DEFERRED:
- **Firma de código** (Authenticode, notarización de Apple): necesita certificados del proyecto.
- **Linux arm64 y macOS x64**: la release construye los runners por defecto de GitHub (`ubuntu-latest` x64, `macos-latest` arm64, `windows-latest` x64).
