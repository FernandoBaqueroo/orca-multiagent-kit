# C / C++
**Gates**: `clang-format --dry-run -Werror` · `clang-tidy` · compilar con `-Wall -Wextra -Wpedantic -Werror` (MSVC `/W4 /WX`) · ASan+UBSan en tests · TSan si hay hilos · `cppcheck` · fuzzing

## Memoria (origen del 70% de los CVE de este lenguaje)
- **Cero `new`/`delete`/`malloc` manuales** en código nuevo: `std::unique_ptr`, `std::shared_ptr` solo si la propiedad es realmente compartida, contenedores de la STL.
- RAII para todo recurso (fichero, socket, lock, handle).
- Sin aritmética de punteros cruda: `std::span`, `std::string_view`, `.at()` en rutas no calientes.
- Regla del cero; si defines uno de los cinco especiales, define todos y razona la propiedad.
- Vigila: desbordamiento de buffer (CWE-787/121/122), lectura fuera de límites (125), use-after-free (416), doble liberación, `string_view`/iterador colgante tras reasignación.
- Nunca `strcpy`, `sprintf`, `gets`, `atoi`. Usa `snprintf` con tamaño, `std::from_chars`, `std::format`.

## Corrección
- C++ moderno (17/20/23): `constexpr`, `enum class`, `std::optional`, `std::variant`, `std::expected`, algoritmos de `<algorithm>` en vez de bucles a mano.
- `const` y `noexcept` donde corresponda; `[[nodiscard]]` en funciones cuyo retorno no se puede ignorar.
- Entero: comprueba desbordamiento (CWE-190) antes de operar; nada de conversión implícita con signo/tamaño distinto; `size_t` para tamaños.
- Sin comportamiento indefinido "que funciona": UB es un fallo, aunque el binario pase los tests.
- Inicializa siempre; sin variables no inicializadas.

## Concurrencia
`std::jthread` con `stop_token`, `std::mutex` con `scoped_lock`, orden fijo de bloqueos para evitar deadlock, atómicos solo con modelo de memoria entendido, nada de `volatile` como sincronización. TSan en CI.

## Build y dependencias
CMake moderno (targets, no variables globales), dependencias con vcpkg/Conan y versiones fijadas, endurecimiento según la OpenSSF Compiler Options Hardening Guide: `-D_FORTIFY_SOURCE=3` (con optimización), `-D_GLIBCXX_ASSERTIONS`, `-fstack-protector-strong`, `-fstack-clash-protection`, PIE y `-Wl,-z,relro,-z,now` en binarios distribuidos.

## Tests
GoogleTest o Catch2 · sanitizers activos en la suite · `libFuzzer`/AFL++ en todo parser de entrada externa · Valgrind en CI nocturno · benchmarks con Google Benchmark.
