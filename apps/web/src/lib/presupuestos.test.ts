import { describe, expect, it } from "vitest";
import { generarCodigoAcceso, generarToken, hashCodigo, hashToken, limitarIp } from "./entrega";
import { PLANTILLAS_DEFECTO, TIPOS_SENSIBLES } from "./notificaciones";
import {
  DIAS_VIGENCIA, MAX_INTENTOS_CODIGO, ROLES_PRESUPUESTOS, TEXTO_ACEPTACION_VERSION, admiteRespuesta, aFechaDb, borradorDeValoracion, calcularTotales, estadoCodigo, estadoVisible, estaVencida,
  esquemaAceptacion, esquemaItem, esquemaPresupuesto, fechaVigencia, filtroEstado, finDeVigencia, lineaNeta, notaLibres, numeroPresupuesto, partirParaOrden, puedeAnular, resumenPresupuestos,
  serviciosParaOrden, textoAceptacion, totalGuardado, transicionValida, vigenciaValida, type EstadoPres,
} from "./presupuestos";
import { hashIp, hashTexto } from "./presupuestos-hash";
import { moduloHabilitado } from "./tipo-centro";

const item = { servicioId: null, descripcion: "Limpieza", cantidad: 1, valorUnitario: 100_000, descuento: 0, fase: 1 };
const AHORA = new Date("2026-11-25T15:00:00Z"); // 10:00 en Bogotá

describe("totales y descuentos (COP enteros)", () => {
  it("suma líneas y limita el descuento de cada ítem a su valor", () => {
    const t = calcularTotales([{ cantidad: 2, valorUnitario: 50_000, descuento: 10_000 }, { cantidad: 1, valorUnitario: 30_000, descuento: 99_000 }]);
    expect(t.subtotal).toBe(130_000);
    expect(t.items.map(lineaNeta)).toEqual([90_000, 0]);
    expect(t.total).toBe(90_000);
  });
  it("el descuento global por porcentaje se reparte y la suma cuadra al peso", () => {
    const t = calcularTotales([{ cantidad: 1, valorUnitario: 100_001, descuento: 0 }, { cantidad: 1, valorUnitario: 50_002, descuento: 0 }, { cantidad: 3, valorUnitario: 33_333, descuento: 0 }], { tipo: "PORCENTAJE", valor: 7 });
    expect(Number.isInteger(t.total)).toBe(true);
    expect(t.descuentoGlobal).toBe(Math.round(((100_001 + 50_002 + 99_999) * 7) / 100));
    expect(t.items.reduce((s, i) => s + i.descuento, 0)).toBe(t.descuento);
    expect(t.total).toBe(250_002 - t.descuento);
    expect(t.items.every((i) => i.descuento <= i.cantidad * i.valorUnitario)).toBe(true);
  });
  it("el descuento global por valor nunca supera lo que se cobra y 100 % deja en cero", () => {
    expect(calcularTotales([{ ...item }], { tipo: "VALOR", valor: 999_999_999 }).total).toBe(0);
    expect(calcularTotales([{ ...item }], { tipo: "PORCENTAJE", valor: 250 }).total).toBe(0);
    expect(calcularTotales([{ ...item }], { tipo: "VALOR", valor: -5 }).total).toBe(100_000);
  });
  it("sin ítems el total es cero y no divide por cero", () => {
    expect(calcularTotales([], { tipo: "PORCENTAJE", valor: 10 }).total).toBe(0);
  });
  it("el margen es sobre costo y es null si no hay costo", () => {
    expect(calcularTotales([{ cantidad: 2, valorUnitario: 130_000, descuento: 0, costoUnitario: 100_000 }]).margenPct).toBe(30);
    expect(calcularTotales([{ cantidad: 1, valorUnitario: 50_000, descuento: 0 }]).margenPct).toBeNull();
  });
  it("totalGuardado coincide con calcularTotales", () => {
    const t = calcularTotales([{ cantidad: 3, valorUnitario: 40_000, descuento: 5_000 }], { tipo: "VALOR", valor: 10_000 });
    expect(totalGuardado(t.items)).toBe(t.total);
  });
});

