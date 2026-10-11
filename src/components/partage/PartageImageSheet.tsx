"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { compterImagePartagee, imagePartage, type CibleImage } from "@/services/api";
import { TypingDots } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/surfaces";
import { EnTete, PAPIER } from "./feuille";

/*
 * « Partager en image », depuis l’accueil (une réponse de BLUSH) comme depuis le rapport (la chute d’un chapitre) :
 * chacun la charge à part (next/dynamic), elle n’arrive qu’au besoin.
 */

/**
 * « Partager en image » : l’image en story (une réponse de BLUSH, la chute d’un chapitre), telle qu’elle partira,
 * puis la partager (Instagram, WhatsApp…) ou l’enregistrer. Le prénom de l’autre est masqué par le serveur.
 */
export function PartageImageSheet({ cible, onClose }: { cible: CibleImage | null; onClose: () => void }) {
  const [image, setImage] = useState<{ cle: string; fichier: File; url: string } | null>(null);
  const [probleme, setProbleme] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const cle = cible ? JSON.stringify(cible) : null;
  const pret = !!image && image.cle === cle;

  useEffect(() => {
    /* Rouverte sur la même cible : l’image déjà dessinée sert telle quelle, sans redemander un rendu au serveur */
    if (!cible || !cle || image?.cle === cle) return;
    let fini = false;
    imagePartage(cible)
      .then((b) => {
        if (fini) return;
        setImage((avant) => {
          if (avant) URL.revokeObjectURL(avant.url);
          return { cle, fichier: new File([b], "blush.png", { type: "image/png" }), url: URL.createObjectURL(b) };
        });
      })
      .catch(() => !fini && setProbleme("L’image n’a pas pu être préparée. Réessaie dans un instant."));
    return () => {
      fini = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `cle` résume la cible : on ne redessine que si elle change
  }, [cle]);

  useEffect(() => {
    if (!fait) return;
    const t = setTimeout(() => setFait(null), 2200);
    return () => clearTimeout(t);
  }, [fait]);

  /* L’image gardée en mémoire (son adresse blob) est libérée quand la feuille disparaît */
  const derniere = useRef<string | null>(null);
  useEffect(() => {
    derniere.current = image?.url ?? null;
  }, [image]);
  useEffect(
    () => () => {
      if (derniere.current) URL.revokeObjectURL(derniere.current);
    },
    [],
  );

  const fermer = () => {
    setProbleme(null);
    setFait(null);
    onClose();
  };
  const peutPartager = pret && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [image.fichier] });
  const partager = async () => {
    if (!pret) return;
    try {
      await navigator.share({ files: [image.fichier] });
      compterImagePartagee();
    } catch {
      /* Fenêtre de partage fermée : rien à faire, rien à compter */
    }
  };
  const enregistrer = () => {
    if (!pret) return;
    const a = document.createElement("a");
    a.href = image.url;
    a.download = "blush.png";
    a.click();
    compterImagePartagee();
    setFait("Image enregistrée.");
  };

  return (
    <Sheet open={!!cible} onClose={fermer} labelledBy="image-titre">
      <EnTete id="image-titre" titre="Partager en image" onClose={fermer} />
      <div className="relative mx-auto aspect-[1080/1920] h-[min(52dvh,460px)] overflow-hidden rounded-[22px] shadow-card" style={{ background: PAPIER }}>
        {pret ? (
          // eslint-disable-next-line @next/next/no-img-element -- l’image dessinée par le serveur, telle qu’elle partira
          <img src={image.url} alt="L’image à partager" className="absolute inset-0 size-full object-cover" />
        ) : (
          !probleme && (
            <span className="absolute inset-0 flex items-center justify-center">
              <TypingDots label="Préparation de l’image" />
            </span>
          )
        )}
      </div>
      {probleme ? (
        <p role="alert" className="m-0 rounded-[18px] bg-[rgba(229,72,77,0.08)] px-4 py-3 text-[14px] font-extrabold text-[#C2363B]">
          {probleme}
        </p>
      ) : (
        <div className="flex gap-2.5">
          {peutPartager && (
            <button type="button" onClick={partager} className="lift lift-ink lift-sm flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[26px] text-[16px] font-black text-white shadow-ink [background:var(--btn-ink-bg)]">
              <Icon name="share" size={17} color="#FFFFFF" stroke={2.4} />
              Partager
            </button>
          )}
          <button
            type="button"
            onClick={enregistrer}
            disabled={!pret}
            className={cn("lift lift-sm flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[26px] bg-white text-[16px] font-black text-ink shadow-soft disabled:opacity-50", !peutPartager && "lift-ink")}
          >
            <Icon name="download" size={17} color="#121214" stroke={2.4} />
            {fait ?? (peutPartager ? "Enregistrer" : "Enregistrer l’image")}
          </button>
        </div>
      )}
      <p className="m-0 flex items-start gap-2 text-[13px] font-extrabold leading-[1.45] text-grey">
        <Icon name="shield" size={16} color="#6B6862" stroke={2.2} style={{ marginTop: 1 }} />
        Son prénom devient une initiale, le tien reste. Parfait pour ta story.
      </p>
    </Sheet>
  );
}
