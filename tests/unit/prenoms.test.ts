import { describe, expect, it } from "vitest";
import { messagesDeLExport } from "@prompts/lib/ajouts";
import { versTexteCaptures } from "@prompts/lib/captures";
import { accordDesNoms, memeCle, nomsDistincts, prenomDe, prenomEcrit, prenomsDuSurnom } from "@prompts/lib/noms";
import { doutePrenom, nomLu } from "@/lib/participants";
import { messagesAffiches } from "@/server/ecrans/messages";
import { contactDuFichier, memePrenom, relier, type ConvEnMorceaux, type Morceau, type MorceauRecu } from "@/server/morceaux";
import { captures, msg } from "../aide/fabriques";

/*
 * Les prénoms d’une conv (prompts/lib/noms.ts, src/lib/participants.ts, src/server/morceaux.ts) : le prénom lu dans un nom
 * de contact, ce qui en fait un doute que « Qui es-tu ? » lève, la clé qui retrouve la même personne d’un morceau ou d’un
 * export à l’autre, et deux noms distincts pour deux personnes au même prénom. Les noms sont inventés.
 */

describe("le prénom d’un nom de contact (prenomDe)", () => {
  it("un prénom suivi d’autre chose : le prénom seul, comme avant", () => {
    for (const [nom, prenom] of [
      ["Hugo S", "Hugo"],
      ["Inès 🌸", "Inès"],
      ["Anne-Sophie", "Anne-Sophie"],
      ["léa.dbs", "léa"],
      ["D’Artagnan", "D’Artagnan"],
      ["Mia Martin", "Mia"],
      ["My Nguyen", "My"],
      ["Doudou Diop", "Doudou"],
      ["Ange Martin", "Ange"],
      ["Amor B", "Amor"],
      ["Mari Carmen", "Mari"],
      ["Ma", "Ma"],
    ])
      expect(prenomDe(nom!)).toBe(prenom);
  });

  it("un surnom tendre après un possessif ou un article reste entier, sans ses emojis ; un possessif devant un prénom, ou un titre, est sauté", () => {
    for (const [nom, prenom] of [
      ["Mon amour ❤️", "Mon amour"],
      ["Ma chérie 💕", "Ma chérie"],
      ["My love 💕", "My love"],
      ["Mi amor", "Mi amor"],
      ["L’amour de ma vie ❤️", "L’amour de ma vie"],
      ["Mon petit cœur ❤️", "Mon petit cœur"],
      ["Ma reine 👑", "Ma reine"],
      ["Mon crush 😍", "Mon crush"],
      ["Mon Chat 🐱", "Mon Chat"],
      ["Mon Petit Chat", "Mon Petit Chat"],
      ["Ma Petite Léa", "Léa"],
      ["My Queen 👑", "My Queen"],
      ["Ma Léa ❤️", "Léa"],
      ["Mon Hugo 💙", "Hugo"],
      ["Dr. Léa Martin", "Léa"],
      ["M. Dupont", "Dupont"],
    ])
      expect(prenomDe(nom!)).toBe(prenom);
  });

  it("un numéro et un compte supprimé restent tels quels ; un prénom écrit à l’écran garde tous ses mots", () => {
    expect(prenomDe("+33 6 12 34 56 78")).toBe("+33 6 12 34 56 78");
    expect(prenomDe("Utilisateur Instagram")).toBe("Utilisateur Instagram");
    expect(prenomEcrit(" Anne Sophie 🌸 ")).toBe("Anne Sophie");
  });
});

