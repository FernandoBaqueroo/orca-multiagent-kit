# 40 — Testing y verificación

## Regla base
Código nuevo sin test **no está hecho**. Bug corregido sin test de regresión **volverá**.
Excepción única: veto explícito del usuario, declarado con `DEFERRED: sin tests por petición`.

## Orden de trabajo (TDD ligero, obligatorio en lógica de negocio)
1. Test que reproduce el requisito o el bug, y **falla** por el motivo correcto (verifícalo, no lo supongas).
2. Implementación mínima para que pase.
3. Refactor con los tests en verde.

## Pirámide
- **Unitarios** (mayoría): rápidos, sin I/O, sin red, sin reloj real, sin aleatoriedad no controlada.
- **Integración**: BD real (contenedor efímero), colas, ficheros, HTTP real contra dobles de servidor.
- **Contrato**: entre servicios y con APIs externas; congela el esquema.
- **E2E** (pocos): solo recorridos críticos de usuario.
- **Propiedad/fuzzing**: en parsers, serializadores, cálculo, criptografía, cualquier cosa con invariantes.
- **Seguridad**: un test por vulnerabilidad corregida (autorización denegada, payload de inyección, límite de tamaño).

## Propiedades FIRST
Fast · Independent (sin orden ni estado compartido) · Repeatable (determinista) · Self-validating (pasa/falla, sin inspección manual) · Timely (con el código, no después).

## Escritura
- Estructura AAA: Arrange / Act / Assert. Un comportamiento por test.
- Nombre = especificación: `rechaza_transferencia_si_saldo_insuficiente`.
- Prueba **comportamiento observable**, no detalles internos. Si un refactor sin cambio funcional rompe el test, el test está mal.
- Assert concreto: valor esperado, no `toBeTruthy()`. Errores: verifica tipo y mensaje relevante.
- Dobles: mockea lo que **no controlas** (red, tiempo, azar, pagos); no mockees tu propio dominio.
- Tiempo y aleatoriedad inyectados (`Clock`, `seed`) — nunca `sleep` como sincronización.
- Datos de prueba con builders/factories y valores explícitos en lo relevante.
- Snapshots: solo para salidas estables y pequeñas; revisar cada actualización, jamás `--update` a ciegas.

## El test defiende el requisito, no el código
- El valor esperado sale del requisito, la spec o el bug reportado, **nunca** de ejecutar la implementación y copiar lo que devuelve.
- Escribe o lee el test antes que la implementación cuando puedas; un test escrito mirando el código tiende a repetir sus errores.
- Prohibido "arreglar" un test rojo cambiando su assert, borrándolo, saltándolo (`skip`, `xit`, `@Disabled`, `#[ignore]`) o ampliando la tolerancia, salvo que el requisito haya cambiado: dilo con `ASSUMPTION:` o pregunta.
- Un test que se modifica en el mismo cambio que el código que prueba exige revisar el diff del test con más sospecha, no menos.
- Ningún mock que reimplemente la lógica bajo prueba: si el doble necesita la misma lógica que el código, el test no prueba nada.

## Casos obligatorios por función
Feliz · vacío/nulo · límite (0, 1, máx, máx+1) · tipo inesperado · Unicode y strings largos · negativo/desbordamiento · concurrencia si hay estado compartido · fallo de la dependencia externa · entrada hostil (inyección, path traversal, payload gigante).

## Cobertura
- Métrica que importa: **líneas y ramas del código cambiado ≥ 80%**, y 100% en dominio crítico (dinero, autenticación, criptografía, permisos).
- La cobertura es suelo, no objetivo: 100% con asserts flojos no vale nada.
- Donde el riesgo es alto, mide **mutación** (`mutmut`, `Stryker`, `cargo-mutants`, `PIT`): objetivo ≥60% de mutantes muertos.

## Flaky
Un test intermitente es un bug. Diagnóstico inmediato o cuarentena etiquetada con issue y fecha límite. Nunca reintentos automáticos como solución.

## CI
El pipeline ejecuta: format → lint → typecheck → build → unit → integración → cobertura → seguridad. Falla = rojo, sin excepciones ni `continue-on-error` en gates de calidad.

## Reporte al usuario
Una línea: `tests: 128 pass / 0 fail / 2 skipped · cov cambiado 86%`. Si algo falla, la línea decisiva del error y la causa, no el log entero.
