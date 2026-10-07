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
import { buildRig, disposeRig, poseRig, rigMorphInfluences } from "./rig";
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
    applyMorphInfluences(built.root, rigMorphInfluences(built, config.morphs));
    poseRig(built);
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
  /**
   * STUDIO LIGHT, DELIBERATELY — AND NOT THE STAGE'S.
   *
   * This looks like an oversight and it is not, so here is the
   * measurement. The Studio opens in the light its stage declares, which
   * is the sanctum for all three forms, and a share page lit differently
   * from the editor the figure was composed in is a real inconsistency.
   * It was changed to follow the stage, photographed, and changed back.
   *
   * A sanctum rig is built to light a figure standing IN the sanctum: the
   * hall is geometry, it bounces, and `StageRender` draws it in a pass of
   * its own so the room and the figure each get their own lamps. This
   * page has no room — it is a plain scene, a plain camera and a ground
   * disc, which is the right thing for a page whose whole subject is one
   * statue. Put the sanctum rig in an empty scene and there is nothing
   * for it to work with.
   *
   * Measured off the rendered page, on the same creation, same framing:
   *
   *     sanctum rig   figure mean luminance 51.9, ground 35.3  (1.47x)
   *     studio rig    figure mean luminance 62.8, ground 36.8  (1.71x)
   *
   * The figure is a fifth brighter under the rig that is already here and
   * stands out from its ground by noticeably more. Following the stage
   * made the one public page in the product dimmer and flatter.
   *
   * Giving this page the actual hall is the thing that would resolve it
   * honestly, and that means the two-pass renderer and the layer
   * discipline the figure would have to join — a rebuild of the public
   * view rather than a correction to it, and not worth risking the page
   * everyone else sees.
   */
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
