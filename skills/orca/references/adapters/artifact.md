# Adaptador: artefacto, diseño o documento

Entrada visual o documental: mockup, captura, Figma/export, página HTML de referencia, artefacto de Claude, documento de requisitos, anotaciones de Orca Design Mode.

**Cuándo se usa**: «implementa este diseño/documento/artefacto» con ≥2 pantallas, componentes o secciones separables, antes de la primera edición (puerta de reparto, `~/.agents/AGENTS.md` §6). Un plan escrito en un artefacto se trata como plan en fichero (`plan-file.md`).

## 1. Extrae requisitos verificables
- **Estructura**: secciones/componentes, jerarquía, orden.
- **Estados**: vacío, cargando, error, éxito, hover/focus, responsive (móvil/escritorio).
- **Tokens**: colores, tipografía, espaciado. Si el repo tiene design system o Tailwind config, **mapea a tokens existentes**; no copies hex sueltos.
- **Comportamiento**: qué hace cada interacción.
- **Contenido**: textos exactos que deben aparecer.
Lo que no se puede deducir de la imagen (datos reales, endpoints) → `ASSUMPTION:` o pregunta única.

## 2. Unidades
- Componentes reutilizables nuevos → una unidad previa (`U0` o `round: 1`) si varias pantallas los usan.
- Una pantalla/vista = una unidad.
- Lógica de datos de esa pantalla puede ir aparte si hay contrato claro.

## 3. Acceptance visual
`acceptance` debe poder comprobarse mirando:
- "En 390px de ancho la tarjeta ocupa el ancho completo con 16px de margen"
- "Estado vacío muestra el texto «Aún no tienes recargas» y el botón primario"
No: "se parece al diseño".
`verify` incluye, si existe navegador del agente o Orca: abrir la ruta en dev y capturar pantalla en móvil y escritorio. Si no se puede ejecutar: `SKIPPED (sin navegador)`.

## Si existe la skill `impeccable`
Úsala para la parte de diseño: `impeccable shape` para planificar la UI antes de dividir, y su `PRODUCT.md`/`DESIGN.md` como fuente de tokens y criterios. Las unidades de UI llevan en `notes`: «aplica impeccable (craft-floor) al implementar». MAW decide el reparto; impeccable decide el diseño.

## 4. Adjunta la referencia
El brief de cada unidad incluye la referencia visual (ruta de la imagen en el repo o en `.work/runs/<run>/assets/`). El worker la necesita; una descripción en texto pierde detalle.

## Design Mode (Orca)
Las anotaciones de Design Mode ya traen elemento, estilos y fichero:línea. Cada grupo de anotaciones del mismo componente = una unidad pequeña; normalmente secuencial (motor `inline`) sobre el agente de ese worktree, sin repartir.