describe("estados, transiciones y vencimiento", () => {
  const validas: [EstadoPres, EstadoPres][] = [["BORRADOR", "ENVIADO"], ["ENVIADO", "VISTO"], ["VISTO", "ACEPTADO"], ["ENVIADO", "RECHAZADO"], ["ACEPTADO", "CONVERTIDO"], ["VISTO", "VENCIDO"]];
  it.each(validas)("%s -> %s es válida", (a, b) => expect(transicionValida(a, b)).toBe(true));
  const invalidas: [EstadoPres, EstadoPres][] = [["BORRADOR", "ACEPTADO"], ["RECHAZADO", "ACEPTADO"], ["CONVERTIDO", "ACEPTADO"], ["ACEPTADO", "RECHAZADO"], ["VENCIDO", "ENVIADO"], ["ACEPTADO", "VENCIDO"]];
  it.each(invalidas)("%s -> %s no es válida", (a, b) => expect(transicionValida(a, b)).toBe(false));

  it("el vencimiento se deriva del día de Bogotá, inclusivo", () => {
    expect(estaVencida(aFechaDb("2026-11-25"), AHORA)).toBe(false); // vence hoy: aún vale
    expect(estaVencida(aFechaDb("2026-11-24"), AHORA)).toBe(true);
    // 23:30 en Bogotá del 25 sigue siendo el 25 aunque en UTC ya sea el 26
    expect(estaVencida(aFechaDb("2026-11-25"), new Date("2026-11-26T04:30:00Z"))).toBe(false);
    expect(estaVencida(aFechaDb("2026-11-25"), new Date("2026-11-26T05:00:00Z"))).toBe(true);
  });
  it("estadoVisible: VENCIDA solo para enviadas/vistas fuera de fecha y ANULADA para el VENCIDO guardado", () => {
    const ayer = aFechaDb("2026-11-24"), hoy = aFechaDb("2026-11-25");
    expect(estadoVisible({ estado: "ENVIADO", validoHasta: ayer }, AHORA)).toBe("VENCIDA");
    expect(estadoVisible({ estado: "VISTO", validoHasta: ayer }, AHORA)).toBe("VENCIDA");
    expect(estadoVisible({ estado: "ENVIADO", validoHasta: hoy }, AHORA)).toBe("ENVIADO");
    expect(estadoVisible({ estado: "ACEPTADO", validoHasta: ayer }, AHORA)).toBe("ACEPTADO");
    expect(estadoVisible({ estado: "BORRADOR", validoHasta: ayer }, AHORA)).toBe("BORRADOR");
    expect(estadoVisible({ estado: "VENCIDO", validoHasta: hoy }, AHORA)).toBe("ANULADA");
  });
  it("solo admite respuesta lo enviado/visto y vigente; anular no aplica a lo aceptado", () => {
    const hoy = aFechaDb("2026-11-25");
    expect(admiteRespuesta({ estado: "VISTO", validoHasta: hoy }, AHORA)).toBe(true);
    expect(admiteRespuesta({ estado: "ACEPTADO", validoHasta: hoy }, AHORA)).toBe(false);
    expect(admiteRespuesta({ estado: "ENVIADO", validoHasta: aFechaDb("2026-11-01") }, AHORA)).toBe(false);
    expect(puedeAnular({ estado: "ACEPTADO" })).toBe(false);
    expect(puedeAnular({ estado: "BORRADOR" })).toBe(true);
  });
  it("vigencia: 15 días por defecto, no en el pasado y con tope", () => {
    expect(fechaVigencia(DIAS_VIGENCIA, AHORA)).toBe("2026-12-10");
    expect(vigenciaValida("2026-11-24", AHORA)).toMatch(/pasado/);
    expect(vigenciaValida("2026-12-10", AHORA)).toBeNull();
    expect(vigenciaValida("2027-06-01", AHORA)).toMatch(/máxima/);
    expect(finDeVigencia(aFechaDb("2026-11-25")).toISOString()).toBe("2026-11-26T04:59:59.000Z");
  });
  it("numeración legible", () => expect(numeroPresupuesto(12)).toBe("P-0012"));
});

