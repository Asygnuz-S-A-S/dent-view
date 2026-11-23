import { describe, expect, it } from "vitest";
import { hashCodigo } from "./entrega";
import {
  ANGULOS, ANGULOS_FOTO, MAX_FOTOS, MAX_INTENTOS_CODIGO, VIDEO_MAX_BYTES, claveCopia, claveMedia, claveValida, duracionLegible, enlaceWhatsapp, estadoCodigo, estadoEfectivo,
  faltaParaEnviar, filtroEstado, filtroValoraciones, ordenarMedios, pacienteEdita, promedioRespuestaMs, puedeCrearValoracion, puedeValorar, tipoDeVideo, transicionValida,
  truncarIp, validarCupo, validarFotoValoracion, validarVideo, esquemaCuestionario, esquemaSolicitud,
} from "./valoraciones";

const bytes = (...b: number[]) => new Uint8Array(b);
const ftyp = (marca: string) => new Uint8Array([0, 0, 0, 24, ...[..."ftyp"].map((c) => c.charCodeAt(0)), ...[...marca].map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
const ahora = new Date("2026-11-23T12:00:00Z");
const en = (ms: number) => new Date(ahora.getTime() + ms);

describe("firma de archivos", () => {
  it("video: mp4, mov y webm por firma; el resto se rechaza aunque diga ser video", () => {
    expect(tipoDeVideo(ftyp("isom"))).toBe("video/mp4");
    expect(tipoDeVideo(ftyp("qt  "))).toBe("video/quicktime");
    expect(tipoDeVideo(bytes(0x1a, 0x45, 0xdf, 0xa3, 1, 2))).toBe("video/webm");
    expect(tipoDeVideo(bytes(0x4d, 0x5a, 0x90, 0, 0, 0, 0, 0, 0, 0, 0, 0))).toBeNull(); // un ejecutable
    expect(validarVideo(new Uint8Array(0))).toMatch(/vacío/);
    expect(validarVideo(bytes(1, 2, 3, 4))).toMatch(/mp4, mov o webm/);
    expect(validarVideo(ftyp("isom"))).toBeNull();
  });
  it("video: el tope de 50 MB se valida por tamaño", () => {
    const grande = new Uint8Array(VIDEO_MAX_BYTES + 1); grande.set(ftyp("isom"));
    expect(validarVideo(grande)).toMatch(/50 MB/);
  });
  it("foto: JPEG/PNG/WebP/HEIC por firma; un video o texto no pasan como foto", () => {
    expect(validarFotoValoracion(bytes(0xff, 0xd8, 0xff, 0xe0))).toBeNull();
    expect(validarFotoValoracion(ftyp("heic"))).toBeNull();
    expect(validarFotoValoracion(ftyp("isom"))).toMatch(/JPEG, PNG, WebP o HEIC/);
    expect(validarFotoValoracion(new TextEncoder().encode("<script>alert(1)</script>"))).not.toBeNull();
  });
});

describe("estados", () => {
  it("transiciones válidas e inválidas", () => {
    expect(transicionValida("PENDIENTE_PACIENTE", "RECIBIDA")).toBe(true);
    expect(transicionValida("RECIBIDA", "EN_REVISION")).toBe(true);
    expect(transicionValida("EN_REVISION", "REQUIERE_MAS_INFO")).toBe(true);
    expect(transicionValida("REQUIERE_MAS_INFO", "RECIBIDA")).toBe(true);
    expect(transicionValida("EN_REVISION", "COMPLETADA")).toBe(true);
    expect(transicionValida("EXPIRADA", "PENDIENTE_PACIENTE")).toBe(true);
    expect(transicionValida("PENDIENTE_PACIENTE", "COMPLETADA")).toBe(false); // sin que el paciente envíe nada
    expect(transicionValida("COMPLETADA", "EN_REVISION")).toBe(false);
    expect(transicionValida("CANCELADA", "PENDIENTE_PACIENTE")).toBe(false);
  });
  it("el vencimiento se deriva de expiraEn solo mientras se espera al paciente", () => {
    expect(estadoEfectivo({ estado: "PENDIENTE_PACIENTE", expiraEn: en(-1) }, ahora)).toBe("EXPIRADA");
    expect(estadoEfectivo({ estado: "REQUIERE_MAS_INFO", expiraEn: en(-1) }, ahora)).toBe("EXPIRADA");
    expect(estadoEfectivo({ estado: "PENDIENTE_PACIENTE", expiraEn: en(1000) }, ahora)).toBe("PENDIENTE_PACIENTE");
    expect(estadoEfectivo({ estado: "RECIBIDA", expiraEn: en(-1) }, ahora)).toBe("RECIBIDA");
    expect(estadoEfectivo({ estado: "COMPLETADA", expiraEn: en(-1) }, ahora)).toBe("COMPLETADA");
    expect(pacienteEdita({ estado: "PENDIENTE_PACIENTE", expiraEn: en(-1) }, ahora)).toBe(false);
    expect(pacienteEdita({ estado: "RECIBIDA", expiraEn: en(1000) }, ahora)).toBe(false);
    expect(pacienteEdita({ estado: "REQUIERE_MAS_INFO", expiraEn: en(1000) }, ahora)).toBe(true);
  });
  it("filtroEstado refleja el vencimiento derivado", () => {
    expect(filtroEstado("PENDIENTE_PACIENTE", ahora)).toEqual({ estado: "PENDIENTE_PACIENTE", expiraEn: { gt: ahora } });
    expect(filtroEstado("RECIBIDA", ahora)).toEqual({ estado: "RECIBIDA" });
    expect(JSON.stringify(filtroEstado("EXPIRADA", ahora))).toContain("lte");
  });
});

describe("código de acceso", () => {
  it("vencimiento, intentos y estados finales", () => {
    const base = { estado: "PENDIENTE_PACIENTE" as const, expiraEn: en(1000), intentosCodigo: 0 };
    expect(estadoCodigo(base, ahora)).toBe("ACTIVO");
    expect(estadoCodigo({ ...base, intentosCodigo: MAX_INTENTOS_CODIGO - 1 }, ahora)).toBe("ACTIVO");
    expect(estadoCodigo({ ...base, intentosCodigo: MAX_INTENTOS_CODIGO }, ahora)).toBe("BLOQUEADO");
    expect(estadoCodigo({ ...base, expiraEn: en(-1) }, ahora)).toBe("VENCIDO");
    expect(estadoCodigo({ ...base, estado: "CANCELADA" }, ahora)).toBe("CERRADO");
    expect(estadoCodigo({ ...base, estado: "COMPLETADA" }, ahora)).toBe("ACTIVO"); // el resultado se consulta con el mismo código
  });
  it("el ejemplo de hash liga código, enlace y secreto", () => {
    expect(hashCodigo("a", "123456", "s")).not.toBe(hashCodigo("b", "123456", "s"));
    expect(hashCodigo("a", "123456", "s")).not.toBe(hashCodigo("a", "123456", "otro"));
  });
});

describe("ángulos y cupos", () => {
  it("la guía mantiene el orden y ordenarMedios lo respeta", () => {
    expect(ANGULOS[0]).toBe("FRONTAL_REPOSO");
    expect(ANGULOS.at(-1)).toBe("OTRO");
    expect(ANGULOS_FOTO).not.toContain("VIDEO_APERTURA");
    const t = (n: number) => new Date(n);
    const r = ordenarMedios([{ angulo: "OTRO", creadoEn: t(1) }, { angulo: "SONRISA", creadoEn: t(5) }, { angulo: "FRONTAL_REPOSO", creadoEn: t(9) }, { angulo: "SONRISA", creadoEn: t(2) }]);
    expect(r.map((m) => `${m.angulo}${m.creadoEn.getTime()}`)).toEqual(["FRONTAL_REPOSO9", "SONRISA2", "SONRISA5", "OTRO1"]);
  });
  it("máximo 12 fotos y 2 videos; repetir un ángulo único reemplaza en vez de sumar", () => {
    const doce = ANGULOS_FOTO.slice(0, MAX_FOTOS).map((angulo) => ({ tipo: "FOTO" as const, angulo }));
    expect(doce).toHaveLength(MAX_FOTOS);
    expect(validarCupo(doce, { tipo: "FOTO", angulo: "OTRO" })).toMatch(/12 fotos/);
    expect(validarCupo(doce, { tipo: "FOTO", angulo: "SONRISA" })).toBeNull(); // reemplaza
    const dosVideos = [{ tipo: "VIDEO" as const, angulo: "VIDEO_APERTURA" }, { tipo: "VIDEO" as const, angulo: "VIDEO_APERTURA" }];
    expect(validarCupo(dosVideos, { tipo: "VIDEO", angulo: "VIDEO_APERTURA" })).toMatch(/2 videos/);
    expect(validarCupo([], { tipo: "VIDEO", angulo: "SONRISA" })).toMatch(/no corresponde/);
    expect(validarCupo([], { tipo: "FOTO", angulo: "VIDEO_APERTURA" })).toMatch(/no corresponde/);
  });
  it("para enviar hacen falta consentimiento, motivo y 3 fotos", () => {
    const fotos = (n: number) => Array.from({ length: n }, (_, i) => ({ tipo: "FOTO" as const, angulo: ANGULOS[i]! }));
    expect(faltaParaEnviar({ consentimiento: false, motivo: "x", medios: fotos(3) })).toMatch(/consentimiento/);
    expect(faltaParaEnviar({ consentimiento: true, motivo: " ", medios: fotos(3) })).toMatch(/motivo/);
    expect(faltaParaEnviar({ consentimiento: true, motivo: "dolor", medios: fotos(2) })).toMatch(/3 fotos/);
    expect(faltaParaEnviar({ consentimiento: true, motivo: "dolor", medios: [...fotos(2), { tipo: "VIDEO", angulo: "VIDEO_APERTURA" }] })).toMatch(/3 fotos/);
    expect(faltaParaEnviar({ consentimiento: true, motivo: "dolor", medios: fotos(3) })).toBeNull();
  });
});

describe("permisos y claves", () => {
  it("quién crea y quién valora", () => {
    expect(puedeCrearValoracion("recepcion")).toBe(true);
    expect(puedeCrearValoracion("especialista")).toBe(false);
    expect(puedeCrearValoracion("doctor_remitente")).toBe(false);
    expect(puedeValorar("especialista", false)).toBe(true);
    expect(puedeValorar("admin_tenant", true)).toBe(true);
    expect(puedeValorar("admin_tenant", false)).toBe(false);
    expect(puedeValorar("recepcion", true)).toBe(false);
  });
  it("el especialista solo ve las suyas; admin y recepción las del centro", () => {
    expect(filtroValoraciones("o1", "u1", "especialista")).toEqual({ organizationId: "o1", doctorId: "u1" });
    expect(filtroValoraciones("o1", "u1", "admin_tenant")).toEqual({ organizationId: "o1" });
    expect(filtroValoraciones("o1", "u1", "recepcion")).toEqual({ organizationId: "o1" });
  });
  it("las claves S3 pertenecen al centro y a la valoración (sin IDOR ni path traversal)", () => {
    const k = claveMedia("org1", "val1", "m1", "jpg");
    expect(k).toBe("tenants/org1/valoraciones/val1/m1/original.jpg");
    expect(claveCopia(k, "thumb")).toBe("tenants/org1/valoraciones/val1/m1/thumb.jpg");
    expect(claveValida(k, "org1", "val1")).toBe(true);
    expect(claveValida(k, "org2", "val1")).toBe(false);
    expect(claveValida(k, "org1", "val2")).toBe(false);
    expect(claveValida("tenants/org1/valoraciones/val1/../val2/x.jpg", "org1", "val1")).toBe(false);
  });
});

describe("utilidades", () => {
  it("IP truncada, nunca completa", () => {
    expect(truncarIp("190.12.34.56")).toBe("190.12.34.0");
    expect(truncarIp("2800:484:1:2:3:4:5:6")).toBe("2800:484:1:2::");
    expect(truncarIp("desconocida")).toBeNull();
    expect(truncarIp(null)).toBeNull();
  });
  it("wa.me con prefijo de Colombia y mensaje codificado", () => {
    expect(enlaceWhatsapp("300 123 4567", "Hola & más")).toBe("https://wa.me/573001234567?text=Hola%20%26%20m%C3%A1s");
    expect(enlaceWhatsapp("+57 300 123 4567", "x")).toBe("https://wa.me/573001234567?text=x");
    expect(enlaceWhatsapp("12", "x")).toBeNull();
    expect(enlaceWhatsapp(null, "x")).toBeNull();
  });
  it("tiempo medio de respuesta", () => {
    const h = 3_600_000, d0 = new Date("2026-01-01T00:00:00Z");
    expect(promedioRespuestaMs([])).toBeNull();
    expect(promedioRespuestaMs([{ desde: d0, hasta: new Date(d0.getTime() + 2 * h) }, { desde: d0, hasta: new Date(d0.getTime() + 4 * h) }])).toBe(3 * h);
    expect(duracionLegible(null)).toBe("—");
    expect(duracionLegible(30 * 60_000)).toBe("30 min");
    expect(duracionLegible(5 * h)).toBe("5 h");
    expect(duracionLegible(72 * h)).toBe("3 días");
  });
  it("validación de solicitud y cuestionario", () => {
    expect(esquemaSolicitud.safeParse({ nombre: "Ana", motivo: "dolor" }).success).toBe(false); // sin correo ni teléfono
    expect(esquemaSolicitud.safeParse({ nombre: "Ana", motivo: "dolor", telefono: "3001234567" }).success).toBe(true);
    expect(esquemaSolicitud.safeParse({ nombre: "Ana", motivo: "dolor", correo: "no-es-correo" }).success).toBe(false);
    expect(esquemaCuestionario.safeParse({ dolor: 11, sintomas: [], motivo: "x y z" }).success).toBe(false);
    expect(esquemaCuestionario.safeParse({ dolor: 4, sintomas: ["DOLOR"], motivo: "me duele" }).success).toBe(true);
    expect(esquemaCuestionario.safeParse({ dolor: 4, sintomas: ["INVENTADO"], motivo: "me duele" }).success).toBe(false);
  });
});
