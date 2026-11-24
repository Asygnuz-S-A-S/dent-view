# Plan: autoagendamiento, finanzas, bodega y evolutivos (2026-11-24)

Resumen del análisis (agente analista, solo fuentes públicas; DentalPin sigue prohibido: ver docs/sala-limpia/README.md; OpenDentist es MIT).

## Decisiones del usuario
1. **Comisiones a doctores remitentes: NO se construyen** (Ley 35 de 1989, art. 30). Se usan tarifas especiales por doctor, el doctor como responsable de la cuenta y reporte de producción por remitente. SÍ se liquida producción a los odontólogos del propio centro.
2. **Radiología: solo con orden, dos rutas.** (B, principal) el doctor crea la orden y el paciente recibe un enlace de reserva atado a ella; (A, respaldo) el paciente sube foto/PDF de la orden y recepción la valida antes de confirmar.
3. **Mensajería: solo correo por ahora** (código de verificación y recordatorios por correo con la marca del centro). WhatsApp/SMS quedan para cuando haya proveedor.
4. **Anticipo configurable por centro** (incluye el odontólogo particular): reembolsable o no, horas límite para cancelar con reembolso, retener si no asiste. El texto legal lo valida el abogado.

## Riesgos existentes hoy (a corregir en la oleada 0)
- Anticipo pagado por enlace atado solo a una cita: la pasarela lo aprueba pero no se registra pago (lib/pagos/servicio.ts).
- Notas clínicas editables y odontograma que sobrescribe sin historial (Res. 1995/1999 art. 18 exige inmodificabilidad); recepción puede escribir notas clínicas.
- Borrado en cascada de datos clínicos vs conservación de 15 años (Res. 839/2017).
- Anular una cuenta no pide motivo ni deja nota crédito.

## Diseño por módulo
### Autoagendamiento (/agendar/[slug], /cita/[token])
Modelos: HorarioAtencion, ExcepcionHorario, ConfigAgendaPublica, ServicioSala, ServicioProfesional, ReservaPublica; campos nuevos en Servicio (duración, holgura, reservable en línea, requiere orden, anticipo) y en Cita (profesional, servicio, origen) con restricción de no cruce (btree_gist EXCLUDE) por sala y por profesional.
Flujo: servicio → huecos (función pura lib/agenda-disponibilidad.ts) → datos + consentimiento (finalidad AGENDAMIENTO; mercadeo aparte) → código por correo (hash, 5 intentos) → la cita se crea DESPUÉS de verificar el código → anticipo opcional (expira en 30 min) → confirmación con enlace /cita/[token] para confirmar, cancelar o reprogramar. Recordatorios también a citas CONFIRMADAS con ese enlace. Lead en el CRM (odontología) con origen AGENDA_WEB. Protección anti-abuso: honeypot, tiempo mínimo, límites por IP/correo/documento en base de datos, mismos mensajes de error, huecos sin datos personales.
### Finanzas
Prioridad 1: Anticipo (con política por centro), anulación auditada de cuenta y de pago (motivo, quién, cuándo; las sumas excluyen pagos anulados), NotaCredito (solo inserta), FacturaItem con servicio/profesional/descuento, Factura.convenioId real, exportación CSV (UTF-8 BOM, separador ;).
Prioridad 2: Presupuesto/ItemPresupuesto (aceptación pública con token hash; conversión parcial por fase), CuotaFactura, PromesaPago, recordatorio de cobro (Ley 2300/2023: horarios y frecuencia), SesionCaja (apertura/cierre), Egreso, conciliación de pasarela.
Prioridad 3: ContratoProfesional/ReglaComisionServicio/Liquidacion (solo odontólogos del centro, sobre lo cobrado), reportes por servicio/profesional/convenio/medio de pago, rentabilidad. Factura electrónica DIAN: solo evaluación (integrar proveedor tecnológico por centro).
### Bodega
Insumo, Bodega, Proveedor, LoteInsumo, Existencia, MovimientoInventario (kardex solo-inserta), RecetaServicio, OrdenCompra/ItemOrdenCompra, CotizacionProveedor/ItemCotizacionProveedor. Consumo automático por receta al pasar la orden a TOMADA (radiología) o al firmar una evolución con procedimiento (odontología); stock puede quedar negativo con alerta. Alertas de stock mínimo y vencimientos. Cotización al paciente = costo de receta + margen.
### Evolutivos
BorradorEvolucion, EvolucionClinica (solo inserta, folio por paciente, firma con hash SHA-256 y reautenticación), AdendaEvolucion (las correcciones son adendas), PlantillaEvolucion (versionada), AdjuntoEvolucion. Solo MEDICOS/odontólogos; consultas auditadas; PDF de la historia por folios. Radiología: "evolutivo de imágenes" (línea de tiempo de estudios) y RegistroToma (solo inserta); sin historia odontológica completa.

## Oleadas
0 Esquema + correcciones (bug de anticipos, anulación, notas clínicas). 1 en paralelo: Agenda pública, Evolutivos, Finanzas P1 (caja, egresos, CSV, reportes), Bodega base. 2 Presupuestos/cuotas/cobro, liquidación, consumo automático, órdenes de compra y cotizaciones, rentabilidad. 3 WhatsApp/SMS reales, DIAN, RIPS (requieren decisión externa).

## Pendientes legales (abogado)
Comisiones por remisión; retracto en anticipos (Ley 1480/2011 art. 47, no verificado); si el informe/registro de toma es parte de la historia clínica del prestador; alcance de RIPS (Res. 948/2026) en atención particular; firma electrónica (Ley 527/1999, Decreto 2364/2012: no verificados); límites exactos de la Ley 2300/2023.
