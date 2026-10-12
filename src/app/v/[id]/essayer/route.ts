import { NextResponse } from "next/server";
import { CLES, compter, marquerVenuDuPartage } from "@/server/compteurs";
import { verdictPartage } from "@/server/partages";

/*
 * Un préchargement, pas un clic : celui du routeur de Next (`next-router-prefetch`, ou `purpose: prefetch`, d’après
 * node_modules/next/dist/docs, « cdn-caching » et « proxy »), ou celui du navigateur (`sec-purpose: prefetch`, les
 * règles de spéculation). Le bouton ne précharge plus (prefetch={false}) : ceci est une défense en plus.
 */
const prechargement = (h: Headers) => h.has("next-router-prefetch") || h.get("purpose") === "prefetch" || (h.get("sec-purpose") ?? "").includes("prefetch");

/**
 * « Analyser ma conv » sur la page d’un verdict partagé : on le compte (si le lien existe et que c’est un vrai clic, pas
 * un préchargement), on retient d’où il vient, et on y va.
 */
export async function GET(req: Request, { params }: RouteContext<"/v/[id]/essayer">) {
  const { id } = await params;
  if (!prechargement(req.headers) && (await verdictPartage(id))) {
    await compter(CLES.lienEssai);
    await marquerVenuDuPartage();
  }
  /* Le début du parcours, comme le bouton de la landing (CTA, src/components/landing/cta.ts) */
  return NextResponse.redirect(new URL("/commencer", req.url));
}