describe("le nom de l’autre dit-il son prénom (doutePrenom)", () => {
  it("rien ne le dit : « Qui es-tu ? » le demande", () => {
    for (const nom of ["Elle", "+33 6 12 34 56 78", "❤️❤️", "Utilisateur Instagram", "Instagram User", "Mon ❤️", "Ma 💍", "Mon❤️"]) {
      expect(nomLu(nom)).toBe(false);
      expect(doutePrenom(nom)).toBe("unknown");
    }
  });

  it("un surnom : l’écran propose de l’écrire", () => {
    for (const nom of [
      "Mon amour ❤️",
      "Bébé ❤️",
      "Chéri",
      "bb",
      "My love 💕",
      "M. Dupont",
      "Habibi ❤️",
      "Husband ❤️",
      "L’amour de ma vie ❤️",
      "Love ❤️",
      "Nounours 🧸",
      "Mon petit cœur ❤️",
      "Ma reine 👑",
      "Mon crush 😍",
      "Mon Petit Cœur",
      "Mon Chat 🐱",
      "Ma Biche 🦌",
      "Mon Loup",
      "Ma Fiancée 💍",
      "MON CHAT",
      "Mon Ex 💔",
      "My Queen 👑",
    ])
      expect(doutePrenom(nom)).toBe("nickname");
  });

  it("un mot à majuscule après un possessif (« Ma Léa ») : sans doute le prénom, mais l’écran propose de l’écrire", () => {
    for (const nom of ["Ma Léa ❤️", "Ma Petite Léa", "Mon Bichon"]) expect(doutePrenom(nom)).toBe("nickname");
  });

  it("un prénom : rien à demander", () => {
    for (const nom of [
      "Léa",
      "Hugo S",
      "Dr. Léa Martin",
      "Mia Martin",
      "My Nguyen",
      "Doudou Diop",
      "Ange Martin",
      "Amor B",
      "Mari Carmen",
      "Hayati Yilmaz",
      "Trésor Mputu",
      "Princesse Kouassi",
      "Bonheur Mbala",
      "Loup Martin",
      "Ma",
      "Anne-Sophie",
      "Moi",
      "𝓛𝓮𝓪 🦋",
    ])
      expect(doutePrenom(nom)).toBeUndefined();
  });
});

describe("le même prénom, d’un morceau à l’autre (memeCle, memePrenom, contactDuFichier)", () => {
  it("les prénoms composés, les accents et les lettres stylisées d’Instagram", () => {
    expect(memePrenom("Anne-Sophie", "Anne Sophie Martin")).toBe(true);
    expect(memePrenom("Marie-Lou 🌸", "Marie Lou")).toBe(true);
    expect(memePrenom("Léa", "𝓛𝓮𝓪 🦋")).toBe(true);
    expect(memePrenom("Lea", "LÉA")).toBe(true);
    expect(memePrenom("Ma Léa ❤️", "Léa")).toBe(true);
    expect(memePrenom("Léa", "Sarah")).toBe(false);
  });

  it("deux prénoms composés différents, deux surnoms différents, deux numéros, deux noms d’emojis : pas la même personne", () => {
    expect(memeCle("Marie-Claire", "Marie-Lou")).toBe(false);
    expect(memeCle("Anne-Sophie", "Anne-Laure")).toBe(false);
    expect(memeCle("Ma chérie ❤️", "Ma mère")).toBe(false);
    expect(memeCle("+33 7 98 76 54 32", "+33 6 12 34 56 78")).toBe(false);
    expect(memeCle("+33 6 12 34 56 78", "+33 6 12 34 56 78")).toBe(true);
    expect(memeCle("🦋", "🍑")).toBe(false);
  });

  it("les mêmes mots valent mieux que le même début (accord)", () => {
    expect(accordDesNoms("Marie-Lou Martin", "Marie-Lou 🌸")).toBe(2);
    expect(accordDesNoms("Marie Dupont", "Marie-Lou 🌸")).toBe(1);
    expect(accordDesNoms("Marie-Claire", "Marie-Lou")).toBe(0);
    /* Un diminutif : la même personne, de loin */
    expect(accordDesNoms("Anne-So", "Anne-Sophie")).toBe(1);
    expect(accordDesNoms("Marie-Jo", "Marie-Josée Martin")).toBe(1);
    expect(accordDesNoms("Anne-Laure", "Anne-Sophie")).toBe(0);
    expect(accordDesNoms("Anne-Laure", "Anne-Laurence")).toBe(0);
    expect(accordDesNoms("Jean-Marc", "Jean-Marcel")).toBe(0);
  });

  it("le fichier désigne un contact au prénom composé, et pas un autre prénom composé du même début", () => {
    expect(contactDuFichier("Discussion WhatsApp avec Anne-Sophie.txt", ["Hugo", "Anne-Sophie"])).toBe("Anne-Sophie");
    expect(contactDuFichier("WhatsApp Chat - Marie-Lou 🌸.zip", ["Tom", "Marie-Lou 🌸"])).toBe("Marie-Lou 🌸");
    expect(contactDuFichier("WhatsApp Chat with Jean-Baptiste.txt", ["Tom", "Jean-Baptiste"])).toBe("Jean-Baptiste");
    expect(contactDuFichier("WhatsApp Chat - Mon amour ❤️.zip", ["Tom", "Mon amour ❤️"])).toBe("Mon amour ❤️");
    expect(contactDuFichier("Discussion WhatsApp avec Marie-Lou.txt", ["Marie-Claire", "Marie-Lou"])).toBe("Marie-Lou");
  });
});

