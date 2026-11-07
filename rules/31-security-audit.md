# 31 — Auditoría de seguridad y caza de vulnerabilidades

Cuándo: antes de cerrar cualquier cambio que toque entrada de usuario, autenticación, autorización, criptografía, ficheros, red, base de datos, deserialización, procesos, secretos o dependencias. También en pre-release y cuando el usuario pida "auditoría".

## Fase A — Modelo de amenaza rápido (5 min, escrito en 6 líneas)
1. **Activos**: qué se pierde si esto cae (datos, dinero, disponibilidad, reputación).
2. **Superficie**: entradas, salidas, confianza cruzada, límites de proceso/red.
3. **Actores**: anónimo, usuario autenticado, usuario de otro tenant, admin, dependencia comprometida, atacante local con acceso al disco.
4. **STRIDE** por límite de confianza: Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege.
5. **Abuso**: 3 formas de usar la funcionalidad para lo contrario de su propósito.
6. **Peor caso**: si esta función se ejecuta con entrada del atacante, ¿qué consigue?

## Fase B — Revisión manual guiada por OWASP Top 10:2025
Si el cambio llama a un LLM o define agentes, herramientas o MCP, añade la tabla de `32-ai-security.md` §Auditoría.
| # | Categoría | Comprobaciones mínimas |
|---|---|---|
| A01 | Broken Access Control | Autorización en servidor por petición; propiedad del objeto (IDOR/BOLA); segregación por tenant; rutas admin protegidas; SSRF (destinos, IP resuelta, redirects, metadata endpoint); CORS; path traversal; force browsing |
| A02 | Security Misconfiguration | Debug/verbose off; credenciales y puertos por defecto; permisos de fichero; cabeceras de seguridad; buckets/BD sin exponer; features innecesarias desactivadas; mensajes de error genéricos |
| A03 | Software Supply Chain Failures | Lockfile presente y commiteado; versiones fijadas; `audit`/`osv-scanner` limpio; acciones de CI ancladas por SHA; scripts post-install revisados; licencias; integridad del artefacto |
| A04 | Cryptographic Failures | Algoritmos y modos (AEAD); tamaño de clave; IV/nonce único; KDF de contraseñas; CSPRNG; TLS y verificación de certificado; datos sensibles en reposo; secretos fuera del repo |
| A05 | Injection | SQL/NoSQL/LDAP/XPath parametrizado; comandos sin shell; XSS (reflejado, almacenado, DOM); plantillas SSTI; cabeceras y CRLF; log injection |
| A06 | Insecure Design | ¿Existe control para el abuso identificado en Fase A? Límites de negocio (cantidad, importe, frecuencia); flujos de recuperación de cuenta; segregación de funciones |
| A07 | Authentication Failures | Fuerza bruta y credential stuffing; política de contraseñas y hash; gestión de sesión y rotación; MFA; tokens de reset; JWT (`alg`, firma, `exp`, `aud`, `iss`, revocación) |
| A08 | Integrity Failures | Deserialización insegura; actualizaciones sin firma; CI/CD que ejecuta código no confiable; webhooks sin verificación de firma |
| A09 | Logging & Alerting Failures | Eventos de seguridad registrados; sin datos sensibles; trazabilidad con id de correlación; alerta ante patrón de ataque; logs no manipulables |
| A10 | Mishandling of Exceptional Conditions | Errores ignorados; `catch` vacío; fallback inseguro (fail-open); recursos no liberados; estado inconsistente tras fallo parcial; pánico/crash por entrada; errores que filtran detalles internos |

