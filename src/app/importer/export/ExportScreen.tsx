"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { useDevice, useFilePicker } from "@/lib/hooks";
import { ACCEPT_EXPORT } from "@/lib/limites";
import { useMonte } from "@/lib/useMonte";
import { codeDe, erreurDeParcours, messageErreur } from "@/lib/messages-erreur";
import { prechargerExport, uploadExport } from "@/services/api";
import { CASE_IMPORT } from "@/contenu/consentements";
import { EXPORT_STEPS, imageDeLaVideo, VIDEOS_EXPORT } from "@/contenu/parcours";
import { MentionImport, useAccord } from "@/components/juridique/cases";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Captcha } from "@/components/ui/Captcha";
import { Segmented } from "@/components/ui/controls";
import { Alert, TypingDots } from "@/components/ui/feedback";
import { FileInput } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/surfaces";
import { ParcoursScreen } from "@/components/shell/ParcoursScreen";
import { ScreenTitle } from "@/components/shell/Screen";
import { setJourney } from "@/state/journey";
import type { ExportApp } from "@/types";
import { ChoixConv } from "./ChoixConv";
import type { ConvInstagram } from "@/services/preparer-export";

type Menu = { contact: string; items: readonly string[]; highlight: number };

/* Écran 02 — Exporter : l’appli, l’écran du téléphone à reconnaître, les étapes en frise, puis le fichier. */
export function ExportScreen({ initialApp }: { initialApp: ExportApp }) {
  const router = useRouter();
  const device = useDevice();
  const picker = useFilePicker();
  const [app, setApp] = useState<ExportApp>(initialApp);
  const [video, setVideo] = useState(false);
  const [busy, setBusy] = useState(false);
  /* Un export Instagram complet : où en est le tour de ses convs (de 0 à 1), dit dans le bouton */
  const [avance, setAvance] = useState<number | null>(null);
  /* L’envoi n’a pas pu se faire (le réseau, trop d’imports d’un coup) : on le dit ici, la conv n’est pas en cause */
  const [souci, setSouci] = useState<string | null>(null);
  /* L’écran est-il toujours là ? Après la lecture du fichier, on n’envoie pas vers la suite quelqu’un qui est parti */
  const monte = useMonte();
  /* L’accord de l’import : la ligne au-dessus du bouton le dit, choisir le fichier le donne (refusé par le serveur, plus rien ne part) */
  const accord = useAccord();
  /* Un export Instagram complet : la feuille « Quelle conv ? », qui répond à l’envoi en cours (null : on a renoncé) */
  const [choix, setChoix] = useState<{ convs: ConvInstagram[]; repondre: (id: string | null) => void } | null>(null);
  const choisir = (convs: ConvInstagram[]) => new Promise<string | null>((repondre) => setChoix({ convs, repondre }));
  const fermerChoix = (id: string | null) => {
    choix?.repondre(id);
    setChoix(null);
  };
  const data = EXPORT_STEPS[app];
  /* La vidéo de l’export de cette appli : sans elle, ni bouton ni feuille */
  const adresseVideo = VIDEOS_EXPORT[app];
  const steps = device === "ios" ? data.steps.ios : device === "android" ? data.steps.android : data.steps.all;

  /* La lecture de l’export est chargée à la demande : on la charge dès qu’on ouvre le choix du fichier */
  const choisirFichier = () => {
    if (!accord.exiger()) return;
    prechargerExport();
    picker.open();
  };

  const onFiles = async ([file]: File[]) => {
    if (!file) return;
    /* L’accord refusé par le serveur pendant que le choix du fichier était ouvert : rien ne repart avant la page rechargée */
    if (!accord.exiger()) return;
    setBusy(true);
    setSouci(null);
    setAvance(null);
    let source;
    try {
      /* L’avancée ne compte plus une fois les convs proposées : la feuille « Quelle conv ? » prend le relais */
      source = await uploadExport(file, CASE_IMPORT.version, choisir, (p) => monte.current && setAvance(p < 1 ? p : null));
    } catch (e) {
      if (!monte.current) return;
      /* Un fichier illisible, une conv de groupe, trop courte : l’écran d’erreur prévu (ErreurDeParcours, ?erreur=) */
      setBusy(false);
      setAvance(null);
      /* On a fermé « Quelle conv ? » sans choisir : on reste sur l’écran, sans erreur */
      if (codeDe(e) === "annule") return;
      /* Le serveur n’a pas reconnu l’accord (BLUSH a changé de texte depuis l’ouverture de l’onglet) : la page est à recharger */
      if (codeDe(e) === "consentement") return accord.perimer();
      /* Le fichier lui-même : l’écran d’erreur prévu. Le reste (réseau, limite) : un message ici, et on réessaie */
      const parcours = erreurDeParcours("export", e);
      if (parcours) {
        router.replace(`/importer/export?app=${app}&erreur=${parcours}`, { scroll: false });
        return;
      }
      setSouci(messageErreur("export", e));
      return;
    }
    if (!monte.current) return;
    setJourney({ exportApp: app, app, exportFileName: source.fileName ?? file.name, capturesAdded: false });
    router.push("/importer/ok");
  };

  return (
    <ParcoursScreen
      step={1}
      back="/commencer"
      contentGap={24}
      head={<ScreenTitle>Exporte votre conv.</ScreenTitle>}
      footer={
        <>
          {/* Une carte opaque : le haut du pied d’écran est un dégradé, le texte de la page passerait derrière */}
          {souci && (
            <Alert variant="carte" className="mb-3 text-center">
              {souci}
            </Alert>
          )}
          {/* Le CAPTCHA de l’import sans compte : invisible tant qu’il ne demande pas de geste */}
          <Captcha action="import" />
          {/* L’accord de l’import, juste au-dessus du bouton qui le donne */}
          <MentionImport etat={accord} />
          {/* aria-busy pour la phase « Je lis ton export · N % » aussi, où loading est faux (Button ne le pose qu’avec loading) */}
          <Button onClick={choisirFichier} disabled={busy} aria-busy={busy} loading={busy && avance == null} loadingLabel="Analyse du fichier">
            {/* Le texte de l’avancée reste lisible sur le bouton grisé : les points y restent blancs */}
            {busy && avance != null ? (
              <span className="flex min-w-0 items-center gap-2.5">
                <TypingDots color="white" label={`Je lis ton export · ${Math.round(avance * 100)}\u00a0%`} />
                <span className="text-corps leading-[1.2] tabular-nums">
                  Je lis ton export · {Math.round(avance * 100)}
                  {NBSP}%
                </span>
              </span>
            ) : (
              "Choisir le fichier enregistré"
            )}
          </Button>
          <FileInput inputRef={picker.ref} accept={ACCEPT_EXPORT} onFiles={(f) => void onFiles(f)} label="Fichier de la conversation exportée" />
        </>
      }
    >
      <Segmented
        label="Ton appli"
        value={app}
        onChange={(v) => {
          setApp(v);
          setJourney({ app: v, exportApp: v });
          router.replace(`/importer/export?app=${v}`, { scroll: false });
        }}
        options={[
          { value: "whatsapp", label: "WhatsApp" },
          { value: "instagram", label: "Instagram" },
        ]}
      />

      {/* L’écran à reconnaître à gauche (au-dessus sur mobile), les étapes à côté */}
      <div className="isolate flex flex-col items-center gap-7 lg:flex-row lg:items-start lg:gap-9">
        {/* Le bas laisse la place au bouton de la vidéo, quand il y en a une */}
        <div className={cn("relative flex w-full shrink-0 justify-center lg:w-[260px]", adresseVideo && "pb-[22px]")}>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[45%] -z-10 size-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,white,rgba(255,255,255,0))]"
          />
          <PhoneScreen menu={data.menu} />
          {adresseVideo && (
            <button
              type="button"
              onClick={() => setVideo(true)}
              className="lift lift-sm absolute bottom-0 left-1/2 inline-flex h-11 -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full bg-white pl-1.5 pr-4 text-note font-black text-ink shadow-soft"
            >
              <span className="lift-pop flex size-8 items-center justify-center rounded-full bg-ink">
                <Icon name="play" size={14} fill="currentColor" stroke={0} className="text-white" />
              </span>
              Voir la vidéo
              <span className="font-extrabold text-grey">30 s</span>
            </button>
          )}
        </div>
        <StepTimeline steps={[...steps]} className="w-full lg:flex-1 lg:pt-2" />
      </div>

      {/* La vidéo de l’export (VIDEOS_EXPORT, src/contenu/parcours.ts) : elle part seule et en boucle à l’ouverture de la feuille, muette, jouée dans la page sur iPhone, son image d’attente le temps qu’elle charge */}
      {adresseVideo && (
        <Sheet open={video} onClose={() => setVideo(false)} labelledBy="video-title">
          <h2 id="video-title" className="m-0 text-[22px] font-black leading-[1.1] tracking-[-0.02em]">
            Voir la vidéo (30 s)
          </h2>
          <video
            key={adresseVideo}
            src={adresseVideo}
            poster={imageDeLaVideo(adresseVideo)}
            controls
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            className="mx-auto aspect-[9/16] w-full max-w-[260px] rounded-[28px] bg-ink object-contain"
          />
          <Button variant="secondary" onClick={() => setVideo(false)}>
            Fermer
          </Button>
        </Sheet>
      )}

      <ChoixConv open={!!choix} convs={choix?.convs ?? []} onChoisir={(id) => fermerChoix(id)} onClose={() => fermerChoix(null)} />
    </ParcoursScreen>
  );
}

