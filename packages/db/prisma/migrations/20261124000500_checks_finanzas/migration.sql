-- Las notas crédito reducen Factura.total: el total nunca puede quedar negativo (defensa en BD además de la validación de la app).
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_total_no_negativo" CHECK ("total" >= 0);
