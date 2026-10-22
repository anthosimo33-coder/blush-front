import type { Metadata } from "next";
import { BubbleLogo } from "@/components/brand/objects3d";

export const metadata: Metadata = { title: "Aperçu de l’achat dans le chat" };
export const dynamic = "force-dynamic";

/**
 * Hors de Vercel seulement (src/proxy.ts) : un intertitre de la vidéo des propositions de l’achat dans le chat, aux
 * couleurs de l’appli. `?t=` : le titre ; `?s=` : la phrase dessous ; `?n=` : le numéro du parcours.
 */
export default async function Page({ searchParams }: PageProps<"/apercu/achat/titre">) {
  const { t, s, n } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-paper px-8 text-center">
      <BubbleLogo size={88} animated />
      {typeof n === "string" && <span className="text-micro font-black uppercase tracking-[0.14em] text-elle-ink">Parcours {n}</span>}
      <h1 className="m-0 text-titre-1 font-black leading-[1.05] tracking-[-0.02em] text-ink">{typeof t === "string" ? t : "Acheter sans quitter le chat"}</h1>
      {typeof s === "string" && <p className="m-0 max-w-[300px] text-accent font-bold leading-[1.4] text-soft">{s}</p>}
    </main>
  );
}
