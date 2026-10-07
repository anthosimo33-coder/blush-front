"use client";

import { BACKEND } from "@/services/mode";
import { useRouter } from "next/navigation";
import { AppTile } from "@/components/ui/controls";
import { FlowSteps } from "@/components/ui/progress";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { setJourney } from "@/state/journey";
import type { AppKind } from "@/types";

/* Écran 01 — Vous vous parlez où ? (pas de Snapchat) */
const TILES: { app: AppKind; title: string; subtitle: string; href: string; wide?: boolean }[] = [
  { app: "whatsapp", title: "WhatsApp", subtitle: "Export en 1 minute", href: "/importer/export?app=whatsapp" },
  { app: "imessage", title: "iMessage", subtitle: "Export depuis un Mac", href: "/importer/export?app=imessage" },
  /* Avec le back-end, Instagram passe par son export (la lecture des captures arrive ensuite) */
  BACKEND
    ? { app: "instagram", title: "Instagram", subtitle: "Export de tes messages", href: "/importer/export?app=instagram" }
    : { app: "instagram", title: "Instagram", subtitle: "Captures d’écran", href: "/importer/captures?app=instagram" },
  { app: "hinge", title: "Hinge", subtitle: "Captures d’écran", href: "/importer/captures?app=hinge" },
  { app: "autre", title: "Autre appli", subtitle: "Messenger, Tinder, Bumble… par captures d’écran", href: "/importer/captures?app=autre", wide: true },
];

export function CommencerScreen() {
  const router = useRouter();
  return (
    <Screen
      mobileTop={<MobileTopBar back={() => router.back()} progress={1} />}
      aside={<FlowSteps step={1} />}
      head={
        <>
          <ScreenTitle size={34}>Vous vous parlez où ?</ScreenTitle>
          <Lead>On te montre comment récupérer votre conv.</Lead>
        </>
      }
    >
      <nav aria-label="Ton appli" className="grid grid-cols-2 gap-3">
        {TILES.map((t) => (
          <AppTile key={t.app} {...t} onClick={() => setJourney({ app: t.app })} />
        ))}
      </nav>
      <p className="m-0 text-[13px] font-bold leading-[1.45] text-grey">Plusieurs applis ? Commence par la principale, tu ajouteras le reste juste après.</p>
    </Screen>
  );
}
