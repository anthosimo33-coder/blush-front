"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { peut, type Besoin } from "@/lib/acces";
import { FRAIS_DU_RENDU } from "@/lib/query";
import { auRepos } from "@/lib/repos";
import { useCompte } from "@/lib/requetes";
import { useCompteDeLaPage } from "./compte-de-la-page";
import { AccountPill, Screen } from "./Screen";

/* Le paiement ne s’ouvre que si les droits manquent : son code (offres comprises) arrive à part, seulement ce jour-là */
const PaywallSheet = dynamic(() => import("@/components/screens/PaywallSheet").then((m) => m.PaywallSheet), { ssr: false });

/**
 * Les droits du compte, par besoin (src/lib/acces.ts ; la lecture de sa fiche n’est encore refusée qu’ici, voir
 * là-bas), et ses bulles. Le rapport s’ouvre conv par conv (ReportPayload.debloque), le chat à tout compte connecté.
 * Dans la page d’une conv, le compte part de celui qu’elle a rendu (PageDeConv) : tout juste rendu, il n’est pas relu au
 * montage, et les droits sont là dès l’affichage.
 */
function useAccess() {
  const page = useCompteDeLaPage();
  const { data } = useCompte(page?.compte ?? undefined, { rendu: page?.rendu, frais: FRAIS_DU_RENDU });
  return {
    initiale: data?.email ? [...data.email][0]?.toUpperCase() : undefined,
    loaded: !!data,
    peut: (besoin: Besoin) => !!data && peut(data, besoin),
  };
}

/**
 * Coque des écrans après le rapport (desktop : une colonne centrée, « Mon compte » en haut ; une colonne d’appoint seulement si l’écran en passe une).
 * `besoin` : ce que l’écran demande (sa fiche) ; le paiement s’affiche par-dessus si le compte ne l’ouvre pas.
 * `ferme` : ce que l’écran montre demande le rapport de sa conv, pas encore débloqué (« Ta question ») : le paiement
 * s’affiche par-dessus, quoi que le compte ait d’autre.
 */
export function AppScreen({
  besoin,
  ferme = false,
  autre,
  aside = null,
  children,
  ...props
}: {
  besoin?: Besoin;
  ferme?: boolean;
  /** Le prénom de l’autre personne, pour le paiement (« toi et Léa »). */
  autre?: string;
  aside?: ReactNode | null;
  children: ReactNode;
} & Omit<ComponentProps<typeof Screen>, "aside" | "children">) {
  const router = useRouter();
  const pathname = usePathname();
  const access = useAccess();
  const blocked = ferme || (!!besoin && access.loaded && !access.peut(besoin));
  /*
   * Monté au premier blocage, puis gardé (pour sa sortie). Tant que les droits peuvent manquer (pas encore lus, ou
   * insuffisants), il est aussi monté fermé une fois la page posée : monté au moment de s’ouvrir, React gardait 0,3 s
   * son écran d’attente avant de le montrer. Qui a les droits ne le charge pas (sauf s’ils tardent à arriver).
   */
  const [bloqueVu, setBloqueVu] = useState(false);
  if (blocked && !bloqueVu) setBloqueVu(true);
  const peutManquer = blocked || (!!besoin && !access.loaded);
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
      {(besoin || ferme) && bloqueVu && <PaywallSheet open={blocked} onClose={() => router.push("/rapport")} next={pathname} otherName={autre} />}
    </>
  );
}
