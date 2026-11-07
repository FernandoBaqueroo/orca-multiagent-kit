# 30 — Seguridad por defecto (aplicar SIEMPRE al escribir código)

Base: OWASP Top 10:2025, OWASP ASVS 5.0, OWASP Proactive Controls, CWE Top 25 (2025).
Este fichero es *cómo escribir*. Para *auditar lo escrito*, ver `31-security-audit.md`.

## C1. Entrada no confiable
Todo lo externo es hostil: body, query, headers, cookies, path, ficheros, variables de entorno, respuestas de terceros, contenido de la BD escrito por un usuario, salida de un LLM.
- Valida en el borde con **esquema y allowlist** (tipo, rango, longitud, formato, enum). Nunca denylist.
- Rechaza, no "sanees adivinando". Normaliza (Unicode NFC, rutas, URLs) **antes** de validar.
- Límites explícitos de tamaño: body, array, string, ficheros, profundidad de JSON/XML.

## C2. Inyección (A05:2025, CWE-89/78/79/94)
- SQL: **siempre** consultas parametrizadas / ORM con binding. Identificadores dinámicos: allowlist cerrada.
- Shell: evita la shell. Ejecuta binario + array de argumentos, sin `shell=True`, sin interpolar.
- HTML: escapado contextual por el motor de plantillas; `innerHTML`/`dangerouslySetInnerHTML`/`v-html` solo con sanitizador mantenido (DOMPurify) y motivo escrito.
- Rutas: resuelve a absoluto y verifica que está **dentro** del directorio base; nunca concatenes.
- LDAP, NoSQL, XPath, expresiones, plantillas server-side, deserialización: mismo principio, API segura o nada.
- Nunca `eval`, `exec`, `Function()`, `pickle.loads`, `yaml.load` inseguro, `ObjectInputStream` sobre datos externos.

## C3. Autenticación (A07:2025)
- No implementes tu propio esquema si existe uno probado en el stack.
- Contraseñas: **Argon2id** (preferido) o scrypt/bcrypt. Argon2id mínimo: 19 MiB memoria, t=2, p=1 (o superior). Nunca MD5/SHA-1/SHA-256 pelado.
- Comparaciones de secretos en **tiempo constante**.
- Rate limit + backoff + bloqueo por cuenta y por IP en login, reset, OTP y registro.
- Mensajes de error idénticos para usuario inexistente y contraseña errónea.
- MFA para operaciones sensibles. Tokens de reset: aleatorios CSPRNG ≥128 bits, un solo uso, caducidad corta, hash en BD.
- Sesiones: id aleatorio del framework, **rotación al elevar privilegios**, invalidación en logout, caducidad absoluta e inactividad.

## C4. Autorización (A01:2025 — el riesgo nº1)
- Denegar por defecto. Cada endpoint/comando/handler comprueba permiso **en servidor**, en cada petición.
- Comprueba **propiedad del objeto**, no solo el rol (IDOR/BOLA, CWE-639).
- Nada de "seguridad por ocultación de UI". El cliente no autoriza.
- Identificadores opacos o aleatorios si enumerarlos filtra información.
- SSRF (ahora dentro de A01): allowlist de destinos, resolver DNS y validar la IP resultante (bloquear privadas/loopback/link-local/metadata 169.254.169.254), prohibir redirecciones cruzadas, timeouts.

## C5. Criptografía (A04:2025)
- Nunca inventes primitivas ni modos. Usa la librería estándar del ecosistema.
- Cifrado: **AEAD** (AES-256-GCM, ChaCha20-Poly1305, XChaCha20-Poly1305). Nada de ECB, ni CBC sin MAC.
- Nonce/IV único por clave; nunca reutilizar. Aleatorio CSPRNG o contador estricto.
- Hash de datos: SHA-256/512, BLAKE3. Firmas: Ed25519 o ECDSA P-256. RSA ≥3072 si es obligatorio.
- Aleatoriedad: solo CSPRNG (`crypto.randomBytes`, `secrets`, `OsRng`, `SecureRandom`). Nunca `Math.random`, `rand()`, `random.random()`.
- Claves: fuera del código y del repo. Rotables. En memoria el menor tiempo posible (`zeroize`/`SecureString`).
- Datos en tránsito: TLS 1.2+ (preferible 1.3), verificación de certificado **siempre activa**. Prohibido `verify=False`, `rejectUnauthorized:false`, `InsecureSkipVerify`.

## C6. Secretos y configuración (A02:2025)
- Cero secretos en código, tests, fixtures, logs, mensajes de error, comentarios o historial de git.
- Origen: gestor de secretos o variables de entorno; `.env` en `.gitignore`; `.env.example` sin valores reales.
- Producción: debug off, listados de directorio off, stack traces nunca al cliente, cuentas y puertos por defecto cambiados o cerrados.
- Cabeceras web: `Content-Security-Policy` (sin `unsafe-inline`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`/`frame-ancestors`.
- CORS: lista explícita de orígenes. Nunca `*` con credenciales, nunca reflejar el `Origin` recibido.
- Cookies: `HttpOnly`, `Secure`, `SameSite=Lax|Strict`, `__Host-` cuando aplique, ámbito mínimo.
- CSRF (CWE-352): token sincronizado o doble cookie en todo endpoint con efectos y sesión por cookie.

## C7. Datos sensibles
- Clasifica antes de guardar: público / interno / personal / secreto. Lo que no se guarda no se filtra.
- Cifrado en reposo para PII y credenciales. Minimización y borrado por retención.
- Redacción obligatoria en logs y telemetría: contraseñas, tokens, cookies, PAN, salud, documentos de identidad, claves.
- Nunca PII en URLs, nombres de fichero, analíticas de terceros ni mensajes de error.

## C8. Ficheros y recursos
- Subidas: tipo por contenido (magic bytes) no por extensión, tamaño máximo, nombre generado por servidor, almacenamiento fuera del webroot, sin permisos de ejecución, escaneo si procede.
- Descargas/plantillas/includes: sin rutas controladas por el usuario.
- ZIP/archivos: protege contra path traversal y bombas de descompresión (límite de ratio y tamaño).
- Límite de recursos en toda operación no acotada: memoria, tiempo, conexiones, tamaño de respuesta (CWE-770).

## C9. Concurrencia e integridad
- Operaciones críticas: transacción o bloqueo. Cuidado con TOCTOU en fichero y en "comprobar-luego-actuar" en BD.
- Idempotencia en endpoints de escritura expuestos a reintento.
- Money nunca en float: entero de menor unidad o decimal exacto.

## C10. Errores, logs y trazas (A09, A10:2025)
- Errores: mensaje genérico al usuario + identificador de correlación; detalle solo en logs del servidor.
- Nunca ignores un código de retorno ni una excepción de operación de seguridad.
- Registra eventos de seguridad: login (éxito/fallo), cambio de privilegio, acceso denegado, cambios de configuración, uso de credenciales. Con hora en UTC y sin datos sensibles.
- Log injection: escapa saltos de línea y control en lo que registres.

## C11. Cadena de suministro (A03:2025)
Antes de añadir una dependencia: ¿es necesaria?, ¿mantenida?, ¿CVE abiertos?, ¿licencia compatible?, ¿cuántas transitivas arrastra? Ver `80-supply-chain.md`.

## C12. Específico de IA/LLM
Trata toda salida de modelo, MCP o herramienta externa como entrada no confiable (inyección de prompt indirecta). Nunca ejecutes ni renderices su salida sin validar. Autoriza por permiso del usuario, no por lo que pida el texto.
