# SQL y bases de datos
**Gates**: linter SQL (sqlfluff) · `EXPLAIN ANALYZE` en consultas nuevas · migración aplicada y revertida en entorno efímero · revisión de índices

## Seguridad
- **Siempre parametrizado**. Identificadores dinámicos (tabla, columna, orden) desde allowlist cerrada, jamás desde la petición.
- Usuario de aplicación con permisos mínimos: sin `SUPERUSER`, sin DDL en producción, sin acceso a tablas que no usa.
- Row Level Security cuando hay multi-tenant (y verifica que la política se aplica también al rol de la app).
- Nunca datos sensibles en claro: hash para credenciales, cifrado para PII; cuidado con logs de consultas lentas que registran parámetros.
- Copias de seguridad cifradas y **restauración probada**, no solo programada.

## Modelado
- Claves primarias estables (UUIDv7 o bigint); claves foráneas con `ON DELETE` explícito.
- `NOT NULL` por defecto; `CHECK` para invariantes; `UNIQUE` para reglas de unicidad reales.
- Tipos correctos: `timestamptz` (nunca `timestamp` sin zona), `numeric` para dinero (nunca `float`), `text` en Postgres, enum o tabla de catálogo para conjuntos cerrados.
- Normaliza primero; desnormaliza solo con medición y con plan de consistencia.

## Consultas
- Sin `SELECT *` en código de aplicación. Paginación por keyset cuando el offset crece.
- Índice que cubra `WHERE` + `ORDER BY`; cuidado con funciones sobre la columna (rompen el índice) y con `LIKE '%x'`.
- Evita N+1 desde el ORM; agrupa con `IN` o `JOIN`.
- `EXISTS` mejor que `COUNT(*) > 0`. `UNION ALL` si no hace falta deduplicar.
- CTE cuando aclara; vigila que no fuerce materialización innecesaria.
- Transacción corta: nada de llamadas de red dentro; nivel de aislamiento consciente; reintento ante deadlock.

## Migraciones
- Versionadas, en el repo, reversibles, idempotentes en lo posible. Una migración, un cambio.
- Cambios en caliente en dos o tres pasos: añadir (nullable/valor por defecto) → rellenar por lotes → hacer obligatorio → retirar lo viejo en un despliegue posterior.
- `CREATE INDEX CONCURRENTLY` en Postgres. Evita bloqueos largos: comprueba el nivel de lock antes de aplicar.
- Prueba la migración con datos de volumen realista y mide el tiempo antes de producción.
