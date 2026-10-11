"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Fragment, memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { pagePrecedente } from "@/lib/navigation";
import { copyText } from "@/lib/hooks";
import { moiEtAutre, titreDuo } from "@/lib/participants";
import { peut } from "@/lib/acces";
import { FRAIS_DU_RENDU } from "@/lib/query";
import { useRapport } from "@/lib/requetes";
import { useSondage } from "@/lib/useSondage";
import type { CibleImage, ReportPayload } from "@/types/api";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/cards";
import { Icon } from "@/components/ui/icons";
import { Blocks, ChapterHeader, ChapterRule } from "@/components/ui/report";
import { Toast } from "@/components/ui/surfaces";
import { Screen } from "@/components/shell/Screen";
import { PaywallSheet } from "@/components/screens/PaywallSheet";
import { useHydrated, useJourneyMe } from "@/state/journey";
import type { Chapter, ChapterBlock, Pronom, Story } from "@/types";
import { figtree } from "@/lib/fonts";
import { auRepos } from "@/lib/repos";
import { ancreDuChapitre, chapitreDeLAncre, PARLER_A_BLUSH, PASTILLE_REPRISE, sectionDuChapitre, titreDuChapitre } from "./ancres";
import { ChatBubble, marquerChatOuvert } from "./ChatBubble";
import { EnTeteRapport } from "./EnTeteRapport";
import { PartageEtConfidentialite } from "./PartageVerdict";
import { ecritureInachevee, phaseDuRapport, type PhaseDuRapport } from "./phase";
import { FeuilleSommaire, ReadingBar, Sommaire } from "./Sommaire";
import { Suite, Writing } from "./Suite";
import { useReprise } from "./useReprise";
import { VocalDuRapport } from "./Vocal";

/* Ce qui ne sert pas à chaque lecture (le mode sobre, l’écriture en cours, « Partager en image ») est chargé à part, quand il sert */
const SoberReport = dynamic(() => import("./SoberReport").then((m) => m.SoberReport));
const PastilleEcriture = dynamic(() => import("./Ecriture").then((m) => m.PastilleEcriture));
const PartageImageSheet = dynamic(() => import("./Partage").then((m) => m.PartageImageSheet), { ssr: false });

/*
 * Écrans 09 (aperçu gratuit), 10 (paiement), 11 (rapport complet) et 18-19 (mode sobre).
 */
export function ReportScreen({ initial, story, openPaywall, fixed = false, rendu }: { initial: ReportPayload; story: Story; openPaywall: boolean; fixed?: boolean; rendu?: number }) {
  /* `rendu` : l’heure du rendu serveur. Tout juste rendu, le rapport n’est pas relu au montage (src/lib/query.ts) */
  const { data, refresh } = useRapport(initial, { fetch: !fixed, rendu, frais: FRAIS_DU_RENDU });
  /* `fixed` : l’aperçu d’un vrai rapport (page /apercu, en local) ne se laisse pas remplacer par celui du compte connecté */
  const payload = fixed ? initial : (data ?? initial);
  const phase = phaseDuRapport(payload);
  /* Le rapport s’écrit encore, ou son vocal s’enregistre : on repasse toutes les 2 secondes jusqu’à ce qu’ils soient là */
  useSondage(refresh, { actif: !fixed && (phase.nom === "ecriture" || payload.vocal?.etat === "en_cours"), intervalle: 2000 });
  /* Mode sobre : le chat reste à portée aussi (c’est là qu’on a le plus besoin de parler), dans une bulle sobre */
  if (payload.sober)
    return (
      <>
        <SoberReport
          data={payload.sober}
          vocal={
            payload.vocal ? (
              <VocalDuRapport
                vocal={payload.vocal}
                sobre
                ecrit={phase.nom === "ecriture"}
                titre={titreDuo(story)}
                fin={{ titre: payload.sober.title, sousTitre: payload.sober.reassurance, action: "Lire la suite" }}
              />
            ) : undefined
          }
        />
        {peut(payload.access, "chat") && phase.nom !== "ecriture" && <ChatBubble sobre />}
      </>
    );
  return (
    <>
      <ReportBody payload={payload} phase={phase} story={story} openPaywall={openPaywall} />
      {phase.nom === "ecriture" && (phase.ecriture ? <PastilleEcriture ecriture={phase.ecriture} /> : <Writing />)}
    </>
  );
}

