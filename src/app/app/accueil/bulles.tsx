"use client";

/*
 * Les bulles de la conv de l’accueil : le fil (FilDeLaConv, et l’historique plus ancien en haut), ses groupes par
 * expéditeur (Group), la forme d’une bulle (BubbleShape) et ce que chaque message y montre (bubblesOf) : ta question,
 * tes captures, un export, un vocal, la réponse de BLUSH (ses bulles, les messages qu’elle cite, la réponse à lui
 * envoyer : SendReply), « BLUSH écrit », une réponse coupée (Coupure) et un niveau franchi (LevelEvent). Le modèle
 * des lignes (jours, groupes, clés) est dans ./conv/modele.ts ; HomeScreen pose le fil et lui donne la conv.
 */
import { createContext, memo, use, type RefObject } from "react";
import { IlOuElle } from "@/lib/pronom";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { delai } from "@/lib/motion";
import { BubbleLogo } from "@/components/brand/objects3d";
import { CopyPill } from "@/components/ui/controls";
import { TypingDots } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { BlushTyping, BULLE_DE_BLUSH, citation, coinsDeBulle, placeDansLeGroupe, Tag, type BulleDeBlush, type PlaceBulle } from "@/components/ui/messages";
import { ClampedBubble } from "@/components/ui/clamp";
import { scaleOf } from "@/contenu/niveaux";
import type { BlushAnswer, BulleChat, LevelId, Pronom } from "@/types";
import { VocalBlush, VoiceNote } from "../voice";
import { CLE_INTRO, CLE_JOUR_INTRO, cleDeBulle, clock, dayLabel, depli, maintenantDe, rowsOf, tapeEncore, typeInconnu, type Msg, type MsgABulles, type Row } from "./conv/modele";
import type { HomeContact } from "./contact";
import { AvecLogoDuFil, LogoDuFil } from "./Entetes";
import { useHomeMotion } from "./mouvement/contexte";

/** Le contact de l’accueil, son niveau suivi pendant la visite (HomeScreen le donne) : les bulles lisent ton prochain pas et son pronom. */
export const ContactContext = createContext<HomeContact | null>(null);

function useContact() {
  const contact = use(ContactContext);
  if (!contact) throw new Error("useContact : hors de HomeScreen");
  return contact;
}

/**
 * Le fil de la conv : les messages se posent en bas, groupés par expéditeur. 6 · 7 · Il se glisse au doigt (à gauche
 * l’heure, à droite pour creuser : accueil/mouvement/gestes.ts, sur `threadRef`). En haut, l’historique plus ancien
 * (`plus`) arrive en remontant (`hautRef`, accueil/mouvement/defilement.ts) ou d’un toucher. `partager` : « Partager en
 * image » une réponse (son échange) ; `relancer` : « Réessayer » une réponse coupée.
 */
export function FilDeLaConv({
  threadRef,
  hautRef,
  msgs,
  opened,
  depuis,
  plus,
  anciens,
  chargerAnciens,
  partager,
  relancer,
}: {
  threadRef: RefObject<HTMLDivElement | null>;
  hautRef: RefObject<HTMLDivElement | null>;
  msgs: Msg[];
  opened: number | null;
  depuis: number;
  plus: boolean;
  anciens: boolean;
  chargerAnciens: () => Promise<unknown>;
  partager: (echange: number) => void;
  relancer: (reponse: number) => void;
}) {
  return (
    <div
      ref={threadRef}
      role="log"
      aria-label="Ta conv avec BLUSH"
      aria-live="polite"
      className="flex flex-1 flex-col px-[18px] pb-4 pt-8 lg:overflow-y-auto lg:bg-[#F7F5F1] lg:px-7 lg:pb-6 overflow-x-clip [touch-action:pan-y_pinch-zoom] lg:overflow-x-hidden"
    >
      {/* L’historique plus ancien : il arrive en remontant, ou d’un toucher */}
      {plus && (
        <div ref={hautRef} className="flex min-h-11 justify-center pb-4">
          {anciens ? (
            <TypingDots label="Chargement des messages plus anciens" />
          ) : (
            <button type="button" onClick={() => void chargerAnciens()} className="rounded-full px-3 text-legende font-black text-grey transition-colors hover:text-ink">
              Voir les messages plus anciens
            </button>
          )}
        </div>
      )}
      <PartagerContext value={partager}>
        <RelanceContext value={relancer}>
          <Thread msgs={msgs} opened={opened} depuis={depuis} />
        </RelanceContext>
      </PartagerContext>
    </div>
  );
}