## Fase C — CWE Top 25 (2025): patrones a buscar en el diff
En el orden de la lista oficial de MITRE: XSS (79) · SQLi (89) · CSRF (352) · Missing authorization (862) · Out-of-bounds write (787) · Path traversal (22) · Use-after-free (416) · OOB read (125) · OS command injection (78) · Code injection (94) · Buffer overflow clásico (120) · Unrestricted upload (434) · NULL deref (476) · Stack overflow (121) · Deserialization (502) · Heap overflow (122) · Incorrect authorization (863) · Improper input validation (20) · Improper access control (284) · Sensitive info exposure (200) · Missing authentication for critical function (306) · SSRF (918) · Command injection (77) · Authorization bypass through user-controlled key (639) · Resource allocation without limits (770).
Fuera del Top 25 de 2025, pero frecuentes en código de aplicación: hardcoded credentials (798), integer overflow (190), race condition (362), improper authentication (287).

## Fase D — Cobertura ASVS 5.0 (17 capítulos) por nivel
Nivel objetivo por defecto: **L1** para apps internas/personales sin datos de terceros; **L2** para cualquier app con datos personales, dinero o autenticación; **L3** para sistemas críticos.
Capítulos a recorrer: codificación y sanitización · validación · frontend web · API y servicios web · manejo de ficheros · autenticación · gestión de sesión · autorización · tokens autocontenidos · OAuth/OIDC · criptografía · comunicación segura · configuración · protección de datos · codificación segura y arquitectura · logging y manejo de errores · WebRTC.
Marca cada capítulo `APLICA / NO APLICA (motivo) / PENDIENTE`.

## Fase E — Herramientas (ejecutar lo disponible; declarar lo que no)
| Propósito | Comando |
|---|---|
| Secretos en repo e historial | `gitleaks detect --redact`, `trufflehog filesystem .` |
| SAST multi-lenguaje | `semgrep --config=auto`, `semgrep --config=p/owasp-top-ten` |
| Vulnerabilidades en deps | `osv-scanner -r .` · `npm audit --omit=dev` · `pnpm audit` · `pip-audit` · `cargo audit` + `cargo deny check` · `govulncheck ./...` · `mvn dependency-check:check` · `dotnet list package --vulnerable` · `composer audit` · `bundler-audit` |
| SAST por lenguaje | `bandit -r .` (py) · `gosec ./...` (go) · `cargo clippy -- -D warnings` (rust) · `eslint-plugin-security` (js/ts) · `spotbugs`+`find-sec-bugs` (java) · `security-code-scan` (.NET) · `psalm --taint-analysis` (php) · `brakeman` (rails) |
| Contenedores e IaC | `trivy fs .` · `trivy image <img>` · `trivy config .` (sustituye a `tfsec`) · `hadolint Dockerfile` · `checkov -d .` · `kube-score` |
| CI/CD | `zizmor .` (GitHub Actions) · `actionlint` |
| Integridad de paquetes npm | `npm audit signatures` (firmas y procedencia del registro) |
| Web dinámico | ZAP baseline · `nikto` · cabeceras con `curl -I` · CSP evaluator |
| Fuzzing | `cargo fuzz` · `go test -fuzz` · `atheris`/`hypothesis` (py) · `jazzer` (jvm) · AFL++/libFuzzer (C/C++) |
| Memoria (C/C++/unsafe) | ASan, UBSan, TSan, Valgrind, `-Wall -Wextra -Werror` |

## Fase F — Informe (formato obligatorio, máximo 1 línea por hallazgo)
```
SEV   CWE/OWASP   fichero:línea   problema   →   corrección
CRIT  A01/CWE-862 api/orders.ts:88  no comprueba propietario del pedido  →  filtrar por user_id en la query
```
Severidad: CRIT (explotable remoto, sin autenticación, con impacto) · HIGH · MED · LOW · INFO.
Reglas del informe: sin hallazgos inventados; cada uno con escenario de explotación concreto; si algo no se pudo verificar, va como `UNVERIFIED` y se dice por qué. Nunca escribas exploits armados: prueba de concepto mínima y corrección.

## Fase G — Criterio de cierre
- 0 hallazgos CRIT o HIGH abiertos.
- Cada MED/LOW: corregido, o aceptado por el usuario con motivo escrito en el código o en el issue.
- Escáneres que no se pudieron ejecutar, listados explícitamente como `SKIPPED`.
