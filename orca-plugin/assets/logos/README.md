# Logos de agente

Los mismos que usa Orca (1.4.257) junto a cada agente: los SVG de Claude, Codex, Copilot, OpenCode,
Droid y Aider de su catálogo de agentes, rasterizados (lo que Orca pinta con `currentColor` va en
gris claro, `#D4D4D8`), y las imágenes que trae embebidas para los demás. Recortados y a 16×16 px:
el panel los enseña pequeños, como Orca. Las marcas son de sus dueños y solo identifican a qué
agente se refiere cada fila. `agent.png` es el genérico del kit.

Para añadir uno: un PNG cuadrado de 16×16 con fondo transparente, `<id del agente>.png`, y su id en
`AGENT_LOGOS` de `src/icons.ts`.
