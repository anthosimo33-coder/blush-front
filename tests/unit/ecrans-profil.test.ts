import { describe, expect, it } from "vitest";
import { chiffrer, lire, rendre, type Histoire, type Message } from "@prompts/lib/conv";
import { profil } from "@prompts/lib/style";
import { titreNettoye } from "@prompts/lib/titres";
import { accorde, vocauxOuMedias } from "@/lib/format";
import { periodeLisible, storyAffichee } from "@/server/conv-affichee";
import { ficheAffichee } from "@/server/ecrans/fiche";
import { signaux, signauxSansHeures } from "@/server/ecrans/haut-du-paywall";
import { messagesAffiches } from "@/server/ecrans/messages";
import { resumeDe, type Meta } from "@/server/histoires";
import { dureeLisible, joursCouverts, moisCouverts } from "@/server/temps";
import { memoire } from "../aide/fabriques";

/*
 * Ce que montrent les écrans d’une conv (lot E du chantier « lecture des convs ») et le profil d’écriture donné au chat
 * (lot F) : les chiffres accordés, les médias d’Android, les années des périodes et des preuves, les signaux du paywall
 * et de la lecture, ce que WhatsApp écrit à la place de quelqu’un, les emojis entiers et les surnoms. Noms inventés.
 */

const H: Histoire = {
  utilisateur: { prenom: "Tom", pronom: "il", nomExport: "Tom" },
  autre: { prenom: "Léa", pronom: "elle", nomExport: "Léa" },
  devinette: "parle",
  objectif: "comprendre",
  appli: "whatsapp",
  format: "whatsapp-ios",
};

/** Un export WhatsApp d’iPhone inventé, à partir de ses messages [jour AAAA-MM-JJ, heure HH:MM, nom, texte]. */
const exporter = (lignes: [string, string, string, string][]) =>
  lignes.map(([jour, heure, nom, texte]) => `[${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)} ${heure}:00] ${nom}: ${texte}`).join("\n");

const meta = (m: Partial<Meta> = {}): Meta => ({
  appli: "whatsapp",
  format: "whatsapp-ios",
  fichier: "Discussion WhatsApp avec Léa.txt",
  participants: [
    { nom: "Tom", prenom: "Tom", messages: 120 },
    { nom: "Léa", prenom: "Léa", messages: 117 },
  ],
  resume: { debut: "2026-03-12", fin: "2026-09-30", total: 237, vocaux: 0 },
  ...m,
});

describe("les chiffres accordés, et les médias d’Android (E1, E2)", () => {
  it("le singulier pour 0 et 1, le pluriel au-delà", () => {
    expect([0, 1, 2].map((n) => accorde(n, "vocal", "vocaux"))).toEqual(["vocal", "vocal", "vocaux"]);
    expect(accorde(1, "message")).toBe("message");
  });

  it("ses vocaux, ou ses médias quand l’export ne les distingue pas, jamais « 0 vocaux »", () => {
    expect(vocauxOuMedias({ voiceCount: 12, mediaCount: 40 })).toEqual({ nombre: 12, nom: "vocaux" });
    expect(vocauxOuMedias({ voiceCount: 0, mediaCount: 42 })).toEqual({ nombre: 42, nom: "médias" });
    expect(vocauxOuMedias({ voiceCount: 0 })).toEqual({ nombre: 0, nom: "vocal" });
    expect(vocauxOuMedias({ voiceCount: 1 })).toEqual({ nombre: 1, nom: "vocal" });
  });

  it("seul un export Android qui ne nomme aucun média compte ses médias, légendés compris", () => {
    const android = [
      "12/03/2026 21:00 - Tom: coucou",
      ...Array.from({ length: 30 }, (_, k) => `12/03/2026 21:${String(k + 1).padStart(2, "0")} - ${k % 2 ? "Léa" : "Tom"}: <Médias omis>`),
      "12/03/2026 21:40 - Léa: <Médias omis>",
      "regarde ma tête",
    ].join("\n");
    const ha: Histoire = { ...H, format: "whatsapp-android" };
    expect(resumeDe(lire(android, ha).messages, "whatsapp-android").medias).toBe(31);
    /* Un export qui nomme ses médias (une photo d’iPhone, un partage d’Instagram) garde ses vocaux, même à 0 */
    const ios = exporter([
      ["2026-03-12", "21:00", "Tom", "coucou"],
      ["2026-03-12", "21:01", "Léa", "\u200eimage omitted"],
      ["2026-03-12", "21:02", "Léa", "\u200edocument omitted"],
    ]);
    expect(resumeDe(lire(ios, H).messages, "whatsapp-ios").medias).toBeUndefined();
    expect(resumeDe(lire(android, ha).messages).medias).toBeUndefined();
  });

  it("un export Android « sans médias » compte ses médias, que la conv montre à la place des vocaux", () => {
    const story = storyAffichee("c", meta({ resume: { debut: "2026-03-12", fin: "2026-09-30", total: 237, vocaux: 0, medias: 42 } }));
    expect(story).toMatchObject({ voiceCount: 0, mediaCount: 42 });
    expect(story.sources[0]).toMatchObject({ voiceCount: 0, mediaCount: 42 });
    /* Une conv importée avant : rien sur ses médias, rien de faux non plus */
    expect(storyAffichee("c", meta()).mediaCount).toBeUndefined();
  });
});

