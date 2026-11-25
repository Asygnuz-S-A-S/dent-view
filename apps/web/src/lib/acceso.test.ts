import { describe, expect, it } from "vitest";
import { decidirAccesoVisor, extraerEstudioUid, filtroEstudios } from "./acceso";

const UID = "1.2.840.113619.2.55.3";
const estudio = { organizationId: "org1", doctorRemitenteId: "doc1" };
const base = { usuarioId: "u1", metodo: "GET", uid: UID, estudio, rol: "admin_tenant" };

describe("extraerEstudioUid", () => {
  it("rechaza filtros QIDO fuera de la lista blanca (C1: alias 0020000D amplía la búsqueda)", () => {
    const u = "1.2.840.113619.2.55.3";
    expect(extraerEstudioUid(`/dicom-web/studies?StudyInstanceUID=${u}&0020000D=`)).toBeNull();
    expect(extraerEstudioUid(`/dicom-web/studies?StudyInstanceUID=${u}&0020000d=`)).toBeNull();
    expect(extraerEstudioUid(`/dicom-web/series?StudyInstanceUID=${u}&00100020=123`)).toBeNull();
    expect(extraerEstudioUid(`/dicom-web/studies?StudyInstanceUID=${u}&studyinstanceuid=`)).toBeNull();
    expect(extraerEstudioUid(`/dicom-web/studies?StudyInstanceUID=${u}&includefield=00100030&limit=10`)).toBe(u);
  });

  it("miniatura rendered: acepta ?accept= y ?viewport= solo con el UID del estudio y no abre otros estudios", () => {
    const r = `/dicom-web/studies/${UID}/series/1.2/instances/1.3/rendered`;
    expect(extraerEstudioUid(`${r}?accept=image/jpeg`)).toBe(UID);
    expect(extraerEstudioUid(`${r}?accept=image%2Fjpeg`)).toBe(UID); // así lo codifica dicomweb-client
    expect(extraerEstudioUid(`${r}%2f..%2fx?accept=image%2Fjpeg`)).toBeNull(); // el %2f en el path sigue rechazado
    expect(extraerEstudioUid(`${r}?accept=image/jpeg&StudyInstanceUID=1.2.3`)).toBeNull(); // contradictorio
    expect(extraerEstudioUid(`/dicom-web/studies?accept=image/jpeg&StudyInstanceUID=1.2.3`)).toBe("1.2.3"); // el control por centro decide: otro centro -> 403
    expect(extraerEstudioUid(`${r}?viewport=256%2C256`)).toBe(UID);
    expect(extraerEstudioUid(`${r}?viewport=256%2C256&00100020=1`)).toBeNull(); // otros filtros siguen fuera
    expect(decidirAccesoVisor({ ...base, uid: extraerEstudioUid(`/dicom-web/studies?accept=image/jpeg&StudyInstanceUID=1.2.3`), estudio: null })).toBe(403);
  });

  it("lee el UID del path", () => {
    expect(extraerEstudioUid(`/dicom-web/studies/${UID}/series/1.2/metadata`)).toBe(UID);
    expect(extraerEstudioUid(`/dicom-web/studies/${UID}`)).toBe(UID);
  });
  it("lee el UID de la query", () => {
    expect(extraerEstudioUid(`/dicom-web/series?StudyInstanceUID=${UID}`)).toBe(UID);
  });
  it("rechaza sin UID, UID inválido, múltiples o contradictorios", () => {
    expect(extraerEstudioUid("/dicom-web/studies")).toBeNull();
    expect(extraerEstudioUid("/dicom-web/studies/abc/series")).toBeNull();
    expect(extraerEstudioUid(`/dicom-web/series?StudyInstanceUID=${UID}&StudyInstanceUID=1.2`)).toBeNull();
    expect(extraerEstudioUid(`/dicom-web/studies/${UID}?StudyInstanceUID=1.2.3`)).toBeNull();
    expect(extraerEstudioUid(null)).toBeNull();
  });
  it("rechaza trucos de path", () => {
    expect(extraerEstudioUid(`/dicom-web/studies/${UID}%2f..%2fx`)).toBeNull();
    expect(extraerEstudioUid(`/dicom-web/studies/1.2/../${UID}/series`)).toBeNull();
  });
});

