# Kotlin (JVM, Android, KMP)
**Gates**: `ktlint`/`spotless` · `detekt` · `./gradlew build` con warnings como error · `./gradlew test connectedCheck` · `lint` de Android · OSV/Dependabot

## Idiomas
- Nulabilidad real: sin `!!`, sin `lateinit` evitable, sin `platform types` sin anotar. `?.`, `?:` y `requireNotNull` con mensaje.
- `data class` para datos, `sealed interface` + `when` exhaustivo para estados, `value class` para identificadores.
- Inmutabilidad: `val` por defecto, `List` en vez de `MutableList` en APIs públicas.
- Funciones de extensión con criterio; nada de extensiones sobre tipos del framework que confundan.
- Errores: `Result` o tipo sellado de dominio; excepciones para lo excepcional. Nunca `catch (e: Exception) {}`.

## Corrutinas
- `suspend` para I/O; `Dispatchers.IO` para bloqueo; nunca bloquear el hilo principal.
- Concurrencia estructurada: alcance con ciclo de vida (`viewModelScope`, `lifecycleScope`), nada de `GlobalScope`.
- Cancelación cooperativa: comprueba `isActive`, usa `withTimeout`, limpia en `finally` con `NonCancellable` solo si es imprescindible.
- `Flow` frío para flujos; `StateFlow`/`SharedFlow` para estado; `flowOn` para cambiar de contexto; sin `collect` sin alcance.

## Android
- Estado de UI inmutable expuesto desde el ViewModel; eventos de una sola vez por canal, no por estado.
- Sin lógica ni claves en `Activity`/`Composable`. Nada de secretos en el APK ni en `strings.xml`.
- Permisos mínimos y justificados; `EncryptedSharedPreferences`/Keystore para datos sensibles; `usesCleartextTraffic=false`; certificate pinning si aplica.
- Compose: estado elevado, `remember` con claves correctas, `key` estable en listas, evita recomposición por lambdas nuevas, `derivedStateOf` cuando toca.
- Exporta componentes solo si es necesario; valida los `Intent` recibidos; `PendingIntent` inmutable.

## Tests
JUnit5 + Turbine para `Flow` · `kotlinx-coroutines-test` con dispatcher controlado · MockK para dependencias externas · Robolectric/Compose UI tests para pantallas · Testcontainers en backend Ktor/Spring.
