"use client";

import { IlOuElle } from "@/lib/pronom";
import Link from "next/link";
import { useEffect, useRef, useState, ViewTransition, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { useFilePicker } from "@/lib/hooks";
import { setQueryData, useQuery } from "@/lib/query";
import { play } from "@/lib/sound";
import { addToFiche, getFiche, updateFiche } from "@/services/api";
import { FICHE_SECTIONS } from "@/mocks/daily";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Avatar } from "@/components/ui/Avatar";
import { FileInput } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { AppScreen } from "@/components/shell/AppScreen";
import type { Fiche, FicheFact, FicheUpdate } from "@/types";

/** Largeur de la fiche sur desktop ; l’en-tête (logo, « Mon compte ») s’aligne dessus. */
const CARD_W = 600;

/** Ce que la fiche accepte : des captures (images) ou un export de votre conv (WhatsApp .zip ou .txt, Instagram .html ou .json). */
const ACCEPT = "image/*,.zip,.txt,.json,.html,application/zip,text/plain,application/json,text/html";
const isImage = (f: File) => f.type.startsWith("image/");
const accepted = (f: File) => isImage(f) || /\.(zip|txt|json|html)$/i.test(f.name) || ["application/zip", "text/plain", "application/json", "text/html"].includes(f.type);

/** Ce que BLUSH analyse, dit simplement : « ta capture », « tes 3 captures », « votre conv », ou les deux. */
function whatOf(files: File[]) {
  const images = files.filter(isImage).length;
  return [images === 1 ? "ta capture" : images > 1 ? `tes ${images} captures` : null, images < files.length ? "votre conv" : null].filter(Boolean).join(" et ");
}

/* « Elle aime », ou « Il aime » quand c’est une fille qui utilise BLUSH */
const sectionTitle = (id: FicheFact["section"], pronoun?: "il" | "elle") => (id === "aime" ? `${IlOuElle(pronoun)} aime` : (FICHE_SECTIONS.find((s) => s.id === id)?.title ?? ""));

type Job =
  | { step: "idle" }
  | { step: "reading"; what: string; thumbs: string[]; file: boolean }
  | { step: "done"; what: string; update: FicheUpdate; before: FicheFact[] };

/*
 * Écran 16 — Sa fiche, à la manière d’une fiche Contacts. Un seul geste pour la remplir : ajouter des captures
 * ou un export (ou les glisser sur la page). BLUSH y trouve les infos et les range lui-même, chacune avec sa source ;
 * ce qui vient d’arriver est marqué d’un point rose. « Modifier » pour retirer une info ou ajouter la tienne.
 * Rien n’est cherché ailleurs.
 */
