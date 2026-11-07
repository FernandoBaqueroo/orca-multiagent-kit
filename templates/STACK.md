# STACK.md — Ficha técnica del proyecto
> Fuente de verdad del stack. El agente la lee ANTES de tocar nada.
> Rellena lo que aplique, borra lo que no. Mantenla corta: si crece de ~120 líneas, mueve detalle a `docs/`.
> Regenerar o actualizar: skill `csr-stack` («actualiza el STACK»).

## 1. Identidad
- **Proyecto**:
- **Qué es** (1 línea):
- **Tipo**: web | API | CLI | escritorio | móvil | librería | monorepo | datos/ML
- **Estado**: prototipo | desarrollo | producción
- **Usuarios y datos**: ¿hay datos personales, dinero o credenciales? sí/no →
- **Nivel de seguridad objetivo (ASVS)**: L1 | L2 | L3

## 2. Stack
| Capa | Tecnología | Versión exacta |
|---|---|---|
| Lenguaje(s) | | |
| Runtime | | |
| Framework | | |
| UI | | |
| Base de datos | | |
| ORM / acceso a datos | | |
| Gestor de paquetes | | |
| Build / bundler | | |
| Tests | | |
| Lint / format | | |
| Infra / despliegue | | |
| CI | | |

## 3. Comandos canónicos (el agente NO debe inventar otros)
```
install    :
dev        :
build      :
test       :
test:watch :
coverage   :
lint       :
format     :
typecheck  :
sec-scan   :
deps-audit :
migrate    :
run-app    :
```
Si un comando no existe, escribe `N/A` — no lo dejes en blanco.

## 4. Mapa del repo (máx. 12 líneas)
```
src/
  domain/      lógica pura, sin I/O
  ...
tests/
```

## 5. Convenciones del proyecto
- Estilo de nombres:
- Estructura de módulos:
- Manejo de errores:
- Gestión de estado:
- Formato de commits:
- Idioma de código/comentarios/UI:

## 6. Límites y prohibiciones específicas
- No tocar:
- No añadir dependencias de:
- Decisiones cerradas (no reabrir):
- Restricciones duras del producto (offline, sin nube, presupuesto, plataformas):

## 7. Seguridad del proyecto
- Datos sensibles que se manejan:
- Dónde viven los secretos:
- Modelo de autenticación/autorización:
- Amenazas principales (3):
- Auditoría obligatoria en cambios que toquen:

## 8. Rendimiento
- Presupuestos (latencia, tamaño, memoria, arranque):
- Puntos calientes conocidos:

## 9. Módulos CSR activos
Siempre: `20-clean-code`, `30-security`, `50-done-gate`.
Lenguaje: `lang/…`
Extra: `40-testing`, `70-performance`, `75-reliability`, `80-supply-chain`, `31-security-audit`, `32-ai-security` (si usa LLM, agentes o MCP)
Desactivados para este proyecto (con motivo):

## 10. Estado actual
- En curso:
- Bloqueado por:
- Deuda técnica conocida:
- Última actualización de esta ficha: YYYY-MM-DD
