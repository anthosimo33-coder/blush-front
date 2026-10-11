"use client";

import { IlOuElle } from "@/lib/pronom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, ViewTransition } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { useFilePicker } from "@/lib/hooks";
import { ACCEPT_EXPORT, ACCEPT_IMAGES, estExport, estImage } from "@/lib/limites";
import { pagePrecedente } from "@/lib/navigation";
import { useApercusFichiers } from "@/lib/useApercusFichiers";
import { ecritDepuis, FRAIS_DU_RENDU, invalidate, setQueryData, useQuery } from "@/lib/query";
import { play } from "@/lib/sound";
import { tracer } from "@/lib/tracer";
import { messageAjoutFiche, messageErreur } from "@/lib/messages-erreur";
import { addToFiche, getFiche, prechargerExport, updateFiche } from "@/services/api";
import { FICHE_SECTIONS } from "@/contenu/fiche";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Avatar } from "@/components/ui/Avatar";
import { Alert } from "@/components/ui/feedback";
import { FileInput } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { AppScreen } from "@/components/shell/AppScreen";
import type { Fiche, FicheFact, FicheUpdate, Pronom } from "@/types";

/** Largeur de la fiche sur desktop ; l’en-tête (logo, « Mon compte ») s’aligne dessus. */
const CARD_W = 600;

/** Ce que la fiche accepte : des captures (images) ou un export de votre conv (WhatsApp .zip ou .txt, Instagram .html ou .json). */
const ACCEPT = `${ACCEPT_IMAGES},${ACCEPT_EXPORT}`;
const accepted = (f: File) => estImage(f) || estExport(f);

/** Ce que BLUSH analyse, dit simplement : « ta capture », « tes 3 captures », « votre conv », ou les deux. */
function whatOf(files: File[]) {
  const images = files.filter(estImage).length;
  return [images === 1 ? "ta capture" : images > 1 ? `tes ${images} captures` : null, images < files.length ? "votre conv" : null].filter(Boolean).join(" et ");
}

/* « Elle aime », ou « Il aime » quand c’est une fille qui utilise BLUSH */
const sectionTitle = (id: FicheFact["section"], pronoun?: Pronom) => (id === "aime" ? `${IlOuElle(pronoun)} aime` : (FICHE_SECTIONS.find((s) => s.id === id)?.title ?? ""));

type Job =
  | { step: "idle" }
  | { step: "reading"; what: string; thumbs: string[]; file: boolean }
  /* Lu, pas encore rangé : la mémoire se met à jour après la réponse, la fiche se relit jusqu’à ce qu’elle ait fini */
  | { step: "adding"; what: string; pending: NonNullable<FicheUpdate["pending"]>; before: FicheFact[] }
  | { step: "done"; what: string; update: FicheUpdate; before: FicheFact[] };

/* Au-delà, on cesse de relire la fiche : la mise à jour prend 20 à 60 s, trois essais au plus */
const SONDAGE_MAX_MS = 5 * 60_000;

/*
 * Écran 16 — Sa fiche, à la manière d’une fiche Contacts. Un seul geste pour la remplir : ajouter des captures
 * ou un export (ou les glisser sur la page). BLUSH y trouve les infos et les range lui-même, chacune avec sa source ;
 * ce qui vient d’arriver est marqué d’un point rose. « Modifier » pour retirer une info ou ajouter la tienne.
 * Rien n’est cherché ailleurs.
 */