export function FicheScreen({ initial, fixed = false }: { initial: Fiche; fixed?: boolean }) {
  /* `fixed` : un aperçu figé (une vraie fiche produite par les prompts), qui ne relit pas la fiche de démo */
  const key = fixed ? "fiche-apercu" : "fiche";
  const { data } = useQuery(key, getFiche, initial, { fetch: !fixed });
  const fiche = data ?? initial;
  const [editing, setEditing] = useState(false);
  const [job, setJob] = useState<Job>({ step: "idle" });
  /* Les infos arrivées pendant la visite : un point rose, jusqu’à ce qu’on quitte la fiche */
  const [fresh, setFresh] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const picker = useFilePicker();
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  /* Des fichiers glissés au-dessus de la page : toute la fiche devient la zone de dépôt */
  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) setOver(true);
    };
    window.addEventListener("dragenter", enter);
    return () => window.removeEventListener("dragenter", enter);
  }, []);

  const save = async (facts: FicheFact[]) => {
    setQueryData(key, { ...fiche, facts });
    await updateFiche(facts);
  };

  const add = async (picked: File[]) => {
    const files = picked.filter(accepted);
    if (!files.length || job.step === "reading") return;
    const before = fiche.facts;
    const thumbs = files.filter(isImage).slice(0, 3).map((f) => URL.createObjectURL(f));
    urls.current.push(...thumbs);
    const what = whatOf(files);
    setEditing(false);
    setJob({ step: "reading", what, thumbs, file: files.some((f) => !isImage(f)) });
    const update = await addToFiche(files);
    setQueryData(key, update.fiche);
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
      disabled={job.step === "reading"}
      className={cn("relative h-10 rounded-full px-3 text-[15px] text-toi-ink transition-[color,opacity] after:absolute after:-inset-1 after:content-[''] disabled:opacity-40", editing ? "font-black" : "font-extrabold")}
    >
      {editing ? "OK" : "Modifier"}
    </button>
  );

  return (
    <AppScreen
      requires="blushplus"
      aside={null}
      mainWidth={CARD_W}
      frameWidth={CARD_W}
      desktopTopPad={8}
      contentGap={0}
      mobileTop={
        <header className="grid h-[60px] shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3 lg:hidden">
          <Link href="/app" prefetch transitionTypes={["nav-back"]} aria-label="Retour" className="flex size-11 items-center justify-center">
            <Icon name="back" size={24} color="#121214" stroke={2.6} />
          </Link>
          <span className="text-[14px] font-black text-grey">Sa fiche</span>
          <span className="flex justify-end">{editButton}</span>
        </header>
      }
    >
      {/* Desktop : retour à gauche, « Modifier » à droite */}
      <div className="mb-2 hidden items-center justify-between lg:flex">
        <Link href="/app" prefetch transitionTypes={["nav-back"]} className="back-nudge relative inline-flex items-center gap-1.5 text-[14px] font-black text-soft no-underline transition-colors hover:text-ink after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']">
          <Icon name="back" size={18} color="#4B4A47" stroke={2.6} />
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
        <h1 className="m-0 mt-3.5 text-[30px] font-black leading-none tracking-[-0.02em]">{fiche.person.name}</h1>
        <p className="m-0 mt-2 text-[14px] font-extrabold text-grey">
          {fiche.portrait} · {fiche.updatedLabel}
        </p>
      </div>

      {/* Un seul geste pour la remplir ; pendant l’analyse, BLUSH écrit à sa place */}
      <div aria-live="polite" className="mt-6 flex flex-col gap-3">
        {job.step === "reading" ? (
          <Reading what={job.what} thumbs={job.thumbs} file={job.file} />
        ) : (
          <AddButton onClick={picker.open} dimmed={editing} />
        )}
        {job.step === "done" && <Found what={job.what} update={job.update} onUndo={undo} onClose={() => setJob({ step: "idle" })} />}
      </div>
      <FileInput inputRef={picker.ref} accept={ACCEPT} multiple onFiles={(f) => void add(f)} label="Captures ou export à ajouter à sa fiche" />

      {/* Ce que BLUSH sait d’elle : une liste par rubrique, la source de chaque info à droite */}
      <div className="mt-7 flex flex-col gap-6">
        {FICHE_SECTIONS.map((sec) => {
          const items = fiche.facts.filter((f) => f.section === sec.id);
          if (items.length === 0 && !editing) return null;
          return (
            <section key={sec.id} aria-labelledby={`sec-${sec.id}`} className="flex flex-col gap-2">
              <h2 id={`sec-${sec.id}`} className="m-0 pl-4 text-[13px] font-black text-grey">
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
                          onClick={() => save(fiche.facts.filter((x) => x.id !== f.id))}
                          aria-label={`Retirer « ${f.text} »`}
                          data-popin=""
                          className="-my-2 -ml-1 flex size-9 shrink-0 items-center justify-center"
                        >
                          <span className="flex size-[22px] items-center justify-center rounded-full bg-[#E5484D]">
                            <Icon name="minus" size={14} color="#FFFFFF" stroke={3} />
                          </span>
                        </button>
                      ) : (
                        isNew && (
                          <span className="-mr-1 size-[7px] shrink-0 rounded-full bg-elle">
                            <span className="sr-only">Nouveau&nbsp;:</span>
                          </span>
                        )
                      )}
                      <span className="min-w-0 flex-1 text-[16px] font-extrabold leading-[1.35]">{f.text}</span>
                      <span className="shrink-0 text-right text-[12.5px] font-extrabold text-grey">{f.sourceLabel}</span>
                    </li>
                  );
                })}
                {editing && <AddRow first={items.length === 0} label={sec.title} onAdd={(text) => save([...fiche.facts, { id: `f${Date.now()}`, section: sec.id, text, sourceLabel: "ajouté par toi", sources: ["note"] }])} />}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="m-0 mt-6 pb-2 text-center text-[13px] font-extrabold text-grey">Rien n’est cherché sur Internet</p>

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
            <p className="m-0 mt-3 text-[24px] font-black leading-[1.15] tracking-[-0.02em]">Dépose tes captures ou ton export</p>
            <p className="m-0 text-[15px] font-extrabold text-grey">BLUSH trouve les infos et les range dans sa fiche.</p>
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
        <span className="text-[16px] font-black leading-[1.25]">Complète sa fiche</span>
        <span className="text-[13px] font-extrabold leading-[1.35] text-grey">
          Ajoute des captures ou un export, BLUSH range tout.<span className="hidden lg:inline"> Tu peux aussi les glisser ici.</span>
        </span>
      </span>
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink shadow-ink transition-transform duration-300 [transition-timing-function:var(--ease-pop)] group-hover:rotate-90">
        <Icon name="plus" size={18} color="#FFFFFF" stroke={2.8} />
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
        <span className="text-[16px] font-black leading-[1.25]">BLUSH analyse {what}</span>
        <span className="text-[13px] font-extrabold leading-[1.35] text-grey">Il range ce qu’il trouve.</span>
      </span>
      <span aria-hidden="true" className="relative flex shrink-0 items-center py-1 pl-3 pr-1">
        {thumbs.map((u, i) => (
          <span
            key={u}
            className="-ml-3.5 block h-[46px] w-[32px] rounded-[8px] bg-white bg-cover bg-top shadow-[0_0_0_2px_#FFFFFF,0_8px_16px_-8px_rgba(17,17,20,0.45)] first:ml-0"
            style={{ backgroundImage: `url(${u})`, rotate: `${(i - (thumbs.length - 1) / 2) * 9}deg` } as CSSProperties}
          />
        ))}
        {file && (
          <span className="-ml-3.5 flex h-[46px] w-[36px] items-center justify-center rounded-[8px] bg-[#F4F2ED] shadow-[0_0_0_2px_#FFFFFF,0_8px_16px_-8px_rgba(17,17,20,0.35)] first:ml-0">
            <Icon name="file" size={18} color="#4B4A47" stroke={2.2} />
          </span>
        )}
        <span data-scan-bar="" className="absolute -inset-x-1 top-0 h-[2px] rounded-full bg-elle shadow-[0_0_10px_2px_rgba(255,79,154,0.55)]" />
      </span>
    </div>
  );
}