describe("les années, les périodes et les durées (E3, E6, E7, E8)", () => {
  it("l’année aux deux bouts quand ils ne sont pas de la même année, un seul jour quand elle tient en un jour", () => {
    expect(periodeLisible("2026-03-12", "2026-09-30")).toBe("12 mars → 30 sept.");
    expect(periodeLisible("2024-03-12", "2025-03-12")).toBe("12 mars 2024 → 12 mars 2025");
    expect(periodeLisible("2025-01-01", "2025-01-01")).toBe("1 janv.");
    const story = storyAffichee("c", meta({ resume: { debut: "2022-08-28", fin: "2025-12-31", total: 900, vocaux: 3 } }));
    expect(story.period).toBe("28 août 2022 → 31 déc. 2025");
    expect(story.sources[0]!.label).toBe("WhatsApp · 28 août 2022");
  });

  it("plus de « · aujourd’hui » écrit en dur : la page du rapport pose le vrai jour", () => {
    expect(storyAffichee("c", meta()).updatedLabel).toBeUndefined();
  });

  it("une conv coupée : les mois lus et la durée disent la même chose", () => {
    const coupee = storyAffichee("c", meta({ coupe: true, resume: { debut: "2025-01-01", fin: "2025-12-11", total: 40_000, vocaux: 0 } }));
    expect(coupee.sources[0]!.moisLus).toBe(11);
    expect(coupee.durationLabel).toBe("11\u00a0mois");
    /* 380 jours : 12 mois partout (la durée disait 13, les mois lus 12) */
    expect(moisCouverts(joursCouverts("2025-01-01", "2026-01-15"))).toBe(12);
    expect(dureeLisible(joursCouverts("2025-01-01", "2026-01-15"))).toBe("12\u00a0mois");
  });

  it("une vidéo s’appelle « vidéo », une capture seule « 1 capture »", () => {
    const captures = (m: Partial<Meta>) => storyAffichee("c", meta({ format: "captures", appli: "instagram", fichier: "", ...m })).sources[0]!.label;
    expect(captures({ captures: 87, video: true })).toBe("Instagram · vidéo");
    expect(captures({ captures: 1 })).toBe("Instagram · 1 capture");
    expect(captures({ captures: 12 })).toBe("Instagram · 12 captures");
  });

  it("sa fiche dit le jour de sa mise à jour", () => {
    const etat = memoire({ fiche: { faits: [] } });
    const lea = { id: "p-autre", name: "Léa", initial: "L" };
    expect(ficheAffichee(lea, etat, new Map(), "aujourd’hui").updatedLabel).toBe("mise à jour aujourd’hui");
    expect(ficheAffichee(lea, etat, new Map(), "12 mars").updatedLabel).toBe("mise à jour le 12 mars");
  });
});

