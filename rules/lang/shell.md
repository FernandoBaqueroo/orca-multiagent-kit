# Shell (Bash) y PowerShell
**Gates**: `shellcheck -S style` · `shfmt -d` · `Invoke-ScriptAnalyzer -Path . -Recurse` (PSScriptAnalyzer) · ejecución en seco (`--dry-run` / `-WhatIf`) antes de la real

## Bash
- Cabecera obligatoria: `#!/usr/bin/env bash` y `set -Eeuo pipefail`; `IFS=$'\n\t'` si iteras texto.
- **Comilla todo**: `"$var"`, `"$@"`, `"${array[@]}"`. Sin comillas = bug de espacios y de globbing.
- `trap 'cleanup' EXIT INT TERM` para temporales; `mktemp -d` para directorios de trabajo.
- Comprueba dependencias al inicio (`command -v jq >/dev/null || exit 1`) y valida los argumentos.
- Nunca `eval`. Nunca `curl ... | bash`. Nunca rutas relativas asumidas: calcula el directorio del script.
- Nada de parsear `ls`; usa globs o `find -print0` con `read -d ''`.
- `rm -rf` solo sobre ruta construida y verificada (comprueba que no está vacía y que cuelga de la base esperada).
- Salida: errores a `stderr`, código de salida significativo, mensajes sin secretos.

## Portabilidad (macOS, Linux, Git Bash)
- macOS trae bash 3.2: sin arrays asociativos, sin `mapfile`/`readarray`, sin `${var,,}`. Si el script debe correr ahí, pruébalo con esa versión.
- GNU y BSD difieren: `sed -i` (evítalo: escribe a un temporal y mueve), `date`, `readlink -f`, `stat`, `grep -P`.
- Fin de línea: `*.sh text eol=lf` en `.gitattributes`; un `\r` rompe el shebang y las comparaciones.
- Git Bash (MSYS2) en Windows:
  - Las variables pueden llegar en formato Windows (`C:\Users\…`) y `$HOME` en formato MSYS (`/c/Users/…`): normaliza con `cygpath -u` antes de comparar o recortar prefijos, y `cygpath -w` al pasar rutas a programas nativos.
  - `ln -s` **copia** en vez de enlazar salvo con `MSYS=winsymlinks:nativestrict` (y Modo desarrollador o permisos de administrador). Si un enlace es imprescindible, comprueba con `[ -L ruta ]` que se creó de verdad y falla si no.
  - MSYS reescribe argumentos que parecen rutas (`/foo` → `C:/Program Files/Git/foo`) al llamar a ejecutables nativos; desactívalo con `MSYS2_ARG_CONV_EXCL` cuando moleste.

## PowerShell
- `Set-StrictMode -Version Latest` y `$ErrorActionPreference = 'Stop'`.
- Verbo-Sustantivo aprobado, `[CmdletBinding()]`, `SupportsShouldProcess` con `-WhatIf` en cualquier función destructiva.
- Parámetros tipados con validación (`[ValidateSet]`, `[ValidateNotNullOrEmpty]`).
- `try/catch/finally` con excepciones tipadas; nunca `-ErrorAction SilentlyContinue` para tapar un fallo.
- Binarios externos: un código de salida distinto de 0 **no** lanza excepción por defecto. Comprueba `$LASTEXITCODE` tras cada llamada, o en PowerShell ≥7.4 usa `$PSNativeCommandUseErrorActionPreference = $true`.
- Secretos: `SecureString`/`PSCredential` o gestor externo; nunca en texto plano ni en el historial de consola.
- Nunca `Invoke-Expression` con entrada externa. Llama binarios con `&` y array de argumentos.
- Rutas: `Join-Path` y `-LiteralPath` (los corchetes son comodines en `-Path`).
- No uses `New-Item -Force` sobre un fichero existente: trunca.

## Windows PowerShell 5.1 frente a PowerShell 7 (`pwsh`)
- Declara cuál necesitas (`#Requires -Version 7.4`) y no asumas que es la que hay: Windows trae 5.1.
- 5.1 no tiene `&&`/`||` ni el operador ternario, y `Out-File`/`>` escriben UTF-16 por defecto: usa `-Encoding utf8` explícito al generar ficheros que lean otras herramientas.
- No cambies la política de ejecución de la máquina (`Set-ExecutionPolicy Bypass` global) para que un script funcione: firma el script o usa `-Scope Process`.

## Ambos
Scripts idempotentes · `--help` y modo verboso · sin rutas absolutas de tu máquina · sin credenciales en línea de comandos (aparecen en la tabla de procesos) · registra lo que hace antes de hacerlo si es destructivo.
