"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { useQuery } from "@/lib/query";
import { getAccount } from "@/services/api";
import { PaywallSheet } from "@/components/screens/PaywallSheet";
import type { Plan } from "@/types";
import { AccountPill, Screen } from "./Screen";

const RANK: Record<Plan, number> = { gratuit: 0, rapport: 1, blushplus: 2 };

/** Droits d’accès simulés : gratuit (ch. 1-2), rapport (ch. 1-8 + une question), BLUSH+ (en plus : accueil, aide, fiche). */
export function useAccess() {
  const { data } = useQuery("account", getAccount);
  const plan = data?.subscription.plan;
  return {
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
  return (
    <>
      <Screen desktopHeaderRight={<AccountPill />} mainWidth={600} asideWidth={360} columnsGap={64} aside={aside ?? undefined} {...props}>
        {children}
      </Screen>
      {requires && (
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