function ReportBody({ payload, phase, story, openPaywall }: { payload: ReportPayload; phase: PhaseDuRapport; story: Story; openPaywall: boolean }) {
  const router = useRouter();
  /* Du parcours, seul « qui est toi » sert ici : le reste ne re-rend pas tout le rapport */
  const journeyMe = useJourneyMe();
  const [paywall, setPaywall] = useState(openPaywall);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /* « Partager en image » : la chute d’un chapitre en story */
  const [image, setImage] = useState<CibleImage | null>(null);
  const [imageVue, setImageVue] = useState(false);
  if (image && !imageVue) setImageVue(true);

  const { report, access } = payload;
  /* Avec l’accès au rapport : « Ton rapport complet », son temps de lecture, « Ta question » ; sans lui, le paiement */
  const full = peut(access, "rapport");
  /* Qui est toi : d’après le serveur (le rapport ouvert depuis le mail n’a pas le parcours de cet onglet), sinon le parcours */
  const { moi: me, autre: other } = moiEtAutre(story, journeyMe);
  const chapters = report.chapters;
  const free = chapters.filter((c) => !c.locked);
  const locked = chapters.filter((c) => c.locked);
  /* Les chapitres ouverts, en clé stable : la mesure de lecture ne se relance que s’ils changent */
  const openKey = free.map((c) => c.number).join(",");
  const { retour, current, resume, allerAuChapitre, oublierReprise } = useReprise(report.storyId, openKey);
  const label = full ? "Ton rapport complet" : "Ton rapport";
  const currentChapter = chapters.find((c) => c.number === current);
  const ouvrirPaiement = useCallback(() => setPaywall(true), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  /*
   * « Partager en image » : chargée une fois la page posée, et montée fermée. Au premier toucher, elle n’a plus qu’à
   * s’ouvrir (montée au toucher, React gardait 0,3 s son écran d’attente avant de la montrer)
   */
  useEffect(() => auRepos(() => void import("./Partage").then(() => setImageVue(true))), []);

  const goTo = useCallback(
    (n: number) => {
      setMenu(false);
      allerAuChapitre(n);
    },
    [allerAuChapitre],
  );

  /* Les mêmes à chaque rendu (comme le partage d’un moment) : un chapitre qui n’a pas changé ne se refait pas */
  const renderQuestion = useCallback((b: Extract<ChapterBlock, { kind: "question" }>) => (
    <Card className="flex flex-col gap-2 p-3.5">
      <div className="text-[13px] font-black text-grey">{b.label}</div>
      <div className="text-[17px] font-black leading-[1.35]">{b.text}</div>
      <button
        type="button"
        onClick={async () => {
          if (await copyText(b.text.replace(/^«\s*|\s*»$/g, ""))) setToast("Copié.");
        }}
        className="lift lift-sm lift-ink relative inline-flex h-[34px] items-center gap-1.5 self-start rounded-[17px] bg-ink px-3.5 text-[13px] font-black text-white after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']"
      >
        <Icon name="copy" size={14} color="#FFFFFF" />
        Copier
      </button>
    </Card>
  ), []);
  const partagerMoment = useCallback((chapitre: number, bloc: number) => setImage({ type: "moment", chapitre, bloc }), []);
  /* L’en-tête du verdict, en tête du chapitre 1 : refait seulement si le verdict change */
  const enTeteVerdict = useMemo(
    () => (
      <>
        <div className="flex items-start gap-2.5">
          <span className="text-[44px] leading-none" aria-hidden="true">
            {report.verdict.emoji}
          </span>
          <span className="text-[32px] font-black leading-[1.05] tracking-[-0.02em]">{report.verdict.title}</span>
        </div>
        <p className="m-0 text-[17px] font-extrabold leading-[1.45] text-soft">{report.verdict.subtitle}</p>
      </>
    ),
    [report.verdict],
  );

  return (
    <Screen
      /* Figtree pour les bulles citées des chapitres (src/lib/fonts.ts) */
      className={figtree.variable}
      mobileTop={
        /* Mobile : la barre reste en haut — le chapitre en cours, la progression, et le sommaire à un toucher */
        <header className="sticky top-0 z-30 shrink-0 bg-[rgba(244,242,237,0.88)] backdrop-blur-xl lg:hidden">
          <div className="grid h-[58px] grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-1 px-2">
            <button type="button" aria-label="Retour" onClick={() => (pagePrecedente() ? router.back() : router.push("/app", { scroll: false }))} className="flex size-11 items-center justify-center">
              <Icon name="back" size={24} color="#121214" stroke={2.6} />
            </button>
            <button type="button" onClick={() => setMenu(true)} aria-haspopup="dialog" className="flex min-w-0 flex-col items-center px-1 text-center">
              {/* L’adresse du site : la barre reste en haut, elle est sur chaque capture du rapport */}
              <span className="flex items-center gap-1 text-[11.5px] font-black leading-tight text-grey">
                <BubbleLogo size={13} />
                askblush.com
              </span>
              {currentChapter ? (
                <span key={currentChapter.number} data-rise="" className="max-w-full truncate text-[14px] font-black leading-tight text-ink">
                  <span className="font-extrabold text-grey">
                    {currentChapter.number}/{chapters.length} ·{" "}
                  </span>
                  {currentChapter.tocTitle}
                </span>
              ) : (
                <span className="text-[14px] font-black leading-tight text-ink">{label}</span>
              )}
            </button>
            <button type="button" aria-label="Sommaire du rapport" aria-haspopup="dialog" onClick={() => setMenu(true)} className="flex size-11 items-center justify-center">
              <Icon name="list" size={22} color="#121214" stroke={2.4} />
            </button>
          </div>
          <ReadingBar className="h-[3px] bg-[rgba(17,17,20,0.06)]" />
        </header>
      }
      desktopLabel={label}
      aside={<Sommaire chapters={chapters} phase={phase} current={current} allerAuChapitre={goTo} ouvrirPaiement={ouvrirPaiement} />}
      asideSide="left"
      asideWidth={300}
      mainWidth={720}
      columnsGap={56}
      mobileGap={18}
      stickyFooter={false}
      footer={
        /* Le rapport écrit : on continue avec BLUSH, dans le chat. Pendant l’écriture, le chat n’est pas encore prêt */
        phase.nom === "complet" ? (
          /* scroll={false} : l’accueil se pose lui-même en bas de la conv, Next ne doit pas le remettre en haut. Préchargé en entier (voir ChatBubble) */
          <ButtonLink ref={PARLER_A_BLUSH} href="/app?depuis=rapport" scroll={false} prefetch onClick={marquerChatOuvert} arrow>
            Parler à BLUSH
          </ButtonLink>
        ) : full ? undefined : (
          <Button arrow onClick={ouvrirPaiement}>
            Lire la suite
          </Button>
        )
      }
    >
      {/* Le vocal de BLUSH : la première chose du rapport */}
      {payload.vocal && (
        <VocalDuRapport
          vocal={payload.vocal}
          ecrit={phase.nom === "ecriture"}
          titre={titreDuo(story)}
          fin={{ emoji: report.verdict.emoji, titre: report.verdict.title, sousTitre: report.verdict.subtitle, action: "Lire mon rapport" }}
        />
      )}

      <EnTeteRapport story={story} report={report} entier={full} moi={me.initial} autre={other.initial} />

      {/* Partager son verdict (le verdict seul, le prénom de l’autre masqué), et ce que BLUSH fait de ta conv */}
      <PartageEtConfidentialite />

      {free.map((c, i) => (
        <Fragment key={c.number}>
          {i > 0 && <ChapterRule />}
          <ChapterSection chapter={c} renderQuestion={renderQuestion} onShare={partagerMoment} autre={other.pronoun}>
            {c.number === 1 && enTeteVerdict}
          </ChapterSection>
        </Fragment>
      ))}

      <Suite phase={phase} fermes={locked} access={access} ouvrirPaiement={ouvrirPaiement} />

      {/* Le rapport prêt, avec BLUSH+ : le chat reste à portée, en bas à droite */}
      {peut(access, "chat") && !ecritureInachevee(phase) && <ChatBubble />}

      {/* Reprendre là où tu t’étais arrêté : une proposition discrète, jamais un saut forcé */}
      {resume && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(20px,env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-8">
          <div ref={PASTILLE_REPRISE} data-popin="" className="pointer-events-auto flex max-w-[420px] items-center gap-1 rounded-full bg-ink py-1.5 pl-1.5 pr-1 text-white shadow-[0_18px_40px_-14px_rgba(17,17,20,0.6)]">
            <button type="button" onClick={() => goTo(resume)} className="flex min-w-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-2 text-left">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,0.14)]">
                <Icon name="arrow" size={15} color="#FFFFFF" stroke={2.6} className="rotate-90" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[14px] font-black leading-tight">Reprendre ta lecture</span>
                <span className="truncate text-[12px] font-extrabold leading-tight text-[rgba(255,255,255,0.72)]">
                  Chapitre {resume} · {chapters.find((c) => c.number === resume)?.tocTitle}
                </span>
              </span>
            </button>
            <button type="button" aria-label="Ne pas reprendre" onClick={oublierReprise} className="flex size-9 shrink-0 items-center justify-center rounded-full">
              <Icon name="close" size={15} color="#FFFFFF" stroke={2.8} />
            </button>
          </div>
        </div>
      )}

      <FeuilleSommaire open={menu} onClose={() => setMenu(false)} chapters={chapters} current={current} allerAuChapitre={goTo} ouvrirPaiement={ouvrirPaiement} phase={phase} />

      {toast && <Toast className="fixed inset-x-4 top-3 lg:left-1/2 lg:right-auto lg:w-[420px] lg:-translate-x-1/2">{toast}</Toast>}

      {/* Montée fermée une fois la page posée, ou au premier « Partager en image » (puis gardée, pour sa sortie et l’image déjà prête) */}
      {imageVue && <PartageImageSheet cible={image} onClose={() => setImage(null)} />}

      <SuivreAncre retour={retour} />

      <PaywallSheet
        open={paywall}
        onClose={() => setPaywall(false)}
        otherName={other.name}
        chapitres={locked.length || undefined}
        onUnlocked={() => setPaywall(false)}
      />
    </Screen>
  );
}

