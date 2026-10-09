"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { copyText } from "@/lib/hooks";
import { compterImagePartagee, creerLienPartage, desactiverLienPartage, imagePartage, type CibleImage, type VerdictMontre } from "@/services/api";
import { BACKEND } from "@/services/mode";
import { TypingDots } from "@/components/ui/FileInput";
import { Icon, type IconName } from "@/components/ui/icons";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { Sheet } from "@/components/ui/surfaces";
import type { Verdict } from "@/types";

/*
 * Partager son verdict, et ce que BLUSH fait de ta conv. Le lien public (/v/<id>) montre le verdict seul,
 * le prénom de l’autre masqué (le tien reste) : jamais un message, jamais un chapitre. Textes relus le 8 octobre (voix de BLUSH).
 */

const N = " ";
/* Le fond de la carte (le papier de la landing), le temps que l’image arrive */
const PAPIER = "radial-gradient(70% 55% at 50% 0%, #FFFFFF 0%, rgba(255,255,255,0) 70%), #F4F2ED";

/* « Partager mon verdict » sonne (dring dring) tant qu’on ne l’a jamais ouvert, sur ce navigateur */
const CLE_OUVERT = "blush.partage.ouvert.v1";
const abonnes = new Set<() => void>();
const dejaOuvert = () => {
  try {
    return localStorage.getItem(CLE_OUVERT) === "1";
  } catch {
    return true;
  }
};
function marquerPartageOuvert() {
  try {
    localStorage.setItem(CLE_OUVERT, "1");
  } catch {
    /* Stockage refusé (navigation privée) : le bouton sonnera encore, sans gravité */
  }
  abonnes.forEach((f) => f());
}
const usePartageOuvert = () =>
  useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    dejaOuvert,
    /* Côté serveur : calme, le bouton ne sonne qu’une fois le navigateur lu */
    () => true,
  );

/** Sous l’en-tête du rapport : partager son verdict, et la promesse de confidentialité (avec le détail à un toucher). */
export function PartageEtConfidentialite({ verdict }: { verdict: Pick<Verdict, "emoji" | "title"> }) {
  const [partage, setPartage] = useState(false);
  const [confidentialite, setConfidentialite] = useState(false);
  const sonne = !usePartageOuvert();
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          setPartage(true);
          marquerPartageOuvert();
        }}
        aria-haspopup="dialog"
        data-dring={sonne ? "" : undefined}
        className="lift lift-sm inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[26px] bg-white px-5 text-[16px] font-black text-ink shadow-soft"
      >
        <span data-dring-icone={sonne ? "" : undefined} className="flex">
          <Icon name="share" size={17} color="#121214" stroke={2.4} />
        </span>
        Partager mon verdict
      </button>
      <p className="m-0 flex items-start gap-2 px-1 text-[13px] font-extrabold leading-[1.45] text-grey">
        <Icon name="shield" size={16} color="#6B6862" stroke={2.2} style={{ marginTop: 1 }} />
        <span>
          Ta conv reste privée, et c’est toi qui décides.{" "}
          <button
            type="button"
            onClick={() => setConfidentialite(true)}
            aria-haspopup="dialog"
            className="relative font-black text-ink underline decoration-[rgba(17,17,20,0.25)] underline-offset-2 after:absolute after:-inset-2 after:content-['']"
          >
            En savoir plus
          </button>
        </span>
      </p>
      <PartageSheet open={partage} onClose={() => setPartage(false)} verdict={verdict} />
      <ConfidentialiteSheet open={confidentialite} onClose={() => setConfidentialite(false)} />
    </div>
  );
}

function EnTete({ id, titre, onClose }: { id: string; titre: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="m-0 text-[24px] font-black leading-[1.1] tracking-[-0.02em]">
        {titre}
      </h2>
      <button type="button" aria-label="Fermer" onClick={onClose} className="lift lift-sm flex size-10 shrink-0 items-center justify-center rounded-full bg-white shadow-soft">
        <Icon name="close" size={16} color="#121214" stroke={2.8} />
      </button>
    </div>
  );
}

