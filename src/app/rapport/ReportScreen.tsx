"use client";

import { BACKEND } from "@/services/mode";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useState, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { copyText } from "@/lib/hooks";
import { formatCount } from "@/lib/format";
import { useQuery } from "@/lib/query";
import { getReport, type ReportPayload } from "@/services/api";
import { BubbleLogo } from "@/components/brand/objects3d";
import { AvatarPair } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/cards";
import { Chip } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/messages";
import { TypingDots } from "@/components/ui/FileInput";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { LockRow } from "@/components/ui/progress";
import { Blocks, ChapterHeader, ChapterRule } from "@/components/ui/report";
import { Sheet, Toast } from "@/components/ui/surfaces";
import { Screen } from "@/components/shell/Screen";
import { PaywallSheet } from "@/components/screens/PaywallSheet";
import { useJourney } from "@/state/journey";
import type { Chapter, ChapterBlock, Story } from "@/types";
import { ChatBubble, marquerChatOuvert } from "./ChatBubble";
import { BarreEcriture, LigneEcriture, MarqueChapitre, PastilleEcriture } from "./Ecriture";
import { PartageEtConfidentialite, PartageImageSheet } from "./Partage";
import type { CibleImage } from "@/services/api";
import { SoberReport } from "./SoberReport";
import { VocalDuRapport } from "./Vocal";

/** Où tu t’étais arrêté (ce navigateur seulement). */
const RESUME_KEY = "blush.rapport.reprise.v1";

/*
 * Écrans 09 (aperçu gratuit), 10 (paiement), 11 (rapport complet) et 18-19 (mode sobre).
 */