export function FicheScreen({ initial, fixed = false, storyId, rendu }: { initial: Fiche; fixed?: boolean; storyId?: string; rendu?: number }) {
  /* `fixed` : un aperçu figé (une vraie fiche produite par les prompts), qui ne relit pas celle du compte connecté.
     Sinon, une clé par conv : le cache d’une autre conv ne s’affiche jamais à la place de la sienne */
  const key = fixed ? ("fiche-apercu" as const) : (`fiche:${storyId ?? ""}` as const);
  /* `rendu` : l’heure du rendu serveur. Préchargée par l’accueil, la page garde la fiche d’alors : modifiée ici depuis,
     on part de la version gardée en cache. Rendue à l’instant (moins de 10 s, FRAIS_DU_RENDU), elle n’est pas relue au
     montage (Q63) : le rendu dit déjà si une mise à jour de la mémoire tourne (`updating`, getFicheEtMaj), et la fiche se
     relit alors jusqu’à ce qu’elle ait fini. Plus ancienne, revue par l’historique, ou rendue avant un message du chat
     (qui a pu lancer une mise à jour depuis, ecritDepuis), elle est relue : la relecture rattrape ce que le chat y a ajouté */
  const [frais] = useState(() => (rendu !== undefined && ecritDepuis("chat", rendu) ? 0 : FRAIS_DU_RENDU));
  const { data, refresh } = useQuery(key, getFiche, initial, { fetch: !fixed, rendu, frais });
  const fiche = data ?? initial;
  const [editing, setEditing] = useState(false);
  const [job, setJob] = useState<Job>({ step: "idle" });
  /* Les infos arrivées pendant la visite : un point rose, jusqu’à ce qu’on quitte la fiche */
  const [fresh, setFresh] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const picker = useFilePicker();
  /* Les vignettes des captures en cours de lecture : celles d’une lecture sont libérées à la suivante, toutes au départ de la fiche */
  const apercus = useApercusFichiers();
  const vignettes = useRef<string[]>([]);
  const router = useRouter();
  /*
   * « Retour » : venu de l’accueil, on y revient par l’historique, comme le geste retour (sinon le retour suivant
   * rouvrirait la fiche). Un retour par l’historique ne glisse pas : Next ne lui donne pas de type de transition.
   * Arrivé ici autrement, le lien ouvre l’accueil, en glissant.
   */
  const retour = (e: { preventDefault: () => void }) => {
    if (pagePrecedente() !== "/app") return;
    e.preventDefault();
    router.back();
  };
  /*
   * Venu de l’accueil, « Retour » passe par l’historique : précharger l’accueil (tout son rendu serveur) ne servirait à
   * rien. Lu après le montage, une fois la page d’avant notée (SuiviNavigation) ; le premier rendu reste celui du serveur.
   */
  const [prechargerAccueil, setPrechargerAccueil] = useState<true | undefined>(undefined);
  useEffect(() => {
    const t = setTimeout(() => setPrechargerAccueil(pagePrecedente() !== "/app" ? true : undefined));
    return () => clearTimeout(t);
  }, []);

  /* Des fichiers glissés au-dessus de la page : toute la fiche devient la zone de dépôt */
  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) setOver(true);
    };
    window.addEventListener("dragenter", enter);
    return () => window.removeEventListener("dragenter", enter);
  }, []);

  /*
   * Une mise à jour de la mémoire tourne (un ajout d’ici, ou un échange du chat ; back-end) : la fiche se relit toutes
   * les 3 s jusqu’à ce qu’elle ait fini, puis ce qui est arrivé prend son point rose. Pas pendant un enregistrement : la
   * relecture remettrait un instant la fiche d’avant la modification.
   */
  const [sondageArrete, setSondageArrete] = useState(false);
  const majEnCours = !fixed && !!fiche.updating && !sondageArrete;
  /* Les textes de la fiche avant la mise à jour, et si elle vient d’un ajout d’ici (qui dit alors ce qu’il a rangé) */
  const suivi = useRef<{ avant: Set<string>; ajout: boolean } | null>(null);
  const enVol = useRef(0);
  /* Depuis quand on attend : un ajout repart de zéro, même si la fiche se relisait déjà (une mise à jour du chat) */
  const debutSondage = useRef(0);
  useEffect(() => {
    if (!majEnCours) return;
    debutSondage.current = Date.now();
    const t = setInterval(() => {
      if (Date.now() - debutSondage.current > SONDAGE_MAX_MS) setSondageArrete(true);
      else if (!enVol.current) refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [majEnCours, refresh]);
  useEffect(() => {
    if (majEnCours) {
      suivi.current ??= { avant: new Set(fiche.facts.map((f) => f.text)), ajout: false };
      return;
    }
    const s = suivi.current;
    if (!s) return;
    suivi.current = null;
    const added = fiche.facts.filter((f) => !s.avant.has(f.text));
    setFresh((ids) => [...ids, ...added.map((f) => f.id)]);
    if (!s.ajout) return;
    /* Cinq minutes sans nouvelles, rien d’arrivé : l’écran dit que ça n’a pas marché */
    const update: FicheUpdate = { fiche, added, ...(fiche.updating && !added.length ? { problem: "bug" as const } : {}) };
    setJob((j) => (j.step === "adding" ? { step: "done", what: j.what, update, before: j.before } : j));
    /* Un toucher par info rangée, chacun un cran plus haut */
    play("ficheRangee", added.length);
  }, [majEnCours, fiche]);

  /*
   * La fiche change tout de suite à l’écran, puis part au serveur. Les enregistrements partent l’un après l’autre (deux
   * retraits rapides arrivent dans l’ordre) ; un enregistrement raté le dit, et la fiche revient à ce que le serveur garde.
   */
  const [souci, setSouci] = useState<string | null>(null);
  const file = useRef<Promise<unknown>>(Promise.resolve());
  const dernier = useRef(0);
  const save = (facts: FicheFact[]) => {
    setQueryData(key, { ...fiche, facts });
    setSouci(null);
    /* Ce que tu écris toi-même pendant une mise à jour n’est pas « arrivé » : pas de point rose */
    facts.forEach((f) => suivi.current?.avant.add(f.text));
    const n = ++dernier.current;
    enVol.current += 1;
    const envoi = file.current.then(() => updateFiche(facts)).finally(() => (enVol.current -= 1));
    /* La file ne s’arrête pas sur un échec : il est dit plus bas (souci, la fiche relue), pas une seconde fois ici */
    file.current = envoi.catch(() => {});
    return envoi.then(
      (f) => {
        if (n === dernier.current) setQueryData(key, f);
      },
      (e) => {
        if (n !== dernier.current) return;
        setSouci(messageErreur("fiche", e));
        invalidate(key);
      },
    );
  };

  const add = async (picked: File[]) => {
    const files = picked.filter(accepted);
    if (!files.length || job.step === "reading" || job.step === "adding") return;
    const before = fiche.facts;
    vignettes.current.forEach(apercus.liberer);
    const thumbs = files.filter(estImage).slice(0, 3).map(apercus.creer);
    vignettes.current = thumbs;
    const what = whatOf(files);
    setEditing(false);
    setJob({ step: "reading", what, thumbs, file: files.some((f) => !estImage(f)) });
    /* Sans réseau, même la fiche ne se relit pas : on garde celle qu’on a, et l’écran dit que ça n’a pas marché */
    const update = await addToFiche(files).catch((e): FicheUpdate => {
      tracer("fiche:ajout", e);
      return { fiche, added: [], problem: "bug" };
    });
    setQueryData(key, update.fiche);
    if (update.pending) {
      /*
       * Lu, pas encore rangé : les infos arrivent avec la mise à jour de la mémoire (la fiche se relit, voir plus haut).
       * Le point de départ est la fiche de la réponse : ce que le chat y a rangé pendant la lecture n’est pas compté
       */
      const avant = update.fiche.facts;
      suivi.current = { avant: new Set(avant.map((f) => f.text)), ajout: true };
      debutSondage.current = Date.now();
      setSondageArrete(false);
      setJob({ step: "adding", what, pending: update.pending, before: avant });
      return;
    }
    setFresh((ids) => [...ids, ...update.added.map((f) => f.id)]);
    setJob({ step: "done", what, update, before });
    /* Un toucher par info rangée, chacun un cran plus haut */
    play("ficheRangee", update.added.length);
  };

  /* « Annuler » : la fiche revient comme avant l’ajout */
  const undo = async () => {
    if (job.step !== "done") return;
    const gone = new Set(job.update.added.map((f) => f.id));
    play("ficheAnnulee", gone.size);
    setFresh((ids) => ids.filter((id) => !gone.has(id)));
    setJob({ step: "idle" });
    await save(job.before);
  };

  const toggleEditing = () => {
    /* En modification, le résumé du dernier ajout s’efface (« Annuler » ne défera pas tes retouches) */
    if (!editing && job.step === "done") setJob({ step: "idle" });
    setEditing((v) => !v);
  };

  const editButton = (
    <button
      type="button"
      onClick={toggleEditing}
      aria-pressed={editing}
      disabled={job.step === "reading" || job.step === "adding"}
      className={cn("relative h-10 rounded-full px-3 text-detail text-toi-ink transition-[color,opacity] after:absolute after:-inset-1 after:content-[''] disabled:opacity-40", editing ? "font-black" : "font-extrabold")}
    >
      {editing ? "OK" : "Modifier"}
    </button>
  );

  return (
    <AppScreen
      besoin="fiche"
      autre={fiche.person.name}
      aside={null}
      mainWidth={CARD_W}
      frameWidth={CARD_W}
      desktopTopPad={8}
      contentGap={0}
      mobileTop={
        <header className="grid h-[60px] shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3 lg:hidden">
          <Link href="/app" prefetch={prechargerAccueil} scroll={false} transitionTypes={["nav-back"]} onNavigate={retour} aria-label="Retour" className="flex size-11 items-center justify-center">
            <Icon name="back" size={24} stroke={2.6} className="text-ink" />
          </Link>
          <span className="text-note font-black text-grey">Sa fiche</span>
          <span className="flex justify-end">{editButton}</span>
        </header>
      }
    >
      {/* Desktop : retour à gauche, « Modifier » à droite */}
      <div className="mb-2 hidden items-center justify-between lg:flex">
        <Link href="/app" prefetch={prechargerAccueil} scroll={false} transitionTypes={["nav-back"]} onNavigate={retour} className="back-nudge relative inline-flex items-center gap-1.5 text-note font-black text-soft no-underline transition-colors hover:text-ink after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']">
          <Icon name="back" size={18} stroke={2.6} className="text-soft" />
          Retour
        </Link>
        {editButton}
      </div>

      {/* Elle, en grand */}
      <div className="flex flex-col items-center pt-2 text-center lg:pt-0">
        {/* Le même avatar que sur l’accueil : à l’aller, il passe d’un écran à l’autre (« Sophie, en glissé ») ; au retour, il repart avec la fiche */}
        <ViewTransition name="sophie-avatar" share={{ "nav-forward": "avatar-morph", default: "none" }} default="none">
          <Avatar tone="elle" size={96} fontSize={38}>
            {fiche.person.initial}
          </Avatar>
        </ViewTransition>
        <h1 className="m-0 mt-3.5 text-titre-2 font-black leading-none tracking-[-0.02em]">{fiche.person.name}</h1>
        <p className="m-0 mt-2 text-note font-extrabold text-grey">
          {fiche.portrait} · {fiche.updatedLabel}
        </p>
      </div>

      {/* Un seul geste pour la remplir ; pendant l’analyse, BLUSH écrit à sa place */}
      <div aria-live="polite" className="mt-6 flex flex-col gap-3">
        {job.step === "reading" ? (
          <Reading what={job.what} thumbs={job.thumbs} file={job.file} />
        ) : job.step === "adding" ? (
          <Adding what={job.what} pending={job.pending} />
        ) : (
          /* Un export se prépare dans un module à part (src/services/preparer-export.ts) : il se charge pendant qu’on choisit */
          <AddButton
            onClick={() => {
              prechargerExport();
              picker.open();
            }}
            dimmed={editing}
          />
        )}
        {job.step === "done" && <Found what={job.what} update={job.update} onUndo={() => void undo()} onClose={() => setJob({ step: "idle" })} />}
        {souci && <Alert className="px-1">{souci}</Alert>}
      </div>
      <FileInput inputRef={picker.ref} accept={ACCEPT} multiple onFiles={(f) => void add(f)} label="Captures ou export à ajouter à sa fiche" />

      {/* Ce que BLUSH sait d’elle : une liste par rubrique, la source de chaque info à droite */}
      <div className="mt-7 flex flex-col gap-6">
        {FICHE_SECTIONS.map((sec) => {
          const items = fiche.facts.filter((f) => f.section === sec.id);
          if (items.length === 0 && !editing) return null;
          return (
            <section key={sec.id} aria-labelledby={`sec-${sec.id}`} className="flex flex-col gap-2">
              <h2 id={`sec-${sec.id}`} className="m-0 pl-4 text-legende font-black text-grey">
                {sectionTitle(sec.id, fiche.person.pronoun)}
              </h2>
              <ul className="m-0 flex list-none flex-col overflow-hidden rounded-[20px] bg-white p-0 shadow-card">
                {items.map((f, i) => {
                  const isNew = fresh.includes(f.id);
                  return (
                    <li key={f.id} data-new={isNew ? "" : undefined} className={cn("flex min-h-[52px] items-center gap-3 px-4 py-2.5", i > 0 && "border-t border-[rgba(17,17,20,0.06)]")}>
                      {editing ? (
                        <button
                          type="button"
                          onClick={() => void save(fiche.facts.filter((x) => x.id !== f.id))}
                          aria-label={`Retirer «\u00a0${f.text}\u00a0»`}
                          data-popin=""
                          className="-my-2 -ml-1 flex size-9 shrink-0 items-center justify-center"
                        >
                          <span className="flex size-[22px] items-center justify-center rounded-full bg-danger">
                            <Icon name="minus" size={14} stroke={3} className="text-white" />
                          </span>
                        </button>
                      ) : (
                        isNew && (
                          <span className="-mr-1 size-[7px] shrink-0 rounded-full bg-elle">
                            <span className="sr-only">Nouveau{NBSP}:</span>
                          </span>
                        )
                      )}
                      <span className="min-w-0 flex-1 text-corps font-extrabold leading-[1.35]">{f.text}</span>
                      <span className="shrink-0 text-right text-[12.5px] font-extrabold text-grey">{f.sourceLabel}</span>
                    </li>
                  );
                })}
                {editing && <AddRow first={items.length === 0} label={sec.title} onAdd={(text) => void save([...fiche.facts, { id: `f${Date.now()}`, section: sec.id, text, sourceLabel: "ajouté par toi", sources: ["note"] }])} />}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="m-0 mt-6 pb-2 text-center text-legende font-extrabold text-grey">Rien n’est cherché sur Internet</p>

      {/* Glisser-déposer : toute la page accueille les fichiers */}
      {over && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void add(Array.from(e.dataTransfer.files));
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(244,242,237,0.78)] p-5 backdrop-blur-md"
        >
          <div
            data-popin=""
            className="pointer-events-none flex size-full max-h-[560px] max-w-[640px] flex-col items-center justify-center gap-3 rounded-[32px] border-[2.5px] border-dashed border-[rgba(232,53,138,0.5)] bg-[rgba(255,79,154,0.05)] px-6 text-center"
          >
            <BubbleLogo size={92} animated />
            <p className="m-0 mt-3 text-titre-3 font-black leading-[1.15] tracking-[-0.02em]">Dépose tes captures ou ton export</p>
            <p className="m-0 text-detail font-extrabold text-grey">BLUSH trouve les infos et les range dans sa fiche.</p>
          </div>
        </div>
      )}
    </AppScreen>
  );
}

/** Le geste pour remplir sa fiche : une carte, la bulle de BLUSH, un « + ». */
function AddButton({ onClick, dimmed }: { onClick: () => void; dimmed: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={dimmed}
      className="lift lift-card group flex w-full items-center gap-3.5 rounded-[22px] bg-white py-3.5 pl-3 pr-4 text-left text-ink shadow-card transition-opacity disabled:pointer-events-none disabled:opacity-40"
    >
      <BubbleLogo size={50} className="lift-pop" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-corps font-black leading-[1.25]">Complète sa fiche</span>
        <span className="text-legende font-extrabold leading-[1.35] text-grey">
          Ajoute des captures ou un export, BLUSH range tout.<span className="hidden lg:inline"> Tu peux aussi les glisser ici.</span>
        </span>
      </span>
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink shadow-ink transition-transform duration-300 [transition-timing-function:var(--ease-pop)] group-hover:rotate-90">
        <Icon name="plus" size={18} stroke={2.8} className="text-white" />
      </span>
    </button>
  );
}

/** Pendant l’analyse : la bulle de BLUSH écrit, et un trait rose balaie les captures en éventail, comme un scanner. */
function Reading({ what, thumbs, file }: { what: string; thumbs: string[]; file: boolean }) {
  return (
    <div role="status" className="relative flex items-center gap-3.5 overflow-hidden rounded-[22px] bg-white py-3.5 pl-3 pr-4 shadow-card">
      <BubbleLogo size={50} animated />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-corps font-black leading-[1.25]">BLUSH analyse {what}</span>
        <span className="text-legende font-extrabold leading-[1.35] text-grey">Il range ce qu’il trouve.</span>
      </span>
      <span aria-hidden="true" className="relative flex shrink-0 items-center py-1 pl-3 pr-1">
        {thumbs.map((u, i) => (
          <span
            key={u}
            className="-ml-3.5 block h-[46px] w-[32px] rounded-[8px] bg-white bg-cover bg-top shadow-[0_0_0_2px_white,0_8px_16px_-8px_rgba(17,17,20,0.45)] first:ml-0"
            style={{ backgroundImage: `url(${u})`, rotate: `${(i - (thumbs.length - 1) / 2) * 9}deg` }}
          />
        ))}
        {file && (
          <span className="-ml-3.5 flex h-[46px] w-[36px] items-center justify-center rounded-[8px] bg-paper shadow-[0_0_0_2px_white,0_8px_16px_-8px_rgba(17,17,20,0.35)] first:ml-0">
            <Icon name="file" size={18} stroke={2.2} className="text-soft" />
          </span>
        )}
        {/* Le trait est le haut d’un calque qui glisse (transform) : il balaie même quand la préparation des fichiers occupe le téléphone */}
        <span
          data-scan-bar=""
          className="pointer-events-none absolute -inset-x-1 inset-y-0 before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:rounded-full before:bg-elle before:shadow-[0_0_10px_2px_rgba(255,79,154,0.55)] before:content-['']"
        />
      </span>
    </div>
  );
}

/**
 * Lu, pas encore rangé : à la place de la lecture, ce que BLUSH a lu, « en cours d’ajout » le temps que sa mémoire se
 * mette à jour (20 à 60 s). Les infos rangées arrivent ensuite, avec leur point rose (Found).
 */
function Adding({ what, pending }: { what: string; pending: NonNullable<FicheUpdate["pending"]> }) {
  const n = pending.messages;
  const rows = [...pending.profile, ...(n > 0 ? [`${n} nouveau${n > 1 ? "x" : ""} message${n > 1 ? "s" : ""}`] : [])];
  return (
    <section role="status" aria-labelledby="ajout-titre" className="overflow-hidden rounded-[22px] bg-white shadow-card">
      <div className="flex items-center gap-3.5 py-3.5 pl-3 pr-4">
        <BubbleLogo size={50} animated />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="ajout-titre" className="m-0 text-corps font-black leading-[1.25]">
            BLUSH a lu {what}
          </h2>
          <span className="text-legende font-extrabold leading-[1.35] text-grey">Il range tout ça dans sa fiche, même si tu pars.</span>
        </span>
      </div>
      {rows.length > 0 && (
        <ul className="m-0 list-none border-t border-[rgba(17,17,20,0.06)] p-0 py-1">
          {rows.map((t, i) => (
            <li key={`${i}-${t}`} className="flex min-h-[40px] items-center gap-2.5 px-4 py-1.5">
              <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-[#D9D6CF] motion-safe:animate-pulse" />
              <span className="min-w-0 flex-1 text-detail font-extrabold leading-[1.35] text-soft">{t}</span>
              <span className="shrink-0 text-[12.5px] font-extrabold text-grey">en cours d’ajout</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Ce que BLUSH a trouvé et où il l’a rangé. « Annuler » retire tout. */
function Found({ what, update, onUndo, onClose }: { what: string; update: FicheUpdate; onUndo: () => void; onClose: () => void }) {
  const n = update.added.length;
  const problem = update.problem ? messageAjoutFiche(update.problem, what, update.fiche.person.name) : null;
  const title = problem?.title ?? (n === 0 ? "Rien de nouveau" : n === 1 ? "1 nouvelle info rangée" : `${n} nouvelles infos rangées`);
  return (
    <section data-rise="" aria-labelledby="trouve-titre" className="overflow-hidden rounded-[22px] bg-white shadow-card">
      <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
        <span aria-hidden="true" className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", n > 0 ? "bg-vrai-ink" : "bg-plaque")}>
          <Icon name={problem ? "alert" : "check"} size={16} stroke={problem ? 2.6 : 3.2} className={n > 0 ? "text-white" : "text-soft"} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="trouve-titre" className="m-0 text-corps font-black leading-[1.25]">
            {title}
          </h2>
          <span className="text-legende font-extrabold leading-[1.35] text-grey">{problem?.detail ?? (n > 0 ? `Trouvées dans ${what}.` : `BLUSH savait déjà tout ce qu’il y a dans ${what}.`)}</span>
        </span>
        <button type="button" onClick={onClose} aria-label="Fermer le résumé" className="-mr-2 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full">
          <Icon name="close" size={16} stroke={2.6} className="text-muted" />
        </button>
      </div>
      {n > 0 && (
        <ul className="m-0 list-none border-t border-[rgba(17,17,20,0.06)] p-0 py-1">
          {update.added.map((f) => (
            <li key={f.id} className="flex min-h-[40px] items-center gap-2.5 px-4 py-1.5">
              <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-elle" />
              <span className="min-w-0 flex-1 text-detail font-extrabold leading-[1.35]">{f.text}</span>
              <span className="shrink-0 rounded-full bg-paper px-2.5 py-1 text-micro font-black leading-none text-soft">{sectionTitle(f.section, update.fiche.person.pronoun)}</span>
            </li>
          ))}
        </ul>
      )}
      {n > 0 && (
        <div className="border-t border-[rgba(17,17,20,0.06)] px-4 py-1.5">
          <button type="button" onClick={onUndo} className="relative h-9 text-note font-black text-toi-ink after:absolute after:-inset-x-2 after:-inset-y-1 after:content-['']">
            Annuler
          </button>
        </div>
      )}
    </section>
  );
}

/** En mode modification : la dernière ligne d’une liste sert à ajouter. */
function AddRow({ first, label, onAdd }: { first: boolean; label: string; onAdd: (t: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <li className={cn("flex min-h-[52px] items-center gap-3 px-4 py-1.5", !first && "border-t border-[rgba(17,17,20,0.06)]")}>
      <form
        className="flex min-w-0 flex-1 items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!value.trim()) return;
          onAdd(value.trim());
          setValue("");
        }}
      >
        <button type="submit" aria-label={`Ajouter dans «\u00a0${label}\u00a0»`} className="-my-2 -ml-1 flex size-9 shrink-0 items-center justify-center">
          <span className="flex size-[22px] items-center justify-center rounded-full bg-vrai-ink">
            <Icon name="plus" size={14} stroke={3} className="text-white" />
          </span>
        </button>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`Ajouter dans «\u00a0${label}\u00a0»`}
          placeholder="Ajouter"
          className="min-w-0 flex-1 border-none bg-transparent text-corps font-extrabold text-ink outline-none placeholder:text-muted focus-visible:outline-none"
        />
      </form>
    </li>
  );
}
