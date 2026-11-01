import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { blocAjout, numeroter } from "@prompts/lib/ajouts";
import { versTexteCaptures } from "@prompts/lib/captures";
import { lire, rendre, type Histoire, type Message } from "@prompts/lib/conv";
import { estLigneMessage, estLigneProfil, idDeLigne, idMessage, ligneMessage, ligneProfil, lireLigne, parIdentifiant, rangDe } from "@prompts/lib/ligne";
import { rendreMemoire, rendreNouveau, rendreNouveaux, type Echange } from "@prompts/lib/memoire";
import { faitsAffiches } from "@/server/ecrans/fiche";
import { messagesAffiches } from "@/server/ecrans/messages";
import { captures, memoire, msg } from "../aide/fabriques";

/*
 * Le format des lignes de la conv (« m0412 2026-03-02 lun. 23:41 Sophie : … ») : le modèle les lit, les cite comme
 * preuves, et la mémoire les garde. Ces empreintes ont été prises avant que lib/ligne.ts ne rassemble ce format :
 * tout ce qui écrit ou relit une ligne doit rester identique à l’octet.
 */

const empreinte = (x: unknown) =>
  createHash("sha256")
    .update(typeof x === "string" ? x : JSON.stringify(x))
    .digest("hex")
    .slice(0, 16);

/* Deux prénoms inventés ; des messages sur plusieurs lignes, des médias, un message géant, un message modifié */
const debut = Date.UTC(2024, 1, 3, 8, 15, 0);
const pad = (n: number) => String(n).padStart(2, "0");
const entete = (k: number) => {
  const d = new Date(debut + k * 53 * 60e3);
  return `[${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00] `;
};
const corps = (k: number) =>
  k % 37 === 5
    ? "audio omitted"
    : k % 41 === 7
      ? "on y va ? image omitted"
      : k % 43 === 9
        ? "première ligne\ndeuxième ligne"
        : k === 120
          ? "bla ".repeat(1500)
          : k % 29 === 3
            ? "j’arrive <This message was edited>"
            : `message ${k} : ça va ?`;
const texte = Array.from({ length: 400 }, (_, k) => `${entete(k)}${k % 3 ? "Inès 🌸" : "Hugo S"}: ${corps(k)}`).join("\n");

const h: Histoire = {
  utilisateur: { prenom: "Hugo", pronom: "il", nomExport: "Hugo S" },
  autre: { prenom: "Inès", pronom: "elle", nomExport: "Inès 🌸" },
  devinette: "vus",
  objectif: "comprendre",
  appli: "whatsapp",
  format: "whatsapp-ios",
};

