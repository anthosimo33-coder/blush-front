import { after } from "next/server";
import { carteVerdict } from "@/server/carte-verdict";
import { CLES, compter, estUnRobot } from "@/server/compteurs";
import { verdictDuLien } from "../verdict";

/** L’image du verdict partagé : la carte de l’aperçu du lien, ou `?format=story` (Instagram). */
export async function GET(req: Request, { params }: RouteContext<"/v/[id]/image">) {
  const v = await verdictDuLien((await params).id);
  if (!v) return new Response(null, { status: 404 });
  const story = new URL(req.url).searchParams.get("format") === "story";
  /* L’aperçu (pas la story), demandé par l’appli de messagerie : le lien vient d’être collé dans une conv. Ni la démo, ni la feuille de partage de BLUSH */
  if (!story && (await params).id !== "demo" && estUnRobot(req.headers.get("user-agent"))) after(() => compter(CLES.lienApercu));
  return carteVerdict(v, story ? "story" : "carte");
}
