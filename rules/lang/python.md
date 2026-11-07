# Python
**Gates**: `ruff format --check .` · `ruff check .` · `mypy --strict` · `pytest -q --cov` · `bandit -r src` · `pip-audit`

## Estilo y tipos
- PEP 8 vía Ruff. Anotaciones de tipo en todo lo público.
- `mypy --strict` como objetivo; `# type: ignore[codigo]` solo con motivo en la misma línea.
- Datos: `dataclass(frozen=True, slots=True)` o Pydantic v2. `Protocol` para interfaces. `Enum`/`Literal` en vez de strings sueltos.
- Nunca argumentos por defecto mutables. Nunca estado global mutable.

## Idiomas
- Comprensiones para transformar; generadores para volumen (memoria constante).
- `with` para todo recurso. `pathlib` en vez de `os.path`. `enumerate` y `zip` en vez de índices.
- Excepciones específicas y jerarquía de dominio propia. `raise ... from e`. Nunca `except:` desnudo ni `except Exception: pass`.
- `logging` con logger por módulo; nunca `print` en librería.
- Dependencias con `uv` o Poetry y lockfile; `pyproject.toml` como única fuente.

## Seguridad
- SQL parametrizado o SQLAlchemy; nunca f-strings en consultas.
- `subprocess.run([...])` sin shell; nunca `os.system`.
- Nunca `eval`, `exec` ni `pickle.loads` sobre datos externos. `yaml.safe_load`. `defusedxml` para XML.
- `secrets` para tokens, `hmac.compare_digest` para comparar, `argon2-cffi` o `bcrypt` para contraseñas. `random` nunca en seguridad.
- `requests`/`httpx`: `timeout` obligatorio, verificación TLS activa, redirecciones controladas.
- Rutas del usuario: resolver a absoluto y comprobar que cuelgan del directorio base.
- Django/Flask/FastAPI: `DEBUG` desactivado en producción, `SECRET_KEY` fuera del código, ORM sin `raw`, permisos comprobados por vista.

## Asincronía
No mezclar bloqueo con `asyncio`: `asyncio.to_thread` o ejecutor. `asyncio.timeout` en toda espera externa. `TaskGroup` en vez de tareas sueltas sin supervisión.

## Rendimiento
Perfila con `cProfile` o `py-spy` antes de tocar nada. `"".join` en vez de concatenar en bucle. `set`/`dict` para pertenencia. NumPy/Polars cuando hay volumen.

## Tests
`pytest` con fixtures, `parametrize` para tablas de casos, `hypothesis` para propiedades, `freezegun` para tiempo, `respx`/`responses` para HTTP, `pytest-cov` con umbral, `mutmut` en dominio crítico.