describe("token, código y rate limit", () => {
  it("token de 256 bits en base64url y código de 6 dígitos", () => {
    expect(generarToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generarCodigoAcceso()).toMatch(/^\d{6}$/);
    expect(generarToken()).not.toBe(generarToken());
  });
  it("el código se liga al token y al secreto (HMAC) y el token solo se guarda como hash", () => {
    const th = hashToken("tok"), th2 = hashToken("otro");
    expect(th).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCodigo(th, "123456", "s1")).not.toBe(hashCodigo(th2, "123456", "s1"));
    expect(hashCodigo(th, "123456", "s1")).not.toBe(hashCodigo(th, "123456", "s2"));
    expect(hashCodigo(th, "123456", "s1")).not.toContain("123456");
  });
  it("tras 5 intentos el código queda bloqueado; un enlace anulado, borrador o vencido hace rato está cerrado", () => {
    const base = { estado: "ENVIADO" as EstadoPres, validoHasta: aFechaDb("2026-11-30") };
    expect(estadoCodigo({ ...base, intentosCodigo: MAX_INTENTOS_CODIGO - 1 }, AHORA)).toBe("ACTIVO");
    expect(estadoCodigo({ ...base, intentosCodigo: MAX_INTENTOS_CODIGO }, AHORA)).toBe("BLOQUEADO");
    expect(estadoCodigo({ ...base, estado: "VENCIDO", intentosCodigo: 0 }, AHORA)).toBe("CERRADO");
    expect(estadoCodigo({ ...base, estado: "BORRADOR", intentosCodigo: 0 }, AHORA)).toBe("CERRADO");
    // vencida pero dentro de la gracia: el código aún abre para mostrar el aviso
    expect(estadoCodigo({ ...base, validoHasta: aFechaDb("2026-11-20"), intentosCodigo: 0 }, AHORA)).toBe("ACTIVO");
    expect(estadoCodigo({ ...base, validoHasta: aFechaDb("2026-09-01"), intentosCodigo: 0 }, AHORA)).toBe("CERRADO");
  });
  it("rate limit por IP", () => {
    const m = new Map<string, number[]>();
    const r = Array.from({ length: 21 }, () => limitarIp(m, "1.2.3.4", 1_000));
    expect(r.filter(Boolean)).toHaveLength(20);
    expect(limitarIp(m, "5.6.7.8", 1_000)).toBe(true);
  });
});

describe("validación (zod strictObject)", () => {
  const ok = { validoHasta: "2026-12-10", items: [{ descripcion: "Limpieza", cantidad: 1, valorUnitario: 100_000 }] };
  it("acepta lo válido y aplica valores por defecto", () => {
    const r = esquemaPresupuesto.parse(ok);
    expect(r.items[0]).toMatchObject({ fase: 1, descuento: 0, costoUnitario: 0 });
  });
  it("rechaza campos desconocidos, topes y valores raros", () => {
    expect(esquemaPresupuesto.safeParse({ ...ok, total: 1 }).success).toBe(false);
    expect(esquemaPresupuesto.safeParse({ ...ok, items: [] }).success).toBe(false);
    expect(esquemaPresupuesto.safeParse({ ...ok, items: Array.from({ length: 61 }, () => ok.items[0]) }).success).toBe(false);
    expect(esquemaItem.safeParse({ ...item, cantidad: 0 }).success).toBe(false);
    expect(esquemaItem.safeParse({ ...item, cantidad: 100 }).success).toBe(false);
    expect(esquemaItem.safeParse({ ...item, valorUnitario: -1 }).success).toBe(false);
    expect(esquemaItem.safeParse({ ...item, valorUnitario: 1.5 }).success).toBe(false);
    expect(esquemaItem.safeParse({ ...item, valorUnitario: 600_000_000 }).success).toBe(false);
    expect(esquemaItem.safeParse({ ...item, descripcion: "" }).success).toBe(false); // libre sin descripción
    expect(esquemaItem.safeParse({ ...item, servicioId: "abc", descripcion: "" }).success).toBe(true); // catálogo no la necesita
  });
  it("el diente debe ser FDI", () => {
    expect(esquemaItem.safeParse({ ...item, diente: 16 }).success).toBe(true);
    expect(esquemaItem.safeParse({ ...item, diente: 55 }).success).toBe(true);
    expect(esquemaItem.safeParse({ ...item, diente: 19 }).success).toBe(false);
    expect(esquemaItem.safeParse({ ...item, diente: 99 }).success).toBe(false);
  });
  it("la aceptación exige nombre completo, documento y casilla", () => {
    expect(esquemaAceptacion.safeParse({ nombre: "Ana Pérez", documento: "1.053.123", acepto: true }).success).toBe(true);
    expect(esquemaAceptacion.safeParse({ nombre: "Ana", documento: "1053123", acepto: true }).success).toBe(false);
    expect(esquemaAceptacion.safeParse({ nombre: "Ana Pérez", documento: "10", acepto: true }).success).toBe(false);
    expect(esquemaAceptacion.safeParse({ nombre: "Ana Pérez", documento: "1053123", acepto: false }).success).toBe(false);
    expect(esquemaAceptacion.safeParse({ nombre: "Ana Pérez", documento: "<script>", acepto: true }).success).toBe(false);
  });
});

