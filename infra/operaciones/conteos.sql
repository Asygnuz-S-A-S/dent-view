-- Solo lectura. Totales y conteos por centro (Organization). Lo usan diagnostico y reiniciar-demo.
SELECT 'Organization' AS tabla, count(*) FROM "Organization"
UNION ALL SELECT 'User', count(*) FROM "User"
UNION ALL SELECT 'PacienteTenant', count(*) FROM "PacienteTenant"
UNION ALL SELECT 'Estudio', count(*) FROM "Estudio"
UNION ALL SELECT 'Cita', count(*) FROM "Cita"
UNION ALL SELECT 'Factura', count(*) FROM "Factura"
UNION ALL SELECT 'Evento', count(*) FROM "Evento";
SELECT o.slug AS centro,
  (SELECT count(*) FROM "PacienteTenant" t WHERE t."organizationId" = o.id) AS pacientes,
  (SELECT count(*) FROM "Estudio" t WHERE t."organizationId" = o.id) AS estudios,
  (SELECT count(*) FROM "Cita" t WHERE t."organizationId" = o.id) AS citas,
  (SELECT count(*) FROM "Factura" t WHERE t."organizationId" = o.id) AS facturas,
  (SELECT count(*) FROM "Evento" t WHERE t."organizationId" = o.id) AS eventos
FROM "Organization" o ORDER BY o.slug;