/** Ce que BLUSH a trouvé et où il l’a rangé. Ce qu’il savait déjà est dit, pas doublé. « Annuler » retire tout. */
function Found({ what, update, onUndo, onClose }: { what: string; update: FicheUpdate; onUndo: () => void; onClose: () => void }) {
  const n = update.added.length;
  const title = n === 0 ? "Rien de nouveau" : n === 1 ? "1 nouvelle info rangée" : `${n} nouvelles infos rangées`;
  const rows = [...update.added.map((f) => ({ f, isNew: true })), ...update.confirmed.map((f) => ({ f, isNew: false }))];
  return (
    <section data-rise="" aria-labelledby="trouve-titre" className="overflow-hidden rounded-[22px] bg-white shadow-card">
      <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
        <span aria-hidden="true" className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", n > 0 ? "bg-vrai-ink" : "bg-[#F1EFEA]")}>
          <Icon name="check" size={16} color={n > 0 ? "#FFFFFF" : "#4B4A47"} stroke={3.2} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="trouve-titre" className="m-0 text-[16px] font-black leading-[1.25]">
            {title}
          </h2>
          <span className="text-[13px] font-extrabold leading-[1.35] text-grey">{n > 0 ? `Trouvées dans ${what}.` : `BLUSH savait déjà tout ce qu’il y a dans ${what}.`}</span>
        </span>
        <button type="button" onClick={onClose} aria-label="Fermer le résumé" className="-mr-2 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full">
          <Icon name="close" size={16} color="#8A8780" stroke={2.6} />
        </button>
      </div>
      {rows.length > 0 && (
        <ul className="m-0 list-none border-t border-[rgba(17,17,20,0.06)] p-0 py-1">
          {rows.map(({ f, isNew }) => (
            <li key={f.id} className="flex min-h-[40px] items-center gap-2.5 px-4 py-1.5">
              <span aria-hidden="true" className={cn("size-[7px] shrink-0 rounded-full", isNew ? "bg-elle" : "bg-[#D9D6CF]")} />
              <span className={cn("min-w-0 flex-1 text-[15px] font-extrabold leading-[1.35]", !isNew && "text-soft")}>{f.text}</span>
              {isNew ? (
                <span className="shrink-0 rounded-full bg-[#F4F2ED] px-2.5 py-1 text-[12px] font-black leading-none text-soft">{sectionTitle(f.section, update.fiche.person.pronoun)}</span>
              ) : (
                <span className="shrink-0 text-[12.5px] font-extrabold text-grey">déjà dans sa fiche</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {n > 0 && (
        <div className="border-t border-[rgba(17,17,20,0.06)] px-4 py-1.5">
          <button type="button" onClick={onUndo} className="relative h-9 text-[14px] font-black text-toi-ink after:absolute after:-inset-x-2 after:-inset-y-1 after:content-['']">
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
        <button type="submit" aria-label={`Ajouter dans « ${label} »`} className="-my-2 -ml-1 flex size-9 shrink-0 items-center justify-center">
          <span className="flex size-[22px] items-center justify-center rounded-full bg-vrai-ink">
            <Icon name="plus" size={14} color="#FFFFFF" stroke={3} />
          </span>
        </button>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`Ajouter dans « ${label} »`}
          placeholder="Ajouter"
          className="min-w-0 flex-1 border-none bg-transparent text-[16px] font-extrabold text-ink outline-none placeholder:text-muted focus-visible:outline-none"
        />
      </form>
    </li>
  );
}
