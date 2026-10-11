import { NextResponse } from "next/server";
import { CLES, compter, marquerVenuDuPartage } from "@/server/compteurs";
import { verdictPartage } from "@/server/partages";

/** « Analyser ma conv » sur la page d’un verdict partagé : on le compte (si le lien existe), on retient d’où il vient, et on y va. */
export async function GET(req: Request, { params }: RouteContext<"/v/[id]/essayer">) {
  const { id } = await params;
  if (await verdictPartage(id)) {
    await compter(CLES.lienEssai);
    await marquerVenuDuPartage();
  }
  /* Le début du parcours, comme le bouton de la landing (CTA, src/components/landing/cta.ts) */
  return NextResponse.redirect(new URL("/commencer", req.url));
}
