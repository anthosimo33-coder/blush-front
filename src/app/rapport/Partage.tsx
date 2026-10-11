"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { copyText } from "@/lib/hooks";
import { nomErreur, tracer } from "@/lib/tracer";
import { creerLienPartage, desactiverLienPartage } from "@/services/api";
import type { VerdictMontre } from "@/types/api";
import { Alert, TypingDots } from "@/components/ui/feedback";
import { Icon, type IconName } from "@/components/ui/icons";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { LienDiscret } from "@/components/ui/NotePrivee";
import { Sheet } from "@/components/ui/surfaces";
import { FEUILLE_CONFIDENTIALITE as F } from "@/contenu/confidentialite";
import { PAPIER } from "@/components/partage/feuille";

/*
 * Partager son verdict, et ce que BLUSH fait de ta conv. Le lien public (/v/<id>) montre le verdict seul,
 * le prénom de l’autre masqué (le tien reste) : jamais un message, jamais un chapitre. Textes relus le 8 octobre (voix de BLUSH).
 * Les feuilles seulement : le bouton du rapport (PartageVerdict.tsx) les charge à sa première ouverture.
 */

/* Les logos de WhatsApp et de Messages, reconnaissables d’un coup d’œil (les icônes au trait se ressemblent trop) */
function GlypheWhatsApp() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" aria-hidden="true" className="text-white">
      <path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.3 20.7l4.4-1.1A8.8 8.8 0 1 0 12 3.2z" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" />
      <path
        d="M9.1 7.9c.2-.4.4-.4.6-.4h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.5l-.5.6c-.1.2-.2.3 0 .6.5.9 1.3 1.7 2.3 2.2.3.1.4.1.6-.1l.6-.7c.2-.2.3-.2.5-.1l1.6.8c.2.1.4.2.4.4 0 .5-.2 1.2-.6 1.5-.6.5-1.4.7-2.3.4-1.5-.5-2.9-1.4-4-2.6-.9-1-1.5-2-1.6-3 0-.9.3-1.6.8-2.2z"
        fill="currentColor"
      />
    </svg>
  );
}

function GlypheMessages() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" aria-hidden="true" className="text-white">
      <path d="M12 4.5c-4.7 0-8.5 3.1-8.5 7 0 2.2 1.2 4.2 3.2 5.5-.2 1-.8 2-1.7 2.8 1.6 0 3.2-.6 4.3-1.5.9.2 1.8.3 2.7.3 4.7 0 8.5-3.1 8.5-7s-3.8-7.1-8.5-7.1z" fill="currentColor" />
    </svg>
  );
}

/** Un bouton rond de partage, avec son nom dessous. Un lien quand il ouvre une appli (WhatsApp, Messages). */
function Action({ icone, nom, fond, href, onClick, pret, children }: { icone: IconName; nom: string; fond: string; href?: string; onClick?: () => void; pret: boolean; children?: ReactNode }) {
  const contenu = (
    <>
      <span
        className="flex size-14 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(17,17,20,0.07),0_10px_20px_-10px_rgba(17,17,20,0.5)] transition-[translate,box-shadow] duration-300 [transition-timing-function:var(--ease-pop)] group-hover:-translate-y-0.5 group-hover:shadow-[inset_0_0_0_1px_rgba(17,17,20,0.07),0_16px_26px_-12px_rgba(17,17,20,0.55)] group-active:translate-y-px group-active:duration-75 motion-reduce:translate-none"
        style={{ background: fond }}
      >
        {children ?? <Icon name={icone} size={22} stroke={2.3} className="text-white" />}
      </span>
      <span className="text-legende font-black text-ink">{nom}</span>
    </>
  );
  /* Le survol soulève le rond, pas toute la case (sinon un carré blanc apparaît autour) */
  const classe = cn("group flex flex-col items-center gap-2 rounded-2xl no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink", !pret && "pointer-events-none opacity-40");
  return href ? (
    <a href={pret ? href : undefined} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" aria-disabled={!pret} className={classe}>
      {contenu}
    </a>
  ) : (
    <button type="button" onClick={onClick} disabled={!pret} className={classe}>
      {contenu}
    </button>
  );
}

/**
 * Partager son verdict : l’aperçu tel qu’il s’affichera dans WhatsApp ou iMessage, puis où l’envoyer.
 * Le lien est créé à l’ouverture (toujours le même), et se désactive d’un toucher. Jamais avant le geste : c’est un lien
 * public, et un lien désactivé ne doit pas renaître tout seul à la visite suivante du rapport.
 */