/**
 * Arrivé sur un chapitre (/rapport#chapitre-N, « Lire la suite » de « C’est débloqué ») par une navigation dans l’appli :
 * l’écran d’attente du rapport passe avant lui, et Next, qui n’y trouve pas encore le chapitre, oublie l’ancre. On y va
 * une fois le rapport posé. Pas au premier chargement (le navigateur a suivi l’ancre lui-même, et on a pu lire plus loin
 * depuis), ni après un retour par l’historique (la position revient seule). À part : le rapport ne se re-rend pas pour ça.
 */
function SuivreAncre({ retour }: { retour: boolean }) {
  /* Vrai seulement à l’hydratation de la page du serveur ; gardé tel quel ensuite */
  const pageDuServeur = !useHydrated();
  const [premierChargement] = useState(pageDuServeur);
  useEffect(() => {
    if (premierChargement || retour) return;
    const n = chapitreDeLAncre(window.location.hash);
    if (n === null) return;
    const raf = requestAnimationFrame(() => sectionDuChapitre(n)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(raf);
  }, [premierChargement, retour]);
  return null;
}

/*
 * Mémorisé : le rapport se re-rend à chaque chapitre atteint pendant la lecture, et toutes les 2 s pendant l’écriture ;
 * un chapitre déjà écrit, lui, ne change pas (ses props restent les mêmes : voir partagerMoment, enTeteVerdict).
 */
const ChapterSection = memo(function ChapterSection({
  chapter,
  children,
  renderQuestion,
  onShare,
  autre,
}: {
  chapter: Chapter;
  children?: ReactNode;
  renderQuestion: Parameters<typeof Blocks>[0]["renderQuestion"];
  onShare?: (chapitre: number, bloc: number) => void;
  autre?: Pronom;
}) {
  return (
    <section id={ancreDuChapitre(chapter.number)} aria-labelledby={titreDuChapitre(chapter.number)} className="flex scroll-mt-[76px] flex-col gap-[18px] lg:scroll-mt-6 lg:gap-3.5">
      <ChapterHeader number={chapter.number} kicker={chapter.kicker} title={chapter.title} id={titreDuChapitre(chapter.number)} />
      {children}
      <Blocks blocks={chapter.blocks} renderQuestion={renderQuestion} onShare={onShare && ((bloc) => onShare(chapter.number, bloc))} autre={autre} />
    </section>
  );
});
