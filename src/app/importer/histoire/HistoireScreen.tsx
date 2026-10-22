"use client";

import { useState } from "react";
import { AppBadge } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { ParcoursScreen } from "@/components/shell/ParcoursScreen";
import { ScreenTitle } from "@/components/shell/Screen";
import { formatCount, NBSP } from "@/lib/format";
import { minimumDeMessages, tropCourte } from "@/lib/morceaux";
import { moiEtAutre } from "@/lib/participants";
import { APPLIS, NOM_AUTRE_APPLI, type Source, type Story } from "@/types";
import { FeuilleMorceau } from "../FeuilleMorceau";

/* Ici, des captures d’une autre appli se disent « Autre appli » */
const APP_NAME = { ...APPLIS, autre: NOM_AUTRE_APPLI };

/** L’autre personne, quand on sait qui c’est : « Qui es-tu ? » rempli, ou un nom qui l’a désignée (story.other). */
const autreDe = (story: Story) => (story.me ? moiEtAutre(story).autre : story.participants.find((p) => p.id === story.other));

/** Les doublons retirés, dits simplement : « ils étaient dans les deux exports », ou dans deux morceaux. */
function phraseDesDoublons(n: number, sources: Source[]): string {
  const exports = sources.every((s) => s.mode === "export");
  const ou = exports ? (sources.length === 2 ? "dans les deux exports" : "dans plusieurs exports") : "dans deux morceaux à la fois";
  return n > 1 ? `${formatCount(n)} messages en double retirés\u00a0: ils étaient ${ou}.` : `1 message en double retiré\u00a0: il était ${ou}.`;
}

/*
 * Écran 05 — Votre histoire réunie (une conv en plusieurs morceaux, src/server/morceaux.ts) : le total en grand, puis
 * les morceaux du plus ancien au plus récent, en une seule liste, et ce que BLUSH a retiré en double. « Ajouter un autre
 * morceau » rouvre la feuille de l’écran 04 (`ajout` : la conv peut en recevoir un de plus). Encore trop courte : ajouter
 * un morceau devient le bouton fort.
 */
export function HistoireScreen({ story, ajout }: { story: Story; ajout: boolean }) {
  const [feuille, setFeuille] = useState(false);
  const autre = autreDe(story);
  const courte = tropCourte(story);
  const doublons = story.duplicatesRemoved ?? 0;
  return (
    <ParcoursScreen
      step={1}
      /* La page d’avant (l’écran du morceau ajouté) : /importer/ok renverrait ici, la conv ayant plusieurs morceaux */
      back={{ repli: "/commencer" }}
      contentGap={22}
      head={
        <>
          <div className="text-legende font-black text-vrai-ink">BLUSH a tout remis dans l’ordre</div>
          <ScreenTitle size={30}>Votre histoire, d’un bout à l’autre.</ScreenTitle>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-chiffre font-black leading-none tracking-[-0.035em] tabular-nums">{formatCount(story.totalMessages)}</span>
            <span className="text-corps font-black text-soft">
              messages · {story.durationLabel} · {story.sources.length} morceaux
            </span>
          </div>
        </>
      }
      footer={
        courte && ajout ? (
          <Button onClick={() => setFeuille(true)}>Ajouter un morceau</Button>
        ) : (
          <ButtonLink href="/qui" arrow disabled={courte}>
            Continuer
          </ButtonLink>
        )
      }
    >
      <div className="flex flex-col gap-2">
        <InsetGroup>
          {story.sources.map((s, i) => (
            <InsetRow
              key={s.id}
              leading={
                <span className="relative flex flex-col items-center">
                  <AppBadge app={s.app} size={40} radius={11} />
                  <span className="sr-only">{`Morceau ${i + 1}`}</span>
                </span>
              }
              title={
                <span className="flex items-center gap-2">
                  {APP_NAME[s.app]}
                  <span className="rounded-full bg-plaque px-2 py-0.5 text-[11px] font-black text-grey">{s.mode === "export" ? "export" : "captures"}</span>
                </span>
              }
              /* data-prive : son prénom et la période, masqués dans l’enregistrement des visites */
              sub={
                <span data-prive="">
                  {s.mode === "captures" ? `${s.screenshotCount} capture${(s.screenshotCount ?? 0) > 1 ? "s" : ""} · ` : autre ? `Avec ${autre.name} · ` : ""}
                  {s.period}
                </span>
              }
              trailing={
                <span className="flex shrink-0 flex-col items-end">
                  <span className="text-corps font-black tabular-nums">{formatCount(s.messageCount)}</span>
                  <span className="text-[11.5px] font-extrabold text-grey">messages</span>
                </span>
              }
            />
          ))}
          {ajout && (
            <InsetRow
              leading={<RowIcon icon="plus" tone="vrai" />}
              title={<span className="text-toi-ink">Ajouter un autre morceau</span>}
              onClick={() => setFeuille(true)}
              chevron
            />
          )}
        </InsetGroup>
        {doublons > 0 && (
          <p className="m-0 flex items-start gap-2 px-4 text-[12.5px] font-extrabold leading-[1.45] text-grey">
            <Icon name="check" size={15} stroke={2.8} style={{ marginTop: 1 }} className="shrink-0 text-vrai-ink" />
            <span>{phraseDesDoublons(doublons, story.sources)}</span>
          </p>
        )}
      </div>

      {/* TODO(produit): texte nouveau, absent de la maquette (une conv réunie encore trop courte) */}
      {courte && (
        <p className="m-0 flex items-start gap-2 rounded-[18px] bg-plaque px-3.5 py-3 text-note font-extrabold leading-[1.45] text-soft">
          <Icon name="clock" size={17} style={{ marginTop: 1 }} className="text-soft" />
          <span>
            C’est encore court pour une lecture juste{NBSP}: il faut au moins {minimumDeMessages(story)} messages. Ajoute un autre morceau de votre histoire.
          </span>
        </p>
      )}

      {ajout && <FeuilleMorceau open={feuille} onClose={() => setFeuille(false)} />}
    </ParcoursScreen>
  );
}
