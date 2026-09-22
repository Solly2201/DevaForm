import { redirect } from "next/navigation";
import { getDeity } from "@devaform/asset-system";

type Params = { params: Promise<{ deity: string }> };

/**
 * The old deity-specific Studio routes, kept working.
 *
 * /studio/<deity> was the editor once, and links to it exist — in saved
 * bookmarks, in shares, in this repository's own history. Deleting them
 * would break those; keeping them as a second editor would make the
 * Studio two places again. So they resolve: the form is handed to the
 * canonical editor as a parameter it consumes once, and the customer
 * lands on /studio with that form selected.
 *
 * A deity nobody has heard of, or one not offered yet, simply opens the
 * Studio — there is always something to make.
 */
export default async function LegacyStudioRoute({ params }: Params) {
  const { deity: deityId } = await params;
  const deity = getDeity(deityId);
  redirect(deity?.available ? `/studio?form=${deity.id}` : "/studio");
}
