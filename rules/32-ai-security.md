# 32 — Seguridad de aplicaciones con LLM, agentes y MCP

Cuándo: el código llama a un modelo, construye prompts, define herramientas (tool/function calling), agentes o servidores/clientes MCP, o hace RAG.
Base: OWASP Top 10 for LLM Applications 2025 y OWASP Top 10 for Agentic Applications (2026), ambos del OWASP GenAI Security Project.
Lo general (entrada no confiable, inyección, secretos, autorización) sigue en `30-security.md`; aquí solo lo propio de los modelos.

## L1. Modelo de confianza
- El modelo **no es un límite de seguridad**. Un system prompt no autoriza ni protege nada: lo que no puede pasar se impide en código.
- Todo lo que entra al contexto (documentos, webs, correos, tickets, resultados de herramientas, memoria) puede llevar instrucciones del atacante (inyección indirecta). Lo que sale del modelo es entrada no confiable.
- Separa instrucciones y datos: delimita el contenido externo y nunca concatenes entrada de usuario en el prompt de sistema.
- Supón que el system prompt se filtrará: sin secretos, credenciales, reglas de autorización ni datos de otros usuarios dentro.

## L2. Agencia mínima (herramientas y agentes)
- Herramientas con el **mínimo privilegio**: solo las necesarias, con el alcance más estrecho (solo lectura si basta, un directorio, una tabla, un dominio).
- La autorización la decide el backend con la identidad del **usuario final**, no la del agente ni una cuenta de servicio con permisos amplios.
- Acciones irreversibles o con efectos externos (pagos, borrados, envíos, despliegues, cambios de permisos) ⇒ confirmación humana explícita, mostrando qué se va a ejecutar.
- Argumentos de cada llamada a herramienta validados con esquema estricto (tipos, enums, rangos, rutas dentro de la base). El modelo propone; el código valida.
- Ejecución de código generado: solo en sandbox aislado (contenedor o VM efímera, sin red o con allowlist, sin secretos, con límites de CPU/memoria/tiempo).
- Límites de bucle: máximo de pasos, de llamadas a herramientas y de tiempo por tarea; un agente sin tope es una denegación de servicio.
- Varios agentes: los mensajes entre agentes son datos no confiables; autentica el origen y no propagues permisos de un agente a otro.

## L3. Salida del modelo
- Renderizado: escapa o sanea (Markdown/HTML con allowlist, sin `<script>`, sin imágenes remotas que exfiltren por URL).
- Nunca en `eval`, shell, SQL, rutas o plantillas sin validar (`30-security.md` §C2). Salida estructurada ⇒ valida contra esquema y rechaza lo que no encaje.
- Enlaces y URLs que genere el modelo: allowlist de dominios antes de seguirlos o mostrarlos como clicables.
- Afirmaciones críticas (datos, código, cifras) verificadas o marcadas como no verificadas; el usuario no debe confiar a ciegas (desinformación y exceso de confianza).

## L4. Datos, RAG y memoria
- Permisos en la recuperación: el índice vectorial filtra por usuario/tenant **antes** de devolver fragmentos; nunca recuperes lo que el usuario no podría leer directamente.
- Datos sensibles fuera de prompts, logs de prompts y datasets de fine-tuning salvo necesidad y consentimiento; redacción de PII antes de enviar a un proveedor externo.
- Fuentes de ingesta (documentos, webs, memoria persistente) con procedencia registrada: lo que se envenena una vez se recupera siempre.
- Memoria de agente acotada por usuario y caducable; nada que un usuario escriba debe acabar en la memoria de otro.

## L5. Consumo y coste
Límite de tokens de entrada y salida por petición, rate limit por usuario y clave, presupuesto y alerta de coste, timeout en cada llamada al proveedor y reintentos con backoff (`75-reliability.md`).

## L6. Cadena de suministro de modelos y MCP
- Modelos, adaptadores y datasets de fuentes verificadas, con versión fijada; formatos seguros (`safetensors`) en vez de pickle.
- Servidores MCP de terceros = dependencia con ejecución de código: revisa origen, mantenedor, permisos y versión fijada (`80-supply-chain.md`). Desconfía de cambios en las descripciones de herramientas: también son texto que el modelo obedece.
- Servidor MCP propio: autenticación en transportes remotos, autorización por herramienta, validación de argumentos y sin devolver secretos en resultados.
- Credenciales del agente en el gestor de secretos o variables de entorno con alcance mínimo, nunca en el prompt ni en ficheros que el agente pueda leer y reenviar.

## Auditoría (añadir a `31-security-audit.md` Fase B cuando aplique)
| Riesgo (LLM Top 10 2025) | Comprobación mínima |
|---|---|
| LLM01 Prompt Injection | Contenido externo delimitado; acciones sensibles no dependen solo del modelo; prueba con una instrucción maliciosa incrustada en un documento |
| LLM02 Sensitive Information Disclosure | Sin secretos ni datos ajenos en contexto, logs ni respuestas |
| LLM03 Supply Chain | Modelos, librerías y servidores MCP fijados y de origen verificado |
| LLM04 Data and Model Poisoning | Procedencia de datos de ingesta, fine-tuning y memoria |
| LLM05 Improper Output Handling | Salida escapada y validada antes de renderizar o ejecutar |
| LLM06 Excessive Agency | Herramientas mínimas, permisos del usuario final, confirmación humana en lo irreversible |
| LLM07 System Prompt Leakage | El system prompt no contiene nada cuya filtración importe |
| LLM08 Vector and Embedding Weaknesses | Filtro por permisos en la recuperación; aislamiento por tenant |
| LLM09 Misinformation | Respuestas críticas verificadas o señaladas |
| LLM10 Unbounded Consumption | Límites de tokens, pasos, tiempo y coste |
Agentes autónomos: recorre además los riesgos del Top 10 agéntico (secuestro del objetivo, mal uso de herramientas, abuso de identidad y privilegios, cadena de suministro agéntica, ejecución de código inesperada, envenenamiento de memoria y contexto, comunicación insegura entre agentes, fallos en cascada, explotación de la confianza humana, agentes fuera de control).

## Tests obligatorios
Un test por control: inyección indirecta en un documento recuperado que intenta llamar a una herramienta, argumentos de herramienta fuera de esquema, salida con HTML/JS, recuperación cruzada entre tenants, y el tope de pasos alcanzado. Con el proveedor simulado (respuestas grabadas), no con el modelo real, para que sean deterministas.