describe("deux personnes au même prénom (nomsDistincts)", () => {
  const p = (nom: string, prenom = prenomDe(nom)) => ({ nom, prenom });

  it("des prénoms différents restent tels quels", () => {
    expect(nomsDistincts([p("Hugo"), p("Léa 🌸")], 1)).toEqual(["Hugo", "Léa"]);
  });

  it("l’initiale du mot qui suit le prénom, sinon les emojis du nom, jamais un nom de famille entier", () => {
    expect(nomsDistincts([p("Léa Martin"), p("Léa Dubois")], 1)).toEqual(["Léa M.", "Léa D."]);
    expect(nomsDistincts([p("Alex"), p("Alex B")], 1)).toEqual(["Alex", "Alex B."]);
    expect(nomsDistincts([p("Léa"), p("léa.dbs")], 1)).toEqual(["Léa", "léa D."]);
    expect(nomsDistincts([p("Léa"), p("Léa 🌸")], 1)).toEqual(["Léa", "Léa 🌸"]);
    expect(nomsDistincts([p("Léa Martin"), p("Léa Moreau")], 1)).toEqual(["Léa", "Léa (l’autre)"]);
  });

  it("rien ne les distingue : l’autre devient « (l’autre) », une fois qu’on sait qui il est", () => {
    expect(nomsDistincts([p("Léa Moreau"), p("Léa Martin")], 0)).toEqual(["Léa (l’autre)", "Léa"]);
    expect(nomsDistincts([p("Léa Martin"), p("Léa Moreau")])).toEqual(["Léa", "Léa"]);
    /* Des captures : ton prénom écrit, égal au sien, ne doit rien à « Moi » */
    expect(nomsDistincts([p("Moi", "Léa"), p("Léa")], 1)).toEqual(["Léa", "Léa (l’autre)"]);
    /* À un accent ou une majuscule près, le modèle ne les distinguerait pas non plus */
    expect(nomsDistincts([p("Inès"), p("Ines")], 1)).toEqual(["Inès", "Ines (l’autre)"]);
    expect(nomsDistincts([p("Moi", "lea"), p("Léa")], 1)).toEqual(["lea", "Léa (l’autre)"]);
  });
});

/** Un export WhatsApp d’iPhone inventé : `n` messages, un par minute à partir du 1er octobre 2026 à 10:00, `toi` et `autre` en alternance. */
const exportIos = (toi: string, autre: string, n = 40, depuis = 0) =>
  Array.from(
    { length: n },
    (_, k) => `[01/10/2026 ${10 + Math.floor((depuis + k) / 60)}:${String((depuis + k) % 60).padStart(2, "0")}:00] ${(depuis + k) % 2 ? autre : toi}: message ${depuis + k}`,
  ).join("\n");