/* ———— La conv ———— */

/**
 * Une bulle de la conv : `at` son heure (6 · glisse pour l’heure), `fresh` une réponse qui vient d’arriver (5 · elle se
 * déplie, `d` secondes après le début de son arrivée), `neuf` un message de cette visite (il fait son entrée ;
 * l’historique et la conv gardée sont déjà lus). `tape` : la bulle de « BLUSH écrit » qui tape encore (tapeEncore).
 */
type Item = { key: string; node: BulleDeBlush; at: number | null; fresh: boolean; d: number; neuf: boolean; tape: boolean };

/** Un groupe de la conv (accueil/conv/modele.ts, rowsOf), habillé : les bulles de chacun de ses messages. */
type GroupeAffiche = Omit<Extract<Row, { kind: "group" }>, "msgs"> & { items: Item[] };

/** Ce que les bulles lisent autour d’elles : ton prochain pas, l’arrivée du jour (il s’écrit mot par mot). */
type BubbleEnv = { nextStep: string; arriving: boolean; autre?: Pronom };

/*
 * Les bulles de chaque message, gardées : un nouveau message ne refait pas celles de toute la conv, et un groupe dont
 * rien n’a changé n’est pas refait (Group). Un message n’est jamais modifié en place (la réponse remplace « BLUSH
 * écrit ») : il garde ses bulles tant que ce que bubblesOf lit autour de lui ne change pas (la clé).
 */
const bullesGardees = new WeakMap<Msg, { cle: string; nodes: BulleDeBlush[] }>();

function bullesDe(m: MsgABulles, env: BubbleEnv) {
  const cle = `${env.nextStep}|${env.autre ?? ""}|${m.type === "intro" && env.arriving}`;
  const gardees = bullesGardees.get(m);
  if (gardees?.cle === cle) return gardees.nodes;
  const nodes = bubblesOf(m, env);
  bullesGardees.set(m, { cle, nodes });
  return nodes;
}

/**
 * Un groupe de la conv, en bulles : celles de chaque message (gardées, voir bullesDe), chacune avec sa clé (cleDeBulle,
 * la règle de la clé du groupe) et son délai. « BLUSH écrit » a sa propre clé : à la réponse, le groupe repart de zéro
 * et ses bulles montent.
 */
function groupeAffiche({ msgs, ...groupe }: Extract<Row, { kind: "group" }>, env: BubbleEnv): GroupeAffiche {
  return {
    ...groupe,
    items: msgs.flatMap(({ m, at, neuf, fresh }) => {
      const nodes = bullesDe(m, env);
      const tape = tapeEncore(m);
      return nodes.map((node, k) => ({ key: cleDeBulle(m, k), node, at, fresh, d: depli(k, nodes.length, m.vagues), neuf, tape }));
    }),
  };
}

/*
 * Mémorisée : taper une lettre ne refait que la barre de saisie (accueil/Composer.tsx), parler que la barre
 * d’enregistrement (RecordingBar), et ce qui refait l’accueil (le point creusé, la feuille du contact, un niveau) ne
 * recalcule pas toute la conv. Et chaque groupe aussi : un nouveau message, un morceau d’historique ou la fin de
 * l’arrivée ne refont que ce qui change.
 */
