/**
 * Protected characters: a structural fingerprint of the rendered scene.
 *
 * Ganesha and the production Shiva must not move while the rig is being
 * restructured beneath them. Screenshots cannot prove that — the capture
 * harness is not deterministic run to run — but the scene itself is: the
 * same configuration builds the same nodes, at the same world transforms,
 * from the same geometry, every time.
 *
 * So the fingerprint is taken over what actually reaches the renderer —
 * every node's world position, rotation and scale, and every mesh's vertex
 * count and bounds — and pinned. If an architectural change moves one
 * joint by a millimetre or swaps one generator's output, this fails, and
 * the diff says which node.
 *
 * Updating a pinned digest is a deliberate act. Do it only when the change
 * to that character is intended, and say so in the commit.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(): void {
      /* never resolves in tests */
    }
  },
}));
import * as THREE from "three";
import {
  createDefaultGaneshaConfiguration,
  createDefaultShivaConfiguration,
  type CharacterConfiguration,
} from "@devaform/character-schema";
import { buildRig, poseRig } from "../rig";
import { ZoneMaterials } from "../materials";

const round = (n: number): string => n.toFixed(6);

/** One line per node: what it is, where it ended up, and what it is made of. */
function sceneRows(config: CharacterConfiguration): string[] {
  const materials = new ZoneMaterials();
  const rig = buildRig(config, materials);
  poseRig(rig);
  rig.root.updateWorldMatrix(true, true);

  const rows: string[] = [];
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  rig.root.traverse((object) => {
    object.matrixWorld.decompose(position, quaternion, scale);
    let geometry = "";
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      const vertices = mesh.geometry.getAttribute("position").count;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
      geometry =
        `|v${vertices}|${round(box.min.x)},${round(box.min.y)},${round(box.min.z)}` +
        `,${round(box.max.x)},${round(box.max.y)},${round(box.max.z)}`;
    }
    rows.push(
      `${object.name || object.type}` +
        `@${round(position.x)},${round(position.y)},${round(position.z)}` +
        `|${round(quaternion.x)},${round(quaternion.y)},${round(quaternion.z)},${round(quaternion.w)}` +
        `|${round(scale.x)},${round(scale.y)},${round(scale.z)}${geometry}`,
    );
  });
  materials.dispose();
  // Traversal order is an implementation detail; the set of nodes is not.
  return rows.sort();
}