/* Les logos de WhatsApp et de Messages, reconnaissables d’un coup d’œil (les icônes au trait se ressemblent trop) */
function GlypheWhatsApp() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.3 20.7l4.4-1.1A8.8 8.8 0 1 0 12 3.2z" fill="none" stroke="#FFFFFF" strokeWidth={1.9} strokeLinejoin="round" />
      <path
        d="M9.1 7.9c.2-.4.4-.4.6-.4h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.5l-.5.6c-.1.2-.2.3 0 .6.5.9 1.3 1.7 2.3 2.2.3.1.4.1.6-.1l.6-.7c.2-.2.3-.2.5-.1l1.6.8c.2.1.4.2.4.4 0 .5-.2 1.2-.6 1.5-.6.5-1.4.7-2.3.4-1.5-.5-2.9-1.4-4-2.6-.9-1-1.5-2-1.6-3 0-.9.3-1.6.8-2.2z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

function GlypheMessages() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4.5c-4.7 0-8.5 3.1-8.5 7 0 2.2 1.2 4.2 3.2 5.5-.2 1-.8 2-1.7 2.8 1.6 0 3.2-.6 4.3-1.5.9.2 1.8.3 2.7.3 4.7 0 8.5-3.1 8.5-7s-3.8-7.1-8.5-7.1z" fill="#FFFFFF" />
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
        {children ?? <Icon name={icone} size={22} color="#FFFFFF" stroke={2.3} />}
      </span>
      <span className="text-[13px] font-black text-ink">{nom}</span>
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
 * Le lien est créé à l’ouverture (toujours le même), et se désactive d’un toucher.
 */
export function PartageSheet({ open, onClose, verdict }: { open: boolean; onClose: () => void; verdict: Pick<Verdict, "emoji" | "title"> }) {
  /* Le lien, et le verdict tel qu’il le montre (le prénom de l’autre masqué, par le serveur) : le texte partagé reprend celui-là */
  const [lien, setLien] = useState<{ url: string; verdict: VerdictMontre | null } | null>(null);
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
      .catch(() => !fini && setProbleme(true));
    return () => {
      fini = true;
    };
  }, [open, url, essai]);

  /* L’image story est prête avant le toucher : sur iPhone, le partage doit partir tout de suite après le geste */
  useEffect(() => {
    if (!open || !url || story) return;
    let fini = false;
    fetch(`${url}/image?format=story`)
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => !fini && setStory(new File([b], "verdict-blush.png", { type: "image/png" })))
      .catch(() => !fini && setStoryRatee(true));
    return () => {
      fini = true;
    };
  }, [open, url, story]);

  useEffect(() => {
    if (!copie && !fait) return;
    const t = setTimeout(() => (setCopie(false), setFait(null)), 2200);
    return () => clearTimeout(t);
  }, [copie, fait]);

  /* Le verdict partagé : celui du lien, le prénom de l’autre masqué. La démo n’a pas de vrai lien : son verdict tel quel */
  const montre = lien?.verdict ?? (BACKEND ? null : verdict);
  /* Ce qu’on écrit à ses potes avec le lien : comme on le dirait (l’aperçu du lien fait le reste) */
  const texte = montre ? `j’ai fait lire notre conv à BLUSH 💀${"\n"}verdict : ${montre.emoji} « ${montre.title} »` : "j’ai fait lire notre conv à BLUSH 💀";
  const avecLien = url ? `${texte}${"\n"}${url}` : "";
  const pret = !!url;

  const enStory = async () => {
    if (!story) return;
    try {
      if (navigator.canShare?.({ files: [story] })) {
        await navigator.share({ files: [story] });
        return;
      }
    } catch {
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
    } catch {
      setFait("Pas réussi. Réessaie.");
    }
  };

  return (
    <Sheet open={open} onClose={onClose} labelledBy="partage-titre">
      <EnTete id="partage-titre" titre="Partager ton verdict" onClose={onClose} />

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
          {!image && !probleme && (
            <span className="absolute inset-0 flex items-center justify-center">
              <TypingDots label="Préparation de la carte" />
            </span>
          )}
        </div>
        <figcaption className="flex flex-col gap-0.5 px-4 py-3">
          <span className="line-clamp-2 min-h-[20px] text-[15px] font-black leading-[1.3] text-ink">{montre && `${montre.emoji} ${montre.title}`}</span>
          <span className="text-[13px] font-extrabold text-grey">askblush.com</span>
        </figcaption>
      </figure>

      {probleme ? (
        <p role="alert" className="m-0 flex items-center justify-between gap-3 rounded-[18px] bg-[rgba(229,72,77,0.08)] px-4 py-3 text-[14px] font-extrabold text-[#C2363B]">
          Le lien n’a pas pu être créé.
          <button
            type="button"
            onClick={() => (setProbleme(false), setEssai((e) => e + 1))}
            className="relative font-black text-ink underline underline-offset-2 after:absolute after:-inset-2 after:content-['']"
          >
            Réessayer
          </button>
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-2 px-1 pt-1">
          <Action icone="link" nom={copie ? "Copié" : "Copier"} fond="var(--gloss), #FFFFFF" pret={pret} onClick={async () => url && setCopie(await copyText(url))}>
            {copie ? <Icon name="check" size={22} color="#087A56" stroke={3} /> : <Icon name="link" size={22} color="#121214" stroke={2.3} />}
          </Action>
          <Action icone="whatsapp" nom="WhatsApp" fond="var(--gloss), #25D366" pret={pret} href={`https://wa.me/?text=${encodeURIComponent(avecLien)}`}>
            <GlypheWhatsApp />
          </Action>
          <Action icone="imessage" nom="Messages" fond="var(--gloss), #34C759" pret={pret} href={`sms:?&body=${encodeURIComponent(avecLien)}`}>
            <GlypheMessages />
          </Action>
          <Action icone="instagram" nom="Story" fond="var(--gloss), linear-gradient(45deg, #FFAA2C, #FF4F9A 55%, #9B7BFF)" pret={pret && (!!story || storyRatee)} onClick={story ? enStory : () => setFait("L’image story n’a pas pu se préparer. Réessaie dans un instant.")} />
        </div>
      )}

      <div className="flex items-start gap-2.5 rounded-[18px] bg-plaque px-3.5 py-3">
        <Icon name="shield" size={17} color="#4B4A47" stroke={2.2} style={{ marginTop: 1 }} />
        <p className="m-0 flex-1 text-[13px] font-extrabold leading-[1.45] text-soft">
          {fait ?? (
            <>
              Le lien montre ce verdict, rien d’autre{N}: ni vos messages, ni son prénom.{" "}
              {url && (
                <button
                  type="button"
                  onClick={desactiver}
                  className="relative font-black text-ink underline decoration-[rgba(17,17,20,0.25)] underline-offset-2 after:absolute after:-inset-2 after:content-['']"
                >
                  Désactiver le lien
                </button>
              )}
            </>
          )}
        </p>
      </div>
    </Sheet>
  );
}

