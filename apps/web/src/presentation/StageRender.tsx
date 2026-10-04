"use client";

/**
 * Two passes, because the room and the figure are lit for different
 * reasons — and because saying so was not enough.
 *
 * WHAT WAS WRONG. The sanctum's geometry is on its own layer with its own
 * dim lamps, and the character's key/fill/rim are on another, so that "the
 * sanctum dark, the murti in the light" could be two decisions instead of
 * one compromise. That is what the code SAID. It is not what happened:
 * three.js gathers lights per RENDER CAMERA, not per object —
 *
 *     targetScene.traverseVisible((object) => {
 *       if (object.isLight && object.layers.test(camera.layers)) …
 *
 * — and the Studio's camera sees every layer, because it has to draw
 * every layer. So all twenty-one lights were gathered into one global
 * rig and applied to everything in it. The character's key is a
 * directional at 2.1 with a rim at 1.15, and a directional does not fall
 * off: the same light that models a statue a metre tall washed a
 * colonnade nine metres behind it to a flat pale value with no gradient
 * across its curve. Zoomed out, the columns stopped reading as columns
 * and became grey panels hanging in a dark room — the "patchy lighting"
 * this fixes. Measured, not guessed: hiding the columns alone removed
 * every patch (scripts/qa-stage.mjs).
 *
 * The same rule governs SHADOWS. The shadow pass tests each object
 * against the view camera's layers too, so sixteen columns standing 3.7 m
 * out were being rasterised into a shadow map whose frustum is three
 * metres wide, and a nine-metre floor was sampling that map far outside
 * its own edges — which a clamped depth texture answers by smearing its
 * border texel across the rest of the room.
 *
 * WHAT THIS DOES. It renders twice with the camera's layers narrowed,
 * which is the only way a forward renderer can hold two rigs:
 *
 *     pass 1  camera.layers = {stage}      room geometry, room lamps
 *     pass 2  camera.layers = {character}  the figure, the figure's rig
 *
 * Depth is kept BETWEEN the passes and cleared only before the first, so
 * occlusion still works in both directions: a column in front of the
 * statue hides it, a statue in front of a column hides that. The
 * character's shadow map now contains the character and nothing else, and
 * the room is lit by the lamps that were always meant to light it.
 *
 * The figure's shadow on the floor is not lost with it: that has always
 * been ContactShadows' job — a soft contact under the feet, which is the
 * shadow a murti on a mandala actually has, and which renders from its
 * own camera on the character's layer.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { CHARACTER_LAYER, STAGE_LAYER } from "./stageLayers";
import { useStageStore } from "./stageStore";

export function StageRender() {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const phase = useStageStore((state) => state.phase);
  const characterReady = useStageStore((state) => state.characterReady);

  /**
   * Put the camera back the way everything else expects to find it.
   *
   * Raycasting, drei's helpers and anything that measures against the
   * camera read `layers` outside the render loop; a camera left narrowed
   * to one layer between frames is a camera that lies to all of them.
   * The passes set it and restore it within the one callback, and this
   * restores it if the component ever goes away mid-frame.
   */
  useEffect(() => {
    camera.layers.enableAll();
    return () => camera.layers.enableAll();
  }, [camera]);

  /**
   * How many frames the hidden stage still owes.
   *
   * See the loop: during the entry the Studio is COVERED, and drawing it
   * is drawing nothing anybody can see. It still owes a frame or two
   * whenever what it would draw has changed — so that the picture under
   * the overlay is correct and complete at the instant the overlay goes,
   * rather than being composed in front of the customer.
   */
  const owed = useRef(2);
  const wasReady = useRef(false);
  if (characterReady !== wasReady.current) {
    wasReady.current = characterReady;
    owed.current = 2;
  }

  // Priority 1: taking a frame callback above zero is what tells
  // react-three-fiber to stop rendering the scene itself. Everything at
  // priority 0 — the contact shadow's own pass, the settle, the light
  // ramp — has already run by the time this does.
  useFrame(({ scene }) => {
    /**
     * NOTHING IS DRAWN WHILE THE ENTRY COVERS IT.
     *
     * The entry is a fullscreen opaque layer and the Studio was rendering
     * the whole statue underneath it, every frame, at full cost: five
     * hundred draw calls and a third of a million triangles, twice over
     * for the two lighting passes, behind a picture of a temple. The
     * customer's machine was being asked to draw a statue nobody could
     * see WHILE they scrolled through the hall, and the scroll is the one
     * thing in the entry that has to stay smooth — it is their own hand
     * moving.
     *
     * The statue still BUILDS during the entry; that is what the entry is
     * for. It simply is not painted until there is a reason to paint it.
     * A couple of frames are still owed whenever the figure appears or
     * changes, so the frame waiting under the overlay is the finished one.
     */
    if (phase === "intro") {
      if (owed.current <= 0) return;
      owed.current -= 1;
    }

    const previousAutoClear = gl.autoClear;
    const background = scene.background;
    try {
      // The room, and only the lamps that belong to it. This pass paints
      // the sanctum's ground colour and owns the clear.
      camera.layers.set(STAGE_LAYER);
      gl.autoClear = true;
      scene.background = background;
      gl.render(scene, camera);

      // The figure, over the room, against the room's depth.
      //
      // The background is LIFTED for this pass, and `autoClear = false`
      // is not enough on its own to do it. three.js clears whenever the
      // scene carries a background colour, whatever the renderer's own
      // setting says:
      //
      //     } else if ( background && background.isColor ) {
      //       setClear( background, 1 );
      //       forceClear = true;
      //     }
      //     …
      //     if ( renderer.autoClear || forceClear ) { … clear … }
      //
      // — so the second pass wiped the first one, and the sanctum
      // disappeared entirely the first time this was written. With no
      // background there is nothing to force, and the room survives
      // underneath with its depth intact.
      camera.layers.set(CHARACTER_LAYER);
      gl.autoClear = false;
      scene.background = null;
      gl.render(scene, camera);
    } finally {
      gl.autoClear = previousAutoClear;
      scene.background = background;
      camera.layers.enableAll();
    }
  }, 1);

  return null;
}
