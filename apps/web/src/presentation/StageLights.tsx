"use client";

/**
 * The stage's light, and the ramp that reveals the statue with it.
 *
 * One rig, one place. The preset says what the finished lighting is; the
 * ramp says how much of it is on. During the entry sequence it is off —
 * the statue stands in the lit hall as a shape in the dark — and over the
 * settle it comes up to full. Nothing about the character is touched,
 * which is the whole reason the reveal is done with light: a presentation
 * layer that reaches into materials to fade them is a presentation layer
 * that owns the character.
 */
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { SceneEnvironment } from "@/engine/SceneEnvironment";
import { useStageStore } from "./stageStore";
import { resolveStudioLighting, type StudioLighting } from "./studioLighting";

export function StageLights({
  lighting,
  settleMs,
  /** Whether a backdrop image is behind the canvas: it owns the background. */
  transparent,
}: {
  lighting: StudioLighting;
  settleMs: number;
  transparent: boolean;
}) {
  /**
   * The preset, with the customer's adjustment already in it.
   *
   * Resolving is pure and lives in `studioLighting`: what reaches this
   * component is a finished rig, so the only thing here that knows about
   * key, fill and rim is the thing that draws them.
   */
  const preset = resolveStudioLighting(lighting);
  const phase = useStageStore((state) => state.phase);
  const group = useRef<THREE.Group | null>(null);
  const level = useRef(phase === "ready" ? 1 : 0);
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);

  /**
   * EXPOSURE, which the Studio never had.
   *
   * r3f's default is ACES filmic at an exposure of one and nothing ever
   * set it, so the only way to make the whole image brighter was to turn
   * up individual lights — which changes the modelling, not the exposure.
   * They are different controls and a customer photographing a statue
   * wants both.
   */
  useEffect(() => {
    gl.toneMappingExposure = preset.exposure;
  }, [gl, preset.exposure]);

  // The character's rig lights the CHARACTER. A directional does not
  // fall off, so the same key that models a statue a metre tall also
  // lands on a wall nine metres behind it; the room is on its own layer
  // and keeps its own lamps.
  useEffect(() => {
    group.current?.traverse((node) => {
      if ((node as THREE.Light).isLight) node.layers.set(0);
    });
  });

  useFrame((_, delta) => {
    const wanted = phase === "intro" ? 0 : 1;
    if (level.current !== wanted) {
      const step = (delta * 1000) / Math.max(1, settleMs);
      level.current =
        wanted > level.current
          ? Math.min(1, level.current + step)
          : Math.max(0, level.current - step * 4);
    }
    const lit = level.current;
    scene.environmentIntensity = preset.envIntensity * lit;
    const node = group.current;
    if (!node) return;
    node.children.forEach((child: THREE.Object3D) => {
      const light = child as THREE.Light & { userData: { full?: number } };
      if (light.userData.full === undefined) return;
      light.intensity = light.userData.full * lit;
    });
  });

  return (
    <>
      {!transparent && <color attach="background" args={[preset.background]} />}
      <SceneEnvironment intensity={preset.envIntensity} />
      <group ref={group}>
        <hemisphereLight
          color={preset.hemisphere.sky}
          groundColor={preset.hemisphere.ground}
          intensity={preset.hemisphere.intensity}
          userData={{ full: preset.hemisphere.intensity }}
        />
        {preset.directionals.map((light, index) => (
          <directionalLight
  key={`${preset.presetId}-${index}`}
            position={light.position}
            intensity={light.intensity}
            color={light.color}
            userData={{ full: light.intensity }}
            castShadow={light.castShadow}
            /**
             * The shadow map frames the FIGURE, and now contains only the
             * figure.
             *
             * It always framed the figure — three metres across, which is
             * generous for a statue a metre and a bit tall — but until the
             * two-pass render (see StageRender) the whole sanctum was
             * rasterised into it and sampled out of it, and a colonnade
             * 5.4 m out has no business in a three-metre map. With the
             * room gone the box can be drawn round the statue and its
             * base, which is what buys the resolution that models a face:
             * two metres over 2048 texels is a shade under a millimetre.
             *
             * `bottom` reaches a little below the mandala so a seated
             * figure's shadow has somewhere to fall; `top` clears the
             * tallest crown the product makes.
             */
            shadow-mapSize={[2048, 2048]}
            shadow-camera-near={0.1}
            shadow-camera-far={8}
            shadow-camera-left={-1}
            shadow-camera-right={1}
            shadow-camera-top={1.8}
            shadow-camera-bottom={-0.25}
            /**
             * And the two biases a soft shadow map needs.
             *
             * There were none. A statue is a single closed surface lit by
             * a key at a grazing angle, which is the exact case that
             * produces acne — the banding that used to crawl over the
             * shoulders and the crown at certain azimuths. `normalBias`
             * is the one that matters here because it offsets along the
             * surface normal, so it costs nothing on the flat and
             * everything where the light grazes.
             */
            shadow-bias={-0.0004}
            shadow-normalBias={0.018}
          />
        ))}
      </group>
    </>
  );
}