describe("les lignes de la conv, à l’octet", () => {
  it("la conv rendue au modèle", () => {
    const lu = lire(texte, h, { autresEnTexte: true });
    const r = rendre(h, lu);
    /* Le 31 octobre 2026, la ligne des médias de <chiffres> compte aussi les médias légendés (« on y va ? [photo] ») : seule elle a changé */
    expect(empreinte(r.texte)).toBe("6945380b3085d771");
    expect(empreinte([...r.lignes])).toBe("ebf8fd27ca9faa58");
  });

  it("des captures, à l’heure approximative", () => {
    const c = versTexteCaptures(
      captures({
        autre: "Inès",
        blocs: [
          { repere: { date: "2024-02-20", heure: "21:05" }, messages: Array.from({ length: 12 }, (_, k) => msg(k % 2 ? "autre" : "moi", `capture ${k}`)) },
          {
            repere: { date: "2024-02-21", heure: null },
            messages: Array.from({ length: 12 }, (_, k) => msg(k % 2 ? "moi" : "autre", `suite ${k}`, { media: k === 3 ? "photo" : null })),
          },
        ],
      }),
      { aujourdhui: "2024-02-22" },
    );
    const hc: Histoire = { ...h, format: "captures", utilisateur: { ...h.utilisateur, nomExport: "Moi" }, autre: { ...h.autre, nomExport: c.autre } };
    const r = rendre(hc, lire(c.texte, hc));
    /* De même : la photo légendée des captures compte dans les médias */
    expect(empreinte(r.texte)).toBe("66a6cbb817182577");
  });

  it("les messages ajoutés, son profil, et le bloc <nouveau> du chat", () => {
    const messages: Message[] = lire(texte, h, { autresEnTexte: true }).messages.slice(390);
    const a = numeroter(messages, ["24 ans\nétudiante", "aime le libanais"], h, { debut: 1077, aujourdhui: "2024-02-20" });
    expect(empreinte(a)).toBe("bdf5947e744b9e8a");
    expect(empreinte(blocAjout(a))).toBe("ed2e3e53c26b3907");
    expect(empreinte(blocAjout(a, 3))).toBe("6c503677cafdb12e");
  });

  it("la mémoire : les messages ajoutés par capture et les lignes déjà numérotées", () => {
    const echange: Echange = {
      date: "2024-02-21",
      messages: [
        { qui: "toi", quand: "2024-02-21 10:02", texte: "tu fais quoi" },
        { qui: "autre", quand: "2024-02-21 10:09", texte: "rien et toi" },
        { qui: "autre", quand: "2024-02-21 10:10", texte: "mdr" },
      ],
      lignes: ["m10001 2024-02-21 mer. 11:00 Inès : ok", "m10002 2024-02-21 mer. --:-- profil de Inès : 24 ans"],
      dit: "elle m’a répondu",
      reponse: ["Ok.", "Elle relance."],
    };
    const nouveau = rendreNouveau(echange, h, 9998);
    expect(empreinte(nouveau.texte)).toBe("22202185409dca34");
    expect(empreinte([...nouveau.lignes])).toBe("947c162c4461b5e9");
    expect(nouveau.suivant).toBe(10001);
    /* Rien de ce qu’elle reçoit ne change : un second essai rend le même bloc, avec les mêmes identifiants */
    expect(rendreNouveau(echange, h, 9998)).toEqual(nouveau);
  });

  it("la mémoire : un message ajouté sur plusieurs lignes reste une ligne (« ⏎ », comme dans la conv)", () => {
    const nouveau = rendreNouveau({ date: "2024-02-21", messages: [{ qui: "autre", quand: "2024-02-21 10:09", texte: "a\nb" }] }, h, 12);
    expect(nouveau.texte).toBe('<nouveau date="2024-02-21 mer.">\nmessages ajoutés à la conv, par capture :\nm0012 2024-02-21 mer. 10:09 Inès : a ⏎ b\n</nouveau>');
    expect(nouveau.lignes.get("m0012")).toBe("m0012 2024-02-21 mer. 10:09 Inès : a ⏎ b");
  });

  it("la mémoire groupée : un bloc par échange, dans l’ordre, les messages numérotés à la suite d’un échange à l’autre", () => {
    const capture = (texte: string) => ({ qui: "autre" as const, quand: "2024-02-21 10:09", texte });
    const premier: Echange = { date: "2024-02-21", messages: [capture("a"), capture("b")], dit: "elle m’a répondu", reponse: ["Ok."] };
    const second: Echange = { date: "2024-02-22", messages: [capture("c")], dit: "et là ?" };
    const groupe = rendreNouveaux([premier, second], h, 12);
    expect(groupe.blocs).toEqual([rendreNouveau(premier, h, 12).texte, rendreNouveau(second, h, 14).texte]);
    expect([...groupe.lignes.keys()]).toEqual(["m0012", "m0013", "m0014"]);
    expect(groupe.suivant).toBe(15);
    /* Un seul échange : le bloc d’avant, mot pour mot */
    expect(rendreNouveaux([premier], h, 12).blocs).toEqual([rendreNouveau(premier, h, 12).texte]);
  });

  it("les preuves affichées et les sources de sa fiche", () => {
    const r = rendre(h, lire(texte, h, { autresEnTexte: true }));
    const lignes = new Map([...r.lignes, ["m0401", "m0401 2024-02-20 mar. --:-- profil de Inès : 24 ans ⏎ étudiante"]]);
    expect(empreinte([...messagesAffiches(lignes, "Hugo")])).toBe("34bdf6ba3a173510");
    const etat = memoire({
      memoire: { moments: [{ quand: "2024-02-04", quoi: "le resto", preuves: ["m0012", "m0400", "m0401", "m0009"] }] },
      fiche: {
        faits: [
          { section: "infos", texte: "24 ans", preuves: ["m0401"], statut: "nouveau" },
          { section: "aime", texte: "le libanais", preuves: ["m0012", "m0013"], statut: "garde" },
          { section: "notes", texte: "d’après lui", preuves: [], statut: "garde" },
        ],
      },
    });
    expect(empreinte(faitsAffiches(etat, lignes))).toBe("0659d6a8d69eea22");
    expect(empreinte(rendreMemoire(etat, lignes))).toBe("a3a4fef719bec830");
  });
});

