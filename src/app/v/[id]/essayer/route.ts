import { NextResponse } from "next/server";
import { CLES, compter, marquerVenuDuPartage } from "@/server/compteurs";

/** « Analyser ma conv » sur la page d’un verdict partagé : on le compte, on retient d’où il vient, et on y va. */
export async function GET(req: Request) {
  await compter(CLES.lienEssai);
  await marquerVenuDuPartage();
  /* Le début du parcours, comme le bouton de la landing (CTA, src/components/landing/parts.tsx) */
  return NextResponse.redirect(new URL("/commencer", req.url));
}
