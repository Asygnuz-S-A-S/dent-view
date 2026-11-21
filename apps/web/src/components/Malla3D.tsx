"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";

export function Malla3D({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState("Cargando malla…");

  useEffect(() => {
    const el = ref.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setPixelRatio(devicePixelRatio);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.1, 10000);
    const controls = new OrbitControls(camera, renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));
    const sol = new THREE.DirectionalLight(0xffffff, 1.5);
    camera.add(sol);
    scene.add(camera);

    let malla: THREE.Mesh | THREE.Points | undefined;
    let cancelado = false;
    new PLYLoader().load(
      src,
      (geo) => {
        if (cancelado) return geo.dispose();
        geo.computeVertexNormals();
        const conColor = geo.hasAttribute("color");
        const mat = new THREE.MeshStandardMaterial({ vertexColors: conColor, color: conColor ? 0xffffff : 0xd8c3b0, side: THREE.DoubleSide });
        malla = geo.index ? new THREE.Mesh(geo, mat) : new THREE.Points(geo, new THREE.PointsMaterial({ vertexColors: conColor, size: 1 }));
        scene.add(malla);
        geo.computeBoundingSphere();
        const { center, radius } = geo.boundingSphere!;
        controls.target.copy(center);
        // Carestream (CS 9600): Z va de mentón a frente y la cara mira hacia -Y; vista inicial de frente.
        camera.up.set(0, 0, 1);
        camera.position.copy(center).add(new THREE.Vector3(0, -radius * 3, 0));
        camera.near = radius / 100;
        camera.far = radius * 20;
        camera.updateProjectionMatrix();
        setEstado("");
      },
      undefined,
      () => setEstado("No se pudo cargar el escaneo."),
    );

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
    const onResize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    };
    addEventListener("resize", onResize);

    return () => {
      cancelado = true;
      removeEventListener("resize", onResize);
      renderer.setAnimationLoop(null);
      controls.dispose();
      malla?.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [src]);

  return (
    <>
      {estado && <p role="status">{estado}</p>}
      <div ref={ref} className="h-[70vh] w-full overflow-hidden rounded-lg bg-neutral-950" />
    </>
  );
}
