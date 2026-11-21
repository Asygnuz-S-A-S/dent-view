-- Borra las citas que dejan las corridas E2E (pacientes "QA Paciente …") para liberar las franjas de la agenda demo.
DELETE FROM "Cita" WHERE "pacienteId" IN (SELECT id FROM "PacienteTenant" WHERE nombre ILIKE 'QA Paciente%');
