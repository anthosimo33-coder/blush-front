"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/icons";
import { InsetGroup, InsetRow } from "@/components/ui/inset";
import { Sheet } from "@/components/ui/surfaces";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";

/*
 * L’export Instagram complet contient toutes les convs : on laisse choisir la bonne, dans le navigateur.
 * Seule celle-là part chez BLUSH, les autres ne quittent jamais le téléphone. Textes relus le 8 octobre (voix de BLUSH).
 */

export type { ConvInstagram } from "@/services/preparer-export";
import type { ConvInstagram } from "@/services/preparer-export";

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const quand = (iso: string) => `${+iso.slice(8, 10)}\u00a0${MOIS[+iso.slice(5, 7) - 1]}`;
const sansAccents = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function ChoixConv({ open, convs, onChoisir, onClose }: { open: boolean; convs: ConvInstagram[]; onChoisir: (id: string) => void; onClose: () => void }) {
  const [cherche, setCherche] = useState("");
  /* Les convs à deux d’abord, les plus longues en haut : la bonne est presque toujours dans les premières */
  const triees = [...convs].sort((a, b) => Number(a.groupe) - Number(b.groupe) || b.messages - a.messages);
  const visibles = cherche.trim() ? triees.filter((c) => sansAccents(c.nom).includes(sansAccents(cherche.trim()))) : triees.slice(0, 12);
  return (
    <Sheet open={open} onClose={onClose} labelledBy="choix-conv-titre">
      <h2 id="choix-conv-titre" className="m-0 text-[26px] font-black leading-[1.05] tracking-[-0.02em] lg:text-titre-2">
        Quelle conv{NBSP}?
      </h2>
      <p className="m-0 text-note font-bold leading-[1.45] text-soft lg:text-detail">
        Ton export contient {convs.length}{NBSP}convs. Choisis celle avec la personne{NBSP}: seule celle-là part chez BLUSH, les autres ne quittent pas ton appareil.
      </p>
      <label className="flex h-[52px] items-center gap-3 rounded-field bg-white pl-4 pr-2 shadow-[inset_0_0_0_1px_rgba(17,17,20,0.09)] focus-within:shadow-[inset_0_0_0_2px_var(--elle),0_0_0_4px_rgb(255_79_154/0.16)]">
        <Icon name="people" size={19} stroke={2} className="text-muted" />
        <input
          value={cherche}
          onChange={(e) => setCherche(e.target.value)}
          placeholder="Chercher un prénom ou un pseudo"
          aria-label="Chercher une conv"
          className="h-full min-w-0 flex-1 border-none bg-transparent text-corps font-extrabold text-ink outline-none placeholder:text-grey"
        />
      </label>
      {/*
       * Plus de quatre convs : une hauteur fixe. Sur mobile, la feuille est posée en bas et suit son contenu : une liste qui
       * rétrécit à chaque lettre faisait descendre le champ de recherche, jusque sous le clavier (et Safari refaisait défiler).
       * La liste garde sa hauteur dans la zone qui défile (shrink-0) : sinon elle se tassait à la hauteur de la zone, et ses
       * dernières convs étaient coupées au lieu de défiler.
       */}
      <InsetGroup
        footer={!cherche.trim() && convs.length > visibles.length ? `Les ${visibles.length} plus longues. Cherche un prénom pour voir les autres.` : undefined}
        className={cn(convs.length > 4 ? "h-[min(52dvh,440px)]" : "max-h-[52dvh]", "overflow-y-auto lg:max-h-[420px] [&>*]:shrink-0")}
      >
        {visibles.map((c) => (
          <InsetRow
            key={c.id}
            leading={
              <Avatar tone={c.groupe ? "toi" : "elle"} size={40} fontSize={16}>
                {c.groupe ? <Icon name="people" size={18} stroke={2.2} className="text-white" /> : (c.nom.match(/\p{L}/u)?.[0]?.toUpperCase() ?? "?")}
              </Avatar>
            }
            title={<span className={cn(c.groupe && "text-grey")}>{c.nom}</span>}
            sub={c.groupe ? "Groupe · BLUSH lit les convs à deux" : `${c.messages.toLocaleString("fr-FR")}\u00a0messages${c.derniere ? ` · jusqu’au ${quand(c.derniere)}` : ""}`}
            chevron={!c.groupe}
            onClick={c.groupe ? undefined : () => onChoisir(c.id)}
          />
        ))}
        {!visibles.length && <p className="m-0 px-4 py-4 text-note font-extrabold text-grey">Aucune conv à ce nom.</p>}
      </InsetGroup>
    </Sheet>
  );
}