/** Le haut d’un téléphone sur la fiche du contact : la bonne option surlignée, qui pulse. Le bas se fond dans la page. */
function PhoneScreen({ menu }: { menu: Menu }) {
  return (
    <div
      aria-hidden="true"
      className="h-[264px] w-[236px] rounded-t-[40px] bg-[#111114] p-[7px] pb-0 shadow-[0_30px_60px_-30px_rgba(17,17,20,0.5)] [mask-image:linear-gradient(180deg,#000_calc(100%_-_48px),transparent)] lg:h-[296px]"
    >
      <div className="flex h-full flex-col items-center overflow-hidden rounded-t-[33px] bg-[#F2F1EE]">
        <span className="mt-2 h-[22px] w-[76px] shrink-0 rounded-full bg-[#111114]" />
        <Avatar tone="elle" size={52} fontSize={21} className="mt-2.5">
          {menu.contact.charAt(0)}
        </Avatar>
        <span className="mt-2 text-corps font-black">{menu.contact}</span>
        <div className="mt-3.5 w-[calc(100%_-_24px)] overflow-hidden rounded-[14px] bg-white">
          {menu.items.map((it, i) => (
            <MenuRow
              key={it}
              first={i === 0}
              on={i === menu.highlight}
              className={cn("h-[42px] px-3.5 text-[13.5px]", i === menu.items.length - 1 ? "text-danger" : "text-[#0F7A3C]")}
            >
              {it}
            </MenuRow>
          ))}
        </div>
      </div>
    </div>
  );
}

