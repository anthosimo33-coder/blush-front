import type { Metadata } from "next";
import { PageEnDirect } from "@/app/admin/PageEnDirect";
import { directDExemple } from "../exemple";

export const metadata: Metadata = { title: "En direct · Admin" };

/** Hors de Vercel seulement (src/proxy.ts) : /admin en direct avec un direct d’exemple, figé (rien ne sonde le réseau). */
export default function Page() {
  return <PageEnDirect d={directDExemple()} base="/apercu/admin" sonder={false} />;
}
