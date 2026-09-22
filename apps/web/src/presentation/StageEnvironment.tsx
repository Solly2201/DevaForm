"use client";

/**
 * The sanctum, built.
 *
 * WHAT THIS REPLACES. The room was the entry's final frame shown in
 * screen space: a photograph, correct for exactly one camera position,
 * which is the one it was taken from. Standing a statue in it works;
 * walking round it does not. The mandala painted on that floor keeps the
 * hero angle's perspective while the base standing on it takes the
 * perspective of wherever the customer has gone, so by ninety degrees
 * the two disagree and the figure reads as sliding across a picture —
 * and the earlier answers to that (fade the room past an angle, fade it
 * with distance) made the temple pop to black under their hands instead.
 *
 * So it is geometry. Cheap geometry — a floor, a painted circle, a ring
 * of columns, a wall, an opening and the shaft it throws — because what
 * is being bought is not detail, it is that every angle is a real angle.
 * The floor is under the feet from all of them, there is no void to
 * rotate into, and nothing has to be hidden.
 *
 * ANCHORED TO THE STAGE'S PIVOT, never to the character. The figure
 * stands at the pivot; the room is built around it; neither knows about
 * the other. Moving the stage can never move the statue, which is the
 * whole reason the two are separate configurations.
 *
 * AND LIT SEPARATELY. The figure's rig is a two-point key at a couple of
 * units of intensity, aimed at a statue a metre tall; a directional
 * light does not fall off, so the same key lands on a wall nine metres
 * away and turns a near-black hall into beige. The room is on its own
 * render layer with its own dim lamps, so the two can be lit for what
 * they are — the sanctum dark, the murti in the light.
 *
 * Layers deal with the LIGHTS. They do not deal with the image-based
 * lighting, which has no layers: the procedural studio box that gives
 * the gold its reflections was also raising every surface of the hall to
 * a flat beige, and the room reads as a photographer's cyclorama rather
 * than as a dark sanctum. Each surface here says how much of that
 * environment it takes.
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { StageEnvironment as StageEnvironmentConfig } from "@devaform/asset-system";

/** The layer the room lives on, and nothing else does. */
export const STAGE_LAYER = 1;

/** One column: a shaft with a base and a capital, turned on its own axis. */
function column(config: StageEnvironmentConfig["columns"]): THREE.BufferGeometry {
  const t = config.thickness;
  const h = config.height;
  return new THREE.LatheGeometry(
    [
      [t * 1.5, 0],
      [t * 1.45, h * 0.035],
      [t * 1.1, h * 0.06],
      [t * 1.0, h * 0.12],
      [t * 0.92, h * 0.55],
      [t * 0.86, h * 0.82],
      [t * 1.05, h * 0.87],
      [t * 1.02, h * 0.92],
      [t * 1.35, h * 0.96],
      [t * 1.3, h],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    18,
  );
}

/**
 * The painted circle, as rings rather than a texture.
 *
 * A texture would be a photograph of a mandala, which is the thing this
 * file exists to stop using. Rings are what a mandala is.
 */
function mandala(config: StageEnvironmentConfig["mandala"]): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < config.rings; i += 1) {
    const t = (i + 1) / config.rings;
    out.push(new THREE.RingGeometry(config.radius * t - 0.012, config.radius * t, 72));
  }
  return out;
}

