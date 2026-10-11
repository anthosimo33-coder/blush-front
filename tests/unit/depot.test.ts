import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { ecrireSurCeQuiAEteLu, PREDICATS } from "@/server/depot";

/*
 * Le dépôt (src/server/depot.ts), sans la base : la boucle d’écriture optimiste de la mémoire, sur une valeur simulée,
 * et les prédicats communs, rendus en SQL. Leurs lectures avec la base sont essayées par les tests des écrans
 * (convs, partage, fiche-async, rapport-taches).
 */

/** Une valeur et sa version, comme une ligne de memories : `ecrire` ne passe que sur la version lue. `autres` : des écritures qui passent avant les N premières. */
function enBase(valeur: string, { autres = 0, absente = false } = {}) {
  const ligne = { valeur, version: 1 };
  let avant = autres;
  const ecritures: string[] = [];
  return {
    ligne,
    ecritures,
    lire: async () => (absente ? null : { ...ligne }),
    ecrire: async (v: string, version: number) => {
      /* Quelqu’un d’autre écrit entre la lecture et l’écriture */
      if (avant > 0) {
        avant--;
        ligne.valeur = `${ligne.valeur}+autre`;
        ligne.version++;
      }
      if (version !== ligne.version) return false;
      ecritures.push(v);
      ligne.valeur = v;
      ligne.version++;
      return true;
    },
  };
}

describe("l’écriture optimiste (modifierMemoire)", () => {
  it("écrit la valeur modifiée, une fois, sur la version lue", async () => {
    const b = enBase("A");
    expect(await ecrireSurCeQuiAEteLu(b, (v) => `${v}B`, 3)).toBe("ecrite");
    expect(b.ecritures).toEqual(["AB"]);
    expect(b.ligne).toEqual({ valeur: "AB", version: 2 });
  });

  it("une écriture passée entre-temps : la modification se refait sur la nouvelle valeur, sans rien effacer", async () => {
    const b = enBase("A", { autres: 1 });
    const vues: string[] = [];
    expect(await ecrireSurCeQuiAEteLu(b, (v) => (vues.push(v), `${v}B`), 3)).toBe("ecrite");
    expect(vues).toEqual(["A", "A+autre"]);
    expect(b.ligne.valeur).toBe("A+autre" + "B");
  });

  it("toujours devancée : « occupee » après le nombre d’essais, sans rien écrire", async () => {
    const b = enBase("A", { autres: 5 });
    let appels = 0;
    expect(await ecrireSurCeQuiAEteLu(b, (v) => (appels++, `${v}B`), 2)).toBe("occupee");
    expect(appels).toBe(2);
    expect(b.ecritures).toEqual([]);
  });

  it("rien à écrire : « inchangee », sans écriture ni nouvel essai ; pas de valeur : « absente »", async () => {
    const b = enBase("A");
    let appels = 0;
    expect(await ecrireSurCeQuiAEteLu(b, async () => (appels++, null), 3)).toBe("inchangee");
    expect([appels, b.ecritures]).toEqual([1, []]);
    expect(await ecrireSurCeQuiAEteLu(enBase("A", { absente: true }), (v) => v, 3)).toBe("absente");
  });
});

describe("les prédicats communs", () => {
  const dialecte = new PgDialect();
  const enSql = (p: Parameters<PgDialect["sqlToQuery"]>[0]) => dialecte.sqlToQuery(p);

  it("une conv du compte : son identifiant et son compte, tous deux en paramètres", () => {
    const q = enSql(PREDICATS.convDuCompte("conv-1", "compte-1")!);
    expect(q.sql).toBe(`("stories"."id" = $1 and "stories"."user_id" = $2)`);
    expect(q.params).toEqual(["conv-1", "compte-1"]);
  });

  it("lue, conv gardée, rapport prêt : sans paramètre, sur la ligne de la conv", () => {
    expect(enSql(PREDICATS.lue)).toEqual({ sql: `exists (select 1 from "tasks" where "tasks"."story_id" = "stories"."id")`, params: [] });
    expect(enSql(PREDICATS.convGardee)).toEqual({ sql: `"stories"."conv" is not null`, params: [] });
    expect(enSql(PREDICATS.rapportPret)).toEqual({ sql: `exists (select 1 from "reports" where "reports"."story_id" = "stories"."id" and "reports"."data" is not null)`, params: [] });
  });
});
