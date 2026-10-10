import { describe, expectTypeOf, it } from "vitest";
import type { Devinette, Objectif, Pronom as PronomDesPrompts } from "@prompts/lib/conv";
import type { FaitAffiche } from "@prompts/lib/front";
import type { Meta } from "@/server/histoires";
import type { AppKind, FicheFact, Goal, Guess, Pronom } from "@/types";

/*
 * Le vocabulaire du domaine est écrit deux fois : dans src/types pour l’appli, et dans prompts/lib, le sous-module, qui
 * n’importe rien de l’appli. Les vérifications de types sont faites par tsc (npm run check) : un mot ajouté ou retiré
 * d’un seul côté le fait échouer, avant tout test.
 */
describe("le vocabulaire de l’appli et celui des prompts", () => {
  it("les devinettes, les objectifs, les pronoms et les rubriques de la fiche sont les mêmes", () => {
    expectTypeOf<Guess>().toEqualTypeOf<Devinette>();
    expectTypeOf<Goal>().toEqualTypeOf<Objectif>();
    expectTypeOf<Pronom>().toEqualTypeOf<PronomDesPrompts>();
    expectTypeOf<FicheFact["section"]>().toEqualTypeOf<FaitAffiche["section"]>();
  });

  it("une conv vient d’une des applis de l’appli", () => {
    expectTypeOf<Meta["appli"]>().toEqualTypeOf<AppKind>();
  });
});
