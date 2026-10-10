"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppTile } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { FlowSteps } from "@/components/ui/progress";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { readJourney, resetJourney, setJourney } from "@/state/journey";
import { pagePrecedente } from "@/lib/navigation";
import type { AppKind } from "@/types";

/* Écran 01 — Vous vous parlez où ? (pas de Snapchat) */
const TILES: { app: AppKind; title: string; subtitle: string; href: string; wide?: boolean }[] = [
  { app: "whatsapp", title: "WhatsApp", subtitle: "Export en 1 minute", href: "/importer/export?app=whatsapp" },
  /* iMessage ne s’exporte pas : on filme son écran (ou des captures) */
  { app: "imessage", title: "iMessage", subtitle: "Enregistrement de l’écran", href: "/importer/captures?app=imessage" },
  /* Instagram passe par son export (la lecture des captures arrive ensuite) */
  { app: "instagram", title: "Instagram", subtitle: "Export de tes messages", href: "/importer/export?app=instagram" },
  { app: "hinge", title: "Hinge", subtitle: "Captures d’écran", href: "/importer/captures?app=hinge" },
  { app: "autre", title: "Autre appli", subtitle: "Messenger, Tinder, Bumble… par captures d’écran", href: "/importer/captures?app=autre", wide: true },
];

export function CommencerScreen({ fermee = false }: { fermee?: boolean }) {
  const router = useRouter();
  /* Choisir une appli, c’est commencer une nouvelle conv : les réponses de la précédente (qui est qui, ce que tu veux) repartent de zéro. L’email reste */
  const nouvelleConv = (app: AppKind) => {
    const { email } = readJourney();
    resetJourney();
    setJourney({ app, email });
  };
  return (
    <Screen
      /* Retour : la page d’avant (l’accueil, ou « Tes convs ») ; arrivé ici directement, l’accueil */
      mobileTop={<MobileTopBar back={() => (pagePrecedente() ? router.back() : router.push("/"))} progress={1} />}
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
          <AppTile key={t.app} {...t} onClick={() => nouvelleConv(t.app)} />
        ))}
      </nav>
      <p className="m-0 text-[13px] font-bold leading-[1.45] text-grey">Plusieurs applis ? Commence par la principale, tu ajouteras le reste juste après.</p>
      <p className="m-0 flex items-start gap-2 text-[13px] font-extrabold leading-[1.45] text-grey">
        <Icon name="lock" size={16} color="#8A8780" style={{ marginTop: 1 }} />
        <span>
          Ta conv est chiffrée, lue par une IA, et effacée après ton rapport.{" "}
          <Link href="/confidentialite" className="font-black text-ink underline decoration-[rgba(17,17,20,0.25)] underline-offset-2">
            Comment ça marche
          </Link>
        </span>
      </p>
      {fermee && (
        /* Texte relu le 8 octobre */
        <Link href="/attente" className="row-hover flex items-center gap-3 rounded-[18px] bg-white px-4 py-3.5 text-ink no-underline shadow-soft">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[rgba(255,79,154,0.12)]">
            <Icon name="lock" size={17} color="#C81D6B" stroke={2.4} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-black">Bêta privée, sur invitation</span>
            <span className="text-[13px] font-extrabold text-grey">Pas encore d’invitation ? Rejoins la liste d’attente.</span>
          </span>
          <Icon name="chevron" size={15} color="#B4B1A9" stroke={2.6} />
        </Link>
      )}
    </Screen>
  );
}
