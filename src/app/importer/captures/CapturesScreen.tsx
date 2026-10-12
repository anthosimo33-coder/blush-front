"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { useFilePicker } from "@/lib/hooks";
import { ACCEPT_IMAGES, CAPTURES_MAX } from "@/lib/limites";
import { connexionPuis } from "@/lib/suite";
import { useApercusFichiers } from "@/lib/useApercusFichiers";
import { useMonte } from "@/lib/useMonte";
import { codeDe, erreurDeParcours, messageErreur, type ErreurParcours } from "@/lib/messages-erreur";
import { prechargerVideo, uploadRecording, uploadScreenshots } from "@/services/api";
import type { AvanceVideo } from "@/types/api";
import { prereduire, vignette } from "@/services/preparer-captures";
import { Button } from "@/components/ui/Button";
import { DoneCheck, TypingDots } from "@/components/ui/feedback";
import { FileInput } from "@/components/ui/FileInput";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { ReorderGrid } from "@/components/ui/ReorderGrid";
import { ParcoursScreen } from "@/components/shell/ParcoursScreen";
import { Lead, ScreenTitle } from "@/components/shell/Screen";
import { setJourney, useJourney } from "@/state/journey";
import { EXPORTS, type AppKind } from "@/types";
import { ErreurApi } from "@/types/erreurs-api";
import { BarreLecture, CarteEnregistrement, CaseAjout, CommentFilmer, Dropzone, TEXTES_GRILLE, VignetteCapture, type Shot } from "./parts";

/* Les applis lues par captures côté serveur (les autres passent par « autre ») */
const APPLIS_CAPTURES: AppKind[] = ["instagram", "hinge", "imessage"];

/** Où en est un enregistrement, dit simplement : la vidéo regardée dans le téléphone, puis lue par BLUSH. */
const texteAvance = (a: AvanceVideo) =>
  a.etape === "reprise"
    ? "La connexion a coupé, je reprends…"
    : a.etape === "video"
      ? `Je regarde ton enregistrement · ${Math.round(a.p * 100)}\u00a0%`
      : a.total > 1
        ? `BLUSH lit ta conv · ${a.faits} sur ${a.total}`
        : "BLUSH lit ta conv";

/*
 * Ce que l’écran des captures dit d’abord, d’après l’appli. Instagram (et WhatsApp) s’exportent : on y arrive souvent
 * juste après un export trop court, l’écran ne dit donc pas le contraire. Hinge et les autres ne s’exportent pas.
 * Les autres applis (Telegram, Messenger…) s’exportent parfois, mais BLUSH ne lit pas leur export : l’écran dit ce qui est vrai.
 * TODO(produit): « Les captures suffisent aussi », et « BLUSH ne lit pas encore l’export de ton appli » pour les autres
 * applis, textes du 12 octobre, à valider.
 */
const leadCaptures = (app: AppKind) =>
  (EXPORTS as readonly AppKind[]).includes(app)
    ? "Les captures suffisent aussi\u00a0: on reconnaît les messages, les dates et qui parle."
    : app === "hinge"
      ? "Hinge ne permet pas d’exporter\u00a0: les captures suffisent. On reconnaît les messages, les dates et qui parle."
      : "BLUSH ne lit pas encore l’export de ton appli\u00a0: les captures suffisent. On reconnaît les messages, les dates et qui parle.";

/** Pendant la lecture des captures (sans avancée à dire) : ce que BLUSH fait, en clair dans le bouton. */
const texteLecture = (n: number) => (n > 1 ? `BLUSH lit tes ${n} captures…` : "BLUSH lit ta capture…");

/*
 * Écran 03 — Captures : sélection, puis l’ordre se règle en glissant (BLUSH retrie aussi par date). Ou un enregistrement
 * d’écran : le téléphone en tire les écrans de la conv (la vidéo ne part pas), puis BLUSH les lit. Pour iMessage (pas
 * d’export possible), l’enregistrement est le chemin principal.
 * `addMode` (?mode=ajout, des captures ajoutées à un export, puis /importer/histoire) est en sommeil : aucun écran n’y
 * mène plus, sauf /importer/histoire, qu’on n’atteint que par lui, et le serveur refuse ces captures (api/captures).
 * Il reste pour la fusion d’un export et de captures, décidée pour plus tard.
 */
