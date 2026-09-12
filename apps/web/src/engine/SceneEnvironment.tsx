"use client";

/**
 * Procedural image-based lighting. Uses three's RoomEnvironment (a fully
 * procedural studio box) through PMREM — no network HDR dependency, works
 * offline, and gives metals/clearcoat real reflections.
 */
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export function SceneEnvironment({ intensity = 1 }: { intensity?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new RoomEnvironment();
    const target = pmrem.fromScene(envScene, 0.04);
    scene.environment = target.texture;
    return () => {
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    scene.environmentIntensity = intensity;
    return () => {
      scene.environmentIntensity = 1;
    };
  }, [scene, intensity]);

  return null;
}
