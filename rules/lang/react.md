# React / Next.js
**Gates**: `eslint` con `react-hooks` y `jsx-a11y` · `tsc --noEmit` · Testing Library · Playwright · Lighthouse

## Componentes
- Función pura de props a UI. La lógica no visual vive en hooks propios o módulos de dominio.
- Extrae cuando el JSX pasa de ~80 líneas o mezcla dos conceptos.
- Props tipadas y explícitas; sin spread ciego sobre elementos del DOM.
- `key` estable y única; nunca el índice si la lista se reordena o filtra.

## Estado y efectos
- Menos estado posible: deriva en el render en vez de duplicar. Estado del servidor en TanStack Query/SWR, no en `useState`.
- `useEffect` solo para sincronizar con sistemas externos. No para transformar datos, ni para responder a eventos de usuario.
- Dependencias completas y honestas; nunca silenciar la regla del linter.
- Toda suscripción, timer o listener se limpia en el retorno del efecto.
- Estados de UI obligatorios: cargando, error, vacío y con datos. Los cuatro.

## Rendimiento
- Mide con el Profiler antes de memoizar. `useMemo`/`useCallback`/`memo` solo con causa medida.
- Re-render típico: objeto, array o función nueva en props. Saca las constantes fuera del componente.
- Listas largas virtualizadas; rutas con `lazy` + `Suspense`; imágenes dimensionadas y diferidas.

## Seguridad
- `dangerouslySetInnerHTML` prohibido salvo con sanitizador y comentario.
- Nunca secretos en el bundle ni en variables `NEXT_PUBLIC_*`.
- Server actions y route handlers: validar entrada y autorizar en servidor siempre; ocultar un botón no es control de acceso.
- Vigila filtrar datos del servidor al cliente vía props de componentes cliente.

## Accesibilidad
HTML semántico antes que `div` con `onClick`. Etiqueta asociada a cada control. Foco visible y orden lógico. Modal con trampa de foco y cierre con `Esc`. `aria-*` solo si el elemento nativo no basta. Contraste AA. Detalle en `lang/web.md`.

## Tests
Consultas por rol y texto accesible, no por clase CSS. MSW para red. Un E2E por recorrido crítico.