describe("les signaux du paywall et de la lecture (E4, E5)", () => {
  it("un lien qui contient « ? » ne pose pas de question", () => {
    const lignes: [string, string, string, string][] = Array.from({ length: 20 }, (_, k) => [
      "2026-03-01",
      `${String(10 + Math.floor(k / 2)).padStart(2, "0")}:${k % 2 ? "30" : "00"}`,
      k % 2 ? "Léa" : "Tom",
      k % 2 ? `tu fais quoi ce soir ${k} ?` : `https://www.instagram.com/reel/C9x${k}/?igsh=MWQ1ZGUxMzBkMA==`,
    ]);
    const lu = lire(exporter(lignes), H);
    const questions = signauxSansHeures(chiffrer(H, lu.messages), lu.messages)?.find((s) => s.id === "questions");
    expect(questions).toMatchObject({ cote: "elle", toi: 0, elle: 10 });
  });

  it("un lien suivi de milliers de « ? » se lit en temps linéaire", () => {
    const forge = `www.${"?".repeat(120_000)}x`;
    const lignes: [string, string, string, string][] = Array.from({ length: 20 }, (_, k) => [
      "2026-03-01",
      `10:${String(k).padStart(2, "0")}`,
      k % 2 ? "Léa" : "Tom",
      k === 0 ? forge : `ok ${k} ?`,
    ]);
    const lu = lire(exporter(lignes), H);
    const debut = performance.now();
    signauxSansHeures(chiffrer(H, lu.messages), lu.messages);
    expect(performance.now() - debut).toBeLessThan(1000);
  });

  it("le « ? » qui finit un lien reste une question", () => {
    const lignes: [string, string, string, string][] = Array.from({ length: 20 }, (_, k) => [
      "2026-03-01",
      `${String(10 + Math.floor(k / 2)).padStart(2, "0")}:${k % 2 ? "30" : "00"}`,
      k % 2 ? "Léa" : "Tom",
      k % 2 ? (k % 3 ? `t’as vu https://vm.tiktok.com/ZMh${k}/?` : `t’as vu https://vm.tiktok.com/ZMh${k}/?😭`) : `ok ${k}`,
    ]);
    const lu = lire(exporter(lignes), H);
    expect(signauxSansHeures(chiffrer(H, lu.messages), lu.messages)?.find((s) => s.id === "questions")).toMatchObject({ toi: 0, elle: 10 });
  });

  it("« elle écrit 2 fois plus long » se compare sur les moyennes exactes, pas arrondies", () => {
    const lignes: [string, string, string, string][] = Array.from({ length: 40 }, (_, k) => [
      "2026-03-01",
      `${String(8 + Math.floor(k / 4)).padStart(2, "0")}:${String((k % 4) * 10).padStart(2, "0")}`,
      k % 2 ? "Léa" : "Tom",
      k % 2 ? (k % 4 === 1 ? "je sais pas trop je crois pas" : "je suis chez ma mère ce soir là") : k % 4 === 0 ? "on se voit quand" : "tu rentres à quelle heure",
    ]);
    const c = chiffrer(H, lire(exporter(lignes), H).messages);
    /* 4,5 et 7,5 mots : arrondis à 5 et 8, mais 1,67 fois, sous le seuil de 1,8 */
    expect(c.motsExacts).toEqual({ toi: 4.5, autre: 7.5 });
    expect(signaux(c).find((s) => s.id === "longueur")).toMatchObject({ cote: "pareil" });
  });
});

