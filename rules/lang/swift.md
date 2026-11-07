# Swift (iOS / macOS)
**Gates**: `swiftformat --lint` · `swiftlint --strict` · `swift build -warnings-as-errors` · `swift test` / `xcodebuild test` · escaneo de dependencias SPM

## Idiomas
- Semántica de valor: `struct` y `enum` por defecto; `class` solo con identidad o ciclo de vida compartido; `final` salvo que se herede a propósito.
- Opcionales explícitos: sin `!` forzado, sin `try!`, sin `as!`. `guard let` con salida temprana.
- Errores con `throws` y tipos de error propios; `Result` en fronteras asíncronas antiguas. Nunca silenciar con `try?` sin comentario.
- Protocolos pequeños y composición; extensiones para conformidad. Genéricos con restricciones claras.
- `@inlinable`/`@usableFromInline` solo con motivo; `Codable` con claves explícitas y validación del payload externo.

## Concurrencia (Swift 6)
- `async/await` y actores; sin `DispatchSemaphore` para esperar código asíncrono.
- Estado mutable compartido dentro de un actor; `@MainActor` para todo lo que toque UI.
- Respeta `Sendable`: si el compilador se queja de concurrencia, es un bug real, no ruido.
- Cancelación cooperativa: comprueba `Task.isCancelled`, propaga el `Task` y cancélalo en `deinit`/`onDisappear`.

## Memoria
`weak`/`unowned` para romper ciclos en closures y delegados (`[weak self]`); cuidado con retención en `Task` de larga vida; instrumenta fugas con Instruments.

## Seguridad (app)
- Secretos y tokens en Keychain (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`), nunca en `UserDefaults` ni en el bundle.
- Biometría con `LAContext` como conveniencia, no como única barrera; la clave real protegida por Secure Enclave o por contraseña del usuario.
- ATS activo; certificate pinning si el modelo de amenaza lo exige. Sin `NSAllowsArbitraryLoads`.
- `CryptoKit` para cripto (`AES.GCM`, `ChaChaPoly`, `SymmetricKey`); nunca cripto propia. Borra material sensible de memoria cuando puedas.
- Valida todo lo que entre por URL scheme, universal link, pasteboard o ficheros compartidos.

## SwiftUI
Una fuente de verdad por estado; `@State` local, `@Observable`/`@StateObject` para modelos; vistas pequeñas y puras; `id` estable en `ForEach`; evita trabajo pesado en `body`.

## Tests
XCTest o Swift Testing · dependencias inyectadas por protocolo · `URLProtocol` simulado para red · pruebas de UI solo en recorridos críticos · snapshot tests con tolerancia controlada.
