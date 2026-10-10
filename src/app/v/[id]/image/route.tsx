import { after } from "next/server";
import { carteVerdict } from "@/server/carte-verdict";
import { CLES, compter, estUnRobot } from "@/server/compteurs";
import { versionImage } from "@/server/partages";
import { BACKEND } from "@/services/mode";
import { verdictDuLien } from "../verdict";

/** L’image du verdict partagé : la carte de l’aperçu du lien, ou `?format=story` (Instagram). */
export async function GET(req: Request, { params }: RouteContext<"/v/[id]/image">) {
  const { id } = await params;
  const v = await verdictDuLien(id);
  if (!v) return new Response(null, { status: 404 });
  const adresse = new URL(req.url).searchParams;
  const story = adresse.get("format") === "story";
  /* L’aperçu (pas la story), demandé par l’appli de messagerie : le lien vient d’être collé dans une conv. Ni la démo, ni la feuille de partage de BLUSH */
  if (!story && id !== "demo" && estUnRobot(req.headers.get("user-agent"))) after(() => compter(CLES.lienApercu));
  /*
   * La story demandée à sa version (`v`, voir versionImage) : le CDN la garde dix minutes, la feuille de partage l’a
   * tout de suite (dessinée, elle prend près d’une seconde). Pas plus : « Désactiver le lien » doit la couper vite.
   * Le reste, et l’aperçu qu’on compte, repasse par le serveur.
   */
  const aSaVersion = story && BACKEND && adresse.get("v") === versionImage(id, v);
  return carteVerdict(v, story ? "story" : "carte", aSaVersion ? "public, max-age=60, s-maxage=600" : undefined);
}
