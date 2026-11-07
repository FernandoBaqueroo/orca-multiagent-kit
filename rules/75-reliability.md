# 75 — Fiabilidad, errores y observabilidad

## Errores
Tipado, causa y `catch`: `20-clean-code.md` §Errores. Aquí, lo operativo:
- Nunca fallback silencioso que devuelve datos falsos (caché caducada, valor por defecto) sin marcarlo como degradado.
- Fail-closed en seguridad (si no se puede verificar, deniega). Fail-open solo en funciones no críticas y declarado.
- Libera recursos siempre, también en el camino de error.
- Fallo parcial: deja el sistema en un estado conocido (compensa, revierte o marca para reintento), nunca a medias.

## Llamadas externas (red, BD, cola, disco remoto)
- **Timeout siempre** (conexión y lectura). Sin timeout = fuga garantizada.
- Reintento solo si la operación es **idempotente**: backoff exponencial + jitter, máximo de intentos, y nunca reintentar 4xx.
- Circuit breaker o bulkhead si el fallo del dependiente puede tumbarte.
- Degradación elegante: qué se sirve cuando el dependiente no está.

## Idempotencia y consistencia
- Claves de idempotencia en escrituras expuestas a reintento.
- Transacción por unidad de trabajo; nada de transacción abierta durante una llamada de red.
- Outbox/saga para consistencia entre servicios; no confíes en "escribo en BD y luego publico".

## Logging
- Estructurado (JSON), con nivel correcto: `error` (acción humana necesaria) · `warn` (anómalo, recuperado) · `info` (evento de negocio) · `debug` (desarrollo).
- Campos mínimos: timestamp UTC, nivel, mensaje, `trace_id`/`request_id`, actor, recurso, resultado.
- **Nunca** loguees credenciales, tokens, PII, cuerpos completos ni cabeceras de autorización. Redacción por defecto.
- Sin logs dentro de bucles calientes. Sin `console.log` en producción.

## Métricas y trazas
- Cuatro señales doradas: latencia, tráfico, errores, saturación. Más: tasa de éxito por endpoint y cola de trabajo.
- Traza distribuida con propagación de contexto en todo salto de proceso.
- Alerta sobre síntomas del usuario (errores, latencia), no sobre CPU.
- Health checks: `live` (¿estoy vivo?) y `ready` (¿puedo atender?), distintos.

## Cambios en producción
- Migraciones **reversibles** y en dos pasos (expandir → migrar → contraer). Nunca borrar columna y desplegar a la vez.
- Feature flags para desacoplar despliegue de activación; con fecha de retirada.
- Plan de rollback escrito antes de desplegar. Backup verificado (restaurar, no solo copiar) antes de tocar datos.
