"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { useQuery } from "@/lib/query";
import { auRepos } from "@/lib/repos";
import { getAccount } from "@/services/api";
import type { Plan } from "@/types";
import { AccountPill, Screen } from "./Screen";

/* Le paiement ne s’ouvre que si les droits manquent : son code (offres comprises) arrive à part, seulement ce jour-là */
const PaywallSheet = dynamic(() => import("@/components/screens/PaywallSheet").then((m) => m.PaywallSheet), { ssr: false });

const RANK: Record<Plan, number> = { gratuit: 0, rapport: 1, blushplus: 2 };

/** Droits d’accès simulés : gratuit (ch. 1-2), rapport (ch. 1-8 + une question), BLUSH+ (en plus : accueil, aide, fiche). */
export function useAccess() {
  const { data } = useQuery("account", getAccount);
  const plan = data?.subscription.plan;
  return {
    initiale: data?.email ? [...data.email][0].toUpperCase() : undefined,
    loaded: !!data,
    plan: plan ?? "gratuit",
    can: (need: Plan) => (plan ? RANK[plan] >= RANK[need] : false),
  };
}

/**
 * Coque des écrans après le rapport (desktop : une colonne centrée, « Mon compte » en haut ; une colonne d’appoint seulement si l’écran en passe une).
 * `requires` affiche le paiement par-dessus l’écran si les droits manquent.
 */
export function AppScreen({
  requires,
  autre,
  aside = null,
  children,
  ...props
}: {
  requires?: Exclude<Plan, "gratuit">;
  /** Le prénom de l’autre personne, pour le paiement (« toi et Léa »). */
  autre?: string;
  aside?: ReactNode | null;
  children: ReactNode;
} & Omit<ComponentProps<typeof Screen>, "aside" | "children">) {
  const router = useRouter();
  const pathname = usePathname();
  const access = useAccess();
  const blocked = !!requires && access.loaded && !access.can(requires);
  /*
   * Monté au premier blocage, puis gardé (pour sa sortie). Tant que les droits peuvent manquer (pas encore lus, ou
   * insuffisants), il est aussi monté fermé une fois la page posée : monté au moment de s’ouvrir, React gardait 0,3 s
   * son écran d’attente avant de le montrer. Qui a les droits ne le charge pas (sauf s’ils tardent à arriver).
   */
  const [bloqueVu, setBloqueVu] = useState(false);
  if (blocked && !bloqueVu) setBloqueVu(true);
  const peutManquer = !!requires && (!access.loaded || blocked);
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
      <Screen desktopHeaderRight={<AccountPill initial={access.initiale} />} mainWidth={600} asideWidth={360} columnsGap={64} aside={aside ?? undefined} {...props}>
        {children}
      </Screen>
      {requires && bloqueVu && (
        <PaywallSheet
          open={blocked}
          only={requires === "blushplus" && access.plan === "rapport" ? "blushplus" : undefined}
          onClose={() => router.push("/rapport")}
          next={pathname}
          otherName={autre}
        />
      )}
    </>
  );
}
