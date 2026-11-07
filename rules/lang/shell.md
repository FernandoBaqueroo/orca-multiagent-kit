# Shell (Bash) y PowerShell
**Gates**: `shellcheck -S style` · `shfmt -d` · `Invoke-ScriptAnalyzer` · ejecución en seco (`--dry-run`) antes de la real

## Bash
- Cabecera obligatoria: `#!/usr/bin/env bash` y `set -Eeuo pipefail`; `IFS=$'\n\t'` si iteras texto.
- **Comilla todo**: `"$var"`, `"$@"`, `"${array[@]}"`. Sin comillas = bug de espacios y de globbing.
- `trap 'cleanup' EXIT INT TERM` para temporales; `mktemp -d` para directorios de trabajo.
- Comprueba dependencias al inicio (`command -v jq >/dev/null || exit 1`) y valida los argumentos.
- Nunca `eval`. Nunca `curl ... | bash`. Nunca rutas relativas asumidas: calcula el directorio del script.
- Nada de parsear `ls`; usa globs o `find -print0` con `read -d ''`.
- `rm -rf` solo sobre ruta construida y verificada (comprueba que no está vacía y que cuelga de la base esperada).
- Salida: errores a `stderr`, código de salida significativo, mensajes sin secretos.

## PowerShell
- `Set-StrictMode -Version Latest` y `$ErrorActionPreference = 'Stop'`.
- Verbo-Sustantivo aprobado, `[CmdletBinding()]`, `SupportsShouldProcess` con `-WhatIf` en cualquier función destructiva.
- Parámetros tipados con validación (`[ValidateSet]`, `[ValidateNotNullOrEmpty]`).
- `try/catch/finally` con excepciones tipadas; nunca `-ErrorAction SilentlyContinue` para tapar un fallo.
- Secretos: `SecureString`/`PSCredential` o gestor externo; nunca en texto plano ni en el historial de consola.
- Nunca `Invoke-Expression` con entrada externa. Llama binarios con `&` y array de argumentos.
- No uses `New-Item -Force` sobre un fichero existente: trunca.

## Ambos
Scripts idempotentes · `--help` y modo verboso · sin rutas absolutas de tu máquina · sin credenciales en línea de comandos (aparecen en la tabla de procesos) · registra lo que hace antes de hacerlo si es destructivo.
