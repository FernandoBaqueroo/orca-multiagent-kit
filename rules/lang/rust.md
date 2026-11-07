# Rust
**Gates**: `cargo fmt --check` · `cargo clippy --all-targets --all-features -- -D warnings` · `cargo test` · `cargo build --locked --release` · `cargo audit` · `cargo deny check` · `cargo llvm-cov`

## Idiomas
- Errores: `thiserror` en librería, `anyhow` en binario. `?` para propagar, `.context(...)` para contexto.
- Prohibido en producción: `unwrap()`, `expect()`, `panic!`, indexado sin comprobar; salvo comentario `// INVARIANT:` que demuestre que no puede fallar. En tests, libre.
- Tipos que impiden estados inválidos: newtype (`struct UserId(Uuid)`), enum en vez de booleanos, `NonZeroU32`, typestate.
- Préstamos antes que clones. `&str`/`&[T]` en parámetros, tipo propio en retorno. `Cow<str>` si dudas.
- Iteradores en vez de índices. `collect::<Result<Vec<_>, _>>()` para propagar en lote.
- Traits pequeños, `impl Trait` en argumentos, genéricos solo con más de un tipo real.
- `#[must_use]` en constructores; `#[non_exhaustive]` en enums de error públicos.

## Seguridad
- `unsafe`: prohibido salvo necesidad demostrada; bloque mínimo con `// SAFETY:` justificando cada invariante; testear con Miri.
- Aritmética: `checked_*` / `saturating_*` / `wrapping_*` explícito donde pueda desbordar (release no comprueba overflow).
- Cripto: RustCrypto (`aes-gcm`, `chacha20poly1305`), `argon2`, `rand::rngs::OsRng`; `zeroize` para claves y contraseñas.
- SQL: `sqlx` con macros verificadas en compilación, o `rusqlite` con parámetros nombrados. Nunca `format!` en SQL.
- Serde en entrada externa: `#[serde(deny_unknown_fields)]` y límites de tamaño.
- `cargo deny` para licencias, duplicados y avisos de seguridad.

## Async
- Un solo runtime. No bloquear el executor: `spawn_blocking` para CPU o I/O sincrónica.
- `tokio::time::timeout` en toda operación de red. Cuidado con cancelación: estado a medias al soltar un future.
- Canales y propiedad antes que `Arc<Mutex<T>>`.

## Tauri (si aplica)
- Capabilities al mínimo, CSP estricta, sin `shell.open` con entrada del usuario.
- Claves y material criptográfico **solo** en el core Rust; el frontend invoca comandos tipados y nunca ve una clave.
- Todo argumento que llega del WebView es entrada no confiable: validar en Rust.

## Tests
Unitarios en `#[cfg(test)]`, integración en `tests/`. `proptest` para invariantes, `cargo fuzz` en parsers, `insta` para snapshots, `criterion` para benchmarks, `cargo-mutants` en dominio crítico.
