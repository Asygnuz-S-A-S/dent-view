# Oleada 2 — backlog consolidado (QA E2E + usuario real + auditoría)

Fuentes: `docs/qa/reporte-e2e-2026-11-20.md`, `docs/qa/usuario-real-2026-11-20.md`, `docs/seguridad/auditoria-2026-11-20.md`.

## Flujo core (dv-visor-core)
- B2: la orden y el estudio no se vinculan (orden informada dice "Aún no hay estudios vinculados"). Vincular automáticamente al ingresar/asignar el estudio (orden abierta más reciente del paciente en AGENDADA/TOMADA) y permitir vincular/desvincular a mano desde la orden y desde el estudio.
- B1: en Estudios a 1366 px los botones "Abrir visor"/"Escaneo facial" quedan fuera de pantalla.
- B3: "Firmar y emitir" sin confirmación (el informe queda inmutable) → AlertDialog con resumen.
- B4: el visor no tiene botón para volver y está medio en inglés ("Patient", "Window Level", "investigational use only") → verificar en el navegador y corregir.
- B7: el doctor no tiene enlace para ver el informe desde la orden informada.
- Mejora: botones directos en la orden ("Agendar", "Facturar", "Informar", "Ver informe"); "Informar este estudio" en el estudio; alertas clínicas del paciente visibles en la orden y en el informe.
- Mejora: entrega impresa — hoja PDF para el paciente con enlace, QR y código (además del correo).

## UX/UI y responsive (dv-ux)
- BUG-01: `<main>` anidado en todas las páginas autenticadas (accesibilidad).
- B5: campo de abono sin separador de miles → input de moneda COP reutilizable en todos los montos.
- B6: fechas con formato técnico ("2026-11-20 10:00") o con mayúsculas raras ("20 De Noviembre De 2026") → utilidades de fecha únicas en español de Colombia.
- B8: en móvil las tablas de Pacientes/Estudios cortan alergias y botones → tablas responsive (columnas prioritarias + tarjetas en móvil).
- Mejora: alertas del paciente en la agenda y la tarjeta de cita; botón "Llegó" en la tarjeta de cita.
- Mejora: confirmaciones antes de acciones irreversibles; el login distingue "demasiados intentos" (429) de credenciales erróneas.
- Mejora: estados de carga (skeletons), vacíos y error; páginas 404/500 en español; búsqueda global (Ctrl/⌘+K) de pacientes y órdenes; modo oscuro.
- `/verificar/<código inexistente>` debería responder 404.

## Módulo nuevo (agente convenios)
- Convenios y listas de precios especiales por convenio y por doctor remitente, aplicadas al crear la orden.
