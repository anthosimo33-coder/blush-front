"use client";

/*
 * Ce qui part de la barre de saisie de l’accueil vers BLUSH : ton texte (4 · il s’envole du champ), une question toute
 * prête (3 · la pastille devient ta bulle), des captures, un export, ton vocal, et le point creusé (7 · glisse pour
 * creuser) que porte ta prochaine question. Chaque envoi pose ton message dans la conv et demande la réponse
 * (accueil/conv/useConversation.ts, envoyer) : au vrai chat (sendToBlush), ou à celui que l’écran donne (`envoyer`,
 * l’aperçu de l’équipe). Les questions toutes prêtes déjà posées pendant la visite quittent la rangée (useIdees).
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { prefersReducedMotion, textWidth } from "@/lib/motion";
import { play } from "@/lib/sound";
import { sendToBlush, sendVoiceToBlush, type SuiviChat } from "@/services/api";
import type { BlushAnswer } from "@/types";
import type { VoiceClip, VoiceError } from "../voice";
import { cleBulle, type Msg } from "./conv/modele";
import { nouvelId, type useConversation } from "./conv/useConversation";
import { CHIP_LOOK, FIELD_LOOK, type Flight } from "./mouvement/vol";

/** Ce que tu envoies d’écrit à BLUSH : ton texte (et le point creusé qu’il porte), ou des fichiers (captures, export). */
export type DemandeAuChat = { text?: string; files?: File[]; about?: string };

/**
 * Qui répond à un envoi écrit, à la place du vrai chat : `msgs`, la conv au moment de l’envoi (sans ton message) ;
 * `suivi`, ses bulles et son vocal à mesure. L’aperçu de l’équipe (src/app/apercu/accueil) y branche ses réponses toutes
 * prêtes et le chat local. Un vocal part toujours au vrai chat.
 */
export type Envoyer = (payload: DemandeAuChat, fil: { msgs: Msg[]; suivi: SuiviChat }) => Promise<BlushAnswer>;

/*
 * Les questions toutes prêtes déjà posées pendant la visite, gardées hors de l’accueil avec la conv (celle de la conv
 * ouverte seulement, voir useConversation) : revenu sur l’accueil, elles ne reviennent pas dans la rangée.
 * Seuls les effets l’écrivent : rien au rendu serveur ni à l’hydratation.
 */
let posees: { cle: string; asked: string[] } | null = null;
/* Les questions toutes prêtes ont fait leur entrée : revenu sur l’accueil, elles sont déjà là (elles la refont après une réponse) */
let pastillesPosees = false;

/**
 * Les questions toutes prêtes de la conv `cle` : celles pas encore posées (`quick`), et leur entrée, au premier
 * affichage de l’accueil puis à leur retour après chaque réponse (`refaireEntree`, au départ d’un échange).
 */
export function useIdees(cle: string | undefined, toutes: string[]) {
  const [entree, setEntree] = useState(() => !pastillesPosees);
  const [asked, setAsked] = useState<string[]>(() => (cle !== undefined && posees?.cle === cle ? posees.asked : []));

  /* Les questions posées, gardées avec la conv pour un retour sur l’accueil */
  useEffect(() => {
    if (cle !== undefined) posees = { cle, asked };
  }, [cle, asked]);

  /* Les questions toutes prêtes ont fait leur entrée : un retour sur l’accueil ne la rejoue pas */
  useEffect(() => {
    pastillesPosees = true;
  }, []);

  return {
    quick: toutes.filter((q) => !asked.includes(q)),
    entree,
    refaireEntree: () => setEntree(true),
    poser: (q: string) => setAsked((a) => [...a, q]),
  };
}

/**
 * Les envois de la barre de saisie, aux noms de ses props (accueil/Composer.tsx) : `about`, le point creusé, et `dig`
 * pour en creuser un. `conv` : la conv de l’accueil (ce qu’en lisent les envois) ; `flightRef`, le vol de ta bulle (accueil/mouvement/vol.ts) ;
 * `input`, le champ (ton texte s’envole de là).
 */
