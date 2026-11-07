# TypeScript / JavaScript / Node
**Gates**: `prettier --check .` · `eslint . --max-warnings=0` · `tsc --noEmit` · `vitest run --coverage` · `npm audit --omit=dev` · `knip`

## Tipos
- `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride` + `verbatimModuleSyntax`.
- `any` prohibido: usa `unknown` y estrecha. `as` solo con comentario. Sin `@ts-ignore` (`@ts-expect-error` con motivo si es inevitable).
- Datos externos (HTTP, env, JSON, storage) validados con Zod/Valibot y tipo derivado. Los tipos no existen en runtime.
- Uniones discriminadas con `switch` exhaustivo y `never` en el default.
- `readonly`, `as const`, `satisfies`. Uniones de literales en vez de enums.

## Idiomas
- ESM, imports `type`-only, sin `export default` en módulos internos.
- `===` siempre. `??` y `?.` en vez de `||` cuando 0 o cadena vacía son válidos.
- Inmutabilidad: `map`/`filter`/`reduce` y spread; no mutar parámetros.
- Errores: clases propias con `cause`; nunca lanzar strings. `Promise.allSettled` si el fallo parcial es aceptable.
- Async: sin promesas flotantes; `Promise.all` cuando no hay dependencia; `await` dentro de manejo real de error.
- `AbortController` y timeout en todo `fetch`.

## Node
- Nunca `exec` con interpolación: `execFile`/`spawn` con array de argumentos.
- Rutas: `path.resolve` y comprobar que el resultado está bajo el directorio base.
- Config desde `process.env` validada con esquema al arrancar; si falta algo, fallo al iniciar.
- Express/Fastify: `helmet`, límite de body, rate limit, CORS explícito, cookies `httpOnly`+`secure`+`sameSite`, manejador de errores que no filtra stack.
- JWT: algoritmo fijado (rechaza `none` y confusión RS/HS), verifica `exp`, `aud`, `iss`; revocación prevista. Sesión en cookie antes que token en localStorage.
- `crypto.randomUUID`, `crypto.randomBytes`, `timingSafeEqual`. Nunca `Math.random` en seguridad.
- ORM: consultas parametrizadas; `$queryRaw` solo con plantilla etiquetada `sql`.

## Navegador
`textContent` antes que `innerHTML`; si hace falta HTML, DOMPurify. Sin `eval` ni `new Function`. CSP sin `unsafe-inline`. `postMessage`: verifica `origin`. Enlaces externos con `rel="noopener noreferrer"`.

## Tests
Vitest/Jest + Testing Library, MSW para HTTP, Playwright para E2E, `fast-check` para propiedades. No mockear el propio dominio. Sin snapshots gigantes.