describe("lib/ligne.ts : écrire une ligne, la relire", () => {
  it("l’identifiant : quatre chiffres au moins, dans l’ordre de la conv au-delà de 9 999", () => {
    expect([1, 412, 9999, 10000, 123456].map(idMessage)).toEqual(["m0001", "m0412", "m9999", "m10000", "m123456"]);
    expect(["m10000", "m9999", "m0002"].sort((a, b) => rangDe(a) - rangDe(b))).toEqual(["m0002", "m9999", "m10000"]);
  });

  it("à l’octet : le jour de la semaine, l’heure, le nom, le texte sur une seule ligne", () => {
    expect(ligneMessage({ id: "m0412", jour: "2026-03-02", heure: "23:41", nom: "Sophie", texte: "on se voit samedi ?" })).toBe(
      "m0412 2026-03-02 lun. 23:41 Sophie : on se voit samedi ?",
    );
    expect(ligneMessage({ id: "m0413", jour: "2026-03-02", heure: "~23:50", nom: "Hugo", texte: "oui\ncarrément" })).toBe("m0413 2026-03-02 lun. ~23:50 Hugo : oui ⏎ carrément");
    expect(ligneProfil("m1080", "2026-03-15", "Sophie", "24 ans\nétudiante")).toBe("m1080 2026-03-15 dim. --:-- profil de Sophie : 24 ans ⏎ étudiante");
  });

  it("aller-retour : ce qu’on écrit se relit tel quel, deux-points du texte compris", () => {
    const parties = [
      { id: "m0001", jour: "2024-02-29", heure: "08:05", nom: "Inès 🌸", texte: "réveillée : oui, motivée : non" },
      { id: "m10001", jour: "2024-12-31", heure: "--:--", nom: "Hugo S", texte: "[photo]" },
      { id: "m0042", jour: "2025-01-01", heure: "~00:01", nom: "Léa", texte: "" },
    ];
    for (const p of parties) expect(lireLigne(ligneMessage(p))).toEqual({ ...p, profil: false });
    expect(lireLigne(ligneProfil("m0900", "2026-03-15", "Sophie", "aime le libanais"))).toMatchObject({
      id: "m0900",
      nom: "profil de Sophie",
      texte: "aime le libanais",
      profil: true,
    });
  });

  it("ce qui n’est pas une ligne de message ne se relit pas", () => {
    for (const l of [
      "[… 12 messages ne sont pas montrés ici]",
      "<conversation>",
      "m12 2024-01-01 lun. 10:00 Léa : trop court",
      "m0001 2024-01-01 lun. 10:00 Léa sans deux-points",
    ]) {
      expect(lireLigne(l)).toBeNull();
    }
    expect(estLigneMessage("m0001 2024-01-01 lun. 10:00 Léa : ok")).toBe(true);
    expect(estLigneMessage("[… 12 messages ne sont pas montrés ici]")).toBe(false);
  });

  it("son profil n’est pas un message, même quand un message en parle", () => {
    expect(estLigneProfil(ligneProfil("m0900", "2026-03-15", "Sophie", "24 ans"))).toBe(true);
    expect(estLigneProfil("m0901 2026-03-15 dim. 10:00 Hugo : regarde sa bio --:-- profil de Sophie : 24 ans")).toBe(false);
    expect(estLigneProfil("m0902 2026-03-15 dim. --:-- Sophie : on se voit ?")).toBe(false);
    /* Une seule règle : un profil n’a pas d’heure, une ligne qui en a une est un message, quel que soit son nom */
    expect(lireLigne("m0903 2026-03-15 dim. 10:00 profil de Sophie : salut")?.profil).toBe(false);
    expect(estLigneProfil("m0903 2026-03-15 dim. 10:00 profil de Sophie : salut")).toBe(false);
  });

  it("un profil dont le texte a un « \\r » seul ou un U+2028 (une bio lue sur une capture) reste un profil, relu tel quel", () => {
    for (const bio of ["bio\u2028deux", "bio\rdeux", "bio\u2029deux"]) {
      const l = ligneProfil("m0900", "2026-03-15", "Sophie", bio);
      expect(estLigneProfil(l)).toBe(true);
      expect(lireLigne(l)).toMatchObject({ nom: "profil de Sophie", texte: bio, profil: true });
    }
  });

  it("une ligne forgée (« : » des milliers de fois, puis un U+2028) se relit, en temps linéaire", () => {
    const l = ligneMessage({ id: "m0001", jour: "2026-01-01", heure: "10:00", nom: "Léa", texte: `${"a : ".repeat(10_000)}\u2028` });
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) expect(lireLigne(l)?.nom).toBe("Léa");
    /* En temps quadratique, ces 20 lectures prenaient des secondes */
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it("idDeLigne et parIdentifiant : la banque des preuves", () => {
    const lignes = [ligneMessage({ id: "m0007", jour: "2024-01-01", heure: "10:00", nom: "Léa", texte: "a b c" }), ligneProfil("m0008", "2024-01-02", "Léa", "x")];
    expect(lignes.map(idDeLigne)).toEqual(["m0007", "m0008"]);
    expect([...parIdentifiant(lignes).keys()]).toEqual(["m0007", "m0008"]);
    expect(parIdentifiant(lignes).get("m0008")).toBe(lignes[1]);
  });
});
