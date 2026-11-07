## Qué

## Por qué

## Cómo probarlo

## Tipo de cambio
- [ ] PATCH: corrección sin cambio de comportamiento esperado
- [ ] MINOR: skill, regla, agente u opción nueva
- [ ] MAJOR: cambia `~/.agents`, el formato de unidad o de informe, o la migración

## Checklist
- [ ] `bash scripts/check.sh` en verde
- [ ] `bash tests/test_install.sh` en verde
- [ ] Una regla, un sitio: no he duplicado normas
- [ ] Rutas neutrales (`~/.agents/…`)
- [ ] `CHANGELOG.md` actualizado en `[Unreleased]`
- [ ] Sin secretos ni datos personales