function MenuRow({ children, on, first, className }: { children: ReactNode; on: boolean; first: boolean; className?: string }) {
  return (
    <div
      className={cn("flex items-center justify-between font-extrabold", !first && "border-t border-[rgba(17,17,20,0.06)]", className)}
      style={on ? { background: "rgba(18,192,138,0.1)" } : undefined}
    >
      {children}
      {/* L’anneau qui bat est un ::after en scale et opacité (data-beat) : une ombre animée repeignait la page à chaque image */}
      {on && <span data-beat="" className="size-3 shrink-0 rounded-full bg-ink shadow-[0_0_0_5px_rgba(17,17,20,0.12)]" />}
    </div>
  );
}

/** Les étapes en frise : un fil relie les numéros, rien d’encadré. */
function StepTimeline({ steps, className }: { steps: ReactNode[]; className?: string }) {
  return (
    <ol className={cn("m-0 flex list-none flex-col p-0", className)}>
      {steps.map((s, i) => (
        <li key={i} className="relative flex gap-3.5 pb-[18px] last:pb-0">
          {i < steps.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[14px] top-[34px] w-0.5 rounded-full bg-[rgba(17,17,20,0.08)]" />}
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-white text-legende font-black text-ink shadow-[0_0_0_1px_rgba(17,17,20,0.06),0_4px_10px_-4px_rgba(17,17,20,0.25)]">
            {i + 1}
          </span>
          <span className="pt-[4px] text-corps font-extrabold leading-[1.4] lg:text-detail">{s}</span>
        </li>
      ))}
    </ol>
  );
}
