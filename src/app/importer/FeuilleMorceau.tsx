"use client";

import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { AppTile } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/surfaces";
import { tuilesDAjout } from "@/contenu/parcours";

/*
 * Une conv en plusieurs morceaux (src/server/morceaux.ts) : la feuille « Ajoute un morceau », sur l’écran de la conv
 * reçue (/importer/ok) et sur l’histoire réunie (/importer/histoire). Les quatre tuiles de « Vous vous parlez où ? »,
 * vers les mêmes écrans en mode ajout : le morceau rejoint la conv qu’on importe, puis l’histoire réunie se montre.
 */
export function FeuilleMorceau({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Ajoute un morceau" titleSize={26} titleClose>
      <p className="m-0 text-detail font-bold leading-[1.4] text-soft">Avec la même personne, sur n’importe quelle appli. BLUSH remet tout dans l’ordre.</p>
      <nav aria-label="Ce que tu ajoutes" className="grid grid-cols-2 gap-3">
        {tuilesDAjout().map((t) => (
          <AppTile key={t.app} {...t} />
        ))}
      </nav>
    </Sheet>
  );
}

/**
 * La ligne qui ouvre la feuille, seule dans son groupe : « Il manque un bout de votre histoire ? » sur la conv reçue.
 * `note` : la phrase grise dessous.
 */
export function LigneMorceau({ titre, sous, note, onClick }: { titre: string; sous?: string; note?: string; onClick: () => void }) {
  return (
    <InsetGroup footer={note}>
      <InsetRow leading={<RowIcon icon="plus" tone="vrai" />} title={<span className="text-toi-ink">{titre}</span>} sub={sous} onClick={onClick} chevron />
    </InsetGroup>
  );
}
