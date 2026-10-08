"use client";

import { useState } from "react";
import { ExportScreen } from "../../importer/export/ExportScreen";
import { ChoixConv, type ConvInstagram } from "../../importer/export/ChoixConv";

/* Des convs inventées, comme dans un vrai export : beaucoup de petites, quelques longues, des groupes */
const CONVS: ConvInstagram[] = [
  { id: "1", nom: "Inès 🌸", messages: 1073, derniere: "2026-09-27", groupe: false },
  { id: "2", nom: "maxime.drn", messages: 412, derniere: "2026-10-02", groupe: false },
  { id: "3", nom: "Les zinzins du jeudi", messages: 2381, derniere: "2026-10-06", groupe: true },
  { id: "4", nom: "Léa", messages: 288, derniere: "2026-08-14", groupe: false },
  { id: "5", nom: "Yanis", messages: 156, derniere: "2026-09-30", groupe: false },
  { id: "6", nom: "camille_pht", messages: 97, derniere: "2026-07-21", groupe: false },
  { id: "7", nom: "Coloc 2.0", messages: 640, derniere: "2026-10-05", groupe: true },
  { id: "8", nom: "Sarah B", messages: 61, derniere: "2026-06-03", groupe: false },
  ...Array.from({ length: 34 }, (_, k) => ({ id: `x${k}`, nom: `contact${k + 1}`, messages: 40 - k, derniere: "2026-05-10", groupe: false })),
];

export function ApercuChoixConv() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <ExportScreen initialApp="instagram" />
      <ChoixConv open={open} convs={CONVS} onChoisir={() => setOpen(false)} onClose={() => setOpen(false)} />
    </>
  );
}
