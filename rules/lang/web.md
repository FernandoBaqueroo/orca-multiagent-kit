# HTML / CSS / Accesibilidad / Frontend base
**Gates**: validador HTML · `stylelint` · `axe`/Lighthouse (a11y ≥95) · presupuesto de bundle · Core Web Vitals

## HTML semántico
- Un `h1` por página y jerarquía de encabezados sin saltos. `header`, `nav`, `main`, `section`, `article`, `footer`, `button`, `a`.
- `button` para acciones, `a[href]` para navegación. Nunca `div` con `onClick`.
- Todo control con etiqueta asociada (`label for` o `aria-label`). `alt` en imágenes (vacío si son decorativas).
- Formularios: `type` correcto, `autocomplete`, `required`, mensajes de error asociados con `aria-describedby` y anunciados.
- Idioma en `html lang`; `title` descriptivo por página; `meta viewport` sin bloquear el zoom.

## Accesibilidad (WCAG 2.2 AA)
- Todo lo usable con ratón, usable con teclado. Foco **visible** y orden lógico. Sin trampas de foco salvo en modales (y con `Esc`).
- Contraste texto ≥4,5:1 (grande ≥3:1); elementos de interfaz ≥3:1.
- Objetivo táctil ≥24×24 px. Respeta `prefers-reduced-motion`.
- ARIA solo si el elemento nativo no basta; ARIA mal usado es peor que nada.
- Cambios dinámicos anunciados (`aria-live` en mensajes de estado y errores).
- Prueba real: navega la pantalla solo con `Tab`, y una vez con lector de pantalla.

## CSS
- Sistema de diseño con tokens (color, espaciado, tipografía) en custom properties; sin valores mágicos repetidos.
- Layout con Grid y Flexbox; evita posicionamiento absoluto para estructura.
- Mobile-first, unidades relativas (`rem`, `ch`, `%`), `clamp()` para escalas fluidas.
- Especificidad baja y plana; sin `!important` salvo utilidades documentadas; sin selectores de más de 3 niveles.
- Modo oscuro por `prefers-color-scheme` con variables, no duplicando hojas.
- Anima solo `transform` y `opacity`; nada de animar `width`/`top` en bucles.

## Rendimiento
Imágenes dimensionadas, modernas (AVIF/WebP), `loading="lazy"`, `srcset` · fuentes con `font-display: swap`, subconjunto y precarga de la crítica · CSS crítico en línea si mejora el LCP · sin librerías pesadas para una animación · presupuesto: JS inicial <200 KB comprimido, LCP <2,5 s, CLS <0,1, INP <200 ms.

## Seguridad en el navegador
CSP estricta sin `unsafe-inline` (nonce o hash) · `Subresource Integrity` en scripts de CDN · sin datos sensibles en `localStorage` · `iframe` con `sandbox` y `allow` mínimos · `noopener` en enlaces externos · validar `origin` en `postMessage`.
