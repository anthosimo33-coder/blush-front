import { describe, expect, it } from "vitest";
import { DOMAINES_CONNUS, distance, nomDeMessagerie, suggestionEmail } from "@/lib/domaines-email";

/* Les fautes de frappe dans le domaine d’un email (src/lib/domaines-email.ts) : ce que le champ propose, et ce qu’il laisse */

describe("la suggestion d’un domaine mal tapé", () => {
  it.each([
    ["alex@gmial.com", "alex@gmail.com"],
    ["alex@gmai.com", "alex@gmail.com"],
    ["alex@gamil.com", "alex@gmail.com"],
    ["alex@gmail.con", "alex@gmail.com"],
    ["alex@gmail.co", "alex@gmail.com"],
    ["alex@gmail.fr", "alex@gmail.com"],
    ["Alex.Lgrs@GMAIL.FR.", "Alex.Lgrs@gmail.com"],
    ["alex@hotmial.fr", "alex@hotmail.fr"],
    ["alex@hotmail.fe", "alex@hotmail.fr"],
    ["alex@hotmail.co", "alex@hotmail.com"],
    ["alex@hotmal.com", "alex@hotmail.com"],
    ["alex@outlok.fr", "alex@outlook.fr"],
    ["alex@icloud.fr", "alex@icloud.com"],
    ["alex@iclod.com", "alex@icloud.com"],
    ["alex@yahoo.fe", "alex@yahoo.fr"],
    ["alex@ornage.fr", "alex@orange.fr"],
    ["alex@laposte.nett", "alex@laposte.net"],
    ["alex@me.con", "alex@me.com"],
  ])("%s → %s", (tape, voulu) => {
    expect(suggestionEmail(tape)).toBe(voulu);
  });

  it.each([
    /* Les domaines qu’on sait bons */
    "alex@gmail.com",
    "alex@hotmail.fr",
    "alex@hotmail.co.uk",
    "alex@ymail.com",
    "alex@email.com",
    "alex@mail.com",
    /* De vrais domaines, loin des extensions de leur messagerie : ceux des salariés */
    "alex@orange.com",
    "alex@laposte.fr",
    "alex@free.com",
    /* Trop courts pour deviner (« sfr », « live ») ou loin de toute messagerie */
    "alex@sfrr.fr",
    "alex@liv.fr",
    "alex@etu.univ-lyon1.fr",
    "alex@blush.test",
    /* Pas un email */
    "alex",
    "@gmial.com",
    "alex@gmial",
  ])("%s : rien à proposer", (tape) => {
    expect(suggestionEmail(tape)).toBeNull();
  });

  it("la distance compte une lettre changée, ajoutée, retirée, ou deux voisines interverties", () => {
    expect([distance("gmail", "gmail"), distance("gmial", "gmail"), distance("gmai", "gmail"), distance("gnail", "gmail"), distance("hotmial", "hotmail")]).toEqual([
      0, 1, 1, 1, 1,
    ]);
    expect(distance("com", "fr")).toBe(3);
  });

  it("les domaines connus : chaque messagerie avec ses extensions, sans les fautes", () => {
    expect(DOMAINES_CONNUS.has("gmail.com")).toBe(true);
    expect(DOMAINES_CONNUS.has("outlook.fr")).toBe(true);
    expect(DOMAINES_CONNUS.has("gmail.fr")).toBe(false);
  });
});

describe("le nom de la messagerie", () => {
  it.each([
    ["alex@gmail.com", "Gmail"],
    ["alex@HOTMAIL.FR", "Outlook"],
    ["alex@live.be", "Outlook"],
    ["alex@icloud.com", "iCloud"],
    ["alex@yahoo.fr", "Yahoo"],
    ["alex@wanadoo.fr", "Orange"],
    ["alex@free.fr", null],
    ["alex@gmial.com", null],
    ["alex@exemple.fr", null],
  ])("%s : %s", (email, nom) => {
    expect(nomDeMessagerie(email)).toBe(nom);
  });
});