describe("texto de aceptación versionado", () => {
  const a = { numero: 7, total: 1_250_000, validoHasta: aFechaDb("2026-12-10"), centro: "Sonrisas" };
  it("incluye número, valor, vigencia y la salvedad de valores estimados", () => {
    const t = textoAceptacion(a);
    expect(t).toContain("P-0007");
    expect(t).toMatch(/1\.250\.000/);
    expect(t).toContain("10 de diciembre de 2026");
    expect(t).toMatch(/estimados/);
    expect(TEXTO_ACEPTACION_VERSION).toBe("2026-11-v1");
  });
  it("el hash cambia si cambia cualquier dato firmado; la IP solo se guarda con hash", () => {
    expect(hashTexto(textoAceptacion(a))).toBe(hashTexto(textoAceptacion(a)));
    expect(hashTexto(textoAceptacion(a))).not.toBe(hashTexto(textoAceptacion({ ...a, total: 1_250_001 })));
    expect(hashIp("1.2.3.0", "s")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashIp("1.2.3.0", "s")).not.toContain("1.2.3");
    expect(hashIp("1.2.3.0", "s")).not.toBe(hashIp("1.2.4.0", "s"));
  });
});

describe("valoración -> borrador", () => {
  const v = { nombre: "Ana Pérez", presupuestoEstimado: 1_800_000, tratamientoSugerido: "Endodoncia y corona" };
  it("copia el presupuesto estimado como nota y lo clínico solo si quien crea puede verlo", () => {
    const con = borradorDeValoracion(v, true), sin = borradorDeValoracion(v, false);
    expect(con.titulo).toBe("Cotización de Ana Pérez");
    expect(con.notas).toMatch(/1\.800\.000/);
    expect(con.notas).toContain("Endodoncia y corona");
    expect(sin.notas).toMatch(/1\.800\.000/);
    expect(sin.notas).not.toContain("Endodoncia");
  });
  it("sin presupuesto estimado no inventa nota", () => expect(borradorDeValoracion({ ...v, presupuestoEstimado: null, tratamientoSugerido: null }, true).notas).toBe(""));
});

