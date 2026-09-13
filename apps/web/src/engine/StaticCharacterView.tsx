"use client";

/**
 * Standalone read-only character viewer for share pages and previews.
 * Builds the rig once from a given configuration — no editor store
 * coupling, its own materials, full disposal on unmount.
 */
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CharacterConfiguration } from "@devaform/character-schema";
import { getLightingPreset } from "./lighting";
import { ZoneMaterials } from "./materials";
import { applyGestureOrientations, applyPose } from "./pose";
import { alignUprightAttachments, buildRig, disposeRig } from "./rig";
import { applyMorphInfluences } from "./skinning";
import { SceneEnvironment } from "./SceneEnvironment";
import { subscribeGlbCache } from "./glbCache";

function StaticCharacter({ config }: { config: CharacterConfiguration }) {
  const [glbVersion, setGlbVersion] = useState(0);
  useEffect(() => subscribeGlbCache(() => setGlbVersion((v) => v + 1)), []);

  const materialsRef = useRef<ZoneMaterials | null>(null);
  materialsRef.current ??= new ZoneMaterials();
  const materials = materialsRef.current;

  const rig = useMemo(() => {
    const built = buildRig(config, materials);
    materials.applyConfiguration(config.materials);
    applyMorphInfluences(built.root, config.morphs);
    applyPose(built.joints, config.pose);
    applyGestureOrientations(built.joints, config.hands);
    alignUprightAttachments(built);
    return built;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, materials, glbVersion]);

  const previousRig = useRef<ReturnType<typeof buildRig> | null>(null);
  useEffect(() => {
    if (previousRig.current && previousRig.current !== rig) disposeRig(previousRig.current);
    previousRig.current = rig;
  }, [rig]);
  useEffect(
    () => () => {
      if (previousRig.current) disposeRig(previousRig.current);
      materials.dispose();
      materialsRef.current = null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return <primitive object={rig.root} />;
}

export function StaticCharacterView({ config }: { config: CharacterConfiguration }) {
  const preset = getLightingPreset("studio");
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [1.55, 1.0, 1.85], fov: 38, near: 0.05, far: 50 }}
      gl={{ antialias: true }}
      className="h-full w-full"
    >
      <color attach="background" args={[preset.background]} />
      <SceneEnvironment intensity={preset.envIntensity} />
      <hemisphereLight
        color={preset.hemisphere.sky}
        groundColor={preset.hemisphere.ground}
        intensity={preset.hemisphere.intensity}
      />
      {preset.directionals.map((light, index) => (
        <directionalLight
          key={index}
          position={light.position}
          intensity={light.intensity}
          color={light.color}
          castShadow={light.castShadow ?? false}
          shadow-mapSize={[1024, 1024]}
        />
      ))}
      <StaticCharacter config={config} />
      <ContactShadows position={[0, -0.002, 0]} opacity={0.6} scale={3.2} blur={2.4} far={1.6} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]} receiveShadow>
        <circleGeometry args={[2.4, 48]} />
        <meshStandardMaterial color="#1a1512" roughness={0.95} />
      </mesh>
      <OrbitControls
        target={[0, 0.62, 0]}
        enablePan={false}
        minDistance={0.6}
        maxDistance={5}
        maxPolarAngle={Math.PI * 0.55}
      />
    </Canvas>
  );
}
