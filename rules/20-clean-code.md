# 20 — Clean Code y buenas prácticas (agnóstico de lenguaje)

## Ley 0
Escribe código que parezca escrito por quien ya mantenía el repo: mismas convenciones, mismo vocabulario, misma densidad de comentarios. Coherencia > preferencia personal.

## Nombres
- Revelan intención: `elapsedDays`, no `d`. Sin abreviaturas inventadas (`cfg`, `usr`, `tmp2`).
- Pronunciables y buscables. Constantes con nombre, nunca números mágicos.
- Funciones = verbo (`calculateTotal`), booleanos = predicado (`isExpired`, `hasAccess`).
- Un concepto, una palabra en todo el repo (`fetch` vs `get` vs `retrieve`: elige una).
- El nombre no miente: si la función también escribe en disco, el nombre lo dice.

## Funciones
- Una responsabilidad, un nivel de abstracción por función.
- Objetivo: ≤ 40 líneas, ≤ 4 parámetros, complejidad ciclomática ≤ 10, anidamiento ≤ 3.
  Superarlo exige justificación escrita en el PR, no en un comentario.
- Sin efectos secundarios ocultos. Comando (muta, no devuelve) o consulta (devuelve, no muta).
- Sin flags booleanos como parámetro: si hay `doX(true)`, hay dos funciones.
- Cláusulas de guarda al principio; return temprano en vez de `else` anidados.

## Estructura
- **Núcleo puro / cáscara imperativa**: lógica de negocio determinista y sin I/O; I/O en los bordes.
- Dependencias hacia dentro (dominio no conoce framework, ni ORM, ni HTTP).
- Inyecta dependencias; nada de singletons globales ni `new` de infraestructura dentro del dominio.
- Módulos por capacidad de negocio, no por tipo técnico, cuando el proyecto crece.
- Interfaces mínimas: expón lo que se usa; todo lo demás, privado.

## Estado y datos
- Inmutabilidad por defecto; mutación local y explícita.
- Estado válido por construcción: tipos que no permiten representar lo imposible (`NonEmptyList`, `Email`, `Money{amount,currency}`).
- Valida en el borde, confía dentro. Nada de revalidar lo mismo en 6 capas.
- Nulos: evítalos; `Option`/`Maybe`/union explícita. Si el lenguaje los tiene, prohíbe el null implícito.

## Errores
- Falla rápido y ruidoso en errores de programación; devuelve error tipado en errores esperados.
- Nunca captures lo que no sabes tratar. Nunca `catch {}` vacío.
- Mensajes con contexto accionable (qué, dónde, con qué entrada), sin datos sensibles.
- Conserva la causa original (`cause`, `%w`, `from e`, `source`).

## Duplicación y abstracción
- DRY sobre conocimiento, no sobre texto coincidente.
- **Regla de tres**: no abstraigas hasta el tercer caso real. La abstracción errónea cuesta más que la duplicación.
- YAGNI: nada de parámetros, hooks o capas "para el futuro".
- Prefiere composición a herencia; herencia solo para sustitución real (LSP).

## Comentarios
- Explican **por qué**, nunca **qué**. Si el comentario explica el qué, renombra el código.
- Comentario obligatorio en: decisiones no obvias, workarounds (con enlace al issue), invariantes, complejidad algorítmica elegida, cualquier supresión de lint/tipo.
- Prohibido: código comentado, changelogs en cabecera, comentarios obsoletos.

## Olores que obligan a refactor
Función >40 líneas · clase >300 líneas · >3 niveles de anidamiento · lista de parámetros larga · envidia de características · obsesión por primitivos · cadenas de `if/else` sobre tipo (usa polimorfismo o match exhaustivo) · retorno de `null` como señal · booleano de control de flujo · dependencia circular · nombre con `Manager`/`Helper`/`Utils` sin significado.

## Antes de dar por escrito un fichero
- [ ] ¿Se lee de arriba abajo como una narración?
- [ ] ¿Cada nombre resiste ser leído en voz alta por otro dev?
- [ ] ¿Hay algún camino de error sin probar?
- [ ] ¿He borrado lo que ya no se usa (código, imports, flags, tests)?
- [ ] ¿He respetado el estilo del repo por encima del mío?
