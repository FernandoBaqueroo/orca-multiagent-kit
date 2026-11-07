# Modo carrera: varios agentes, un problema

Para bugs difíciles de causa desconocida o decisiones con 2–3 enfoques plausibles. Cuesta N veces más: úsalo solo cuando el usuario lo pida o la incertidumbre lo justifique.

## Cuándo no usarla
Bug con causa visible en un stack trace, cambio mecánico, o unidad `S`. Una carrera multiplica el coste por N.

## 1. Unidad única
Con el adaptador que toque (`adapters/chat.md` normalmente) genera **una** unidad. Refuerza:
- `acceptance` con un test de reproducción que hoy falla (si es bug). Si no existe, escríbelo tú primero en la base: sin él, no hay forma objetiva de comparar.
- `notes`: "Enfoque libre. Explica en el informe por qué elegiste el tuyo."

## 2. Participantes
2–3 agentes de **proveedores distintos** (Claude, Antigravity/Gemini, Codex…) o el mismo con modelos distintos. Mismo despacho, palabra por palabra. Motor: `orca` (ideal) o `manual`.
Con Orca: una tarea por participante (`task-create --task-title "U1 carrera A" --spec-file <brief>`), cada una con su `worker-start --worktree new-child --base-branch <base>`; así cada intento tiene su worktree y su informe. En `run.md`, una fila por participante (`U1-A`, `U1-B`…).
Variante "enfoques dirigidos": en vez de enfoque libre, asigna un enfoque por participante en `notes` (por ejemplo A: arreglar en el servicio; B: arreglar en la consulta).

## 3. Comparación (tabla fija)
| criterio | peso | A | B | C |
|---|---|---|---|---|
| Test de reproducción pasa | bloqueante | | | |
| Gates (`csr-gate`) sin FAIL | bloqueante | | | |
| Causa raíz vs. síntoma | 3 | | | |
| Tamaño del diff (menor mejor) | 2 | | | |
| Ficheros fuera de `write` | 2 | | | |
| Riesgo (seguridad, datos, contrato) | 3 | | | |
| Legibilidad / encaje con el código existente | 1 | | | |
Puntúa 0–2 por criterio. Lee los diffs de verdad; no puntúes por el informe.

## 4. Salida
```
race U1 · ganador: B (antigravity) · 11/13
A: arregla el síntoma (añade retry); B: corrige el orden de await en payment.service.ts:88
mezcla sugerida: test extra de A (concurrencia) sobre la solución de B
```
Después: integra (`integrate.md`) solo la ganadora (más los añadidos que el usuario apruebe). Las ramas perdedoras se borran con confirmación.
