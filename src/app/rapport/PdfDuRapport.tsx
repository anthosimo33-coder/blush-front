"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { nomErreur, tracer } from "@/lib/tracer";
import { pdfDuRapport } from "@/services/api";
import { useJourneyMe } from "@/state/journey";
import { ErreurApi } from "@/types/erreurs-api";
import { TypingDots } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";

/*
 * « Télécharger en PDF » : le rapport tel qu’on le lit, dessiné par le serveur (GET /api/rapport/pdf). Sur un écran
 * tactile qui sait partager un fichier (un téléphone), la feuille de partage du système (l’enregistrer dans Fichiers,
 * l’imprimer, l’envoyer) ; ailleurs, ou si elle n’est pas là, le téléchargement. Trois points le temps qu’il se dessine
 * (quelques secondes), et un message clair s’il rate. Dans la feuille du sommaire, celui de l’ordinateur, et à la fin
 * du rapport.
 */

/** Où en est le PDF : rien demandé, en train de se dessiner, prêt (le partage a demandé un second toucher), enregistré, raté, trop demandé aujourd’hui. */
type Etat = "repos" | "en_cours" | "pret" | "enregistre" | "rate" | "trop";

/** Ce que la ligne dit sous son titre, selon l’état. */
const SOUS_TITRES: Record<Etat, string> = {
  repos: "Ton rapport, à garder ou à imprimer",
  en_cours: "BLUSH met ton rapport en pages…",
  pret: "Ton PDF est prêt\u00a0: touche encore pour l’envoyer.",
  enregistre: "PDF enregistré.",
  rate: "Le PDF n’a pas pu se préparer. Réessaie dans un instant.",
  trop: "Assez de PDF pour aujourd’hui. Réessaie demain.",
};

/** Un écran tactile (un téléphone, une tablette) : le PDF y part par la feuille de partage du système, s’il sait la donner. */
const tactile = () => window.matchMedia("(pointer: coarse)").matches;

/** Enregistre `fichier` dans le navigateur (un ordinateur, ou un navigateur qui ne partage pas de fichier). */
function enregistrer(fichier: File) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(fichier);
  a.download = fichier.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Le geste du PDF : `etat` pour l’écran, et `telecharger` au toucher. Le PDF se demande au toucher (il se dessine en
 * quelques secondes) ; sur un téléphone, la feuille de partage du système doit s’ouvrir dans un geste, et Safari la
 * refuse quand le dessin a trop duré : le fichier est gardé, et le toucher suivant l’envoie aussitôt.
 */
function useGestePdf() {
  /* Qui est toi : le parcours de l’onglet, pour un serveur qui ne le sait pas (« Qui es-tu ? » pas encore envoyé) */
  const moi = useJourneyMe();
  const [etat, setEtat] = useState<Etat>("repos");
  const [fichier, setFichier] = useState<File | null>(null);

  useEffect(() => {
    if (etat !== "enregistre") return;
    const t = setTimeout(() => setEtat("repos"), 2600);
    return () => clearTimeout(t);
  }, [etat]);

  const envoyer = async (f: File) => {
    if (tactile() && navigator.canShare?.({ files: [f] })) {
      try {
        await navigator.share({ files: [f] });
        setFichier(null);
        setEtat("repos");
        return;
      } catch (e) {
        /* Refermée sans choisir : rien à faire */
        if (nomErreur(e) === "AbortError") return setEtat("repos");
        /* Refusée parce que le geste est trop loin (le dessin a duré) : le toucher suivant l’enverra */
        if (nomErreur(e) === "NotAllowedError") {
          setFichier(f);
          return setEtat("pret");
        }
        tracer("rapport:pdf:partage", e);
      }
    }
    enregistrer(f);
    setFichier(null);
    setEtat("enregistre");
  };

  const telecharger = async () => {
    if (etat === "en_cours") return;
    if (fichier) return envoyer(fichier);
    setEtat("en_cours");
    try {
      await envoyer(await pdfDuRapport(moi));
    } catch (e) {
      tracer("rapport:pdf", e);
      setEtat(e instanceof ErreurApi && e.status === 429 ? "trop" : "rate");
    }
  };

  return { etat, telecharger: () => void telecharger() };
}

/** La ligne « Télécharger en PDF », celle des feuilles et de la fin du rapport (InsetRow), dans son groupe. */
export function LignePdf() {
  const { etat, telecharger } = useGestePdf();
  const souci = etat === "rate" || etat === "trop";
  return (
    <InsetGroup>
      <InsetRow
        leading={<RowIcon icon="download" tone="toi" />}
        title="Télécharger en PDF"
        sub={
          <span role={souci ? "alert" : "status"} className={cn(souci && "text-danger")}>
            {SOUS_TITRES[etat]}
          </span>
        }
        trailing={etat === "en_cours" ? <TypingDots size={5} /> : undefined}
        onClick={telecharger}
        aria-busy={etat === "en_cours" || undefined}
      />
    </InsetGroup>
  );
}

/** Le même, dans le rapport doux du mode sobre : un lien de texte, encre et papier, sans couleur ni icône. */
export function LienPdfSobre() {
  const { etat, telecharger } = useGestePdf();
  const souci = etat === "rate" || etat === "trop";
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={telecharger}
        aria-busy={etat === "en_cours" || undefined}
        className="flex min-h-11 items-center justify-center gap-2 text-detail font-black text-soft"
      >
        Télécharger en PDF
        {etat === "en_cours" && <TypingDots size={4} />}
      </button>
      {etat !== "repos" && etat !== "en_cours" && (
        <span role={souci ? "alert" : "status"} className={cn("text-center text-legende font-extrabold", souci ? "text-danger" : "text-grey")}>
          {SOUS_TITRES[etat]}
        </span>
      )}
    </div>
  );
}

/** Le lien « Télécharger en PDF » du sommaire de l’ordinateur, au dessin de « Ta question ». */
export function LienPdfSommaire() {
  const { etat, telecharger } = useGestePdf();
  const souci = etat === "rate" || etat === "trop";
  return (
    <div className="flex flex-col">
      <button type="button" onClick={telecharger} aria-busy={etat === "en_cours" || undefined} className="row-hover flex w-full items-center gap-2.5 py-[7px] text-left text-ink">
        <span className="flex h-[26px] min-w-[26px] items-center justify-center rounded-[13px] bg-[rgba(61,139,255,0.12)]">
          <Icon name="download" size={14} color="#2F7BFF" stroke={2.4} />
        </span>
        <span className="flex-1 text-note font-black">Télécharger en PDF</span>
        {etat === "en_cours" && <TypingDots size={4} />}
      </button>
      {etat !== "repos" && etat !== "en_cours" && (
        <span role={souci ? "alert" : "status"} className={cn("pb-1 pl-[36px] text-micro font-extrabold leading-[1.35]", souci ? "text-danger" : "text-grey")}>
          {SOUS_TITRES[etat]}
        </span>
      )}
    </div>
  );
}
