"use client";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { NBSP } from "@/lib/format";

/*
 * La page du mode tournage, où mène le lien d’une conv de tournage (src/server/tournage.ts) : pour la créatrice, jamais
 * filmée. Ce que fait le mode, comment filmer, et le quitter (un formulaire : POST /tournage/fin). `nom` : le nom de la
 * conv de tournage (sa campagne), ou null : pas de mode tournage sur ce navigateur. `prenom` : celui que son lien porte.
 * Les étapes, relues le 16 octobre : l’outil des créatrices recopie les mêmes dans ses missions, à changer ensemble.
 */

const ETAPES = [
  "Touche «\u00a0Commencer une prise\u00a0», puis WhatsApp.",
  "Sur «\u00a0Exporte votre conv.\u00a0», touche «\u00a0Choisir le fichier enregistré\u00a0»\u00a0: BLUSH prend tout seul la conv de ce lien. Tu n’as aucun fichier à chercher.",
  "Réponds à «\u00a0Qui es-tu\u00a0?\u00a0», puis connecte-toi avec ton email (une fois suffit).",
  "BLUSH lit la conv pendant 40 secondes, puis montre le verdict et le rapport en entier.",
  "Une nouvelle prise remplace la précédente\u00a0: recommence autant de fois que tu veux.",
];

export function TournageScreen({ nom, prenom = null }: { nom: string | null; prenom?: string | null }) {
  if (!nom)
    return (
      <Screen
        mobileTop={<MobileTopBar back="/" />}
        desktopBack={{ target: "/" }}
        head={
          <>
            <ScreenTitle>Ce lien de tournage ne marche plus.</ScreenTitle>
            <Lead size={15} weight={800}>
              Il a été arrêté, ou il est incomplet. Demande le bon lien à l’équipe BLUSH, et ouvre-le tel quel sur le téléphone qui filme.
            </Lead>
          </>
        }
        footer={
          <ButtonLink href="/" arrow>
            Revenir à l’accueil
          </ButtonLink>
        }
      >
        <span />
      </Screen>
    );

  return (
    <Screen
      mobileTop={<MobileTopBar back="/" />}
      desktopBack={{ target: "/" }}
      head={
        <>
          <span className="self-start rounded-full bg-ink px-2.5 py-1 text-legende font-black text-white">Mode tournage</span>
          <ScreenTitle>
            Prête à filmer{prenom && `, ${prenom}`}
            {NBSP}?
          </ScreenTitle>
          <Lead size={15} weight={800}>
            Pour «{NBSP}
            {nom}
            {NBSP}», BLUSH rejoue sur ce téléphone une lecture déjà faite{NBSP}: le même verdict et le même rapport à chaque prise. Rien ne se paie, et rien de ce mode ne s’affiche
            pendant que tu filmes.
          </Lead>
        </>
      }
      footer={
        <div className="flex w-full flex-col items-center gap-1">
          <ButtonLink href="/commencer" arrow>
            Commencer une prise
          </ButtonLink>
          <form method="post" action="/tournage/fin">
            <Button type="submit" variant="link">
              Quitter le mode tournage
            </Button>
          </form>
        </div>
      }
    >
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {ETAPES.map((e, k) => (
          <li key={k} className="flex items-start gap-3 rounded-[18px] bg-white p-4 text-detail font-extrabold text-ink shadow-soft">
            <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-elle text-legende font-black text-white">
              {k + 1}
            </span>
            <span className="pt-0.5">{e}</span>
          </li>
        ))}
      </ol>
    </Screen>
  );
}