function digest(rows: readonly string[]): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  const joined = rows.join("\n");
  for (let i = 0; i < joined.length; i += 1) {
    a = Math.imul(a ^ joined.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b + joined.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

const PINNED = {
  // Re-pinned when the two transform pipelines became one. Ganesha's
  // hands used to be left as the pose put them while the ITEM was rotated
  // upright in world space — so an axe passed ACROSS a fist rather than
  // through it, which is precisely what references/reference_mid.png
  // objects to. Now the arm is solved onto what it holds: the shoulder
  // rotates, the forearm pronates, the wrist trims, and the fist closes
  // on a shaft whose thickness the asset declares.
  //
  // Verified before re-pinning, by capturing the same fifteen QA views
  // from the previous commit and comparing: the silhouette, ornaments,
  // garment, head, trunk and base are unchanged view for view. What moved
  // is the back hands, and they moved from beside their attributes to
  // around them.
  // One node more than before, and it is an EMPTY one: the chest.mala
  // socket, added so a torque at the throat and a mala on the chest can be
  // worn together. Verified by removing the socket and re-running: with it
  // gone the digest is byte-for-byte the previous ced6cadb987a4329, so
  // nothing else about Ganesha moved.
  //
  // Moved again, by thirteen millimetres straight down, when the figure
  // stopped being placed by an authored root offset and started resting
  // on its base: Ganesha's soles had been hovering that far above the
  // lotus seat. Same node count, same everything else — the whole statue
  // is one translation lower. See support.test.ts, which now holds every
  // pose of both deities to actual contact.
  //
  // Re-pinned when the band ornaments learned to be worn RATHER than
  // threaded. A torus's major radius is the centre line of its own tube,
  // so every armlet, bangle and anklet in this product was built at the
  // limb's measured radius with half its thickness inside the flesh; and
  // a vanki built as a torus is a doughnut, as thick as it is wide. They
  // are flat bands now, sized from the inside, seated on the limb's own
  // direction rather than laid flat at a height. Ganesha and Shiva were
  // both looked at before pinning: nothing else about either of them
  // moved, and their jewellery sits on their arms instead of through
  // them.
  //
  // Re-pinned when the back arms learned to reach OUT. Ganesha's blessing
  // used to hold the parashu 2.3 mm from its own abhaya palm — measured,
  // not judged — because the two arms put their hands within fifty
  // millimetres of each other in the horizontal plane, and a shaft
  // presented upright out of one had nowhere to go but through the other.
  // Three of the five poses moved their upper pair further out and a
  // little behind, which is where the iconography puts it: the lower
  // hands address the devotee, the upper ones hold the attributes clear.
  // Nothing else about Ganesha changed — no asset, no socket, no ornament,
  // no front arm, no node — and handCoexistence.test.ts now holds every
  // pose of every deity to real daylight between the two.
  //
  // Re-pinned again when the blessing gestures stopped bending the wrong
  // way. Abhaya swung the whole upper arm seventy degrees forward, which
  // puts the elbow ahead of the chest and folds the forearm back toward
  // the shoulder — from the front the arm reads as hinging backwards, and
  // the hand lands at the chest instead of beside the face. Varada was
  // worse: forty-four degrees of elbow on an already-abducted arm left it
  // nearly straight, with the wrist twenty-three centimetres in front of
  // the shoulder, an arm held out stiffly to the side. Both are measured
  // against the constraints correction.test already stated and both now
  // meet every one of them, on every body, with the wrist solver reaching
  // the required palm exactly.
  //
  // Ganesha's blessing back arms moved with them, by a little: with the
  // lower hand no longer in front of the chest the upper pair needed less
  // room, not more, so the axe clears by over forty millimetres from a
  // NARROWER stance than before.
  //
  // Re-pinned when the worn things started following the body. Three of
  // Ganesha's were half-measured and half-typed: the haram's front half
  // dropped to a hardcoded height and spread to a hardcoded width, the
  // angavastram's two END points were authored at a z of two centimetres
  // — near the middle of a torso rather than on its surface — and the
  // kamarbandh was a circle stretched on one axis until its front
  // cleared a belly, which pushes its back out behind the spine by the
  // same amount. Measured: 112 mm of collar inside him, 72 mm of sash
  // through his shoulders, 15 mm of belt in his side. All three are
  // routes walked over the measured surface now, and all three measure
  // zero or near it. The node count rises because a ribbon and a bead
  // fringe have more parts than a tube and a torus.
  //
  // And again for the collar, which Vishnu wears too. It passed every
  // clearance check while being a hundred and sixty-three millimetres
  // across a neck ninety-six across — a flat gold yoke standing off the
  // shoulders rather than a kantha — because its route dipped onto the
  // chest the whole way round and so left the neck at the sides. The dip
  // is confined to the front arc now, the seat is FOUND on each body by
  // walking up until the surface round the back stops being shoulder and
  // starts being neck, and the band is held out to at least the neck's
  // own girth. Same nodes; a collar instead of a yoke.
  //
  // And again when clearance started meaning distance. `walkSurface` used
  // to push an ornament horizontally away from the slice's centre, which
  // is the surface normal only where the surface is vertical; over a
  // shoulder it slid the piece along the slope instead of lifting it off.
  // Everything routed over skin moves a little: the collar, the belt, the
  // serpent, the mala, the sash. See surfaceClearance.test.ts.
  //
  // And again when his hands learned to close. `fingerPoints` rotated
  // each phalanx about +X, which for a finger pointing down curls it AWAY
  // from the palm: every closing mudra made a ball of knuckles with the
  // haft running down the outside. Only Ganesha wears these hands, so
  // only Ganesha moves. See handGrip.test.ts.
  //
  // And again when the collar learned about hair. Held off the skin by
  // its full gauge the whole way round, it came through the back of
  // Vishnu's head of hair as a gold bar across the dark mass — the first
  // thing his back view showed. Behind the neck it hugs now, because
  // that is where hair lies over it. Ganesha wears the same collar and
  // has no hair to hide it, so what moves on him is only the nape.
  //
  // And when the kamarbandh learned which way a belt is wide. A ribbon's
  // width ran across the SURFACE it rides, which is right for a sash over
  // a shoulder and wrong for a belt: round a hip the normal tilts down
  // and out, and the band's lower edge swings out with it. On Ganesha,
  // whose hips curve hardest, it came out sixty-two millimetres thick
  // radially — a gold tray round the waist rather than a belt on it.
  // Thirty-eight now. Only the belt moves.
  //
  // And once more for the bands. Two deliberate changes, both measured:
  // the lathe profile of every band ornament now CLOSES, so an armlet, a
  // bangle and an anklet each have an inner wall — they were open
  // C-sections with nothing in the hole, which reads as a cut edge where
  // the limb does not fill the ring and is not a shape that can be
  // printed. And the armlet's seat moved to a station the geometry
  // allows: at a third of the way down the upper arm a ring of its own
  // radius is inside the chest and, on a four-armed figure, inside the
  // REAR UPPER ARM — eighty-nine of Vishnu's hundred and ninety-one
  // buried vertices were in the other arm. The girth is measured where
  // the band now sits rather than where it used to, so the hole did not
  // merely move; it is the right size for the new station. Each body
  // states its own station (`BodyProfile.armBandAlong`) because the
  // stylised one has no clear station at all. See bandSeat.test.ts.
  //
  // And again, for the surface everything wrapped is wrapped around. The
  // generated profile took the front from whichever volume reached
  // furthest -- the belly -- and mirrored it through the CHEST's centre,
  // so a belly carried twenty-five millimetres forward of the chest put
  // the back of the figure fifty millimetres behind the mesh. Measured,
  // the kamarbandh stood fifty-two to ninety-three millimetres off his
  // back while touching his front, and the shawl and the collar's rear
  // span went with it. Each volume now mirrors through its own centre,
  // which is what torsoBackZAt a few lines below always did, and the
  // profile agrees with the mesh to within five millimetres at every
  // bearing. Only this character moves: the human body ships a measured
  // surface and never used this path. See bodySurface.test.ts.
  //
  // And once more, for his waist. Three changes, all measured. The belt
  // now asks the dhoti how thick it is instead of inferring it from two
  // hip measurements -- fifty-four vertices of the cloth's own waist roll
  // were coming through the gold, which is the red tongue a rear view
  // showed lying across the belt. The sash's clearance varies ALONG its
  // route, because its low point crosses a hip that is already wearing a
  // skirt and its shoulder end is not. And the skirt is cut to contain
  // the legs it is drawn around: the thigh masses reach 164.8mm and the
  // wrap radius was 165.0, flush to two tenths of a millimetre, so one
  // facet of hip stood through one facet of cloth and read as a patch of
  // skin on red. Cloth also draws from both sides now, as its patterned
  // variant always has. See garmentLayer.test.ts.
  //
  // And for his head, which was never in the figure. `bodyMeshes` claimed
  // the body slot alone, because its one job was to decide what the
  // statue rests on -- so his head, ears, tusks, trunk and hands were not
  // part of "the figure" and nothing could measure anything against them.
  // His crown read a hundred and forty-nine millimetres from "the body",
  // which was the measurement failing rather than the crown.
  //
  // With the head in, the crown turned out to be sitting INSIDE it: the
  // kirita is drawn against a sixty-seven millimetre reference skull and
  // his head part draws one a hundred and thirty-five millimetres wide,
  // so the band sat fifty-seven millimetres below the crown of a head
  // thirty-seven millimetres wider than the band, and only the cone above
  // the skull was visible. The cranium is now MEASURED off whichever head
  // part landed -- his is a GLB, so nothing declared anywhere would have
  // described it -- and the crowns scale by `headFit` as the earrings
  // always have.
  //
  // His dhoti tapers downward again (clearing the hips had made top and
  // hem the same number: the barrel its own comment warns about), his
  // belt is sized by the waist it wraps rather than by his neck, and a
  // belt clears what is under it PER BEARING rather than bulging its
  // whole circumference to miss one sash crossing.
  //
  // AND HIS BELT NOW SITS ON HIS DHOTI. It was eighty millimetres proud
  // of the cloth — a gold flange standing further out than his own belly,
  // in every frame of the 360-degree sweep. Four separate things put it
  // there and all four are fixed in this digest: it cleared the uttariya
  // as well as the dhoti, though a sash's tail falls ACROSS a belt; its
  // three front tassels read the clearance with the walk's own parameter
  // and so were seated on cloth measured at his BACK; the per-bearing
  // window maxed a clearance rather than a radius, carrying one bearing's
  // need round to another; and a body-derived floor was added on top of
  // all of it. The extra node is the tassels, now a named group so that a
  // measurement can tell the band from the things hanging off it.
  //
  // AND HIS HANDS ARE HANDS. They were four identical sausages on a
  // rounded slab -- a smooth cone per finger with a ball stuck on its
  // root, which is precisely what a moulded plastic hand is, and that is
  // how they read. A finger is three bones: widest past the knuckle,
  // waisted through each phalanx, swelling at each joint, ending in a
  // pad; wider than it is deep rather than perfectly round; and carrying
  // a nail, which at statue distance is worth more than all the rest.
  // The palm gains the thenar and hypothenar pads, without which a thumb
  // grows straight out of a flat plate.
  //
  // It costs twenty nodes FEWER than before, not more. A hand is one
  // material and rigid under its own bone, so everything but the four
  // fingers is merged -- five meshes where there were seventeen. The
  // fingers stay separate and named, because they are what closes on a
  // held object and so are what every grip measurement addresses.
  //
  // AND THE STRIPS ON HIS DHOTI FOLLOW IT. The front pleat strips were
  // placed at one fixed depth while the wrap is a cone, so they sank into
  // the cloth near the waist and surfaced lower down in pale flecks --
  // on every dhoti in the picker, not just his. They now read their depth
  // off the cloth at their own height and lean at the cone's own angle.
  //
  // AND HIS EYES AND BROWS FOLLOW THE CURVE OF HIS FACE. They sat at one
  // authored depth while a face is curved, so moving eye spacing buried
  // the brows or lifted them off: measured, the proportion of brow
  // standing clear ran 36.9% narrow, 39.1% default, 44.9% wide. Dragging
  // one control changed how thick another feature looked. Corrected as a
  // delta against the default spacing, so the tuned face is untouched and
  // only the travel is on the curve.
  //
  // AND HIS PALM IS A HAND. It was one ellipsoid with a second stuck on
  // for the knuckles, and an ellipsoid is the same width everywhere --
  // the mitten silhouette the hands were criticised for. Lofted now from
  // a round wrist, through the ball, to its widest across the knuckles,
  // flatter than it is wide the whole way; the finger roots sit on a
  // knuckle ARC in both planes instead of nearly in a line; and there is
  // web between them, without which each finger reads as a rod screwed
  // on. A held sweet sits deeper in it, which is what a palm with a dish
  // in it does.
  //
  // AND HIS REGAL CHEST IS A CHEST. The variant added two sixty-two
  // millimetre spheres ninety-five millimetres proud of the torso and
  // nearly round in plan, so they sat ON it: the build read as inflated
  // and toy-like rather than substantial. A pectoral is broad, flat and
  // low, set back far enough that its own curve is the last part of the
  // chest rather than a thing stuck to it.
  //
  // AND THE HAND WAS REBUILT (see generators/hand.ts). Deliberate: the
  // fingers were rooted ON the palm's surface rather than inside it, so
  // each one stood off the mass it belonged to; every fingertip was a
  // flat disc, because the tube primitive capped its ends with a fan;
  // the webs were spheres and read as beads; the thumb's base was a
  // 24 mm cylinder, wider than anything at the wrist; and the wrist
  // itself was a 27 mm ball handing over to a 17 mm palm. The hand owns
  // the whole forearm → wrist → palm silhouette now, so the two cannot
  // disagree about where a wrist is.
  //
  // AND HIS SHAWL IS ROUTED CLEAR OF HIS ARMS. Deliberate, and shared:
  // the same generator dresses Shiva's uttariya, which was running
  // nineteen millimetres through a forearm. The crossing moved inboard
  // toward the neck, where a sash actually goes, and a keep-out pass
  // pushes any vertex still inside a limb out of it.
  ganesha: { nodes: 364, digest: "692fc4e42c1b4d7a" },
  // Shiva moved for the same reason, plus two of its own: the trishul is
  // now one fixed length that slides to meet the ground rather than a
  // shaft built to reach whatever height the hand started at, and the
  // procedural fist closes onto the radius each attribute declares.
  // Shiva is a different statue now, deliberately. The default body is the
  // measured human mesh rather than a primitive assembly, so the stylised
  // head, eyes and hands parts are gone (the mesh has its own), the
  // garment is the layered dhoti-and-hide, the jata flows, and the naga
  // and rudraksha are both worn. Judged against references/ref3.png; the
  // QA sheet is screenshots/shiva.
  //
  // The node count DROPS because a skinned mesh is one node where the
  // primitive figure was two hundred.
  //
  // Re-pinned again after the garment was rebuilt: the hide is ONE closed
  // skin instead of a tube plus a sheet plus two leg wraps, the sash end
  // is a pleat of the cascade rather than a flat panel of its own, and
  // the dhoti is cut to the body's measured leg envelope — which the
  // engine was not passing to the profile at all, so every wrap had been
  // sized from mean limb radii. Fourteen nodes more than the count above,
  // all of them the pieces the hide split into. Judged against
  // references/ref3.png; the QA sheet is screenshots/shiva.
  //
  // The digest moved once more, at the same node count, when the sash end
  // became a ribbon whose spine is read off the column at every height: a
  // lofted tube carries one x for its whole length, and the cloth it
  // hangs on is not the same width at the waist as at the thigh.
  //
  // Two nodes more, and a new digest, for the serpent. Its head was one
  // swept form with a six-stage profile ladder, and a sweep carries its
  // own idea of which way is up: the skull came out as a flat paddle
  // lying across the throat with its mouth on top of its head. A head is
  // a hood, a skull, a snout and two eyes, each with a place relative to
  // the others, so it is built that way now in a frame that is aimed
  // once. The body is thinner, tapers along its whole length, and carries
  // counter-shading taken from which way its skin faces.
  //
  // Fifty-three nodes more, for hair and for a serpent's head. The jata
  // was eighteen locks three tenths of a skull-radius thick — eighteen
  // rods five centimetres across, which is what every look at this head
  // called them — and is forty-six a quarter that thickness now, with a
  // fringe along the hairline. The serpent's head is a hood, a skull, a
  // snout, two eyes and a stone rather than one swept form. The ash on
  // the brow is drawn in two strokes a side, parted round the third eye.
  //
  // Same nodes, new digest: what each hand holds moved onto the palm. The
  // grip point the body measures is the middle of the tube a fist makes,
  // a third of a finger's length off the knuckles, and an object centred
  // there is pinched in the fingertips with daylight behind it. The body
  // ships the SEAT now — the skin over its knuckles and the way its
  // fingers close — and an object of radius r rests at seat + normal × r.
  //
  // And again for the cloth: the pleat beside the sash had no colour
  // attribute under a material that renders them, so it rendered BLACK —
  // a hole cut through the dhoti in every three-quarter view. Every cloth
  // piece carries vertex colours now, and vertexColours.test.ts holds
  // every mesh of every pose of both deities to that.
  //
  // Six nodes more, for a damaru whose waist is long enough to be held —
  // eighteen millimetres of straight is gripped by fingers that span
  // thirty, so the outer two ran into the flare. And a new digest for
  // three measurements the body got right this time: the radius that
  // CONTAINS a limb rather than its mean (a bangle no longer sunk in a
  // forearm), the hips centred where the body actually is rather than on
  // the pelvis joint, and a torso surface that carries per-morph deltas.
  //
  // And once more for the cloth: the dhoti follows the leg in below the
  // knee instead of standing the same distance off it all the way down,
  // which is what made the silhouette leave the hip and come straight to
  // the floor. Sixty-eight columns rather than forty-four, so the deeper
  // of its two fold frequencies survives being sampled.
  //
  // And again for the garment itself, which is a different garment now.
  // Shiva's default was a cream dhoti to the ankle with the tiger skin
  // slung over it; in the Studio that read as a leopard belt over a cream
  // cylinder, and the cylinder was the first thing anyone asked about.
  // The skin IS the lower garment now — the layered look is still offered
  // and still loads — and the skin was rebuilt for being worn on the body
  // rather than over four centimetres of gathered cloth.
  //
  // And again for the hands, which now close on what they hold. The body
  // bakes two closures — one round something thin, one round something
  // fist-sized — instead of one fist dialled to a fraction, and the seat
  // an object rests on is the seat those closures were baked around
  // rather than a second computation of it. Every finger moves.
  //
  // And for a throat that is violet where a throat is and a serpent that
  // is not inspecting the figure's mouth: the halahala band was centred
  // on a landmark named for the jaw that is actually the head joint,
  // inside the skull, and the naga's route came out thirty degrees off
  // the front instead of at the shoulder.
  //
  // And once more for the garment, which is a different kind of object
  // now: one strip of hide wound round the hips with its far end over its
  // near one and its last stretch falling as a tail, instead of a ring of
  // cloth with a shaped hem. Five nodes fewer, because the two thigh
  // sleeves and the front fan are gone — the strip's own far end is the
  // hanging part.
  //
  // And for the brow. The forehead socket is turned onto the forehead's
  // own measured normal now, so the third eye and the ash lie on the
  // skin instead of half inside it, and neither carries its own guess at
  // the angle any more.
  //
  // Re-pinned when the leg envelope learned its morphs: the wrap is now
  // cut for the body the customer's build actually is (outward morph
  // contributions only — see sampleLegEnvelope), so its vertices moved
  // by millimetres. Verified in the Studio before pinning: the hide sits
  // on the hips, nothing shows through, the tail falls as it did.
  //
  // Re-pinned when the band ornaments learned to be worn RATHER than
  // threaded. A torus's major radius is the centre line of its own tube,
  // so every armlet, bangle and anklet in this product was built at the
  // limb's measured radius with half its thickness inside the flesh; and
  // a vanki built as a torus is a doughnut, as thick as it is wide. They
  // are flat bands now, sized from the inside, seated on the limb's own
  // direction rather than laid flat at a height. Ganesha and Shiva were
  // both looked at before pinning: nothing else about either of them
  // moved, and their jewellery sits on their arms instead of through
  // them.
  //
  // Re-pinned when a face stopped being one thing. Both mesh-bodied
  // deities arrive wearing a brow now — three are offered, built from
  // whatever skull is wearing them — and a face with none reads as
  // unfinished, which is what both of them did. Three nodes more: the
  // part's own group and the two brows. Nothing else about Shiva moved.
  //
  // Shiva moves for the mala and the sash. ref3's neck close-up shows a
  // fine strand; his beads were a sixth of his neck's radius, which at
  // this scale is a walnut, and the guru bead was seated at seven tenths
  // of its own radius so a third of it was inside the sternum. Beads are
  // a ninth of the neck now, there are more of them, and each clears the
  // skin by its own radius.
  //
  // And again for the brows, which Shiva wears the same assets of as
  // Vishnu. They were flattened with `mesh.scale`, which on a part's
  // child scales about the PART's origin — the centre of the skull — so
  // the depth squash did not thin the band, it moved it thirty-five
  // millimetres backwards into the forehead. Nothing is scaled now; the
  // radius alone says how the band reads, and it is seated proud of the
  // skin. Same node count: the same two brows, in a different shape and
  // a different place.
  //
  // And again when Shiva put his clothes on. His default was the tiger
  // skin alone, which left both legs bare; ref3 shows a cream dhoti to
  // the ankle under it, an ochre sash, and the hide over the top, in all
  // four views. Eleven nodes more: the dhoti column, its hem border, its
  // fan, and the sash.
  // The serpent moves with it: at a fifth of the neck's radius it was
  // thinner through the wrap than the mala hanging over it, which is a
  // gold cord round a neck and not the torque the reference sheet labels.
  // Same nodes, a thicker snake.
  // And a hundred and twelve nodes fewer, which is the mala: a hundred
  // and fourteen beads that were a hundred and fourteen draw calls and
  // are now two, one per material. Nothing about the mala changed except
  // how many objects it is. See geometry.collapse and renderBudget.
  // And four nodes fewer when his dress stopped doubling itself. The fan
  // of flat panels that hangs at the front of a cloth-only wrap was being
  // drawn with a hide over it, in the HIDE'S own material, directly on
  // top of the skin's own tail — the "two representations of one garment"
  // that read as a washed-out tan patch across the thigh. It is worn only
  // when nothing else is the outer layer, which is what its own comment
  // always said. The skin also clears the cloth's GATHERS now rather than
  // its spine, and its tail is short when there is a dhoti under it.
  // See garmentLayering.test.ts.
  // And for the bands, as above: closed lathe profiles and an armlet
  // seated where a ring of its radius is actually clear of the figure.
  shiva: { nodes: 268, digest: "1556ff12e8e3cdee" },
} as const;

describe("protected characters do not move", () => {
  it.each([
    ["ganesha", createDefaultGaneshaConfiguration],
    ["shiva", createDefaultShivaConfiguration],
  ] as const)("%s renders exactly as it did", (name, makeConfig) => {
    const rows = sceneRows(makeConfig());
    const expected = PINNED[name];
    // Node count first: it localises "something appeared/vanished" before
    // the digest can only say "something, somewhere, differs".
    expect(rows.length, `${name} node count`).toBe(expected.nodes);
    expect(digest(rows), `${name} scene digest`).toBe(expected.digest);
  });

  it("is deterministic, so a failure means a real change", () => {
    const config = createDefaultGaneshaConfiguration();
    expect(digest(sceneRows(config))).toBe(digest(sceneRows(config)));
  });

  it("would notice a change", () => {
    // Proof the fingerprint has teeth: nudge one joint and it must move.
    const config = createDefaultGaneshaConfiguration();
    const moved = {
      ...config,
      pose: { ...config.pose, jointOverrides: { ...config.pose.jointOverrides, neck: [0.01, 0, 0] as const } },
    } as CharacterConfiguration;
    expect(digest(sceneRows(moved))).not.toBe(PINNED.ganesha.digest);
  });
});