describe("decidirAccesoVisor", () => {
  it("sin sesión → 401", () => expect(decidirAccesoVisor({ ...base, usuarioId: null })).toBe(401));
  it("admin del tenant → 200", () => expect(decidirAccesoVisor(base)).toBe(200));
  it("recepcion y especialista → 200", () => {
    expect(decidirAccesoVisor({ ...base, rol: "recepcion" })).toBe(200);
    expect(decidirAccesoVisor({ ...base, rol: "especialista" })).toBe(200);
  });
  it("estudio de otro tenant (no miembro) → 403", () =>
    expect(decidirAccesoVisor({ ...base, rol: null })).toBe(403));
  it("estudio inexistente → 403", () =>
    expect(decidirAccesoVisor({ ...base, estudio: null })).toBe(403));
  it("doctor asignado → 200", () =>
    expect(decidirAccesoVisor({ ...base, usuarioId: "doc1", rol: "doctor_remitente" })).toBe(200));
  it("doctor no asignado → 403", () =>
    expect(decidirAccesoVisor({ ...base, usuarioId: "doc2", rol: "doctor_remitente" })).toBe(403));
  it("estudio sin doctor asignado: doctor → 403", () =>
    expect(
      decidirAccesoVisor({
        ...base,
        usuarioId: "doc1",
        rol: "doctor_remitente",
        estudio: { organizationId: "org1", doctorRemitenteId: null },
      }),
    ).toBe(403));
  it("rol desconocido → 403", () => expect(decidirAccesoVisor({ ...base, rol: "otro" })).toBe(403));
  it("POST/PUT/DELETE/sin método → 403", () => {
    for (const metodo of ["POST", "PUT", "DELETE", null])
      expect(decidirAccesoVisor({ ...base, metodo })).toBe(403);
  });
  it("HEAD → 200", () => expect(decidirAccesoVisor({ ...base, metodo: "HEAD" })).toBe(200));
  it("sin UID → 403", () => expect(decidirAccesoVisor({ ...base, uid: null })).toBe(403));
});

describe("decidirAccesoVisor con cookie de resultados", () => {
  const sin = { ...base, usuarioId: null, rol: null, estudio: null };
  const enlace = { estudioUids: [UID, "1.2.3"], activo: true };
  it("cookie válida y UID incluido → 200 (GET y HEAD)", () => {
    expect(decidirAccesoVisor({ ...sin, enlace })).toBe(200);
    expect(decidirAccesoVisor({ ...sin, enlace, uid: "1.2.3", metodo: "HEAD" })).toBe(200);
  });
  it("UID que no incluye el enlace → 403", () => expect(decidirAccesoVisor({ ...sin, enlace, uid: "9.9.9" })).toBe(403));
  it("sin UID → 403", () => expect(decidirAccesoVisor({ ...sin, enlace, uid: null })).toBe(403));
  it("método distinto de GET/HEAD → 403", () => {
    for (const metodo of ["POST", "PUT", "DELETE", null]) expect(decidirAccesoVisor({ ...sin, enlace, metodo })).toBe(403);
  });
  it("enlace vencido o revocado (inactivo) → 401", () =>
    expect(decidirAccesoVisor({ ...sin, enlace: { ...enlace, activo: false } })).toBe(401));
  it("sin cookie → 401 como antes", () => {
    expect(decidirAccesoVisor({ ...sin, enlace: null })).toBe(401);
    expect(decidirAccesoVisor(sin)).toBe(401);
  });
});

describe("filtroEstudios", () => {
  it("doctor remitente solo ve los suyos", () =>
    expect(filtroEstudios("o", "u", "doctor_remitente")).toEqual({ organizationId: "o", doctorRemitenteId: "u" }));
  it("otros roles ven todo el tenant", () =>
    expect(filtroEstudios("o", "u", "recepcion")).toEqual({ organizationId: "o" }));
});
