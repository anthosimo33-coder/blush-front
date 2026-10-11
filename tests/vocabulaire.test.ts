import { describe, expectTypeOf, it } from "vitest";
import type { Devinette, Objectif, Pronom as PronomDesPrompts } from "@prompts/lib/conv";
import type { Memoire, Niveau } from "@prompts/lib/schemas";
import type { Meta } from "@/server/histoires";
import type { AppKind, FicheFact, Goal, Guess, LevelId, Pronom } from "@/types";

/*
 * Le vocabulaire du domaine est écrit deux fois : dans src/types pour l’appli, et dans prompts/lib, le sous-module, qui
 * n’importe rien de l’appli. Les vérifications de types sont faites par tsc (npm run check) : un mot ajouté ou retiré
 * d’un seul côté le fait échouer, avant tout test.
 */
describe("le vocabulaire de l’appli et celui des prompts", () => {
  it("les devinettes, les objectifs, les pronoms, les niveaux et les rubriques de la fiche sont les mêmes", () => {
    expectTypeOf<Guess>().toEqualTypeOf<Devinette>();
    expectTypeOf<Goal>().toEqualTypeOf<Objectif>();
    expectTypeOf<Pronom>().toEqualTypeOf<PronomDesPrompts>();
    /* Le niveau qu’écrit le modèle (verdict, mémoire, chat) est celui que montre l’appli, sans conversion */
    expectTypeOf<LevelId>().toEqualTypeOf<Niveau>();
    /* La rubrique d’une info de sa fiche : écrite par la mémoire (prompt 07), montrée telle quelle (src/server/ecrans/fiche.ts) */
    expectTypeOf<FicheFact["section"]>().toEqualTypeOf<NonNullable<Memoire["fiche"]>["faits"][number]["section"]>();
  });

  it("une conv vient d’une des applis de l’appli", () => {
    expectTypeOf<Meta["appli"]>().toEqualTypeOf<AppKind>();
  });
});
