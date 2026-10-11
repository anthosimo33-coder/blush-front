import type { ReactNode } from "react";
import { formatCount } from "@/lib/format";
import { titreDuo } from "@/lib/participants";
import { AvatarPair } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/cards";
import { Chip } from "@/components/ui/controls";
import { Tag } from "@/components/ui/messages";
import type { Report, Story } from "@/types";

/**
 * Un chiffre de l’en-tête : sa valeur, son nom sous elle (mobile), et sa pastille (ordinateur). La pastille garde son
 * texte en morceaux (le nombre, l’espace, le nom) : d’un seul tenant, Chrome le place à un sous-pixel près ailleurs
 * (vu sur les captures de référence, tests/e2e/visuel.spec.ts).
 */
type Chiffre = { valeur: string; nom: string; pastille: ReactNode };

/** Les chiffres de la conv, une fois pour les deux mises en page : les messages, les applis, les vocaux, le temps de lecture. */
function chiffresDuRapport(story: Story, report: Report, entier: boolean): Chiffre[] {
  const messages = formatCount(story.totalMessages);
  const applis = story.sources.length === 1 ? "appli" : "applis";
  const vocaux = story.voiceCount === 1 ? "vocal" : "vocaux";
  const lecture = entier ? report.readingTime.full : report.readingTime.free;
  return [
    { valeur: messages, nom: "messages", pastille: <>{messages} messages</> },
    {
      valeur: String(story.sources.length),
      nom: applis,
      pastille: (
        <>
          {story.sources.length} {applis}
        </>
      ),
    },
    {
      valeur: String(story.voiceCount),
      nom: vocaux,
      pastille: (
        <>
          {story.voiceCount} {vocaux}
        </>
      ),
    },
    { valeur: lecture, nom: "de lecture", pastille: lecture },
  ];
}

/**
 * L’en-tête du rapport : vos initiales, vos prénoms, la période de la conv, et ses chiffres (rangés en grille sur
 * mobile, en pastilles sur ordinateur, comme la maquette). `entier` : avec l’accès au rapport (« Complet »).
 */
export function EnTeteRapport({ story, report, entier, moi, autre }: { story: Story; report: Report; entier: boolean; moi: string; autre: string }) {
  const chiffres = chiffresDuRapport(story, report, entier);
  return (
    <Card className="flex flex-col gap-2.5 p-[18px]">
      <div className="flex items-center justify-between">
        <div className="text-legende font-black text-grey">Le rapport de votre histoire</div>
        {entier ? (
          <Tag tone="ink" size="md">
            Complet
          </Tag>
        ) : (
          <Tag tone="apercu" size="md" />
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <AvatarPair me={moi} other={autre} />
        <h1 className="m-0 text-titre-2 font-black leading-[1.05] tracking-[-0.02em] [text-wrap:balance]">{titreDuo(story)}</h1>
      </div>
      <div className="text-legende font-bold leading-[1.45] text-grey">
        {story.period} · {story.updatedLabel}
      </div>
      {/* Mobile : les chiffres rangés en grille ; desktop : les pastilles de la maquette */}
      <dl className="m-0 mt-1 grid grid-cols-4 gap-2 border-t-2 border-sep pt-3.5 lg:hidden">
        {chiffres.map((c) => (
          <div key={c.nom} className="flex min-w-0 flex-col-reverse gap-0.5">
            <dt className="text-micro font-extrabold text-grey">{c.nom}</dt>
            <dd className="m-0 whitespace-nowrap text-[19px] font-black leading-tight tabular-nums">{c.valeur}</dd>
          </div>
        ))}
      </dl>
      <div className="hidden flex-wrap gap-2 lg:flex">
        {chiffres.map((c) => (
          <Chip key={c.nom}>{c.pastille}</Chip>
        ))}
      </div>
    </Card>
  );
}
