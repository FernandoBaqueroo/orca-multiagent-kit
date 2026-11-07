# 90 — Documentación, comentarios y decisiones

## Jerarquía
1. **El código** es la documentación primaria: nombres y tipos antes que prosa.
2. **Comentarios**: el porqué que el código no puede expresar.
3. **README / docs**: cómo arrancar, cómo probar, cómo desplegar.
4. **ADR**: por qué se eligió esta arquitectura y qué se descartó.

## README mínimo del proyecto
Qué es y para quién · requisitos y versiones · instalación en 3 comandos · comandos de dev/test/build/lint · variables de entorno (con `.env.example`) · estructura de carpetas en 10 líneas · cómo contribuir · licencia. Sin capturas obsoletas ni promesas de futuro.

## Comentarios
- Explican decisión, invariante, restricción externa o trampa. Nunca parafrasean la línea siguiente.
- Obligatorio comentar: workaround (con enlace al issue y condición para retirarlo), algoritmo no evidente, supresión de lint o de tipo, constante con origen externo, cualquier `unsafe`.
- Prohibido: código comentado (está en git), banners ASCII, changelog en cabecera, `// fix later`.
- Comentario desactualizado = bug. Si tocas la línea, revisa su comentario.

## API pública
Docstring en todo elemento exportado: propósito, parámetros, retorno, **errores que puede lanzar**, efectos secundarios, complejidad si importa, ejemplo ejecutable. Los ejemplos de la documentación deben ejecutarse en CI (doctest, `cargo test --doc`, `go test` de `Example`).

## ADR (`docs/adr/NNNN-titulo.md`)
```
# NNNN — Título
Fecha: YYYY-MM-DD · Estado: propuesta|aceptada|sustituida por NNNN
## Contexto
## Decisión
## Alternativas consideradas (y por qué no)
## Consecuencias (buenas y malas)
```
Escribe un ADR cuando la decisión sea cara de revertir: base de datos, framework, límite de módulos, modelo de autenticación, formato de datos, estrategia de despliegue.

## Changelog
`CHANGELOG.md` en formato Keep a Changelog + SemVer. Entradas escritas para quien usa el software, no para quien lo escribió.

## Qué NO documentar
Lo que un linter o el tipo ya garantizan. Lo que cambia cada semana. Lo que nadie lee. Documentación duplicada en dos sitios: enlaza, no copies.