describe("un nouvel export après le rapport (messagesDeLExport)", () => {
  const h = (autre: string, nomExport = autre) => ({
    utilisateur: { prenom: "Hugo", pronom: "il" as const, nomExport: "Hugo" },
    autre: { prenom: autre, pronom: "elle" as const, nomExport },
  });

  it("le même prénom, sans les mêmes accents ou avec un trait d’union : la même conv", () => {
    expect(messagesDeLExport(exportIos("Hugo", "Lea"), h("Léa", "Léa"), 0)).toEqual(expect.any(Array));
    expect(messagesDeLExport(exportIos("Hugo", "Anne Sophie"), h("Anne-Sophie"), 0)).toEqual(expect.any(Array));
  });

  it("un autre numéro, ou un autre prénom : une autre conv", () => {
    expect(messagesDeLExport(exportIos("Hugo", "+33 7 98 76 54 32"), h("+33 6 12 34 56 78"), 0)).toBe("autre_conv");
    expect(messagesDeLExport(exportIos("Hugo", "Sarah"), h("Léa"), 0)).toBe("autre_conv");
  });

  it("un contact renommé sur « Qui es-tu ? » se retrouve par son nom d’export, même quand ses emojis changent", () => {
    expect(messagesDeLExport(exportIos("Hugo", "Bébé 💕"), h("Léa", "Bébé ❤️"), 0)).toEqual(expect.any(Array));
  });

  it("deux surnoms différents, deux noms d’emojis : une autre conv", () => {
    expect(messagesDeLExport(exportIos("Hugo", "Ma mère"), h("Ma chérie", "Ma chérie ❤️"), 0)).toBe("autre_conv");
    expect(messagesDeLExport(exportIos("Hugo", "🍑"), h("🦋"), 0)).toBe("autre_conv");
  });

  it("ton prénom est le début du sien (Marie et Marie-Lou) : elle se retrouve par tous les mots de son prénom", () => {
    const marie = {
      utilisateur: { prenom: "Marie", pronom: "elle" as const, nomExport: "Marie" },
      autre: { prenom: "Marie-Lou", pronom: "elle" as const, nomExport: "Marie-Lou 🌸" },
    };
    const lus = messagesDeLExport(exportIos("Marie Dupont", "Marie-Lou Martin"), marie, 0);
    if (!Array.isArray(lus)) throw new Error(lus);
    expect([...new Set(lus.filter((m) => m.role === "autre").map((m) => m.nom))]).toEqual(["Marie-Lou Martin"]);
  });

  it("un prénom composé écrit avec une espace (« Anne Sophie ») ne retrouve pas Anne-Laure", () => {
    expect(messagesDeLExport(exportIos("Hugo", "Anne-Laure"), h("Anne Sophie", "Mon cœur 💕"), 0)).toBe("autre_conv");
  });

  it("ton nom d’export n’est jamais l’autre", () => {
    const marie = {
      utilisateur: { prenom: "Marie-Claire", pronom: "elle" as const, nomExport: "Marie-Claire" },
      autre: { prenom: "Marie", pronom: "elle" as const, nomExport: "Marie-Lou" },
    };
    expect(messagesDeLExport(exportIos("Marie-Claire", "Bébé ❤️"), marie, 0)).toBe("autre_conv");
  });

  it("deux Léa : l’autre est celle qui n’est pas toi, ou qui a les mots de son nom d’export ; sinon, l’export est refusé plutôt que lu à l’envers", () => {
    const deux = {
      utilisateur: { prenom: "Léa M.", pronom: "elle" as const, nomExport: "Léa Martin" },
      autre: { prenom: "Léa D.", pronom: "elle" as const, nomExport: "Léa Dubois" },
    };
    const autresDe = (lus: ReturnType<typeof messagesDeLExport>) => {
      if (!Array.isArray(lus)) throw new Error(lus);
      return [...new Set(lus.filter((m) => m.role === "autre").map((m) => m.nom))];
    };
    expect(autresDe(messagesDeLExport(exportIos("Léa Martin", "Léa D 🌸"), deux, 0))).toEqual(["Léa D 🌸"]);
    expect(autresDe(messagesDeLExport(exportIos("Léa M", "Léa Dubois 🌸"), deux, 0))).toEqual(["Léa Dubois 🌸"]);
    /* Une conv née de captures : tu es « Moi », et son nom lu en haut ne dit que son prénom (« Léa 🌸 ») : on ne sait pas qui est qui */
    const enHaut = { utilisateur: { prenom: "Léa", pronom: "elle" as const, nomExport: "Moi" }, autre: { prenom: "Léa 🌸", pronom: "elle" as const, nomExport: "Léa 🌸" } };
    for (const [a, b] of [
      ["Léa", "Léa Dubois"],
      ["Léa Dubois", "Léa"],
      ["Léa ✨", "Léa Dubois"],
    ] as const)
      expect(messagesDeLExport(exportIos(a, b), enHaut, 0)).toBe("autre_conv");
    /* Son nom lu en haut a les mots de ton prénom : on ne sait pas non plus */
    const anne = {
      utilisateur: { prenom: "Anne-Sophie", pronom: "elle" as const, nomExport: "Moi" },
      autre: { prenom: "Anne", pronom: "elle" as const, nomExport: "Anne Sophie" },
    };
    expect(messagesDeLExport(exportIos("Anne-Sophie", "Anne-Sophie Dubois"), anne, 0)).toBe("autre_conv");
    /* Un surnom renommé de ton prénom (« Bébé ❤️ » devenue Léa) : son nom d’export la retrouve, même avec un autre emoji */
    const bebe = { utilisateur: { prenom: "Léa", pronom: "elle" as const, nomExport: "Moi" }, autre: { prenom: "Léa (l’autre)", pronom: "elle" as const, nomExport: "Bébé ❤️" } };
    expect(autresDe(messagesDeLExport(exportIos("Léa", "Bébé 💕"), bebe, 0))).toEqual(["Bébé 💕"]);
    /* Une conv née de captures : tu es « Moi », et l’autre n’est que « Léa » */
    const captures = { utilisateur: { prenom: "Léa", pronom: "elle" as const, nomExport: "Moi" }, autre: { prenom: "Léa (l’autre)", pronom: "elle" as const, nomExport: "Léa" } };
    expect(messagesDeLExport(exportIos("Léa Martin", "Léa Dubois"), captures, 0)).toBe("autre_conv");
  });
});

