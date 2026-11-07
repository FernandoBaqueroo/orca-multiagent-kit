# 70 — Rendimiento

## Orden no negociable
1. **Mide** (perfila, traza, cuenta consultas). Sin medición no hay optimización, hay superstición.
2. Arregla el **algoritmo y el acceso a datos** antes que el micro-detalle.
3. Vuelve a medir y compara con el número de partida. Reporta antes/después.

## Presupuestos por defecto (ajustar en `STACK.md`)
- API p95 < 300 ms; p99 < 1 s. Consulta a BD < 50 ms.
- Web: LCP < 2,5 s · INP < 200 ms · CLS < 0,1. JS inicial < 200 KB comprimido.
- CLI: arranque < 200 ms. Batch: throughput declarado y memoria acotada.

## Fallos que causan el 90% de la lentitud
- **N+1** de consultas (ORM sin `join`/`include`/`preload`).
- Falta de índice, o índice que no cubre el `WHERE`/`ORDER BY`. `SELECT *`. Sin paginación.
- Trabajo repetido dentro de un bucle (recalcular, reabrir, reconectar, recompilar regex).
- Complejidad accidental O(n²) por búsqueda lineal dentro de bucle: usa mapa/conjunto.
- I/O sincrónica en hilo de eventos / de UI.
- Serializar y deserializar de más; payloads que devuelven campos que nadie usa.
- Falta de streaming: cargar en memoria lo que se puede procesar por trozos.
- Ausencia de agrupación: llamadas 1 a 1 donde hay API por lotes.

## Caché
Solo con: clave clara, TTL, política de invalidación y medición del hit-rate. Cachear sin invalidar es corromper. Cuidado con stampede (usa lock o `stale-while-revalidate`).

## Concurrencia
Paralelizar solo tras medir. Límite de concurrencia explícito (pool/semáforo). Sin bloqueos dentro de secciones críticas. Backpressure siempre que haya productor rápido y consumidor lento.

## Memoria
Vigila fugas por: listeners no liberados, cachés sin límite, closures que retienen, conexiones no cerradas, buffers que crecen sin cota. Usa cierre determinista de recursos (`defer`, `with`, `using`, `Drop`, `try-with-resources`).

## Herramientas
`perf`, `flamegraph`, `py-spy`/`cProfile`, `pprof` (Go), `cargo flamegraph`/`criterion` (Rust), Chrome DevTools + Lighthouse, `EXPLAIN ANALYZE` (SQL), `hyperfine` (CLI), `k6`/`autocannon` (carga), `dotnet-counters`, `async-profiler` (JVM).

## Reporte
`p95 420ms → 78ms (n=1000, hyperfine). Causa: N+1 en orders.list. Fix: join + índice (order_id, created_at).`