export function CapturesScreen({ app, addMode }: { app: AppKind | null; addMode: boolean }) {
  const router = useRouter();
  const [journey] = useJourney();
  const shots = useFilePicker();
  const rec = useFilePicker();
  const [items, setItems] = useState<Shot[]>([]);
  const [result, setResult] = useState<{ count: number; messages: number; video: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [avance, setAvance] = useState<AvanceVideo | null>(null);
  const [announce, setAnnounce] = useState("");
  /* Plus de 20 captures choisies : on garde les 20 premières, et on le dit */
  const [trop, setTrop] = useState(false);
  /* Ce qui a empêché l’envoi et ne vient pas des captures (la limite du jour, le budget de l’IA, le réseau) : dit sous elles, qui restent là */
  const [souci, setSouci] = useState<string | null>(null);
  /* L’écran est-il toujours là ? Après une lecture de 10 à 40 s, on n’envoie pas vers la suite quelqu’un qui est parti */
  const monte = useMonte();
  const captureApp = app ?? journey.app ?? "instagram";
  const enregistrement = captureApp === "imessage";
  const all = useRef<Shot[]>([]);
  useEffect(() => {
    all.current = items;
  }, [items]);

  /* Les aperçus sont créés une fois par fichier (déplacer une capture ne les recharge pas), libérés au départ de l’écran */
  const apercus = useApercusFichiers();

  /*
   * L’aperçu d’une capture : une vignette (le Worker la tire du fichier), pas l’originale, qui pèse une douzaine de Mo
   * une fois décodée (vingt captures font grimper la mémoire jusqu’au rechargement de Safari). Sans Worker, l’originale.
   */
  const vignettes = (shots: Shot[]) =>
    shots.forEach(
      (s) =>
        void vignette(s.file).then((b) => {
          /* Retirée entre-temps, ou l’écran est parti : l’aperçu ne sert plus */
          if (!monte.current || !all.current.some((x) => x.id === s.id)) return;
          const url = apercus.creer(b ?? s.file);
          setItems((list) => list.map((x) => (x.id === s.id ? { ...x, url } : x)));
        }),
    );

  /* Une erreur de lecture (rien de lisible, conv trop courte) ouvre l’écran d’erreur prévu (?erreur=, ErreurDeParcours) */
  const echec = (code: ErreurParcours) => router.replace(`/importer/captures?app=${captureApp}${addMode ? "&mode=ajout" : ""}&erreur=${code}`, { scroll: false });

  const handle = (picked: File[], video: boolean) => {
    /* Un enregistrement garde son fichier en aperçu (la balise vidéo le lit) ; une capture attend sa vignette */
    const added: Shot[] = picked.map((file, i) => ({ id: `${Date.now()}-${i}-${file.name}`, file, url: video ? apercus.creer(file) : null }));
    /* Un enregistrement remplace tout ; des captures après un enregistrement le remplacent aussi */
    const replace = video || !!result?.video;
    if (replace) items.forEach((s) => apercus.liberer(s.url));
    const toutes = replace ? added : [...items, ...added];
    const next = video ? toutes : toutes.slice(0, CAPTURES_MAX);
    toutes.slice(next.length).forEach((s) => apercus.liberer(s.url));
    setTrop(!video && toutes.length > CAPTURES_MAX);
    setSouci(null);
    /* L’enregistrement sert à la première importation (pas encore pour compléter une conv) */
    if (video && addMode) return echec("capture");
    setItems(next);
    if (!video) {
      const gardees = added.filter((s) => next.includes(s));
      /* all.current suit items après le rendu : à jour dès maintenant pour les vignettes qui arrivent */
      all.current = next;
      vignettes(gardees);
      /* Le Worker les réduit déjà pour l’envoi, pendant qu’on règle l’ordre */
      prereduire(gardees.map((s) => s.file));
    }
    /* La lecture ne part qu’une fois, au clic sur Continuer */
    setResult({ count: next.length, messages: -1, video });
  };

  /* La zone d’ajout, qui revient quand on retire la dernière capture : le focus y va (sinon, il retomberait sur la page) */
  const zoneAjout = useRef<HTMLButtonElement>(null);

  const remove = (id: string) => {
    apercus.liberer(items.find((s) => s.id === id)?.url);
    const next = items.filter((s) => s.id !== id);
    setItems(next);
    setAnnounce("Capture retirée.");
    setTrop(false);
    if (next.length) return setResult((r) => (r ? { ...r, count: next.length } : r));
    setResult(null);
    requestAnimationFrame(() => zoneAjout.current?.focus());
  };

  /** Déplace une capture à une autre place : BLUSH les lit dans cet ordre. */
  const move = (id: string, to: number) => {
    setItems((list) => {
      const from = list.findIndex((s) => s.id === id);
      if (from < 0 || to < 0 || to >= list.length || from === to) return list;
      const next = [...list];
      const [it] = next.splice(from, 1);
      if (!it) return list;
      next.splice(to, 0, it);
      return next;
    });
  };

  /* BLUSH lit toutes les captures d’un coup (de 10 à 40 secondes), puis on passe à la suite */
  const continuer = async () => {
    setBusy(true);
    setSouci(null);
    setAvance(null);
    const video = !!result?.video;
    const enregistre = video ? items[0] : undefined;
    try {
      const r = enregistre
        ? await uploadRecording(enregistre.file, APPLIS_CAPTURES.includes(captureApp) ? captureApp : "autre", setAvance)
        : await uploadScreenshots(
            items.map((s) => s.file),
            { app: captureApp, mode: addMode ? "add" : "first", onAvance: setAvance },
          );
      if (!monte.current) return;
      /* Une première conv de captures prend la place de l’export de cet onglet : le code reçu par email attendra ton prénom (vientDeCaptures) */
      setJourney({ ...(addMode ? { capturesAdded: true } : { app: captureApp, exportFileName: null }), me: "p0" });
      setResult({ count: items.length, messages: r.messagesRead, video });
      router.push(next);
    } catch (e) {
      if (!monte.current) return;
      /* Bêta fermée : BLUSH ne lit des captures que pour un compte (la session a pu expirer sur cet écran). La connexion, puis retour ici */
      if (e instanceof ErreurApi && e.status === 401) return router.push(connexionPuis(`/importer/captures?app=${captureApp}${addMode ? "&mode=ajout" : ""}`));
      setBusy(false);
      setAvance(null);
      /*
       * La conv elle-même (trop courte, de groupe), la vidéo, ou des captures où rien ne se lit : son écran d’erreur, comme
       * sur l’export. Rien ne se lit, c’est « capture », ou « fichier » quand le serveur refuse les images ou ne sait pas
       * lire ce que le modèle en a tiré (src/server/captures.ts) ; les deux ouvrent l’écran « capture ». Tout le reste ne
       * vient pas des captures, qui restent là : la limite du jour, le budget de l’IA (« souffle »), un refus de l’IA, une
       * panne, une réponse sans code (un 504) ou le réseau, encore après la reprise. Il se dit sous elles
       * (MESSAGES.captures), et on réessaie.
       */
      const code = codeDe(e);
      const parcours = erreurDeParcours("captures", e) ?? (code === "capture" || code === "fichier" ? "capture" : null);
      if (parcours) return echec(parcours);
      setSouci(messageErreur("captures", e));
    }
  };

  const back = addMode ? "/importer/ok" : "/commencer";
  const next = addMode ? "/importer/histoire" : "/qui";
  /* L’extraction d’un enregistrement est chargée à la demande : on la charge dès qu’on ouvre le choix de la vidéo */
  const choisirEnregistrement = () => {
    prechargerVideo();
    rec.open();
  };
  /* Pendant la lecture, ce qui se dit dans le bouton (et aux lecteurs d’écran) */
  const enCours = avance ? texteAvance(avance) : texteLecture(items.length);
  /* La première capture, ou l’enregistrement (seul de sa liste) */
  const premier = items[0];

  return (
    <ParcoursScreen
      step={1}
      back={back}
      head={
        <>
          <ScreenTitle>{enregistrement ? "Filme ta conv." : "Choisis tes captures."}</ScreenTitle>
          <Lead size={14}>
            {enregistrement ? "iMessage ne permet pas d’exporter. Enregistre ton écran en remontant la conv\u00a0: BLUSH lit tout, message par message." : leadCaptures(captureApp)}
          </Lead>
        </>
      }
      footer={
        items.length ? (
          <>
            <Button arrow={!busy} onClick={() => void continuer()} disabled={busy} aria-busy={busy}>
              {/* Le texte de l’avancée reste lisible sur le bouton grisé : les points y restent blancs */}
              {busy ? (
                <span className="flex min-w-0 items-center gap-2.5">
                  <TypingDots color="white" label={enCours} />
                  <span className="text-corps leading-[1.2] tabular-nums">{enCours}</span>
                </span>
              ) : (
                "Continuer"
              )}
            </Button>
            {/* Des captures : rien ne dit où en est la lecture, une barre avance d’après sa durée habituelle */}
            {busy && !result?.video && <BarreLecture captures={items.length} />}
          </>
        ) : enregistrement ? (
          <Button onClick={choisirEnregistrement}>Choisir mon enregistrement</Button>
        ) : (
          <Button onClick={shots.open}>Choisir mes captures</Button>
        )
      }
    >
      {!premier ? (
        enregistrement ? (
          <CommentFilmer onPick={choisirEnregistrement} />
        ) : (
          <Dropzone ref={zoneAjout} onPick={shots.open} onFiles={(f) => handle(f, false)} />
        )
      ) : result?.video ? (
        <CarteEnregistrement shot={premier} onChange={busy ? undefined : choisirEnregistrement} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* Pendant la lecture, l’ordre et la sélection sont figés : ce qui part est déjà parti */}
          <ReorderGrid
            items={items}
            onMove={move}
            onRemove={remove}
            onAnnounce={setAnnounce}
            fige={busy}
            rendu={(s, position) => <VignetteCapture shot={s} position={position} />}
            ajout={busy ? undefined : { onAdd: shots.open, rendu: <CaseAjout /> }}
            textes={TEXTES_GRILLE}
            sous={
              trop && (
                <p role="status" className="m-0 text-note font-extrabold leading-[1.45] text-ink">
                  {CAPTURES_MAX} captures au plus{NBSP}: on a gardé les {CAPTURES_MAX} premières. Retires-en pour en ajouter d’autres.
                </p>
              )
            }
            aide="Maintiens une capture et glisse-la pour changer l’ordre. BLUSH les remettra aussi dans l’ordre des dates."
          />
          <p aria-live="polite" className="sr-only">
            {announce}
          </p>
        </div>
      )}

      {/* L’autre façon d’ajouter la conv, en ligne discrète comme sur l’écran suivant */}
      <InsetGroup>
        {enregistrement ? (
          <InsetRow
            leading={<RowIcon icon="photo" tone="toi" />}
            title="Ou choisis des captures d’écran"
            sub="Pour une conv courte, quelques captures suffisent."
            onClick={busy ? undefined : shots.open}
            chevron={!busy}
            className={cn(busy && "opacity-50")}
          />
        ) : (
          <InsetRow
            leading={
              <RowIcon tone="elle">
                <span className="size-3.5 rounded-[7px] bg-elle" />
              </RowIcon>
            }
            title={"Plus rapide\u00a0: enregistre ton écran"}
            sub={"Remonte la conv doucement en filmant ton écran\u00a0: BLUSH lit tout."}
            onClick={busy ? undefined : choisirEnregistrement}
            chevron={!busy}
            className={cn(busy && "opacity-50")}
          />
        )}
      </InsetGroup>

      <div aria-live="polite" className="min-h-6">
        {/* L’avancée s’affiche dans le bouton ; ici, elle est seulement annoncée aux lecteurs d’écran */}
        {busy && <span className="sr-only">{enCours}</span>}
        {!busy && souci && <p className="m-0 mb-2.5 text-note font-extrabold leading-[1.45] text-ink">{souci}</p>}
        {!busy && result && !result.video && (
          <div data-rise="" className="flex items-center gap-2 text-note font-black">
            <DoneCheck size={24} />
            {result.video ? "1 enregistrement" : `${result.count} capture${result.count > 1 ? "s" : ""}`}
            {result.messages >= 0 ? ` · ${result.messages} messages analysés` : result.video ? " prêt" : result.count > 1 ? " prêtes" : " prête"}
          </div>
        )}
      </div>

      <FileInput inputRef={shots.ref} accept={ACCEPT_IMAGES} multiple onFiles={(f) => handle(f, false)} label="Captures d’écran de la conversation" />
      <FileInput inputRef={rec.ref} accept="video/*" onFiles={(f) => handle(f, true)} label="Enregistrement d’écran de la conversation" />
    </ParcoursScreen>
  );
}