const Thread = memo(function Thread({ msgs, opened, depuis }: { msgs: Msg[]; opened: number | null; depuis: number }) {
  const { report, fiche } = useContact();
  const { arriving } = useHomeMotion();
  const env: BubbleEnv = { nextStep: report.nextStep, arriving, autre: fiche.person.pronoun };
  const rows = rowsOf(msgs, opened, depuis);
  const now = maintenantDe(rows, opened);
  return (
    /* mt-auto pose les messages en bas sans justify-end, qui rend le haut d’une conv longue inaccessible au défilement */
    <div data-thread="" className="mt-auto flex flex-col gap-4">
      {/* L’avatar de BLUSH sous chaque réponse, dessiné une fois, en dernier dans la conv (accueil/Entetes.tsx) */}
      <AvecLogoDuFil>
        {rows.map((r) =>
          r.kind === "day" ? (
            <p key={r.key} data-row={r.key} data-a={arriving && r.key === CLE_JOUR_INTRO ? "day" : undefined} className="m-0 h-4 text-center text-micro font-bold leading-4 text-grey first:-mt-2">
              {r.at === null ? (
                NBSP
              ) : (
                <time dateTime={new Date(r.at).toISOString()}>
                  <span className="font-black">{dayLabel(r.at, now)}</span> {clock(r.at)}
                </time>
              )}
            </p>
          ) : r.kind === "event" ? (
            <LevelEvent key={r.key} row={r.key} level={r.level} neuf={r.neuf} />
          ) : (
            <Group key={r.key} row={groupeAffiche(r, env)} intro={arriving && r.key === CLE_INTRO} />
          ),
        )}
      </AvecLogoDuFil>
    </div>
  );
});

