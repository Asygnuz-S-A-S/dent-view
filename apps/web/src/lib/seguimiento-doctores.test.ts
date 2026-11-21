import { describe, expect, it } from "vitest";
import { calcularDoctor, claveMes, diasEntre, mediana, ordenarDoctores, ultimosMeses, validarUmbrales } from "./seguimiento-doctores";

const d = (iso: string) => new Date(`${iso}T12:00:00-05:00`);
const AHORA = d("2026-11-20");
/** Remisiones cada `cada` días terminando `hace` días antes de AHORA. */
const ritmo = (n: number, cada: number, hace: number) => Array.from({ length: n }, (_, i) => new Date(AHORA.getTime() - (hace + i * cada) * 86_400_000));

describe("calcularDoctor", () => {
  it("doctor regular activo dentro de su ritmo", () => {
    const r = calcularDoctor(ritmo(10, 15, 5), AHORA);
    expect(r.semaforo).toBe("ACTIVO");
    expect(r.intervaloHabitual).toBe(15);
    expect(r.diasSinEnviar).toBe(5);
  });

  it("doctor regular que se enfría: riesgo > inactivo > crítico", () => {
    // intervalo habitual 15 d, factor 2 => riesgo pasados 30 d
    expect(calcularDoctor(ritmo(10, 15, 31), AHORA).semaforo).toBe("EN_RIESGO");
    expect(calcularDoctor(ritmo(10, 15, 29), AHORA).semaforo).toBe("ACTIVO");
    expect(calcularDoctor(ritmo(10, 15, 60), AHORA).semaforo).toBe("INACTIVO");
    expect(calcularDoctor(ritmo(10, 15, 90), AHORA).semaforo).toBe("CRITICO");
  });

  it("aplica el mínimo razonable: quien remite a diario no es riesgo a los pocos días", () => {
    expect(calcularDoctor(ritmo(20, 1, 10), AHORA).semaforo).toBe("ACTIVO");
    expect(calcularDoctor(ritmo(20, 1, 22), AHORA).semaforo).toBe("EN_RIESGO");
  });

  it("doctor nuevo (menos de 3 remisiones) no es riesgo", () => {
    expect(calcularDoctor(ritmo(2, 10, 40), AHORA).semaforo).toBe("NUEVO");
    expect(calcularDoctor(ritmo(1, 10, 3), AHORA).semaforo).toBe("NUEVO");
  });

  it("doctor nuevo que lleva demasiado sin enviar sí se marca inactivo", () => {
    expect(calcularDoctor(ritmo(1, 10, 100), AHORA).semaforo).toBe("CRITICO");
  });

  it("doctor sin remisiones: NUEVO, sin fecha ni promedio", () => {
    const r = calcularDoctor([], AHORA);
    expect(r).toMatchObject({ semaforo: "NUEVO", ultimaRemision: null, diasSinEnviar: null, intervaloHabitual: null, promedioMensual: 0, tendencia: "ESTABLE" });
    expect(r.porMes).toHaveLength(12);
  });

  it("respeta umbrales personalizados", () => {
    const u = { umbralRiesgoFactor: 3, diasInactivo: 30, diasInactivoCritico: 45 };
    expect(calcularDoctor(ritmo(10, 15, 35), AHORA, u).semaforo).toBe("INACTIVO");
    expect(calcularDoctor(ritmo(10, 15, 45), AHORA, u).semaforo).toBe("CRITICO");
    expect(calcularDoctor(ritmo(10, 5, 25), AHORA, { ...u, umbralRiesgoFactor: 1 }).semaforo).toBe("EN_RIESGO"); // 25 > máx(21, 1×5)
    expect(calcularDoctor(ritmo(10, 15, 40), AHORA, { umbralRiesgoFactor: 3, diasInactivo: 100, diasInactivoCritico: 200 }).semaforo).toBe("ACTIVO"); // 40 < 3×15
  });

  it("zona horaria: 23:30 en Bogotá del 31 cae en octubre aunque en UTC ya sea noviembre", () => {
    const tarde = new Date("2026-11-01T04:30:00Z"); // 23:30 del 31/oct en Bogotá
    expect(claveMes(tarde)).toBe("2026-10");
    const r = calcularDoctor([tarde], new Date("2026-11-01T05:30:00Z")); // 00:30 del 1/nov en Bogotá
    expect(r.porMes.at(-2)).toEqual({ mes: "2026-10", n: 1 });
    expect(r.porMes.at(-1)!.n).toBe(0);
    expect(r.diasSinEnviar).toBe(1);
  });

  it("remisiones por mes y tendencia", () => {
    const sube = [...ritmo(6, 7, 0), d("2026-07-10")];
    expect(calcularDoctor(sube, AHORA).tendencia).toBe("SUBE");
    const baja = [d("2026-06-01"), d("2026-06-10"), d("2026-07-01"), d("2026-08-02"), d("2026-11-01")];
    expect(calcularDoctor(baja, AHORA).tendencia).toBe("BAJA");
    expect(calcularDoctor(baja, AHORA).remisiones12m).toBe(5);
  });
});

describe("auxiliares", () => {
  it("diasEntre cuenta días calendario de Bogotá", () => {
    expect(diasEntre(new Date("2026-11-01T04:30:00Z"), new Date("2026-11-01T05:30:00Z"))).toBe(1);
  });
  it("ultimosMeses cruza el año", () => {
    expect(ultimosMeses(d("2026-02-10"), 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("mediana", () => {
    expect(mediana([])).toBeNull();
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 10])).toBe(2.5);
  });
  it("validarUmbrales", () => {
    expect(validarUmbrales({ umbralRiesgoFactor: 2, diasInactivo: 60, diasInactivoCritico: 90 })).toBeNull();
    expect(validarUmbrales({ umbralRiesgoFactor: 0.5, diasInactivo: 60, diasInactivoCritico: 90 })).toMatch(/factor/);
    expect(validarUmbrales({ umbralRiesgoFactor: 2, diasInactivo: 60, diasInactivoCritico: 60 })).toMatch(/críticos/);
  });
  it("ordenarDoctores por riesgo y luego ingresos", () => {
    const f = (nombre: string, semaforo: "ACTIVO" | "CRITICO" | "EN_RIESGO", ingresos12m: number, diasSinEnviar: number) => ({ nombre, semaforo, ingresos12m, diasSinEnviar });
    const xs = [f("A", "ACTIVO", 9, 1), f("B", "CRITICO", 1, 100), f("C", "EN_RIESGO", 5, 40), f("D", "CRITICO", 7, 95)];
    expect(ordenarDoctores(xs).map((x) => x.nombre)).toEqual(["D", "B", "C", "A"]);
    expect(ordenarDoctores(xs, "ultima").map((x) => x.nombre)).toEqual(["B", "D", "C", "A"]);
  });
});
