#!/usr/bin/env python3
"""Genera estudios DICOM SINTETICOS (no reales) para la demo. Uso: generar_dicom.py manifiesto.json carpeta_salida

Requiere solo pydicom y numpy. Cada estudio del manifiesto produce <salida>/<clave>/NNN.dcm (y face.ply para FACIAL).
Los patrones son figuras geometricas estilizadas con la marca 'DEMO': no hay datos de ninguna persona real.
"""
import json
import os
import sys
import datetime

import numpy as np
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

SOP = {
    "PX": "1.2.840.10008.5.1.4.1.1.1.1",   # Digital X-Ray (presentacion)
    "CEFALO": "1.2.840.10008.5.1.4.1.1.1.1",
    "IO": "1.2.840.10008.5.1.4.1.1.3.1",   # Digital Intra-oral X-Ray
    "BW": "1.2.840.10008.5.1.4.1.1.3.1",
    "CBCT": "1.2.840.10008.5.1.4.1.1.2",   # CT
    "FACIAL": "1.2.840.10008.5.1.4.1.1.7",  # Secondary Capture
}
MODALIDAD = {"PX": "PX", "CEFALO": "DX", "IO": "IO", "BW": "IO", "CBCT": "CT", "FACIAL": "OT"}

FUENTE = {
    "D": ["1110", "1001", "1001", "1001", "1001", "1001", "1110"],
    "E": ["1111", "1000", "1000", "1110", "1000", "1000", "1111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "O": ["0110", "1001", "1001", "1001", "1001", "1001", "0110"],
}


def texto_demo(img, x0, y0, escala, valor):
    """Estampa 'DEMO' con una fuente de bits (sin dependencias)."""
    x = x0
    for ch in "DEMO":
        glifo = FUENTE[ch]
        for fy, fila in enumerate(glifo):
            for fx, bit in enumerate(fila):
                if bit == "1":
                    ys, xs = y0 + fy * escala, x + fx * escala
                    if ys + escala <= img.shape[0] and xs + escala <= img.shape[1]:
                        img[ys:ys + escala, xs:xs + escala] = valor
        x += (len(glifo[0]) + 1) * escala


def rejilla(h, w):
    y, x = np.mgrid[0:h, 0:w]
    return x / (w - 1), y / (h - 1)


def ruido(rng, h, w, a):
    return rng.normal(0, a, (h, w))


def a_u16(img):
    return (np.clip(img, 0, 1) * 4095).astype(np.uint16)


def panoramica(rng):
    h, w = 320, 640
    x, y = rejilla(h, w)
    img = 0.10 + 0.05 * (1 - np.abs(2 * y - 1)) + ruido(rng, h, w, 0.012)
    # Contorno de la mandibula y ramas
    arco = 0.62 + 0.30 * (2 * x - 1) ** 2
    img += 0.35 * (np.abs(y - arco) < 0.011) * (x > 0.09) * (x < 0.91)
    for cx in (0.09, 0.91):
        img += 0.35 * (np.abs(x - cx) < 0.011) * (y > 0.22) * (y < 0.75)
        img += 0.30 * (((x - cx) / 0.025) ** 2 + ((y - 0.22) / 0.04) ** 2 < 1)
    # Senos / paladar
    img += 0.18 * (np.abs(y - (0.36 - 0.05 * (1 - (2 * x - 1) ** 2))) < 0.008) * (x > 0.15) * (x < 0.85)
    # Dientes superiores e inferiores
    for i in range(14):
        cx = 0.12 + i * (0.76 / 13)
        curva = 0.46 + 0.05 * (1 - (2 * cx - 1) ** 2)
        ancho = 0.017 if 3 <= i <= 10 else 0.021
        img += 0.55 * ((np.abs(x - cx) < ancho) & (y > curva - 0.10) & (y < curva - 0.005))
        img += 0.30 * ((np.abs(x - cx) < ancho * 0.45) & (y >= curva - 0.19) & (y <= curva - 0.10))
        img += 0.55 * ((np.abs(x - cx) < ancho) & (y > curva + 0.005) & (y < curva + 0.10))
        img += 0.30 * ((np.abs(x - cx) < ancho * 0.45) & (y >= curva + 0.10) & (y <= curva + 0.19))
    # Restauracion y ausencia (para que se vea algo clinico)
    img += 0.25 * (((x - 0.30) / 0.02) ** 2 + ((y - 0.42) / 0.03) ** 2 < 1)
    texto_demo(img, 270, 285, 4, 0.9)
    return a_u16(img), (0.1, 0.1)


def cefalometrica(rng):
    h, w = 400, 320
    x, y = rejilla(h, w)
    img = 0.08 + 0.05 * x + ruido(rng, h, w, 0.012)
    cr = np.abs(((x - 0.5) / 0.38) ** 2 + ((y - 0.30) / 0.24) ** 2 - 1)
    img += 0.55 * (cr < 0.07)
    # Perfil facial (frente, nariz, labios, menton)
    perfil = 0.84 + 0.05 * np.sin(y * 18) * (y > 0.3) * (y < 0.75)
    img += 0.30 * (np.abs(x - perfil) < 0.008) * (y > 0.22) * (y < 0.80)
    # Mandibula, columna cervical y dientes
    img += 0.50 * (np.abs(((x - 0.62) / 0.20) ** 2 + ((y - 0.62) / 0.12) ** 2 - 1) < 0.10) * (y > 0.60)
    for k in range(5):
        img += 0.35 * (np.abs(x - 0.18) < 0.05) * (np.abs(y - (0.58 + k * 0.075)) < 0.030)
    img += 0.60 * ((np.abs(x - 0.70) < 0.012) & (y > 0.52) & (y < 0.60))
    img += 0.60 * ((np.abs(x - 0.70) < 0.012) & (y > 0.62) & (y < 0.70))
    texto_demo(img, 20, 360, 4, 0.9)
    return a_u16(img), (0.1, 0.1)


def periapical(rng, n_dientes=2):
    h, w = 256, 192
    x, y = rejilla(h, w)
    img = 0.28 + 0.10 * y + ruido(rng, h, w, 0.03)
    for t in range(n_dientes):
        cx = 0.5 + (t - (n_dientes - 1) / 2) * 0.42
        corona = (np.abs(x - cx) < 0.15) & (y > 0.12) & (y < 0.42)
        ancho_raiz = 0.12 * (1 - np.clip((y - 0.42) / 0.5, 0, 1)) + 0.02
        raiz = (np.abs(x - cx) < ancho_raiz) & (y >= 0.42) & (y < 0.92)
        img += 0.55 * corona + 0.38 * raiz
        img -= 0.28 * ((np.abs(x - cx) < 0.018) & (y > 0.22) & (y < 0.88))  # conducto
        img += 0.20 * (np.abs(x - cx) < 0.15) * (np.abs(y - 0.12) < 0.012)
    img += 0.10 * ((y > 0.5) & (np.abs(np.sin(x * 60 + y * 25)) > 0.9))  # trabeculado
    texto_demo(img, 14, 228, 3, 0.95)
    return a_u16(img), (0.03, 0.03)


def bite_wing(rng):
    h, w = 192, 256
    x, y = rejilla(h, w)
    img = 0.30 + ruido(rng, h, w, 0.03)
    for i in range(4):
        cx = 0.14 + i * 0.24
        img += 0.52 * ((np.abs(x - cx) < 0.095) & (y > 0.18) & (y < 0.46))
        img += 0.52 * ((np.abs(x - cx) < 0.095) & (y > 0.54) & (y < 0.82))
        img -= 0.20 * ((np.abs(x - cx) < 0.03) & (((y > 0.30) & (y < 0.44)) | ((y > 0.56) & (y < 0.70))))  # pulpa
    img += 0.30 * ((y > 0.46) & (y < 0.54) & (np.abs(np.sin(x * 40)) > 0.97))
    img += 0.25 * (np.abs(y - 0.95) < 0.015) + 0.25 * (np.abs(y - 0.06) < 0.015)  # cresta osea
    texto_demo(img, 10, 160, 3, 0.95)
    return a_u16(img), (0.03, 0.03)


def cbct(rng, cortes):
    n = 96
    gy, gx = np.mgrid[0:n, 0:n]
    x = (gx - n / 2) / (n / 2)
    y = (gy - n / 2) / (n / 2)
    volumen = []
    for k in range(cortes):
        z = k / (cortes - 1)
        # Cráneo: elipsoide que se estrecha hacia la mandibula (z=0 abajo).
        radio = 0.55 + 0.35 * np.sin(np.pi * min(1.0, z * 1.15 + 0.1) * 0.5)
        r = np.sqrt((x / (0.80 * radio + 0.05)) ** 2 + (y / (0.92 * radio + 0.05)) ** 2)
        img = 0.04 + np.zeros((n, n))
        img += 0.40 * (r < 1.0)                          # tejido blando
        img += 0.55 * ((r > 0.80) & (r < 0.93))          # hueso cortical
        if z < 0.55:                                      # arcada dental
            u = np.sqrt((x / 0.55) ** 2 + ((y - 0.15) / 0.50) ** 2)
            arco = (np.abs(u - 0.82) < 0.07) & (y > -0.05)
            img += 0.50 * arco * (0.5 + 0.5 * np.sin(np.arctan2(y - 0.15, x) * 14) ** 2)
            img += 0.25 * ((np.abs(u - 0.82) < 0.14) & (y > -0.05))
        if 0.55 <= z < 0.8:                               # senos
            img -= 0.30 * ((((x - 0.3) / 0.15) ** 2 + ((y - 0.25) / 0.2) ** 2 < 1) | (((x + 0.3) / 0.15) ** 2 + ((y - 0.25) / 0.2) ** 2 < 1))
        img += ruido(rng, n, n, 0.012)
        texto_demo(img, 4, n - 12, 1, 0.95)
        volumen.append(a_u16(img))
    return volumen


def malla_facial(rng, ruta):
    """PLY ASCII: elipsoide tipo rostro (esfera con ruido y nariz) de ~1100 vertices."""
    lat, lon = 28, 40
    verts = []
    for i in range(lat + 1):
        th = np.pi * i / lat
        for j in range(lon):
            ph = 2 * np.pi * j / lon
            r = 1.0 + rng.normal(0, 0.006)
            nariz = 0.22 * np.exp(-(((th - np.pi * 0.52) / 0.18) ** 2 + ((ph - 0.0) / 0.22) ** 2))
            verts.append((
                0.85 * r * np.sin(th) * np.cos(ph) + nariz,
                1.10 * r * np.cos(th),
                0.95 * r * np.sin(th) * np.sin(ph),
            ))
    caras = []
    for i in range(lat):
        for j in range(lon):
            a = i * lon + j
            b = i * lon + (j + 1) % lon
            c = (i + 1) * lon + j
            d = (i + 1) * lon + (j + 1) % lon
            caras += [(a, b, c), (b, d, c)]
    with open(ruta, "w") as f:
        f.write("ply\nformat ascii 1.0\ncomment DEMO sintetico\n")
        f.write(f"element vertex {len(verts)}\nproperty float x\nproperty float y\nproperty float z\n")
        f.write(f"element face {len(caras)}\nproperty list uchar int vertex_indices\nend_header\n")
        for v in verts:
            f.write(f"{v[0]:.5f} {v[1]:.5f} {v[2]:.5f}\n")
        for c in caras:
            f.write(f"3 {c[0]} {c[1]} {c[2]}\n")


def imagen_facial(rng):
    h = w = 256
    x, y = rejilla(h, w)
    r = np.sqrt(((x - 0.5) / 0.32) ** 2 + ((y - 0.5) / 0.42) ** 2)
    sombra = np.clip(1 - r ** 2, 0, 1) ** 0.5
    base = 0.15 + 0.7 * sombra * (0.75 + 0.25 * (1 - x))
    rgb = np.stack([base * 0.95, base * 0.85, base * 0.80], axis=-1) + rng.normal(0, 0.01, (h, w, 3))
    gris = rgb[..., 0].copy()
    texto_demo(gris, 70, 225, 4, 1.0)
    rgb[..., 0] = np.where(gris > 0.99, 1.0, rgb[..., 0])
    rgb[..., 1] = np.where(gris > 0.99, 1.0, rgb[..., 1])
    rgb[..., 2] = np.where(gris > 0.99, 1.0, rgb[..., 2])
    return (np.clip(rgb, 0, 1) * 255).astype(np.uint8)


def nuevo(e, sop_uid, serie_uid, n_instancia, clase, modalidad, serie_desc, hoy):
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = clase
    meta.MediaStorageSOPInstanceUID = sop_uid
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    meta.ImplementationClassUID = generate_uid(entropy_srcs=["dent-view-demo"])
    ds = FileDataset(None, {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID, ds.SOPInstanceUID = clase, sop_uid
    ds.PatientName, ds.PatientID = e["patientName"], e["patientId"]
    ds.PatientBirthDate, ds.PatientSex = e["birthDate"], e.get("sex", "O")
    ds.StudyInstanceUID, ds.SeriesInstanceUID = e["studyUid"], serie_uid
    ds.StudyDate, ds.StudyTime = e["studyDate"], "090000"
    ds.SeriesDate, ds.ContentDate = e["studyDate"], e["studyDate"]
    ds.StudyDescription, ds.SeriesDescription = e["desc"], serie_desc
    ds.AccessionNumber, ds.StudyID = e.get("accession", ""), "1"
    ds.SeriesNumber, ds.InstanceNumber = 1, n_instancia
    ds.Modality = modalidad
    ds.InstitutionName = e.get("centro", "DEMO")
    ds.Manufacturer = "dent-view demo (sintetico)"
    ds.ReferringPhysicianName = e.get("remitente", "")
    ds.is_little_endian, ds.is_implicit_VR = True, False
    return ds


def escala_gris(ds, img, bits_alm=16, bits_usados=12):
    ds.SamplesPerPixel, ds.PhotometricInterpretation = 1, "MONOCHROME2"
    ds.Rows, ds.Columns = img.shape
    ds.BitsAllocated, ds.BitsStored, ds.HighBit, ds.PixelRepresentation = bits_alm, bits_usados, bits_usados - 1, 0
    ds.WindowCenter, ds.WindowWidth = 2048, 4096
    ds.PixelData = img.tobytes()


def guardar(ds, ruta):
    """pydicom 3 usa enforce_file_format; pydicom 2 usa write_like_original=False."""
    try:
        ds.save_as(ruta, enforce_file_format=True)
    except TypeError:
        ds.save_as(ruta, write_like_original=False)


def main():
    manifiesto, salida = sys.argv[1], sys.argv[2]
    estudios = json.load(open(manifiesto))
    hoy = datetime.date.today().strftime("%Y%m%d")
    for e in estudios:
        rng = np.random.default_rng(e["seed"])
        carpeta = os.path.join(salida, e["key"])
        os.makedirs(carpeta, exist_ok=True)
        tipo, uid = e["tipo"], e["studyUid"]
        serie = uid + ".1"
        clase, mod = SOP[tipo], MODALIDAD[tipo]
        if tipo == "CBCT":
            cortes = cbct(rng, e.get("cortes", 28))
            for k, img in enumerate(cortes):
                ds = nuevo(e, f"{uid}.1.{k + 1}", serie, k + 1, clase, mod, "CBCT DEMO", hoy)
                escala_gris(ds, img)
                ds.PixelSpacing, ds.SliceThickness = [0.3, 0.3], 0.3
                ds.ImagePositionPatient = [-14.4, -14.4, k * 0.3]
                ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
                ds.SliceLocation = k * 0.3
                ds.RescaleIntercept, ds.RescaleSlope = -1024, 1
                guardar(ds, os.path.join(carpeta, f"{k + 1:03d}.dcm"))
        elif tipo == "FACIAL":
            rgb = imagen_facial(rng)
            ds = nuevo(e, f"{uid}.1.1", serie, 1, clase, mod, "Escaneo facial DEMO", hoy)
            ds.SamplesPerPixel, ds.PhotometricInterpretation, ds.PlanarConfiguration = 3, "RGB", 0
            ds.Rows, ds.Columns = rgb.shape[:2]
            ds.BitsAllocated = ds.BitsStored = 8
            ds.HighBit, ds.PixelRepresentation = 7, 0
            ds.ConversionType = "WSD"
            ds.PixelData = rgb.tobytes()
            guardar(ds, os.path.join(carpeta, "001.dcm"))
            malla_facial(rng, os.path.join(carpeta, "face.ply"))
        else:
            img, esp = {"PX": panoramica, "CEFALO": cefalometrica, "IO": periapical, "BW": bite_wing}[tipo](rng)
            ds = nuevo(e, f"{uid}.1.1", serie, 1, clase, mod, e["desc"], hoy)
            escala_gris(ds, img)
            ds.PixelSpacing = list(esp)
            guardar(ds, os.path.join(carpeta, "001.dcm"))
        print(f"ok {e['key']} {tipo}")


if __name__ == "__main__":
    main()