/** 11 · Un niveau franchi pendant la visite : un repère au milieu de la conv (texte relu le 8 octobre). */
function LevelEvent({ row, level, neuf }: { row: string; level: LevelId; neuf: boolean }) {
  const { levels, index, temperature } = scaleOf(level);
  return (
    <p data-row={row} className="m-0 flex justify-center">
      <span data-popin={neuf ? "" : undefined} className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-[#E3F6EE] px-3 text-legende font-extrabold text-vrai-ink">
        <Icon name="sparkle" size={14} stroke={2.6} className="text-vrai-ink" />
        {temperature ? "Nouvelle température" : "Nouveau niveau"} · <b className="font-black">{levels[index]?.label}</b>
      </span>
    </p>
  );
}

/** « Partager en image » une réponse de BLUSH (son échange). */
const PartagerContext = createContext<(echange: number) => void>(() => {});

type GroupProps = { row: GroupeAffiche; intro: boolean };

/**
 * Les bulles d’un même expéditeur : l’avatar de BLUSH sous la dernière, l’heure dessous (ou « BLUSH écrit » à la place).
 * `intro` : 1 · l’arrivée, BLUSH écrit un instant, puis l’intro se pose. L’arrivée arrive en props, pas par le contexte :
 * sa fin ne refait que le groupe de l’intro. Un groupe sans bulle (une réponse vide) ne montre rien, ni heure ni
 * « Partager ».
 */
const Group = memo(function Group({ row, intro }: GroupProps) {
  const partager = use(PartagerContext);
  if (!row.items.length) return null;
  const typing = row.items.find((it) => it.tape);
  const bubbles = row.items.filter((it) => it !== typing);
  const n = bubbles.length;
  return (
    <div data-row={row.key} data-group="" className="relative flex flex-col gap-[3px]">
      {bubbles.map((it, i) => {
        const pos = placeDansLeGroupe(i, n);
        /* 5 · Une réponse qui vient d’arriver se déplie depuis l’avatar (son délai reste le même quand la suite arrive : rien ne rejoue) */
        const unfold = it.fresh ? it.d : null;
        /* 6 · L’heure de chaque bulle attend hors champ, à droite */
        const time =
          it.at !== null ? (
            <span aria-hidden="true" className="swipe-time">
              {clock(it.at)}
            </span>
          ) : null;
        return row.from === "blush" ? (
          <div
            key={it.key}
            data-rise={unfold === null && it.neuf ? "" : undefined}
            data-a={intro ? "intro" : undefined}
            className="relative flex items-end gap-2"
            style={{ ...delai(i * 0.06), "--i": i }}
          >
            {i === n - 1 ? (
              /* Juste après « BLUSH écrit », sa petite bulle vole jusqu’ici avec la réponse */
              <span data-avatar="" data-a={intro ? "intro-av" : undefined} className="-mb-0.5 block shrink-0">
                <LogoDuFil />
              </span>
            ) : (
              <span aria-hidden="true" className="w-[34px] shrink-0" />
            )}
            {/* 7 · La flèche pour creuser, cachée derrière la bulle */}
            {it.node.quote && (
              <span aria-hidden="true" data-dig-icon="">
                <Icon name="reply" size={16} color="currentColor" stroke={2.6} />
              </span>
            )}
            <BubbleShape side="blush" pos={pos} node={it.node} id={it.key} unfold={unfold} />
            {time}
          </div>
        ) : (
          <div key={it.key} data-rise={it.neuf ? "" : undefined} className="relative flex justify-end">
            <BubbleShape side="toi" pos={pos} node={it.node} id={it.key} />
            {time}
          </div>
        );
      })}
      {intro && (
        <span aria-hidden="true" data-a="ghost" className="pointer-events-none absolute bottom-[18px] left-0 block">
          <BubbleLogo size={62} animated layered />
        </span>
      )}
      {typing ? (
        <div key={typing.key} data-reading={typing.key} className="flex items-end pt-1">
          {typing.node.body}
        </div>
      ) : (
        <span data-a={intro ? "intro-tm" : undefined} className={cn("mt-0.5 flex h-3.5 items-center gap-2 text-[11px] font-bold leading-[14px] text-grey", row.from === "blush" ? "pl-[46px]" : "justify-end pr-1.5")}>
          {row.at === null ? NBSP : <time dateTime={new Date(row.at).toISOString()}>{clock(row.at)}</time>}
          {/* La réponse se partage en image (story), le prénom de l’autre masqué */}
          {row.from === "blush" && row.echange && (
            <button
              type="button"
              onClick={() => partager(row.echange!)}
              className="relative inline-flex items-center gap-1 font-black text-grey transition-colors hover:text-ink after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
            >
              <Icon name="share" size={11} color="currentColor" stroke={2.8} />
              Partager
            </button>
          )}
        </span>
      )}
    </div>
  );
}, groupesEgaux);

/** Le même groupe : tout ce que Group lit (les bulles comparées une à une, leur contenu par identité). */
function groupesEgaux(a: GroupProps, b: GroupProps) {
  if (a.intro !== b.intro) return false;
  const x = a.row;
  const y = b.row;
  if (x === y) return true;
  if (x.key !== y.key || x.at !== y.at || x.echange !== y.echange || x.from !== y.from || x.items.length !== y.items.length) return false;
  return x.items.every((it, i) => {
    const o = y.items[i];
    return !!o && it.key === o.key && it.node === o.node && it.at === o.at && it.fresh === o.fresh && it.d === o.d && it.neuf === o.neuf && it.tape === o.tape;
  });
}

/**
 * Une bulle de la conv (src/components/ui/messages.tsx, BulleDeBlush) : ses coins viennent de sa place dans le groupe,
 * son style de son contenu (`plain`, la bulle blanche de BLUSH). `quote` : 7 · ce qu’on creuse en la glissant.
 */
function BubbleShape({ side, pos, node, id, unfold = null }: { side: "blush" | "toi"; pos: PlaceBulle; node: BulleDeBlush; id: string; unfold?: number | null }) {
  const tone = node.tone ?? (side === "toi" ? "toi" : "plain");
  const quote = side === "blush" ? node.quote : undefined;
  return (
    <div
      data-bubble={id}
      data-quote={quote}
      data-unfold={unfold !== null ? "" : undefined}
      style={unfold !== null ? delai(unfold) : undefined}
      className={cn(
        "relative z-[1]",
        tone === "plain" ? BULLE_DE_BLUSH : "flex max-w-[318px] flex-col rounded-[20px] text-left",
        coinsDeBulle(side, pos),
        tone === "accent" && "bg-[linear-gradient(180deg,#F3F8FF,white)] px-4 py-3.5 text-ink shadow-play",
        tone === "toi" && "max-w-[80%] bg-toi-ink px-4 py-2.5 text-white",
        tone === "bare" && "overflow-hidden",
        node.className,
      )}
    >
      {node.body}
    </div>
  );
}

/** 1 · Ton prochain pas, mot par mot pendant l’arrivée (les espaces insécables gardent « pas : » ensemble). */
function Words({ text }: { text: string }) {
  return text.split(" ").map((w, i) => (
    <span key={i}>
      {i > 0 && " "}
      <span data-a="w" style={{ "--i": i }}>
        {w}
      </span>
    </span>
  ));
}

/** Une bulle écrite de BLUSH, puis les messages qu’elle cite, comme dans un vrai fil. */
function bulleEcrite(b: BulleChat): BulleDeBlush[] {
  return [{ quote: b.text, body: <span className="text-corps font-bold leading-[1.4]">{b.text}</span> }, ...citesPar(b)];
}

/** Les messages qu’une bulle de BLUSH cite : chacun dans sa bulle, repliée s’il est long (ClampedBubble). */
const citesPar = (b: BulleChat) => (b.messages ?? []).map((msg) => citation(msg, <ClampedBubble from={msg.from} caption={msg.caption} text={msg.text} limit={25} />));

/** Le vocal de la réponse se fait encore : sa bulle attend, à la taille du lecteur qui la remplacera. */
function VocalEnCours() {
  return (
    <span role="status" className="flex h-[42px] min-w-[220px] items-center gap-2 pl-1.5">
      <span className="sr-only">BLUSH</span>
      <span data-vocal-rec="" className="size-[9px] rounded-full bg-danger-vif" />
      <span className="text-note font-black text-ink">enregistre un vocal…</span>
    </span>
  );
}

/** « Réessayer » une réponse coupée par le réseau (voir echanger, accueil/conv/useConversation.ts). */
const RelanceContext = createContext<(reponse: number) => void>(() => {});

/**
 * Le réseau a coupé la réponse : ce qui est arrivé reste, BLUSH le dit comme toute erreur du chat (« j’ai eu un bug,
 * renvoie-moi ça », src/services/api.ts), et la demande repart d’un toucher.
 */
function Coupure({ reponse }: { reponse: number }) {
  const relancer = use(RelanceContext);
  return (
    <span className="flex flex-col items-start gap-2.5">
      <span className="text-corps font-bold leading-[1.4]">j’ai eu un bug, renvoie-moi ça</span>
      <button type="button" onClick={() => relancer(reponse)} className="lift lift-sm inline-flex h-9 items-center rounded-full bg-white px-3.5 text-legende font-black text-ink shadow-soft">
        Réessayer
      </button>
    </span>
  );
}

/** Les bulles d’un message, d’après son `type`. */
function bubblesOf(m: MsgABulles, env: BubbleEnv): BulleDeBlush[] {
  switch (m.type) {
    case "intro":
      return m.intro === "next"
        ? [
            {
              tone: "accent",
              quote: env.nextStep,
              body: (
                <span className="flex items-start gap-2.5">
                  <Icon name="bolt" size={18} className="mt-0.5 shrink-0 text-toi" />
                  <span className="flex flex-col gap-[3px]">
                    <span className="text-micro font-black text-toi-ink">À toi de jouer</span>
                    <span className="text-corps font-black leading-[1.35]">{env.arriving ? <Words text={env.nextStep} /> : env.nextStep}</span>
                  </span>
                </span>
              ),
            },
          ]
        : [
            {
              body: (
                <span className="flex flex-col gap-1">
                  <span className="text-corps font-black leading-[1.3]">{IlOuElle(env.autre)} vient de répondre{NBSP}?</span>
                  <span className="text-note font-extrabold leading-[1.45] text-soft">Ajoute sa réponse{NBSP}: capture, export ou texte. BLUSH reconnaît tout seul.</span>
                </span>
              ),
            },
          ];
    case "ecrit":
      /* Sa bulle qui tape, seule : Group la pose à la place de l’heure (Item.tape) */
      if (tapeEncore(m)) return [{ body: <BlushTyping label={m.reading} vocal={m.vocal} /> }];
      /* Ses bulles déjà arrivées pendant qu’il écrit, et « Réessayer » si le réseau a coupé avant la fin */
      return [...(m.recues ?? []).flatMap(bulleEcrite), ...(m.coupee ? [{ body: <Coupure reponse={m.id} /> }] : [])];
    case "mot":
      return [{ body: <span className="text-detail font-extrabold leading-[1.45]">{m.notice}</span> }];
    case "vocal":
      return [{ className: "py-2 pl-2 pr-3.5", body: <VoiceNote clip={m.voice} /> }];
    case "texte":
      return [
        {
          body: (
            <span className="flex min-w-0 flex-col">
              {/* 7 · Le point creusé, rappelé au-dessus de ta question */}
              {m.about && <span className="mb-1 truncate border-l-2 border-[rgba(255,255,255,0.55)] pl-2 text-legende font-extrabold leading-[1.35] text-[rgba(255,255,255,0.82)]">{m.about}</span>}
              <span className="whitespace-pre-wrap text-corps font-bold leading-[1.4]">{m.text}</span>
            </span>
          ),
        },
      ];
    case "images":
      return [
        {
          tone: "bare",
          body: (
            <span className={cn("grid gap-0.5", m.images.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
              {m.images.slice(0, 4).map((u, i) => (
                <span key={u} className="relative block">
                  {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local d’un fichier choisi */}
                  <img src={u} alt={`Capture ${i + 1}`} decoding="async" className={cn("block object-cover object-top", m.images.length > 1 ? "h-[150px] w-[112px]" : "h-[230px] w-[172px]")} />
                  {i === 3 && m.images.length > 4 && (
                    <span className="absolute inset-0 flex items-center justify-center bg-[rgba(17,17,20,0.55)] text-[20px] font-black text-white">+{m.images.length - 4}</span>
                  )}
                </span>
              ))}
            </span>
          ),
        },
      ];
    case "fichier":
      return [
        {
          className: "py-3 pl-3",
          body: (
            <span className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.18)]">
                <Icon name="file" size={20} stroke={2.2} className="text-white" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-detail font-black">{m.file.name}</span>
                <span className="text-micro font-extrabold text-[rgba(255,255,255,0.75)]">{formatSize(m.file.size)}</span>
              </span>
            </span>
          ),
        },
      ];
    case "reponse":
      /* 5 · La meilleure réponse d’une réponse qui vient d’arriver brille une fois */
      return bullesDeLaReponse(m.result, !!m.answered);
    default:
      return typeInconnu(m);
  }
}

/** Les bulles d’une réponse de BLUSH. `shine` : elle vient d’arriver, sa meilleure réponse brille une fois. */
function bullesDeLaReponse(r: BlushAnswer, shine: boolean): BulleDeBlush[] {
  /* Le message qu’il a reçu, montré d’abord, et la réponse à lui envoyer : en vocal comme en bulles */
  const recu = (r.incoming ?? []).map((msg) => citation(msg));
  const aEnvoyer: BulleDeBlush[] = r.send ? [{ quote: r.send.join("\n"), body: <SendReply lines={r.send} why={r.why} shine={shine} /> }] : [];
  /*
   * Une réponse dite en vocal : la bulle vocale à la place des bulles écrites ; les messages qu’elle cite et la réponse à
   * envoyer restent. Le vocal se fait encore : sa bulle attend, la réponse est déjà là
   */
  if (r.vocal || r.vocalEnCours)
    return [
      ...recu,
      { className: "py-2.5 pl-2.5 pr-3.5", quote: r.bubbles.map((b) => b.text).join(" "), body: r.vocal ? <VocalBlush vocal={r.vocal} /> : <VocalEnCours /> },
      ...r.bubbles.flatMap(citesPar),
      ...aEnvoyer,
    ];
  /* La réponse en bulles : chaque bulle, puis les messages qu’elle cite, comme dans un vrai fil */
  return [
    ...recu,
    ...r.bubbles.flatMap(bulleEcrite),
    ...aEnvoyer,
    ...(r.ask ? [{ quote: r.ask, body: <span className="text-corps font-bold leading-[1.4]">{r.ask}</span> }] : []),
    ...(r.react ? [{ quote: r.react, body: <span className="text-corps font-bold leading-[1.4]">{r.react}</span> }] : []),
  ];
}

/** Les messages à lui envoyer, une bulle chacun, à copier en un geste. */
function SendReply({ lines, why, shine = false }: { lines: string[]; why?: string; shine?: boolean }) {
  return (
    <span className="flex flex-col gap-2">
      <span className="flex items-center justify-between gap-2">
        <span className="text-micro font-black text-vrai-ink">Ta meilleure réponse</span>
        <Tag tone="recommandee" />
      </span>
      <span className="flex flex-col items-start gap-[3px]">
        {lines.map((l, i) => (
          <span key={i} data-shine={shine && i === 0 ? "" : undefined} className="rounded-[18px] rounded-br-[6px] bg-toi-ink px-3.5 py-2 font-message text-detail font-bold leading-[1.35] text-white">
            {l}
          </span>
        ))}
      </span>
      {why && <span className="text-legende font-extrabold leading-[1.45] text-grey">{why}</span>}
      <span className="mt-1 flex">
        <CopyPill text={lines.join("\n")} label="Copier" />
      </span>
    </span>
  );
}

/** La taille d’un fichier, à la française (« 340 ko », « 2,4 Mo »). */
function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} ko` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}
