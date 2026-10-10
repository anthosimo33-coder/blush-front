"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useSoundOnce } from "@/lib/sound";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { MobileTopBar, Screen } from "@/components/shell/Screen";

/** Les erreurs du parcours d’import, posées dans l’adresse (`?erreur=<code>`) : voir ErreurDeParcours. */
export const ERREURS_PARCOURS = ["fichier", "groupe", "courte", "lecture", "capture", "video", "longue"] as const;
export type ErreurParcours = (typeof ERREURS_PARCOURS)[number];

/* Écrans d’erreur : un titre, une phrase, une action. Textes absents des maquettes, relus le 8 octobre. */
export const ERROR_COPY: Record<ErreurParcours, { title: string; text: string; action: string; href: string; back: string }> = {
  fichier: {
    title: "On n’arrive pas à lire ce fichier.",
    text: "Exporte à nouveau votre discussion, sans médias, puis choisis le fichier enregistré.",
    action: "Choisir un autre fichier",
    href: "/importer/export",
    back: "/importer/export",
  },
  groupe: {
    title: "C’est une conversation de groupe.",
    text: "BLUSH analyse seulement les conversations à deux. Exporte votre discussion privée.",
    action: "Choisir une autre conv",
    href: "/commencer",
    back: "/commencer",
  },
  courte: {
    title: "Votre conv est encore trop courte.",
    text: "Il faut au moins 50 messages pour un verdict juste. Ajoute des captures du début, ou reviens dans quelques jours.",
    action: "Ajouter des captures",
    href: "/importer/captures?mode=ajout",
    back: "/importer/ok",
  },
  lecture: {
    title: "L’analyse n’a pas abouti.",
    text: "Rien n’est perdu : ta conv est toujours là. Relance l’analyse.",
    action: "Relancer l’analyse",
    href: "/lecture",
    back: "/email",
  },
  capture: {
    title: "Cette capture est illisible.",
    text: "On ne voit pas bien les messages. Refais la capture en entier, sans la recadrer.",
    action: "Choisir d’autres captures",
    href: "/importer/captures",
    back: "/importer/captures",
  },
  video: {
    title: "Je n’arrive pas à lire cette vidéo.",
    text: "Choisis l’enregistrement tel quel, depuis ton iPhone : sans le recadrer ni le monter.",
    action: "Choisir une autre vidéo",
    href: "/importer/captures",
    back: "/importer/captures",
  },
  longue: {
    title: "Ton enregistrement est trop long.",
    text: "Refais-le plus court : remonte un peu plus vite, ou arrête-toi là où votre histoire commence vraiment.",
    action: "Refaire un enregistrement",
    href: "/importer/captures",
    back: "/importer/captures",
  },
};

type Copie = (typeof ERROR_COPY)[ErreurParcours];

/**
 * Le texte et les liens d’une erreur, d’après l’écran où elle arrive : réessayer garde son appli (`?app=`) et son mode.
 * Une conv trop courte : sur des captures, en choisir plus (20 messages suffisent) ; sur un export, passer aux captures
 * (réunir un export et des captures arrive plus tard).
 */
function copieDe(kind: ErreurParcours, chemin: string, params: URLSearchParams): Copie {
  const c = ERROR_COPY[kind];
  const reste = new URLSearchParams(params);
  reste.delete("erreur");
  const requete = reste.toString();
  const ici = requete ? `${chemin}?${requete}` : chemin;
  const app = params.get("app");
  if (kind === "courte" && chemin === "/importer/captures")
    return {
      ...c,
      text: "Il faut au moins 20 messages pour un verdict juste. Ajoute des captures, depuis le début de votre conv, ou reviens dans quelques jours.",
      action: "Choisir plus de captures",
      href: ici,
      back: ici,
    };
  if (kind === "courte")
    return {
      ...c,
      text: "Un export doit avoir au moins 50 messages pour un verdict juste. En captures, 20 suffisent : envoie celles de votre conv, ou reviens dans quelques jours.",
      action: "Envoyer des captures",
      href: app ? `/importer/captures?app=${encodeURIComponent(app)}` : "/importer/captures",
      back: ici,
    };
  if (kind === "fichier" || kind === "capture" || kind === "video" || kind === "longue") return { ...c, href: ici, back: ici };
  return c;
}

export function ErrorScreen({ kind }: { kind: ErreurParcours }) {
  const c = copieDe(kind, usePathname(), useSearchParams());
  /* Une erreur se dit doucement : deux touchers sourds, sans buzzer */
  useSoundOnce("non");
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="error-title" aria-describedby="error-text" className="fixed inset-0 z-50 overflow-y-auto [background:var(--paper-light)] bg-paper">
      <Screen mobileTop={<MobileTopBar back={c.back} />} desktopBack={{ target: c.back }} centered mainWidth={520} frameWidth={520} footer={<ButtonLink href={c.href}>{c.action}</ButtonLink>}>
        {/* Centré, calme : une icône, ce qui se passe, ce qu’on fait. Pas d’alarme. */}
        <div className="flex flex-1 flex-col items-center justify-center pb-10 text-center lg:flex-none lg:pb-0 lg:pt-[max(24px,calc(50dvh_-_330px))]">
          <span aria-hidden="true" className="flex size-[76px] items-center justify-center rounded-full bg-plaque">
            <Icon name="alert" size={34} color="#121214" stroke={2.2} />
          </span>
          <h1 id="error-title" className="m-0 mt-5 text-[30px] font-black leading-[1.08] tracking-[-0.02em] [text-wrap:balance] lg:text-[34px]">
            {c.title}
          </h1>
          <p id="error-text" className="m-0 mt-3 max-w-[400px] text-[16px] font-extrabold leading-[1.45] text-soft">
            {c.text}
          </p>
        </div>
      </Screen>
    </div>
  );
}
