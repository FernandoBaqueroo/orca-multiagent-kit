# Go
**Gates**: `gofmt -l .` · `go vet ./...` · `golangci-lint run` · `go test -race -cover ./...` · `govulncheck ./...` · `gosec ./...`

## Idiomas
- Errores como valores: comprobar **siempre**. `fmt.Errorf("contexto: %w", err)` para envolver; `errors.Is`/`errors.As` para inspeccionar.
- Nunca `_ = err` salvo comentario justificado. Nunca `panic` en librería; solo en `main` ante estado imposible.
- Interfaces pequeñas, definidas en el **consumidor**. Acepta interfaces, devuelve structs.
- Valor cero útil. Constructores solo si hay invariante que mantener.
- `context.Context` como primer parámetro en toda función que haga I/O; respétalo (`ctx.Done()`), no lo guardes en structs.
- `defer` para liberar; cuidado con `defer` dentro de bucles.

## Concurrencia
- No lances una goroutine sin saber cómo termina. `errgroup` o `WaitGroup` siempre.
- Canales para comunicar, mutex para proteger estado. Cierra el canal quien escribe.
- `go test -race` obligatorio en CI.
- Timeouts en todo cliente HTTP (`http.Client{Timeout}`), nunca `http.DefaultClient` en producción.

## Seguridad
- `database/sql` con parámetros (`$1`, `?`); nunca `fmt.Sprintf` en SQL.
- `exec.Command` con argumentos separados; sin shell.
- `crypto/rand` para aleatoriedad; `subtle.ConstantTimeCompare`; `golang.org/x/crypto/argon2` para contraseñas.
- `html/template` (escapa) y no `text/template` para HTML.
- Límite de tamaño en `io.Copy`/body (`http.MaxBytesReader`), timeouts de servidor (`ReadHeaderTimeout`).
- Rutas: `filepath.Clean` + comprobación de prefijo; `os.Root` o `http.Dir` con cuidado.

## Rendimiento
`pprof` y `go test -bench -benchmem` antes de optimizar. Preasigna slices con capacidad conocida. Evita copias grandes; punteros cuando el struct pesa. `strings.Builder` para concatenar.

## Tests
Table-driven con subtests, `t.Parallel` cuando sea seguro, `httptest` para servidores, `testing/fstest`, fuzzing con `go test -fuzz`. Sin dependencias de red en unitarios.