describe("relier un morceau : les surnoms et les deux Léa (relier)", () => {
  const exporte = (noms: [string, string], texte: string): Morceau => ({ format: "whatsapp-ios", texte, noms, empreinte: noms.join("|") });
  const capturees = (autre: string, messages: { de: "moi" | "autre"; texte: string }[], date = "2026-09-20"): MorceauRecu => {
    const t = versTexteCaptures(captures({ autre, blocs: [{ repere: { date, heure: "21:00" }, messages: messages.map((m) => msg(m.de, m.texte)) }] }), {
      aujourdhui: "2026-10-22",
    });
    return { format: "captures", texte: t.texte, noms: ["Moi", t.autre], empreinte: `captures-${autre}-${date}` };
  };
  const autresMessages = Array.from({ length: 24 }, (_, k) => ({ de: k % 2 ? ("autre" as const) : ("moi" as const), texte: `capture ${k}` }));

  it("un contact enregistré sous un surnom ne fait pas refuser les captures de la même personne", () => {
    const conv: ConvEnMorceaux = { morceaux: [exporte(["Hugo", "Bébé ❤️"], exportIos("Hugo", "Bébé ❤️"))] };
    const r = relier(conv, { noms: ["Hugo", "Bébé ❤️"], contact: 1 }, capturees("Léa", autresMessages));
    expect(r.morceaux).toHaveLength(2);
    expect(r.morceaux[1]!.noms).toEqual(["Moi", "Léa"]);
  });

  it("ni l’export Instagram de la même personne", () => {
    const conv: ConvEnMorceaux = { morceaux: [exporte(["Hugo", "Mon amour ❤️"], exportIos("Hugo", "Mon amour ❤️"))] };
    const r = relier(conv, { noms: ["Hugo", "Mon amour ❤️"], contact: 1 }, { ...exporte(["Hugo", "Léa Dupont"], exportIos("Hugo", "Léa Dupont", 40, 100)), contact: undefined });
    expect(r.morceaux.map((m) => m.noms)).toEqual([
      ["Hugo", "Mon amour ❤️"],
      ["Hugo", "Léa Dupont"],
    ]);
  });

  it("un surnom à majuscules (« Mon Chat 🐱 ») ne fait pas refuser les captures de la même personne", () => {
    const conv: ConvEnMorceaux = { morceaux: [exporte(["Hugo", "Mon Chat 🐱"], exportIos("Hugo", "Mon Chat 🐱"))] };
    expect(relier(conv, { noms: ["Hugo", "Mon Chat 🐱"], contact: 1 }, capturees("Léa", autresMessages)).morceaux).toHaveLength(2);
  });

  it("un diminutif (« Anne-So ») et le prénom entier (« Anne-Sophie ») : la même personne", () => {
    const conv: ConvEnMorceaux = { morceaux: [exporte(["Hugo", "Anne-So"], exportIos("Hugo", "Anne-So"))] };
    expect(relier(conv, { noms: ["Hugo", "Anne-So"], contact: 1 }, capturees("Anne-Sophie", autresMessages)).morceaux).toHaveLength(2);
  });

  it("un possessif seul (« Mon ❤️ ») ne dit aucun prénom : il ne bloque rien non plus", () => {
    const conv: ConvEnMorceaux = { morceaux: [exporte(["Hugo", "Mon ❤️"], exportIos("Hugo", "Mon ❤️"))] };
    expect(relier(conv, { noms: ["Hugo", "Mon ❤️"] }, capturees("Léa", autresMessages)).morceaux).toHaveLength(2);
  });

  it("deux prénoms différents restent deux personnes différentes, même derrière un possessif ou un prénom qui ressemble à un surnom", () => {
    for (const nom of ["Léa", "Ma Léa ❤️", "My Nguyen", "Doudou Diop", "Amor B", "Trésor Mputu"]) {
      const conv: ConvEnMorceaux = { morceaux: [exporte(["Hugo", nom], exportIos("Hugo", nom))] };
      expect(() => relier(conv, { noms: ["Hugo", nom], contact: 1 }, capturees("Sarah", autresMessages))).toThrow(expect.objectContaining({ code: "autre_conv" }));
    }
  });

  it("Marie et Marie-Lou : les mêmes mots rangent l’export d’une autre appli, sans message en commun", () => {
    const conv: ConvEnMorceaux = { morceaux: [exporte(["Marie-Lou 🌸", "Marie"], exportIos("Marie-Lou 🌸", "Marie"))] };
    const r = relier(
      conv,
      { noms: ["Marie-Lou 🌸", "Marie"], contact: 0 },
      { ...exporte(["Marie Dupont", "Marie-Lou Martin"], exportIos("Marie Dupont", "Marie-Lou Martin", 40, 100)) },
    );
    expect(r.morceaux[1]!.noms).toEqual(["Marie-Lou Martin", "Marie Dupont"]);
  });

  it("deux Léa : le prénom ne désigne personne, les messages en commun rangent les captures", () => {
    /* La fin de l’export : Léa Martin (l’utilisatrice) puis Léa Dubois, repris par les captures */
    const texte = exportIos("Léa Martin", "Léa Dubois", 40);
    const conv: ConvEnMorceaux = { morceaux: [exporte(["Léa Martin", "Léa Dubois"], texte)] };
    const reprises = Array.from({ length: 6 }, (_, k) => ({ de: (34 + k) % 2 ? ("autre" as const) : ("moi" as const), texte: `message ${34 + k}` }));
    const r = relier(conv, { noms: ["Léa Martin", "Léa Dubois"] }, capturees("Léa", reprises, "2026-10-01"));
    /* « Moi » est Léa Martin (le participant 0), et rien ne dit encore qui est l’autre */
    expect(r.morceaux[1]!.noms).toEqual(["Moi", "Léa"]);
    expect(r.identite.contact).toBeUndefined();
  });
});

