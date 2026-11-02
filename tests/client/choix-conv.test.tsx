import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChoixConv } from "@/app/importer/export/ChoixConv";

/*
 * « Quelle conv ? » (src/app/importer/export/ChoixConv.tsx), le choix d’une conv dans un export Instagram complet : le jour
 * du dernier message dit son année quand ce n’est pas l’année en cours, pour ne pas envoyer une vieille conv au même
 * prénom ; et « 1 message » au singulier. Noms inventés.
 */
afterEach(cleanup);

describe("« Quelle conv ? »", () => {
  it("l’année d’une vieille conv, et le singulier", () => {
    vi.useFakeTimers({ now: new Date("2026-11-02T10:00:00Z"), toFake: ["Date"] });
    try {
      render(
        <ChoixConv
          open
          convs={[
            { id: "a", nom: "Léa", messages: 300, derniere: "2026-10-20", groupe: false },
            { id: "b", nom: "Inès", messages: 120, derniere: "2021-03-03", groupe: false },
            { id: "c", nom: "Sacha", messages: 1, derniere: "2026-05-02", groupe: false },
          ]}
          onChoisir={() => {}}
          onClose={() => {}}
        />,
      );
      /* La recherche par texte ramène les insécables à des espaces */
      expect(screen.getByText("300 messages · jusqu’au 20 oct.")).toBeTruthy();
      expect(screen.getByText("120 messages · jusqu’au 3 mars 2021")).toBeTruthy();
      expect(screen.getByText("1 message · jusqu’au 2 mai")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