export function PartageSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  /* Le lien, et le verdict tel qu’il le montre (le prénom de l’autre masqué, par le serveur) : le texte partagé reprend celui-là */
  const [lien, setLien] = useState<{ url: string; verdict: VerdictMontre | null; story?: string } | null>(null);
  const url = lien?.url ?? null;
  const [probleme, setProbleme] = useState(false);
  const [image, setImage] = useState(false);
  const [copie, setCopie] = useState(false);
  const [story, setStory] = useState<File | null>(null);
  /* L’image story n’a pas pu se préparer : le bouton le dit au toucher, au lieu de rester grisé sans raison */
  const [storyRatee, setStoryRatee] = useState(false);
  const [fait, setFait] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);

  useEffect(() => {
    if (!open || url) return;
    let fini = false;
    creerLienPartage()
      .then((l) => !fini && setLien(l))
      .catch((e) => {
        tracer("partage:lien", e);
        if (!fini) setProbleme(true);
      });
    return () => {
      fini = true;
    };
  }, [open, url, essai]);

  /* L’image story est prête avant le toucher : sur iPhone, le partage doit partir tout de suite après le geste */
  const adresseStory = lien?.story ?? (url ? `${url}/image?format=story` : null);
  useEffect(() => {
    if (!open || !adresseStory || story) return;
    let fini = false;
    fetch(adresseStory)
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => !fini && setStory(new File([b], "verdict-blush.png", { type: "image/png" })))
      .catch((e) => {
        tracer("partage:image-story", e);
        if (!fini) setStoryRatee(true);
      });
    return () => {
      fini = true;
    };
  }, [open, adresseStory, story]);

  useEffect(() => {
    if (!copie && !fait) return;
    const t = setTimeout(() => (setCopie(false), setFait(null)), 2200);
    return () => clearTimeout(t);
  }, [copie, fait]);

  /* Le verdict partagé : celui du lien, le prénom de l’autre masqué */
  const montre = lien?.verdict ?? null;
  /* Ce qu’on écrit à ses potes avec le lien : comme on le dirait (l’aperçu du lien fait le reste) */
  const texte = montre ? `j’ai fait lire notre conv à BLUSH 💀${"\n"}verdict\u00a0: ${montre.emoji} «\u00a0${montre.title}\u00a0»` : "j’ai fait lire notre conv à BLUSH 💀";
  const avecLien = url ? `${texte}${"\n"}${url}` : "";
  const pret = !!url;

  const enStory = async () => {
    if (!story) return;
    try {
      if (navigator.canShare?.({ files: [story] })) {
        await navigator.share({ files: [story] });
        return;
      }
    } catch (e) {
      /* La feuille de partage refermée sans choisir (AbortError) n’est pas un souci ; le reste se trace */
      if (nomErreur(e) !== "AbortError") tracer("partage:story", e);
      return;
    }
    /* Sur ordinateur : l’image s’enregistre, prête pour une story depuis le téléphone */
    const a = document.createElement("a");
    a.href = URL.createObjectURL(story);
    a.download = story.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setFait("Image enregistrée.");
  };

  const desactiver = async () => {
    try {
      await desactiverLienPartage();
      setLien(null);
      setStory(null);
      setImage(false);
      onClose();
    } catch (e) {
      tracer("partage:desactiver", e);
      setFait("Pas réussi. Réessaie.");
    }
  };

  const copier = async () => {
    if (url) setCopie(await copyText(url));
  };

  return (
    <Sheet open={open} onClose={onClose} title="Partager ton verdict" titleClose>

      {/* L’aperçu du lien, comme dans une conv : la carte, puis le titre et le site */}
      <figure className="m-0 overflow-hidden rounded-[22px] bg-white shadow-card">
        <div className="relative aspect-[1200/630] w-full" style={{ background: PAPIER }}>
          {url && (
            // eslint-disable-next-line @next/next/no-img-element -- l’image dessinée par le serveur, telle quelle
            <img
              src={`${url}/image`}
              alt={montre ? `${montre.emoji} ${montre.title}` : "Le verdict partagé"}
              onLoad={() => setImage(true)}
              className={cn("absolute inset-0 size-full object-cover transition-opacity duration-300", image ? "opacity-100" : "opacity-0")}
            />
          )}
          {/* Le temps que la carte soit dessinée : son verdict tel que le lien le montre, plutôt que trois points */}
          {!image && !probleme && (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
              {montre ? (
                <>
                  <span aria-hidden="true" className="text-chiffre leading-none">
                    {montre.emoji}
                  </span>
                  <span aria-hidden="true" className="line-clamp-2 text-[20px] font-black leading-[1.15] tracking-[-0.01em] text-ink [text-wrap:balance]">
                    {montre.title}
                  </span>
                </>
              ) : (
                <TypingDots label="Préparation de la carte" />
              )}
            </span>
          )}
        </div>
        <figcaption className="flex flex-col gap-0.5 px-4 py-3">
          <span className="line-clamp-2 min-h-[20px] text-detail font-black leading-[1.3] text-ink">{montre && `${montre.emoji} ${montre.title}`}</span>
          <span className="text-legende font-extrabold text-grey">askblush.com</span>
        </figcaption>
      </figure>

      {probleme ? (
        <Alert variant="voile" className="flex items-center justify-between gap-3">
          Le lien n’a pas pu être créé.
          <button
            type="button"
            onClick={() => (setProbleme(false), setEssai((e) => e + 1))}
            className="relative font-black text-ink underline underline-offset-2 after:absolute after:-inset-2 after:content-['']"
          >
            Réessayer
          </button>
        </Alert>
      ) : (
        <div className="grid grid-cols-4 gap-2 px-1 pt-1">
          <Action icone="link" nom={copie ? "Copié" : "Copier"} fond="var(--gloss), white" pret={pret} onClick={() => void copier()}>
            {copie ? <Icon name="check" size={22} stroke={3} className="text-vrai-ink" /> : <Icon name="link" size={22} stroke={2.3} className="text-ink" />}
          </Action>
          <Action icone="whatsapp" nom="WhatsApp" fond="var(--gloss), #25D366" pret={pret} href={`https://wa.me/?text=${encodeURIComponent(avecLien)}`}>
            <GlypheWhatsApp />
          </Action>
          <Action icone="imessage" nom="Messages" fond="var(--gloss), #34C759" pret={pret} href={`sms:?&body=${encodeURIComponent(avecLien)}`}>
            <GlypheMessages />
          </Action>
          <Action icone="instagram" nom="Story" fond="var(--gloss), linear-gradient(45deg, var(--attente), var(--elle) 55%, var(--flou))" pret={pret && (!!story || storyRatee)} onClick={story ? () => void enStory() : () => setFait("L’image story n’a pas pu se préparer. Réessaie dans un instant.")} />
        </div>
      )}

      <div className="flex items-start gap-2.5 rounded-[18px] bg-plaque px-3.5 py-3">
        <Icon name="shield" size={17} stroke={2.2} style={{ marginTop: 1 }} className="text-soft" />
        <p className="m-0 flex-1 text-legende font-extrabold leading-[1.45] text-soft">
          {fait ?? (
            <>
              Le lien montre ce verdict, rien d’autre{NBSP}: ni vos messages, ni son prénom.{" "}
              {url && (
                <LienDiscret onClick={() => void desactiver()}>Désactiver le lien</LienDiscret>
              )}
            </>
          )}
        </p>
      </div>
    </Sheet>
  );
}

/** Ce que BLUSH fait de ta conv, en trois lignes (src/contenu/confidentialite.ts), et la main sur tout (ton compte, la politique complète). */
export function ConfidentialiteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ligne = "items-start [&>span:first-child]:mt-0.5";
  return (
    <Sheet open={open} onClose={onClose} title={F.titre} titleClose>
      <InsetGroup>
        <InsetRow leading={<RowIcon icon="lock" tone="vrai" />} title={F.chiffree.titre} sub={F.chiffree.detail} className={ligne} />
        <InsetRow leading={<RowIcon icon="trash" />} title={F.effacee.titre} sub={F.effacee.detail} className={ligne} />
        <InsetRow leading={<RowIcon icon="eye" tone="elle" />} title={F.partage.titre} sub={F.partage.detail} className={ligne} />
      </InsetGroup>
      <InsetGroup title="Tu gardes la main">
        <InsetRow leading={<RowIcon icon="user" tone="toi" />} title="Gérer mon compte" sub="Supprime ton histoire ou ton compte quand tu veux" href="/compte" chevron />
        <InsetRow leading={<RowIcon icon="file" />} title="Notre politique de confidentialité" href="/confidentialite" chevron />
      </InsetGroup>
    </Sheet>
  );
}