describe("tablero", () => {
  const hoy = aFechaDb("2026-11-25");
  it("filtroEstado deriva VENCIDA de la fecha y ANULADA del VENCIDO guardado", () => {
    expect(filtroEstado("VENCIDA", hoy)).toEqual({ estado: { in: ["ENVIADO", "VISTO"] }, validoHasta: { lt: hoy } });
    expect(filtroEstado("ENVIADO", hoy)).toEqual({ estado: "ENVIADO", validoHasta: { gte: hoy } });
    expect(filtroEstado("ANULADA", hoy)).toEqual({ estado: "VENCIDO" });
    expect(filtroEstado("ACEPTADO", hoy)).toEqual({ estado: "ACEPTADO" });
  });
  it("resumen: enviadas, vistas, aceptadas, tasa, valor en juego y por vencer", () => {
    const f = (estado: EstadoPres, validoHasta: string, p: Partial<{ enviadoEn: Date | null; vistoEn: Date | null; aceptadoEn: Date | null; total: number }> = {}) =>
      ({ estado, validoHasta: aFechaDb(validoHasta), enviadoEn: AHORA, vistoEn: null, aceptadoEn: null, total: 100_000, ...p });
    const r = resumenPresupuestos([
      f("ENVIADO", "2026-11-27"), f("VISTO", "2026-12-20", { vistoEn: AHORA }), f("ACEPTADO", "2026-12-01", { vistoEn: AHORA, aceptadoEn: AHORA }),
      f("RECHAZADO", "2026-12-01", { vistoEn: AHORA }), f("ENVIADO", "2026-11-01"), f("BORRADOR", "2026-12-01", { enviadoEn: null }),
    ], AHORA);
    expect(r).toMatchObject({ enviadas: 5, vistas: 3, aceptadas: 1, tasaAceptacion: 20, valorEnJuego: 200_000, porVencer: 1 });
  });
  it("sin envíos la tasa es null", () => expect(resumenPresupuestos([], AHORA).tasaAceptacion).toBeNull());
});

describe("conversión en orden", () => {
  const items = [
    { servicioId: "s1", descripcion: "Limpieza", cantidad: 2, valorUnitario: 80_000, descuento: 0 },
    { servicioId: null, descripcion: "Carilla especial", cantidad: 1, valorUnitario: 400_000, descuento: 0 },
  ];
  it("separa catálogo de ítems libres, expande por unidad y deja nota de lo libre", () => {
    const { catalogo, libres } = partirParaOrden(items);
    expect(catalogo).toHaveLength(1);
    expect(libres).toHaveLength(1);
    expect(serviciosParaOrden(items)).toEqual([{ servicioId: "s1" }, { servicioId: "s1" }]);
    expect(notaLibres(libres, 3)).toBe("Cotización P-0003, ítems fuera del catálogo: 1 × Carilla especial");
    expect(notaLibres([], 3)).toBe("");
  });
});

describe("permisos y módulo", () => {
  it("el doctor remitente no cotiza; gestión y especialista sí", () => {
    expect(ROLES_PRESUPUESTOS).toEqual(["admin_tenant", "recepcion", "especialista"]);
    expect(ROLES_PRESUPUESTOS as readonly string[]).not.toContain("doctor_remitente");
  });
  it("el módulo presupuestos está habilitado en los cuatro tipos de centro", () => {
    for (const t of ["CENTRO_RADIOLOGICO", "CENTRO_ODONTOLOGICO", "CLINICA_ODONTOLOGICA", "ODONTOLOGO_PARTICULAR"] as const) expect(moduloHabilitado(t, "presupuestos")).toBe(true);
  });
});

describe("correos de la cotización", () => {
  it("enlace y código viajan en plantillas separadas, sin PHI, y son de credenciales", () => {
    expect(PLANTILLAS_DEFECTO.PRESUPUESTO_ENLACE.cuerpo).toContain("{{enlace}}");
    expect(PLANTILLAS_DEFECTO.PRESUPUESTO_ENLACE.cuerpo).not.toContain("{{codigo}}");
    expect(PLANTILLAS_DEFECTO.PRESUPUESTO_CODIGO.cuerpo).toContain("{{codigo}}");
    expect(PLANTILLAS_DEFECTO.PRESUPUESTO_CODIGO.cuerpo).not.toContain("{{enlace}}");
    for (const t of ["PRESUPUESTO_ENLACE", "PRESUPUESTO_CODIGO", "PRESUPUESTO_RESPUESTA"] as const) {
      expect(`${PLANTILLAS_DEFECTO[t].asunto}${PLANTILLAS_DEFECTO[t].cuerpo}`).not.toMatch(/\{\{(paciente|total|valor|nombre)\}\}/);
    }
    expect(TIPOS_SENSIBLES).toEqual(expect.arrayContaining(["PRESUPUESTO_ENLACE", "PRESUPUESTO_CODIGO"]));
  });
});