export function useEnvois({
  conv,
  idees,
  envoyer,
  flightRef,
  input,
}: {
  conv: Pick<ReturnType<typeof useConversation>, "msgs" | "modeVocal" | "envoyer" | "direMot">;
  idees: Pick<ReturnType<typeof useIdees>, "poser">;
  envoyer?: Envoyer;
  flightRef: RefObject<Flight | null>;
  input: RefObject<HTMLInputElement | null>;
}) {
  const { msgs, modeVocal } = conv;
  /* 7 · Le point creusé : ta prochaine question porte dessus */
  const [about, setAbout] = useState<string | null>(null);
  /* Les adresses des captures et des vocaux montrés dans la conv, libérées en quittant l’accueil */
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const ask = (mine: Msg, payload: DemandeAuChat) => {
    play("envoi");
    return conv.envoyer(mine, {
      label: modeVocal ? "BLUSH enregistre un vocal" : "BLUSH analyse sa réponse",
      demande: async (suivi) => ({ type: "reponse", from: "blush", result: envoyer ? await envoyer(payload, { msgs, suivi }) : await sendToBlush(payload, suivi) }),
      vocal: modeVocal,
    });
  };

  /* Ton message, depuis la barre de saisie : le champ montre encore ton texte, il s’envole de là */
  const onText = (t: string) => {
    const mine = nouvelId();
    const field = input.current;
    /* 4 · L’envoi façon Messages : ton texte quitte le champ et devient une bulle bleue */
    if (field && !about && !prefersReducedMotion()) {
      const r = field.getBoundingClientRect();
      const w = textWidth(t, field);
      if (w <= r.width) flightRef.current = { kind: "text", bubble: cleBulle(mine, 0), text: t, from: { left: r.left - 16, top: r.top + r.height / 2 - 21, width: w + 32, height: 42 }, start: FIELD_LOOK };
    }
    const point = about ?? undefined;
    setAbout(null);
    void ask({ type: "texte", id: mine, from: "toi", text: t, about: point }, { text: t, about: point });
  };

  /* Une question toute prête part tout de suite, comme si tu l’avais écrite. 3 · La pastille elle-même devient ta bulle */
  const onQuick = (q: string, chip?: HTMLElement) => {
    idees.poser(q);
    const mine = nouvelId();
    if (chip && !prefersReducedMotion()) flightRef.current = { kind: "text", bubble: cleBulle(mine, 0), text: q, from: chip.getBoundingClientRect(), start: CHIP_LOOK };
    void ask({ type: "texte", id: mine, from: "toi", text: q }, { text: q });
  };

  const onImages = (files: File[]) => {
    const list = files.map((f) => URL.createObjectURL(f));
    urls.current.push(...list);
    void ask({ type: "images", id: nouvelId(), from: "toi", images: list }, { files });
  };

  const onExport = ([file]: File[]) => {
    if (file) void ask({ type: "fichier", id: nouvelId(), from: "toi", file: { name: file.name, size: file.size } }, { files: [file] });
  };

  /* Le vocal : le micro est demandé au premier toucher ; sans micro, BLUSH le dit dans la conv */
  const onMicError = (e: VoiceError) =>
    conv.direMot(
      e === "denied"
        ? "Je n’ai pas accès à ton micro. Autorise-le dans les réglages de ton navigateur, ou écris-moi."
        : "Les vocaux ne marchent pas sur ce navigateur. Écris-moi, je te réponds pareil.",
    );

  /* Ton vocal, depuis la barre de saisie (ou rien d’entendu : BLUSH le dit) */
  const onVoice = (clip: VoiceClip | "empty") => {
    if (clip === "empty") {
      conv.direMot("Je n’ai rien entendu. Vérifie ton micro et réessaie, ou écris-moi.");
      return;
    }
    play("vocalEnvoye");
    urls.current.push(clip.url);
    /* Tu lui parles en vocal : elle te répond en vocal */
    void conv.envoyer(
      { type: "vocal", id: nouvelId(), from: "toi", voice: { url: clip.url, seconds: clip.seconds, peaks: clip.peaks } },
      {
        label: "BLUSH enregistre un vocal",
        demande: async (suivi) => ({ type: "reponse", from: "blush", result: await sendVoiceToBlush({ audio: clip.blob, seconds: clip.seconds }, suivi) }),
        vocal: true,
      },
    );
  };

  /* 7 · Glisse pour creuser : la réponse glissée se cale au-dessus du champ, et le clavier s’ouvre */
  const dig = (quote: string) => {
    play("creuser");
    setAbout(quote);
    input.current?.focus({ preventScroll: true });
  };

  return { about, onAboutClear: () => setAbout(null), dig, onText, onQuick, onImages, onExport, onVoice, onMicError };
}
