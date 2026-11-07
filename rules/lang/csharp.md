# C# / .NET
**Gates**: `dotnet format --verify-no-changes` · `dotnet build -warnaserror` · `dotnet test --collect:"XPlat Code Coverage"` · `dotnet list package --vulnerable --include-transitive` · analizadores Roslyn + Security Code Scan

## Idiomas
- `Nullable` habilitado en el proyecto y respetado: sin `!` salvo comentario justificado.
- `record` para datos inmutables, `readonly struct` para valores pequeños, `required` e `init` en vez de constructores gigantes.
- `switch` con patrones y comprobación exhaustiva; evita cadenas de `if` sobre el tipo.
- Excepciones específicas; nunca `catch (Exception)` vacío; `throw;` para conservar el stack (no `throw ex;`).
- `IDisposable`/`IAsyncDisposable` con `using`. Nada de finalizadores salvo recursos no gestionados.

## Async
- `async` de punta a punta. Prohibido `.Result`, `.Wait()` y `Task.Run` para envolver I/O.
- `CancellationToken` propagado en toda operación asíncrona pública.
- `ConfigureAwait(false)` en librerías. `IAsyncEnumerable` para flujos.
- `HttpClient` vía `IHttpClientFactory` con timeout y Polly para reintentos con backoff.

## ASP.NET Core
Validación en el borde (FluentValidation o DataAnnotations) · autorización por política y por recurso, denegando por defecto · antiforgery activo con cookies · CORS explícito · cabeceras de seguridad · límites de tamaño y rate limiting · problemas devueltos como `ProblemDetails` sin stack · configuración y secretos por `IOptions` y gestor de secretos, nunca en `appsettings.json` del repo.

## EF Core
Consultas LINQ parametrizadas; `FromSqlRaw` solo con parámetros · `AsNoTracking` en lecturas · proyecta a DTO en vez de traer la entidad completa · evita N+1 con `Include` o proyección · paginación obligatoria · migraciones revisadas antes de aplicar.

## Seguridad
`RandomNumberGenerator` (nunca `Random`) · `CryptographicOperations.FixedTimeEquals` · ASP.NET Identity o Argon2/BCrypt para contraseñas · sin `BinaryFormatter` · rutas validadas con `Path.GetFullPath` y comprobación de prefijo.

## Tests
xUnit + FluentAssertions; NSubstitute/Moq solo para dependencias externas; WebApplicationFactory para integración; Testcontainers para BD; Bogus para datos; Stryker.NET para mutación.
