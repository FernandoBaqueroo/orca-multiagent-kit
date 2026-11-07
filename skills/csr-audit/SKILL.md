---
name: csr-audit
description: Auditoria de seguridad completa (OWASP Top 10 2025, ASVS 5.0, CWE Top 25) sobre el diff, un fichero, un modulo o todo el repositorio, con informe de hallazgos y correcciones.
---

# csr-audit — Auditoría de seguridad

1. Define el alcance: diff actual (por defecto), fichero, módulo o repo completo si el usuario lo pide.
2. Ejecuta `~/.agents/rules/31-security-audit.md` completo: fases A (modelo de amenaza) → G (criterio de cierre).
3. Ejecuta las herramientas disponibles de la fase E; lo que no esté instalado, se declara `SKIPPED`, no se simula.
4. Informe: una línea por hallazgo con severidad, CWE/OWASP, `fichero:línea`, problema y corrección. Ordenado por severidad.
5. Ofrece corregir CRIT y HIGH en el mismo turno; MED y LOW se listan para decisión del usuario.

**Prohibido**: inventar hallazgos, inventar resultados de escáneres, o escribir exploits armados. Prueba de concepto mínima y corrección.
