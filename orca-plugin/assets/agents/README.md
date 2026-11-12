# Iconos de agente

Glifos de [simple-icons](https://simpleicons.org) 13.21.0 (CC0-1.0) en blanco sobre el color de cada
marca; `agent.svg` es propio. Las marcas son de sus dueños y solo identifican a qué agente se refiere
cada fila del panel.

Para añadir uno: el `path` del SVG de simple-icons, en blanco y con `transform="translate(6 6) scale(0.8333)"`,
dentro del mismo marco (`viewBox="0 0 32 32"` y `<rect width="32" height="32" rx="7">` del color de la
marca). Después, regístralo en `src/icons.ts`.