/** Ce que BLUSH fait de ta conv, en trois lignes, et la main sur tout (ton compte, la politique complète). */
export function ConfidentialiteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ligne = "items-start [&>span:first-child]:mt-0.5";
  return (
    <Sheet open={open} onClose={onClose} labelledBy="confidentialite-titre">
      <EnTete id="confidentialite-titre" titre="Ta conv reste à toi." onClose={onClose} />
      <InsetGroup>
        <InsetRow
          leading={<RowIcon icon="lock" tone="vrai" />}
          title="Chiffrée, lue seulement par l’IA"
          sub="Ta conv, ton rapport et le chat sont chiffrés. Personne chez BLUSH ne les lit."
          className={ligne}
        />
        <InsetRow
          leading={<RowIcon icon="trash" />}
          title="Effacée dès ton rapport écrit"
          sub={`La conv brute part dès que ton rapport est prêt. Sans rapport, elle reste chiffrée jusqu’à ce que tu le débloques. Jamais lue, au bout de 24${N}h.`}
          className={ligne}
        />
        <InsetRow
          leading={<RowIcon icon="eye" tone="elle" />}
          title="Rien ne sort sans toi"
          sub="La personne avec qui tu parles n’est jamais contactée. Quand tu partages, seul ton verdict part, sans son prénom."
          className={ligne}
        />
      </InsetGroup>
      <InsetGroup title="Tu gardes la main">
        <InsetRow leading={<RowIcon icon="user" tone="toi" />} title="Gérer mon compte" sub="Supprime ton histoire ou ton compte quand tu veux" href="/compte" chevron />
        <InsetRow leading={<RowIcon icon="file" />} title="Notre politique de confidentialité" href="/confidentialite" chevron />
      </InsetGroup>
    </Sheet>
  );
}

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
    if (!cible || !cle) return;
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
    /* cle résume la cible : on ne redessine que si elle change */
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