export function ReportScreen({ initial, story, openPaywall, fixed = false }: { initial: ReportPayload; story: Story; openPaywall: boolean; fixed?: boolean }) {
  const { data, refresh } = useQuery("report", getReport, initial, { fetch: !fixed });
  /* `fixed` : l’aperçu d’un vrai rapport (page /apercu, en local) ne se laisse pas remplacer par les données de démo */
  const payload = fixed ? initial : (data ?? initial);
  /* Le rapport s’écrit encore (back-end), ou son vocal s’enregistre : on repasse toutes les 2 secondes jusqu’à ce qu’ils soient là */
  const attendre = !!payload.generating || payload.vocal?.etat === "en_cours";
  useEffect(() => {
    if (!attendre || fixed) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [attendre, fixed, refresh]);
  /* Mode sobre : le chat reste à portée aussi (c’est là qu’on a le plus besoin de parler), dans une bulle sobre */
  if (payload.sober)
    return (
      <>
        <SoberReport
          data={payload.sober}
          vocal={payload.vocal ? <VocalDuRapport vocal={payload.vocal} sobre ecrit={!!payload.generating} titre={`${story.participants[0].name} & ${story.participants[1].name}`} fin={{ titre: payload.sober.title, sousTitre: payload.sober.reassurance, action: "Lire la suite" }} /> : undefined}
        />
        {payload.access === "blushplus" && !payload.generating && <ChatBubble sobre />}
      </>
    );
  return (
    <>
      <ReportBody payload={payload} story={story} openPaywall={openPaywall} />
      {payload.generating && (payload.ecriture ? <PastilleEcriture ecriture={payload.ecriture} /> : <Writing />)}
    </>
  );
}

/** Pendant que BLUSH écrit le rapport (2 à 3 minutes) : une pastille en bas de l’écran. Texte relu le 8 octobre */
function Writing() {
  return (
    <div role="status" className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <span className="flex items-center gap-2.5 rounded-full bg-ink px-4 py-2.5 text-[14px] font-extrabold text-white shadow-card">
        <TypingDots color="#FFFFFF" label="BLUSH écrit ton rapport" />
        BLUSH écrit ton rapport, 2 à 3 minutes
      </span>
    </div>
  );
}

/**
 * Suit la lecture : le chapitre à l’écran (celui dont le haut a passé le tiers de l’écran)
 * et la progression, du début du chapitre 1 à la fin du dernier chapitre ouvert.
 */
function useReading(openKey: string) {
  const [current, setCurrent] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const numbers = openKey.split(",").map(Number);
    let raf = 0;
    const measure = () => {
      raf = 0;
      const line = window.innerHeight * 0.33;
      let now: number | null = null;
      for (const n of numbers) {
        const el = document.getElementById(`chapitre-${n}`);
        if (el && el.getBoundingClientRect().top <= line) now = n;
      }
      setCurrent(now);
      const first = document.getElementById(`chapitre-${numbers[0]}`);
      const last = document.getElementById(`chapitre-${numbers[numbers.length - 1]}`);
      if (first && last) {
        const start = first.getBoundingClientRect().top + window.scrollY - line;
        const end = last.getBoundingClientRect().bottom + window.scrollY - window.innerHeight;
        setProgress(Math.min(1, Math.max(0, (window.scrollY - start) / Math.max(1, end - start))));
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [openKey]);
  return { current, progress };
}

function ReportBody({ payload, story, openPaywall }: { payload: ReportPayload; story: Story; openPaywall: boolean }) {
  const router = useRouter();
  const [j] = useJourney();
  const [paywall, setPaywall] = useState(openPaywall);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /* « Partager en image » : la chute d’un chapitre en story */
  const [image, setImage] = useState<CibleImage | null>(null);
  const [resume, setResume] = useState<number | null>(null);

  const { report, access } = payload;
  const full = access !== "gratuit";
  /* Le rapport s’écrit : les chapitres à venir ne mènent pas au paiement, ils montrent où en est l’écriture */
  const ecriture = payload.generating ? payload.ecriture : undefined;
  const enEcriture = (n: number) => ecriture?.chapitres.find((c) => c.number === n);
  const [me, other] = j.me === story.participants[1].id ? [story.participants[1], story.participants[0]] : story.participants;
  const chapters = report.chapters;
  const free = chapters.filter((c) => !c.locked);
  const locked = chapters.filter((c) => c.locked);
  /* Les chapitres ouverts, en clé stable : la mesure de lecture ne se relance que s’ils changent */
  const openKey = free.map((c) => c.number).join(",");
  const { current, progress } = useReading(openKey);
  const label = full ? "Ton rapport complet" : "Ton rapport";
  const currentChapter = chapters.find((c) => c.number === current);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  /* À l’arrivée : si tu t’étais arrêté plus loin, on propose d’y reprendre (sans sauter tout seul) */
  useEffect(() => {
    if (window.location.hash || window.scrollY > 200) return;
    try {
      const saved = Number(JSON.parse(localStorage.getItem(RESUME_KEY) ?? "null")?.chapter);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique du stockage local à l’arrivée
      if (saved >= 2 && openKey.split(",").map(Number).includes(saved)) setResume(saved);
    } catch {
      /* stockage indisponible : pas de reprise */
    }
  }, [openKey]);

  /* On garde le chapitre en cours ; la proposition de reprise s’efface dès qu’on lit plus loin */
  useEffect(() => {
    if (!current) return;
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({ chapter: current }));
    } catch {
      /* rien */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la reprise devient inutile une fois la lecture repartie
    if (current >= 2) setResume(null);
  }, [current]);

  const goTo = useCallback((n: number) => {
    setMenu(false);
    setResume(null);
    requestAnimationFrame(() => {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(`chapitre-${n}`)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    });
  }, []);

  const renderQuestion = (b: Extract<ChapterBlock, { kind: "question" }>) => (
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
  );

  /* Desktop : le sommaire suit la lecture (chapitre en cours surligné, progression sous le titre) */
  const toc = (
    <nav aria-label="Sommaire" className="flex flex-col gap-0.5 rounded-card bg-white p-[18px] shadow-card">
      <div className="text-[13px] font-black text-grey">Sommaire</div>
      {ecriture ? <BarreEcriture ecriture={ecriture} /> : <ReadingBar progress={progress} className="mb-2 mt-2.5 h-[3px] rounded-full bg-[#ECE9E2]" />}
      <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
        {chapters.map((c) => (
          <li key={c.number}>
            {c.locked && payload.generating ? (
              <div className="flex w-full items-center gap-2.5 py-[7px] text-left">
                <ChapterBadge number={c.number} state="locked" />
                <span className={cn("flex-1 text-[14px] font-black", enEcriture(c.number)?.etat === "attente" || !ecriture ? "text-grey" : "text-ink")}>{enEcriture(c.number)?.title ?? c.tocTitle}</span>
                <MarqueChapitre etat={enEcriture(c.number)?.etat ?? "attente"} />
              </div>
            ) : c.locked ? (
              <button type="button" onClick={() => setPaywall(true)} className="row-hover flex w-full items-center gap-2.5 py-[7px] text-left">
                <ChapterBadge number={c.number} state="locked" />
                <span className="flex-1 text-[14px] font-black text-grey">{c.tocTitle}</span>
                <Icon name="lock" size={16} color="#8A8780" />
                <span className="sr-only">(verrouillé)</span>
              </button>
            ) : (
              <a
                href={`#chapitre-${c.number}`}
                onClick={(e) => {
                  e.preventDefault();
                  goTo(c.number);
                }}
                aria-current={c.number === current ? "location" : undefined}
                className={cn("row-hover flex items-center gap-2.5 py-[7px] text-ink no-underline", c.number === current && "before:!bg-[#F1EFEA] before:!opacity-100")}
              >
                <ChapterBadge number={c.number} state={c.number === current ? "current" : current && c.number < current ? "read" : "open"} />
                <span className={cn("flex-1 text-[14px]", c.number === current ? "font-black" : "font-extrabold")}>{c.tocTitle}</span>
              </a>
            )}
          </li>
        ))}
      </ol>
      {full && (
        /* Le trait est hors de la ligne cliquable : le voile du survol reste centré sur elle, comme pour les chapitres */
        <div className="mt-2 border-t border-[rgba(17,17,20,0.06)] pt-1.5">
          <Link href="/rapport/question" className="row-hover flex items-center gap-2.5 py-[7px] text-ink no-underline">
            <span className="flex h-[26px] min-w-[26px] items-center justify-center rounded-[13px] bg-[rgba(61,139,255,0.12)]">
              <Icon name="bolt" size={14} color="#2F7BFF" stroke={2.4} />
            </span>
            <span className="flex-1 text-[14px] font-black">Ta question</span>
            <Icon name="chevron" size={15} color="#B4B1A9" stroke={2.6} />
          </Link>
        </div>
      )}
      {/* Le sommaire suit la lecture : l’adresse du site est sur chaque capture du rapport (ordinateur) */}
      <span className="mt-3 flex items-center gap-1.5 border-t border-[rgba(17,17,20,0.06)] pt-3 text-[12px] font-black text-grey">
        <BubbleLogo size={15} />
        askblush.com
      </span>
    </nav>
  );

  return (
    <Screen
      mobileTop={
        /* Mobile : la barre reste en haut — le chapitre en cours, la progression, et le sommaire à un toucher */
        <header className="sticky top-0 z-30 shrink-0 bg-[rgba(244,242,237,0.88)] backdrop-blur-xl lg:hidden">
          <div className="grid h-[58px] grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-1 px-2">
            <button type="button" aria-label="Retour" onClick={() => router.back()} className="flex size-11 items-center justify-center">
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
          <ReadingBar progress={progress} className="h-[3px] bg-[rgba(17,17,20,0.06)]" />
        </header>
      }
      desktopLabel={label}
      aside={toc}
      asideSide="left"
      asideWidth={300}
      mainWidth={720}
      columnsGap={56}
      mobileGap={18}
      stickyFooter={false}
      footer={
        /* Le rapport écrit : on continue avec BLUSH, dans le chat. Pendant l’écriture, le chat n’est pas encore prêt */
        full ? (
          payload.generating ? undefined : (
            <ButtonLink id="cta-chat" href="/app?depuis=rapport" onClick={marquerChatOuvert} arrow>
              Parler à BLUSH
            </ButtonLink>
          )
        ) : (
          <Button arrow onClick={() => setPaywall(true)}>
            Lire la suite
          </Button>
        )
      }
    >
      {/* Le vocal de BLUSH : la première chose du rapport */}
      {payload.vocal && (
        <VocalDuRapport
          vocal={payload.vocal}
          ecrit={!!payload.generating}
          titre={`${story.participants[0].name} & ${story.participants[1].name}`}
          fin={{ emoji: report.verdict.emoji, titre: report.verdict.title, sousTitre: report.verdict.subtitle, action: "Lire mon rapport" }}
        />
      )}

      {/* En-tête du rapport */}
      <Card className="flex flex-col gap-2.5 p-[18px]">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-black text-grey">Le rapport de votre histoire</div>
          {full ? <Tag tone="ink" size="md">Complet</Tag> : <Tag tone="apercu" size="md" />}
        </div>
        <div className="flex items-center gap-2.5">
          <AvatarPair me={me.initial} other={other.initial} />
          <h1 className="m-0 text-[30px] font-black leading-[1.05] tracking-[-0.02em] [text-wrap:balance]">
            {story.participants[0].name} & {story.participants[1].name}
          </h1>
        </div>
        <div className="text-[13px] font-bold leading-[1.45] text-grey">
          {story.period} · {story.updatedLabel}
        </div>
        {/* Mobile : les chiffres rangés en grille ; desktop : les pastilles de la maquette */}
        <dl className="m-0 mt-1 grid grid-cols-4 gap-2 border-t-2 border-sep pt-3.5 lg:hidden">
          {[
            [formatCount(story.totalMessages), "messages"],
            [String(story.sources.length), story.sources.length === 1 ? "appli" : "applis"],
            [String(story.voiceCount), story.voiceCount === 1 ? "vocal" : "vocaux"],
            [full ? report.readingTime.full : report.readingTime.free, "de lecture"],
          ].map(([value, label]) => (
            <div key={label} className="flex min-w-0 flex-col-reverse gap-0.5">
              <dt className="text-[12px] font-extrabold text-grey">{label}</dt>
              <dd className="m-0 whitespace-nowrap text-[19px] font-black leading-tight tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="hidden flex-wrap gap-2 lg:flex">
          <Chip>{formatCount(story.totalMessages)} messages</Chip>
          <Chip>
            {story.sources.length} {story.sources.length === 1 ? "appli" : "applis"}
          </Chip>
          <Chip>
            {story.voiceCount} {story.voiceCount === 1 ? "vocal" : "vocaux"}
          </Chip>
          <Chip>{full ? report.readingTime.full : report.readingTime.free}</Chip>
        </div>
      </Card>

      {/* Partager son verdict (le verdict seul, prénoms masqués), et ce que BLUSH fait de ta conv */}
      <PartageEtConfidentialite verdict={report.verdict} />

      {free.map((c, i) => (
        <Fragment key={c.number}>
          {i > 0 && <ChapterRule />}
          <ChapterSection chapter={c} renderQuestion={renderQuestion} onShare={(bloc) => setImage({ type: "moment", chapitre: c.number, bloc })}>
            {c.number === 1 && (
              <>
                <div className="flex items-start gap-2.5">
                  <span className="text-[44px] leading-none" aria-hidden="true">
                    {report.verdict.emoji}
                  </span>
                  <span className="text-[32px] font-black leading-[1.05] tracking-[-0.02em]">{report.verdict.title}</span>
                </div>
                <p className="m-0 text-[17px] font-extrabold leading-[1.45] text-soft">{report.verdict.subtitle}</p>
              </>
            )}
          </ChapterSection>
        </Fragment>
      ))}

      {locked.length > 0 && payload.generating && (
        <>
          <ChapterRule />
          <div className="text-[13px] font-black text-grey">La suite de ton rapport s’écrit · {locked.length} chapitres</div>
          <div id="suite-ecriture" className="flex flex-col rounded-card bg-white px-4 py-1 shadow-card">
            {locked.map((c, k) => (
              <LigneEcriture key={c.number} number={c.number} title={enEcriture(c.number)?.title ?? c.tocTitle} etat={enEcriture(c.number)?.etat ?? "attente"} last={k === locked.length - 1} />
            ))}
          </div>
        </>
      )}

      {locked.length > 0 && !payload.generating && (
        <>
          <ChapterRule />
          <div className="text-[13px] font-black text-grey">La suite de ton rapport · {locked.length} chapitres</div>
          <div className="flex flex-col rounded-card bg-white px-4 py-1 shadow-card">
            {locked.map((c) => (
              <LockRow key={c.number} number={c.number} title={c.tocTitle} onClick={() => setPaywall(true)} />
            ))}
          </div>
        </>
      )}

      {full && (
        <>
          <ChapterRule />
          {/* Après la lecture : ta question d’abord (bien visible), puis compléter le début de l’histoire */}
          <InsetGroup>
            <InsetRow
              leading={<RowIcon icon="bolt" tone="toi" />}
              title="Poser ma question à BLUSH"
              sub={access === "rapport" ? "Une question incluse avec ton rapport" : undefined}
              href="/rapport/question"
              chevron
            />
            {/* Back-end v1 : réunir un export et des captures arrive plus tard */}
            {!BACKEND && (
              <InsetRow
                leading={<RowIcon icon="photo" tone="elle" />}
                title="Ajouter le début"
                sub="Votre histoire commence avant WhatsApp ? Ajoute des captures (Hinge, Insta) : ton rapport sera encore plus juste."
                href="/importer/captures?mode=ajout"
                chevron
              />
            )}
          </InsetGroup>
        </>
      )}

      {/* Le rapport prêt, avec BLUSH+ : le chat reste à portée, en bas à droite */}
      {payload.access === "blushplus" && !payload.generating && <ChatBubble raised={!!resume} />}

      {/* Reprendre là où tu t’étais arrêté : une proposition discrète, jamais un saut forcé */}
      {resume && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(20px,env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-8">
          <div data-popin="" className="pointer-events-auto flex max-w-[420px] items-center gap-1 rounded-full bg-ink py-1.5 pl-1.5 pr-1 text-white shadow-[0_18px_40px_-14px_rgba(17,17,20,0.6)]">
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
            <button type="button" aria-label="Ne pas reprendre" onClick={() => setResume(null)} className="flex size-9 shrink-0 items-center justify-center rounded-full">
              <Icon name="close" size={15} color="#FFFFFF" stroke={2.8} />
            </button>
          </div>
        </div>
      )}

      {/* Le sommaire (mobile) : chaque chapitre à un toucher, les chapitres fermés ouvrent le paiement */}
      <Sheet open={menu} onClose={() => setMenu(false)} labelledBy="sommaire-titre">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="sommaire-titre" className="m-0 text-[24px] font-black leading-[1.1] tracking-[-0.02em]">
              Sommaire
            </h2>
            <span className="text-[13px] font-extrabold text-grey">{current ? `Chapitre ${current} sur ${chapters.length}` : `${chapters.length} chapitres`}</span>
          </div>
          <button type="button" aria-label="Fermer" onClick={() => setMenu(false)} className="lift lift-sm flex size-10 shrink-0 items-center justify-center rounded-full bg-white shadow-soft">
            <Icon name="close" size={16} color="#121214" stroke={2.8} />
          </button>
        </div>
        <ReadingBar progress={progress} className="h-1 rounded-full bg-[#E6E3DC]" />
        <InsetGroup>
          {chapters.map((c) =>
            c.locked ? (
              <InsetRow
                key={c.number}
                leading={<ChapterBadge number={c.number} state="locked" large />}
                title={<span className="text-grey">{c.tocTitle}</span>}
                trailing={<Icon name="lock" size={16} color="#8A8780" />}
                onClick={() => {
                  setMenu(false);
                  setPaywall(true);
                }}
              />
            ) : (
              <InsetRow
                key={c.number}
                leading={<ChapterBadge number={c.number} state={c.number === current ? "current" : current && c.number < current ? "read" : "open"} large />}
                title={c.tocTitle}
                sub={c.number === current ? "En cours" : undefined}
                onClick={() => goTo(c.number)}
              />
            ),
          )}
        </InsetGroup>
        {full && (
          <InsetGroup>
            <InsetRow leading={<RowIcon icon="bolt" tone="toi" />} title="Poser ma question à BLUSH" href="/rapport/question" chevron />
          </InsetGroup>
        )}
      </Sheet>

      {toast && <Toast className="fixed inset-x-4 top-3 lg:left-1/2 lg:right-auto lg:w-[420px] lg:-translate-x-1/2">{toast}</Toast>}

      <PartageImageSheet cible={image} onClose={() => setImage(null)} />

      <PaywallSheet
        open={paywall}
        onClose={() => setPaywall(false)}
        otherName={other.name}
        onUnlocked={() => setPaywall(false)}
      />
    </Screen>
  );
}

/** La barre de progression de lecture : bleu toi → rose elle → vert vérité. */
function ReadingBar({ progress, className }: { progress: number; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-label="Progression de la lecture"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      className={cn("overflow-hidden", className)}
    >
      <div
        className="h-full origin-left rounded-full transition-transform duration-150 ease-out"
        style={{ transform: `scaleX(${progress})`, background: "linear-gradient(90deg, #3D8BFF, #FF4F9A 60%, #12C08A)" } as CSSProperties}
      />
    </div>
  );
}

/** Le numéro d’un chapitre : lu (coche), en cours (encre), ouvert, ou fermé (cadenas à côté). */
function ChapterBadge({ number, state, large }: { number: number; state: "read" | "current" | "open" | "locked"; large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-black",
        large ? "size-9 text-[14px]" : "h-[26px] min-w-[26px] text-[12px]",
        state === "current" && "bg-ink text-white",
        state === "read" && "bg-vrai-ink text-white",
        state === "open" && "bg-white text-ink shadow-[inset_0_0_0_1.5px_rgba(17,17,20,0.16)]",
        state === "locked" && "bg-plaque text-grey",
      )}
    >
      {state === "read" ? <Icon name="check" size={large ? 15 : 12} color="#FFFFFF" stroke={3.2} /> : number}
    </span>
  );
}

function ChapterSection({
  chapter,
  children,
  renderQuestion,
  onShare,
}: {
  chapter: Chapter;
  children?: React.ReactNode;
  renderQuestion: Parameters<typeof Blocks>[0]["renderQuestion"];
  onShare?: (bloc: number) => void;
}) {
  return (
    <section id={`chapitre-${chapter.number}`} aria-labelledby={`chapitre-${chapter.number}-titre`} className={cn("flex scroll-mt-[76px] flex-col gap-[18px] lg:scroll-mt-6 lg:gap-3.5")}>
      <ChapterHeader number={chapter.number} kicker={chapter.kicker} title={chapter.title} id={`chapitre-${chapter.number}-titre`} />
      {children}
      <Blocks blocks={chapter.blocks} renderQuestion={renderQuestion} onShare={onShare} />
    </section>
  );
}