export function StageEnvironment({
  config,
  pivot,
}: {
  config: StageEnvironmentConfig;
  pivot: readonly [number, number, number];
}) {
  const columnGeometry = useMemo(() => column(config.columns), [config.columns]);
  const rings = useMemo(() => mandala(config.mandala), [config.mandala]);
  const columns = useMemo(
    () =>
      Array.from({ length: config.columns.count }, (_, i) => {
        const angle = (i / config.columns.count) * Math.PI * 2;
        return [
          Math.sin(angle) * config.columns.radius,
          0,
          Math.cos(angle) * config.columns.radius,
        ] as const;
      }),
    [config.columns],
  );
  const lamps = useMemo(
    () =>
      Array.from({ length: config.lamps.count }, (_, i) => {
        const angle = ((i + 0.5) / config.lamps.count) * Math.PI * 2;
        return [
          Math.sin(angle) * config.lamps.radius,
          0,
          Math.cos(angle) * config.lamps.radius,
        ] as const;
      }),
    [config.lamps],
  );

  // Everything in here belongs to the stage's layer, lights included.
  const group = useRef<THREE.Group | null>(null);
  useEffect(() => {
    group.current?.traverse((node) => node.layers.set(STAGE_LAYER));
  }, [config]);

  return (
    <group ref={group} position={pivot as unknown as [number, number, number]}>
      {/* The hall's own light: a dim warm ambience and a shaft from the
          opening. Weak on purpose — a sanctum is dark, and what the eye
          should find in it is the figure. */}
      <hemisphereLight color="#ffdca8" groundColor="#120d09" intensity={0.12} />
      <directionalLight position={[0, 8, 0.6]} intensity={0.34} color={config.oculus.color} />
      <directionalLight position={[2.5, 1.2, 3.5]} intensity={0.1} color="#ffb877" />
      {/* The floor. Real, and under the feet from every angle. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[config.floorRadius, 96]} />
        <meshStandardMaterial
          color={config.floorColor}
          roughness={0.94}
          metalness={0}
          envMapIntensity={0.3}
        />
      </mesh>

      {/* The circle it stands on — a hair above the floor so the two do
          not fight for the same depth. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0012, 0]} receiveShadow>
        <circleGeometry args={[config.mandala.radius, 72]} />
        <meshStandardMaterial color={config.mandala.color} roughness={0.88} envMapIntensity={0.45} />
      </mesh>
      {rings.map((geometry, index) => (
        <mesh
          key={index}
          geometry={geometry}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.0022, 0]}
        >
          <meshStandardMaterial color={config.mandala.ringColor} roughness={0.8} envMapIntensity={0.45} />
        </mesh>
      ))}

      {/* The colonnade. */}
      {columns.map((at, index) => (
        <mesh key={index} geometry={columnGeometry} position={at as unknown as [number, number, number]} castShadow receiveShadow>
          <meshStandardMaterial color={config.columns.color} roughness={0.92} envMapIntensity={0.28} />
        </mesh>
      ))}

      {/* A step round the sanctum: the floor needs structure, or a dark
          disc nine metres across reads as fog. */}
      <mesh position={[0, 0.035, 0]}>
        <cylinderGeometry
          args={[config.lamps.radius + 0.55, config.lamps.radius + 0.6, 0.07, 64, 1, true]}
        />
        <meshStandardMaterial color={config.columns.color} roughness={0.95} envMapIntensity={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
        <ringGeometry args={[config.lamps.radius + 0.55, config.lamps.radius + 0.6, 64]} />
        <meshStandardMaterial color={config.columns.color} roughness={0.9} envMapIntensity={0.34} />
      </mesh>

      {/* The hall beyond them: a wall the camera can never get outside,
          seen from the inside, so there is no direction that is void.
          Banded, because an unbroken cylinder nine metres across has no
          scale and reads as a backdrop rather than as a room. */}
      {[0.28, 0.52, 0.78].map((at) => (
        <mesh key={at} position={[0, config.wall.height * at, 0]}>
          <cylinderGeometry
            args={[config.wall.radius * 0.995, config.wall.radius * 0.995, config.wall.height * 0.035, 64, 1, true]}
          />
          <meshStandardMaterial
            color={config.columns.color}
            roughness={0.95}
            side={THREE.BackSide}
            envMapIntensity={0.2}
          />
        </mesh>
      ))}
      <mesh position={[0, config.wall.height / 2, 0]}>
        <cylinderGeometry args={[config.wall.radius, config.wall.radius, config.wall.height, 64, 1, true]} />
        <meshStandardMaterial
          color={config.wall.color}
          roughness={1}
          side={THREE.BackSide}
          envMapIntensity={0.1}
        />
      </mesh>
      {/* And a roof, so looking up from below is a ceiling rather than sky. */}
      <mesh position={[0, config.wall.height, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[config.oculus.radius, config.wall.radius, 64]} />
        <meshStandardMaterial
          color={config.wall.color}
          roughness={1}
          side={THREE.DoubleSide}
          envMapIntensity={0.1}
        />
      </mesh>

      {/* The opening, and the shaft it throws. The shaft is additive and
          writes no depth: it is light in the air, not an object. */}
      <mesh position={[0, config.oculus.height, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[config.oculus.radius, 48]} />
        <meshBasicMaterial color={config.oculus.color} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, config.oculus.height / 2, 0]}>
        <coneGeometry
          args={[config.oculus.radius * 2.1, config.oculus.height, 40, 1, true]}
        />
        <meshBasicMaterial
          color={config.oculus.color}
          transparent
          opacity={config.oculus.shaftOpacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Oil lamps: what actually warms a dark hall, and what gives the
          floor something to catch at every angle. */}
      {lamps.map((at, index) => (
        <group key={index} position={at as unknown as [number, number, number]}>
          <mesh position={[0, 0.045, 0]}>
            <cylinderGeometry args={[0.035, 0.05, 0.09, 12]} />
            <meshStandardMaterial
              color="#8a6a3a"
              roughness={0.5}
              metalness={0.7}
              envMapIntensity={0.5}
            />
          </mesh>
          <mesh position={[0, 0.105, 0]}>
            <sphereGeometry args={[0.028, 12, 10]} />
            <meshBasicMaterial color={config.lamps.color} />
          </mesh>
          <pointLight
            position={[0, 0.13, 0]}
            color={config.lamps.color}
            intensity={0.22}
            distance={2.6}
            decay={2}
          />
        </group>
      ))}
    </group>
  );
}
