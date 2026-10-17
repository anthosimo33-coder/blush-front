import { NextResponse } from "next/server";
import { poserParrain } from "@/server/cookies";
import { CLES, compter } from "@/server/compteurs";
import { CODE } from "@/server/parrainage";

/**
 * Le lien de parrainage d’une amie (/p/<code>, src/server/parrainage.ts) : il garde son code dans un cookie (30 jours),
 * que la création du compte lira, et mène à la landing. Rien de la marraine n’est montré. Un code mal formé : la landing,
 * sans rien garder.
 */
export async function GET(req: Request, { params }: RouteContext<"/p/[code]">) {
  const { code } = await params;
  if (CODE.test(code)) {
    await poserParrain(code);
    await compter(CLES.lienParrainage);
  }
  return NextResponse.redirect(new URL("/", req.url));
}
