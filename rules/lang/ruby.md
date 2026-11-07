# Ruby (y Rails)
**Gates**: `rubocop` · `srb tc` o RBS/Steep si hay tipos · `rspec` con cobertura (SimpleCov) · `brakeman` · `bundler-audit check --update`

## Idiomas
- Métodos cortos; `guard clauses` en vez de anidar. Sin `unless` con `else`.
- Objetos de valor y `Struct`/`Data` para datos; `freeze` en constantes.
- Excepciones específicas; nunca `rescue => e` genérico sin relanzar; nunca `rescue nil`.
- Sin monkey patching de clases del core ni de gemas; si es inevitable, en un refinement documentado.
- `Enumerable` antes que bucles manuales; cuidado con cargar colecciones enteras en memoria.

## Rails
- Modelo gordo no: lógica de negocio en objetos de servicio o de dominio; el modelo mantiene invariantes y consultas.
- Strong parameters siempre; nunca `params.permit!`.
- Autorización explícita por acción (Pundit/CanCan), denegando por defecto; comprueba propiedad del recurso.
- Evita N+1 con `includes`; usa `bullet` en desarrollo; paginación obligatoria.
- Consultas: parámetros de Active Record; nunca interpolar en `where("... #{}")`.
- Vistas: escapado por defecto; `html_safe` y `raw` prohibidos sobre datos del usuario.
- `has_secure_password` (BCrypt) o Argon2; `SecureRandom` para tokens; credenciales cifradas de Rails, nunca en el repo.
- Migraciones reversibles; índices con la migración; `strong_migrations` para cambios peligrosos en caliente.
- Jobs idempotentes con reintentos acotados.

## Tests
RSpec o Minitest · factories (FactoryBot) con datos mínimos · `request specs` sobre controladores · VCR/WebMock para HTTP externo · un test de autorización por endpoint protegido · sin `sleep` en tests de sistema.