describe("les bulles des preuves (E10, E11, E12)", () => {
  const lignes = new Map([
    ["m0001", "m0001 2024-03-02 sam. 23:41 Léa : t’es mignon toi"],
    ["m0002", "m0002 2025-03-02 dim. 23:41 Léa : on se voit samedi ?"],
    ["m0003", "m0003 2025-04-28 lun. ~21:00 Léa : capture"],
    ["m0004", "m0004 2025-04-28 lun. 21:05 Léa : on y va ? [photo]"],
    ["m0005", "m0005 2025-04-28 lun. 21:06 Léa : [Appel vocal 7 s]"],
    /* Son profil, ajouté plus tard : daté du jour de l’ajout, il n’est pas le dernier message */
    ["m0006", "m0006 2026-01-03 sam. --:-- profil de Léa : 24 ans"],
  ]);
  const bulles = messagesAffiches(lignes, "Tom");

  it("l’année quand ce n’est pas celle du dernier message, l’heure d’une capture dite « vers »", () => {
    expect(bulles.get("m0001")!.caption).toBe("Léa · 02/03/2024 23:41");
    expect(bulles.get("m0002")!.caption).toBe("Léa · 02/03 23:41");
    expect(bulles.get("m0003")!.caption).toBe("Léa · 28/04 vers 21:00");
  });

  it("l’année se compare au dernier jour de la conv, même quand les lignes données n’en sont qu’une partie", () => {
    const citees = new Map([["m0002", "m0002 2025-02-10 lun. 21:14 Léa : coucou"]]);
    expect(messagesAffiches(citees, "Tom", { fin: "2026-01-06" }).get("m0002")!.caption).toBe("Léa · 10/02/2025 21:14");
    expect(messagesAffiches(citees, "Tom").get("m0002")!.caption).toBe("Léa · 10/02 21:14");
  });

  it("la légende d’un média se lit « · photo », et ce que WhatsApp a écrit à sa place ne s’affiche pas", () => {
    expect(bulles.get("m0004")!.text).toBe("on y va ? · photo");
    expect(bulles.has("m0005")).toBe(false);
  });

  it("le modèle lit un appel ou une position entre crochets, jamais comme ses mots", () => {
    const avant: [string, string, string, string][] = Array.from({ length: 50 }, (_, k) => [
      "2025-03-02",
      `20:${String(k).padStart(2, "0")}`,
      k % 2 ? "Léa" : "Tom",
      `message ${k}`,
    ]);
    /* iOS marque d’un U+200E en tête la ligne d’un contenu qu’il écrit lui-même */
    const marquees = exporter([
      ["2025-03-02", "23:45", "Léa", "\u200eAppel vocal \u200e7 s"],
      ["2025-03-02", "23:48", "Léa", "\u200ePosition : https://maps.google.com/?q=48.85,2.35"],
    ]).replace(/^\[/gm, "\u200e[");
    const texte = `${exporter([...avant, ["2025-03-02", "23:40", "Tom", "tu dors ?"]])}\n${marquees}`;
    const r = rendre({ ...H, aujourdhui: "2025-03-03" }, lire(texte, H));
    const corps = [...r.lignes.values()].slice(-3).map((l) => l.split(" : ").slice(1).join(" : "));
    expect(corps).toEqual(["tu dors ?", "[Appel vocal 7 s]", "[Position : https://maps.google.com/?q=48.85,2.35]"]);
  });
});

describe("le profil d’écriture donné au chat (F1, F2)", () => {
  const de = (textes: string[]) =>
    profil(
      H,
      lire(
        exporter(
          textes.flatMap((t, k): [string, string, string, string][] => [
            ["2026-03-10", `${String(10 + Math.floor(k / 6)).padStart(2, "0")}:${String((k % 6) * 10).padStart(2, "0")}`, "Tom", t],
          ]),
        ),
        H,
      ).messages,
    );

  it("un emoji avec sa couleur de peau reste entier, et ❤️ et ❤ ne font qu’un", () => {
    const p = de(["jsp 🤷🏻‍♂️", "aucune idée 🤷🏻‍♂️", "t’es sérieuse 🤦🏻‍♂️", "bonne nuit ❤", "jtm ❤️", "moi aussi ❤️", "🇫🇷 allez"]);
    /* ❤ (copié-collé) et ❤️ : un seul emoji, sous la forme qu’il écrit le plus */
    expect(p.emojis).toEqual(
      expect.arrayContaining([
        ["🤷🏻‍♂️", 2],
        ["❤️", 3],
        ["🤦🏻‍♂️", 1],
        ["🇫🇷", 1],
      ]),
    );
    expect(p.emojis.some(([e]) => e === "♂️" || e === "🤷")).toBe(false);
    expect(titreNettoye("Le 🤷🏻‍♂️ de minuit")).toBe("Le de minuit");
  });

  it("un surnom sans ambiguïté compte au milieu d’un message ; un surnom ambigu, quand il l’appelle", () => {
    const p = de([
      "coucou bb ça va",
      "merci bb t’es trop gentille",
      "salut ma belle tu fais quoi",
      "coucou ma belle bien dormi",
      "oui bébé j’arrive",
      "coucou bébé tu fais quoi",
      "dsl je te raconte ma vie",
      "c’est ma vie",
    ]);
    expect(p.surnoms).toEqual([
      ["bb", 2],
      ["bébé", 2],
      ["ma belle", 2],
    ]);
  });

  it("« mon bébé » au milieu d’une phrase, « alors raconte bb » : des surnoms", () => {
    const p = de(["coucou mon bébé ça va", "oui mon bébé j’arrive", "d’accord bébé je t’appelle après", "alors raconte bb", "raconte bb t’as eu le poste"]);
    expect(p.surnoms).toEqual([
      ["bébé", 3],
      ["bb", 2],
    ]);
  });

  it("« bébé » qui ne la désigne pas n’est pas un surnom", () => {
    const p = de([
      "quand j’étais bébé j’avais une tête énorme",
      "quand j’étais bébé j’avais peur du noir",
      "t’es un grand bébé toi",
      "t’es un grand bébé quand t’es malade",
      "leur bébé est trop mignon",
      "leur bébé dort enfin",
    ]);
    expect(p.surnoms).toEqual([]);
  });

  it("un message forgé de milliers d’espaces se lit en temps linéaire", () => {
    const debut = performance.now();
    de([`a${" ".repeat(40_000)}b`, "jtm bb", "jtm bb"]);
    expect(performance.now() - debut).toBeLessThan(2000);
  });

  it("un surnom compte quand il s’adresse à elle, pas dans une expression", () => {
    const p = de([
      "jamais de ma vie j’ai vu ça",
      "le pire film de ma vie",
      "ma cousine a eu un bébé",
      "un bébé trop mignon dans le train",
      "je vais à l’institut de beauté",
      "toujours l’institut de beauté",
      "jtm bb",
      "bb t’es où",
      "bonne nuit ma vie ❤️",
      "à demain ma vie",
    ]);
    expect(p.surnoms).toEqual([
      ["bb", 2],
      ["ma vie", 2],
    ]);
  });
});

describe("une conv sans date, une conv coupée (PR 5)", () => {
  const sansDate = (m: Partial<Meta> = {}) =>
    meta({
      format: "captures",
      appli: "instagram",
      fichier: "2 captures",
      captures: 2,
      resume: { debut: "2026-10-31", fin: "2026-10-31", total: 30, vocaux: 0, sansDate: true },
      ...m,
    });

  it("des captures sans aucune date : ni période ni durée, sur la source comme sur l’histoire", () => {
    const story = storyAffichee("c", sansDate());
    expect([story.period, story.durationLabel, story.sources[0]!.period]).toEqual([undefined, undefined, undefined]);
    expect(story.sources[0]!.label).toBe("Instagram · 2 captures");
    expect(story.totalMessages).toBe(30);
    /* Les mêmes, datées du jour de l’import (une conv d’avant la PR 5) : la période et la durée de ce jour-là */
    const datee = storyAffichee("c", sansDate({ resume: { debut: "2026-10-31", fin: "2026-10-31", total: 30, vocaux: 0 } }));
    expect([datee.period, datee.durationLabel]).toEqual(["31 oct.", "1\u00a0jour"]);
  });

  it("une conv coupée : son début manque ; en morceaux, seulement si le plus ancien est coupé", () => {
    expect(storyAffichee("c", meta({ coupe: true })).startMissing).toBe(true);
    expect(storyAffichee("c", meta()).startMissing).toBeUndefined();
    const exportCoupe = { appli: "whatsapp" as const, fichier: "WhatsApp Chat - Léa.zip", coupe: true, resume: { debut: "2026-09-01", fin: "2026-10-15", total: 400, vocaux: 0 } };
    const capturesDu = (debut: string, fin: string) => ({ appli: "instagram" as const, fichier: "2 captures", captures: 2, resume: { debut, fin, total: 24, vocaux: 0 } });
    expect(storyAffichee("c", meta({ coupe: true, morceaux: [exportCoupe, capturesDu("2026-10-20", "2026-10-22")] })).startMissing).toBe(true);
    /* Des captures plus anciennes, importées en second : le plus ancien morceau n’est pas coupé */
    expect(storyAffichee("c", meta({ coupe: true, morceaux: [capturesDu("2026-06-01", "2026-06-03"), exportCoupe] })).startMissing).toBeUndefined();
  });

  it("les preuves d’un jour inconnu : le nom seul sous la bulle ; l’année des autres ne change pas", () => {
    const lignes = new Map([
      ["m0002", "m0002 ????-??-?? ??? --:-- Léa : on se voit quand ?"],
      ["m0003", "m0003 ????-??-?? ??? --:-- Tom : demain ?"],
      ["m0412", "m0412 2025-03-02 dim. 23:41 Léa : t’es où"],
    ]);
    const bulles = messagesAffiches(lignes, "Tom", { fin: "2025-03-10" });
    expect(bulles.get("m0002")!.caption).toBe("Léa");
    expect(bulles.get("m0003")!.caption).toBe("Toi");
    /* Sans la garde, « ???? » passait devant tous les jours : l’année de référence, et toutes les autres preuves la prenaient */
    expect(bulles.get("m0412")!.caption).toBe("Léa · 02/03 23:41");
  });

  it("sa fiche : une info prouvée par un message au jour inconnu vient de « votre conv », sans date", () => {
    const lignes = new Map([
      ["m0002", "m0002 ????-??-?? ??? --:-- Léa : j’adore le libanais"],
      ["m0412", "m0412 2025-03-02 dim. 23:41 Léa : ce soir libanais ?"],
    ]);
    const etat = memoire({
      fiche: {
        faits: [
          { section: "aime", texte: "le libanais", preuves: ["m0002"], statut: "garde" },
          { section: "aime", texte: "sortir le soir", preuves: ["m0412"], statut: "garde" },
        ],
      },
    });
    const faits = ficheAffichee({ id: "p-autre", name: "Léa", initial: "L" }, etat, lignes, undefined, "2025-03-10").facts;
    expect(faits.map((f) => f.sourceLabel)).toEqual(["votre conv", "votre conv · 2 mars"]);
  });

  it("resumeDe : les bornes des messages datés ; aucun daté, le jour écrit, sans date", () => {
    const m = (k: number, iso: string, jourDevine?: Message["jourDevine"]): Message => ({
      id: `m000${k}`,
      t: Date.parse(`${iso}T00:00:00Z`),
      nom: k % 2 ? "Léa" : "Moi",
      role: k % 2 ? "autre" : "toi",
      texte: `message ${k}`,
      approx: "jour",
      ...(jourDevine ? { jourDevine } : {}),
      ligne: k,
    });
    expect(resumeDe([m(1, "2026-09-01"), m(2, "2026-09-03"), m(3, "2026-10-31", "inconnu")])).toEqual({ debut: "2026-09-01", fin: "2026-09-03", total: 3, vocaux: 0 });
    expect(resumeDe([m(1, "2026-10-31", "inconnu"), m(2, "2026-10-31", "inconnu"), m(3, "2026-10-31", "inconnu")])).toEqual({
      debut: "2026-10-31",
      fin: "2026-10-31",
      total: 3,
      vocaux: 0,
      sansDate: true,
    });
    /* Un jour emprunté (« au plus tard ») est une borne juste : il compte */
    expect(resumeDe([m(1, "2026-09-01", "auPlusTard"), m(2, "2026-09-01")]).sansDate).toBeUndefined();
  });
});
