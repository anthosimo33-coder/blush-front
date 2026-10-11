"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { offreAProposer, peut, type Besoin } from "@/lib/acces";
import { FRAIS_DU_RENDU } from "@/lib/query";
import { auRepos } from "@/lib/repos";
import { useCompte } from "@/lib/requetes";
import { useCompteDeLaPage } from "./compte-de-la-page";
import { AccountPill, Screen } from "./Screen";

/* Le paiement ne s’ouvre que si les droits manquent : son code (offres comprises) arrive à part, seulement ce jour-là */
const PaywallSheet = dynamic(() => import("@/components/screens/PaywallSheet").then((m) => m.PaywallSheet), { ssr: false });

/**
 * Les droits d’accès du compte, par besoin (src/lib/acces.ts, la table que l’écran et le serveur lisent ; « Ta question »
 * et la lecture de sa fiche ne sont encore refusées qu’ici, voir là-bas) : gratuit (le chapitre 1, le verdict), rapport
 * (tous les chapitres, « Ta question »), BLUSH+ (en plus : le chat, sa fiche).
 * Dans la page d’une conv, le compte part de celui qu’elle a rendu (PageDeConv) : tout juste rendu, il n’est pas relu au
 * montage, et le plan est là dès l’affichage.
 */
export function useAccess() {
  const page = useCompteDeLaPage();
  const { data } = useCompte(page?.compte ?? undefined, { rendu: page?.rendu, frais: FRAIS_DU_RENDU });
  const plan = data?.subscription.plan;
  return {
    initiale: data?.email ? [...data.email][0]?.toUpperCase() : undefined,
    loaded: !!data,
    plan: plan ?? "gratuit",
    peut: (besoin: Besoin) => !!plan && peut(plan, besoin),
  };
}

/**
 * Coque des écrans après le rapport (desktop : une colonne centrée, « Mon compte » en haut ; une colonne d’appoint seulement si l’écran en passe une).
 * `besoin` : ce que l’écran demande (le chat, sa fiche, « Ta question ») ; le paiement s’affiche par-dessus si le plan du compte ne l’ouvre pas.
 */
export function AppScreen({
  besoin,
  autre,
  aside = null,
  children,
  ...props
}: {
  besoin?: Besoin;
  /** Le prénom de l’autre personne, pour le paiement (« toi et Léa »). */
  autre?: string;
  aside?: ReactNode | null;
  children: ReactNode;
} & Omit<ComponentProps<typeof Screen>, "aside" | "children">) {
  const router = useRouter();
  const pathname = usePathname();
  const access = useAccess();
  const blocked = !!besoin && access.loaded && !access.peut(besoin);
  /*
   * Monté au premier blocage, puis gardé (pour sa sortie). Tant que les droits peuvent manquer (pas encore lus, ou
   * insuffisants), il est aussi monté fermé une fois la page posée : monté au moment de s’ouvrir, React gardait 0,3 s
   * son écran d’attente avant de le montrer. Qui a les droits ne le charge pas (sauf s’ils tardent à arriver).
   */
  const [bloqueVu, setBloqueVu] = useState(false);
  if (blocked && !bloqueVu) setBloqueVu(true);
  const peutManquer = !!besoin && (!access.loaded || blocked);
  useEffect(() => {
    if (!peutManquer || bloqueVu) return;
    let fini = false;
    const annuler = auRepos(() => void import("@/components/screens/PaywallSheet").then(() => !fini && setBloqueVu(true)));
    return () => {
      fini = true;
      annuler();
    };
  }, [peutManquer, bloqueVu]);
  return (
    <>
      <Screen
        desktopHeaderRight={<AccountPill initial={access.initiale} />}
        mainWidth={props.mise ? undefined : 600}
        asideWidth={360}
        columnsGap={64}
        aside={aside ?? undefined}
        {...props}
      >
        {children}
      </Screen>
      {besoin && bloqueVu && (
        <PaywallSheet
          open={blocked}
          /* Ce que le rapport n’ouvre pas (le chat, sa fiche) : qui l’a déjà ne voit que BLUSH+ */
          only={offreAProposer(access.plan, besoin)}
          onClose={() => router.push("/rapport")}
          next={pathname}
          otherName={autre}
        />
      )}
    </>
  );
}
