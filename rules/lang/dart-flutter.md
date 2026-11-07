# Dart / Flutter
**Gates**: `dart format --set-exit-if-changed .` · `dart analyze --fatal-infos` · `flutter test --coverage` · `flutter build` por plataforma · `dart pub outdated` + auditoría

## Dart
- `analysis_options.yaml` estricto: `strict-casts`, `strict-raw-types`, sin `dynamic` implícito.
- Null safety real: sin `!` gratuito, sin `late` evitable.
- `sealed class` + `switch` exhaustivo para estados; `records` y patrones para retornos múltiples.
- Errores tipados de dominio; `Future` siempre esperado o encadenado (`unawaited` explícito si de verdad no se espera).
- `const` en todo lo que pueda serlo.

## Flutter
- Widgets pequeños y `const`; separa widget de lógica; nada de lógica de negocio en `build`.
- `build` debe ser puro y barato: sin I/O, sin construcciones costosas, sin `setState` en cadena.
- Estados de UI explícitos: cargando, error, vacío, con datos.
- Listas con `ListView.builder` y claves estables; imágenes con caché y tamaño acotado.
- Libera `controllers`, `streams`, `listeners` y `AnimationController` en `dispose`.
- Gestión de estado: la que use el proyecto (Riverpod/Bloc/Provider), pero una sola y coherente.

## Seguridad
- Secretos nunca en el binario ni en `--dart-define` de un repo público; usa `flutter_secure_storage` o Keychain/Keystore.
- Valida en el backend; el cliente no autoriza. Verificación TLS activa, pinning si aplica.
- Deep links y datos del portapapeles tratados como entrada no confiable.
- Ofusca y desactiva logs en release (`kReleaseMode`).

## Tests
Unitarios de dominio sin Flutter · widget tests con `pumpWidget` y búsquedas por semántica (`find.bySemanticsLabel`) o texto visible · golden tests con tolerancia · `integration_test` para recorridos críticos · `mocktail` para dependencias externas.
