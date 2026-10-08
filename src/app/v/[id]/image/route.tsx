import { carteVerdict } from "@/server/carte-verdict";
import { verdictDuLien } from "../verdict";

/** L’image du verdict partagé : la carte de l’aperçu du lien, ou `?format=story` (Instagram). */
export async function GET(req: Request, { params }: RouteContext<"/v/[id]/image">) {
  const v = await verdictDuLien((await params).id);
  if (!v) return new Response(null, { status: 404 });
  return carteVerdict(v, new URL(req.url).searchParams.get("format") === "story" ? "story" : "carte");
}
