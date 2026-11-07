# Java (y Spring Boot / Quarkus)
**Gates**: `mvn -q verify` o `gradle check` · Spotless/Checkstyle · SpotBugs + find-sec-bugs · `mvn dependency-check` u OSV · JaCoCo con umbral

## Idiomas
- Java moderno: `record` para datos, `sealed` + `switch` con patrones para jerarquías cerradas, `var` solo cuando el tipo es evidente, text blocks.
- Inmutabilidad por defecto: campos `final`, colecciones `List.of`/`Map.copyOf`, sin setters en objetos de dominio.
- `Optional` como tipo de retorno; nunca como parámetro ni como campo. Nunca devolver `null` en API pública.
- Excepciones: comprobadas para fallos recuperables del dominio, no comprobadas para errores de programación. Nunca `catch (Exception e) {}`. Conserva la causa.
- Inyección por constructor, no por campo. Sin `static` mutable.
- `try-with-resources` para todo `Closeable`. `equals`/`hashCode` coherentes.

## Spring / Quarkus
- Capas: controlador (validación y mapeo) → servicio (negocio, transacciones) → repositorio. Sin entidades JPA en la API pública: usa DTO.
- `@Transactional` en el servicio, con el alcance mínimo; sin llamadas remotas dentro de la transacción.
- Validación con Bean Validation en el borde (`@Valid`).
- Seguridad: autorización por método/endpoint (`@PreAuthorize`), denegar por defecto, CSRF activo si hay sesión por cookie, CORS explícito, actuator restringido.
- Configuración externalizada; secretos en el gestor, nunca en `application.yml` del repo.

## JPA
`FetchType.LAZY` por defecto; evita N+1 con `join fetch` o `EntityGraph`; paginación siempre; consultas con parámetros nombrados, nunca concatenadas; `@Version` para bloqueo optimista; migraciones con Flyway/Liquibase, jamás `ddl-auto=update` en producción.

## Seguridad
`PreparedStatement` siempre · sin deserialización Java de datos externos · `SecureRandom` · BCrypt/Argon2 para contraseñas · `MessageDigest.isEqual` para comparar · parser XML con entidades externas desactivadas · límites de tamaño de petición.

## Concurrencia
Prefiere inmutabilidad y `ExecutorService`/virtual threads a hilos manuales. `ConcurrentHashMap` en vez de sincronizar a mano. Nada de bloqueo dentro de secciones críticas. Timeouts en todo cliente.

## Tests
JUnit 5 + AssertJ; Mockito solo para colaboradores externos; Testcontainers para BD y colas; `@SpringBootTest` solo en pruebas de integración reales; ArchUnit para reglas de arquitectura; jqwik para propiedades; PIT para mutación.
