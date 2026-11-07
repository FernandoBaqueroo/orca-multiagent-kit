# PHP (y Laravel / Symfony)
**Gates**: `php-cs-fixer fix --dry-run` (PSR-12) · `phpstan analyse --level=max` o Psalm · `phpunit --coverage-text` · `composer audit` · `psalm --taint-analysis`

## Idiomas
- `declare(strict_types=1)` en todos los ficheros. Tipos en parámetros, retornos y propiedades.
- `readonly` y objetos de valor para datos; enums nativos en vez de constantes sueltas.
- Excepciones de dominio propias; nunca `@` para silenciar errores; nunca `die`/`exit` en código de librería.
- Composer con `composer.lock` commiteado y autoload PSR-4. Sin `require` de rutas dinámicas.

## Seguridad
- SQL: PDO con sentencias preparadas y `PDO::ATTR_EMULATE_PREPARES => false`. Eloquent/Doctrine con binding; nunca concatenar.
- XSS: escapa en la plantilla (`{{ }}` de Blade/Twig escapa; `{!! !!}` y `|raw` prohibidos salvo sanitizado explícito).
- Nunca `eval`, `extract`, `unserialize` sobre datos externos (usa JSON), ni `include` con variable del usuario.
- `password_hash`/`password_verify` (Argon2id si está disponible); `random_bytes` para tokens; `hash_equals` para comparar.
- CSRF activo en todo formulario; sesión con cookie `httponly`, `secure`, `samesite`; regenerar id al iniciar sesión.
- Subida de ficheros: comprobar tipo real, renombrar, guardar fuera del webroot, sin permisos de ejecución.
- Producción: `display_errors=Off`, `expose_php=Off`, `open_basedir` si aplica, dependencias sin CVE.

## Laravel
- Validación con Form Request; autorización con Policies (denegar por defecto) en cada acción.
- Sin asignación masiva ciega: `$fillable` explícito, nunca `$guarded = []`.
- Evita N+1 con `with()`; activa `Model::preventLazyLoading()` en desarrollo.
- Colas para trabajo lento; jobs idempotentes. Migraciones reversibles.
- `.env` fuera del repo; `php artisan config:cache` en despliegue.

## Tests
PHPUnit o Pest · factories para datos · base de datos en transacción o contenedor efímero · Infection para mutación · tests de autorización por cada endpoint protegido.