describe("les bulles des preuves (messagesAffiches)", () => {
  it("tes messages sous ton nom distinct comme sous ton prénom d’avant (les lignes gardées par la mémoire)", () => {
    const lignes = new Map([
      ["m0001", "m0001 2026-10-01 jeu. 10:00 Léa : gardée avant"],
      ["m0002", "m0002 2026-10-01 jeu. 10:01 Lea : sa réponse"],
      ["m0003", "m0003 2026-10-01 jeu. 10:02 Léa M. : relue depuis"],
    ]);
    expect([...messagesAffiches(lignes, ["Léa M.", "Léa"]).values()].map((m) => m.from)).toEqual(["toi", "elle", "toi"]);
  });

  it("sa légende dit son prénom, sans le « (l’autre) » que lit le modèle", () => {
    const lignes = new Map([["m0001", "m0001 2026-10-01 jeu. 10:00 Léa (l’autre) : coucou"]]);
    expect(messagesAffiches(lignes, "Léa").get("m0001")).toMatchObject({ from: "elle", caption: "Léa · 01/10 10:00" });
  });
});

describe("le prénom glissé dans un surnom, à masquer (prenomsDuSurnom)", () => {
  it("le mot à majuscule après les mots tendres, jamais après « de »", () => {
    expect(prenomsDuSurnom("Mon amour Léa ❤️")).toEqual(["Léa"]);
    expect(prenomsDuSurnom("Ma Belle Inès")).toEqual(["Inès"]);
    expect(prenomsDuSurnom("Mon Bébé Hugo 💙")).toEqual(["Hugo"]);
    expect(prenomsDuSurnom("Mon Amour De Toujours")).toEqual([]);
    expect(prenomsDuSurnom("Mon Petit Chat")).toEqual([]);
    expect(prenomsDuSurnom("Léa Martin")).toEqual([]);
    for (const nom of ["Mon Amour Pour Toujours", "Mon Plus Grand Amour", "Mon Bébé D’amour 💕", "Mon Homme À MOI ❤️", "Mon Prince Charmant 🤴", "Ma Femme Que J’Aime"])
      expect(prenomsDuSurnom(nom)).toEqual([]);
  });
});
