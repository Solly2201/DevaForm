import { describe, it } from "vitest";
import { getAsset } from "@devaform/asset-system";
import { deriveBodyProfile } from "../generators/bodyProfile";

describe("probe", () => {
  it("hip numbers", () => {
    const asset = getAsset("humanoid.body.human")!;
    const body = deriveBodyProfile({}, { height: 1, bulk: 1 }, {
      profile: asset.bodyProfile!,
      morphs: {},
      torsoSurface: asset.torsoSurface,
      legEnvelope: asset.legEnvelope,
    } as never);
    console.log("waistSeatY", body.waistSeatY, "thighSeatY", body.thighSeatY);
    console.log("pelvisHalfWidth", body.pelvisHalfWidth, "bellyRadiusZ", body.bellyRadiusZ);
    for (const y of [0.09, 0.06, 0.03, 0.0, -0.03, -0.06, -0.1]) {
      const leg = body.legExtentAt(y);
      console.log(`y=${y}`, JSON.stringify(leg));
    }
  });
});
