import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { blocAjout, cleDuMessage, heureDuMessage, inserer, messagesDeLExport, messagesDesCaptures, numeroter, remplacer, type Heure, type Lu } from "@prompts/lib/ajouts";
import { versTexteCaptures } from "@prompts/lib/captures";
import { lire, type Histoire, type Message } from "@prompts/lib/conv";
import { ligneMessage, TETE_DU_RAPPEL } from "@prompts/lib/ligne";
import { rendreNouveau } from "@prompts/lib/memoire";
import type { Captures } from "@prompts/lib/schemas";
import { lireExport, resumeConvInstagram } from "@prompts/lib/export";
import { depuisInstagramJsonDans } from "@prompts/lib/instagram";
import { fuseauSur, jourDans } from "@/lib/jours";
import { resumeAjout } from "@/server/ajouts";
import { depuisPaquet } from "@/server/import";
import { aujourdhuiDans } from "@/server/temps";
import { captures, msg } from "../aide/fabriques";

/*
 * Ce qu’il envoie après le rapport (lot H du chantier « lecture des convs ») : les messages déjà lus reconnus par leur
 * clé et leur heure possible (une capture du dernier écran, l’export d’une conv de captures), un échange qu’il remontre,
 * la rafale à laquelle répondre, ce qu’un export trop long ne laisse pas lire, et le jour du téléphone (H7, C7). Noms
 * inventés.
 */

const H: Pick<Histoire, "utilisateur" | "autre"> = {
  utilisateur: { prenom: "Tom", pronom: "il", nomExport: "Tom" },
  autre: { prenom: "Léa", pronom: "elle", nomExport: "Léa" },
};
const ios = (lignes: [string, string, string][]) => lignes.map(([quand, nom, texte]) => `[${quand}] ${nom}: ${texte}`).join("\n");

/** Un message lu, tel que la conv le garde : sa clé, son heure (« 2026-10-30 23:10:45 », sans fuseau) et ce qu’elle vaut. */
const lu = (role: "toi" | "autre", texte: string, quand: string, heure: Heure = "exacte", media?: Message["media"]): Lu => ({
  cle: cleDuMessage({ role, texte, ...(media ? { media } : {}) }),
  t: Date.parse(`${quand.replace(" ", "T")}Z`),
  heure,
});
type Bloc = { date: string | null; heure?: string | null; messages: ["moi" | "autre", string][] };
const capture = (...blocs: Bloc[]) =>
  captures({
    autre: "Léa",
    blocs: blocs.map((b) => ({ repere: b.date ? { date: b.date, heure: b.heure ?? null } : null, messages: b.messages.map(([de, t]) => msg(de, t)) })),
  });
const textes = (ms: readonly Message[]) => ms.map((m) => m.texte);

describe("des captures : ce qui est déjà lu, d’après la clé et l’heure possible (H4, H6)", () => {
  /* La fin de ce qui est lu, par un export : le 30 octobre au soir, jusqu’à « bonne nuit 😘 » à 23:10 */
  const dernier = Date.UTC(2026, 9, 30, 23, 10, 45);
  const lus = [
    lu("autre", "😘", "2026-10-30 08:00:00"),
    lu("toi", "mdr", "2026-10-30 12:00:00"),
    lu("autre", "tu dors ?", "2026-10-30 22:58:03"),
    lu("toi", "non et toi", "2026-10-30 23:01:00"),
    lu("autre", "bonne nuit 😘", "2026-10-30 23:10:45"),
  ];
  const lire30 = (c: Captures, deja: readonly Lu[] = lus, aujourdhui = "2026-10-31") => messagesDesCaptures(c, H, { aujourdhui, apres: dernier, lus: deja });

  it("une capture qui reprend la fin de ce qui est lu n’en garde que la suite, emoji compris", () => {
    const c = capture(
      {
        date: "2026-10-30",
        heure: "22:58",
        messages: [
          ["autre", "tu dors ?"],
          ["moi", "non et toi"],
          ["autre", "bonne nuit 😘"],
        ],
      },
      {
        date: "2026-10-31",
        heure: "10:02",
        messages: [
          ["autre", "❤️"],
          ["autre", "bien dormi ?"],
        ],
      },
    );
    const r = lire30(c);
    expect(textes(r.nouveaux)).toEqual(["❤️", "bien dormi ?"]);
    expect(r.remontres).toEqual([]);
    expect(r.aNoter.map((e) => e.heure)).toEqual(["repere", "repere"]);
  });

  it("le haut de l’écran sans repère (la veille, déjà lue) se retrouve, quel que soit le jour qu’il emprunte", () => {
    const c = capture(
      {
        date: null,
        messages: [
          ["autre", "tu dors ?"],
          ["moi", "non et toi"],
          ["autre", "bonne nuit 😘"],
        ],
      },
      { date: "2026-10-31", heure: "09:50", messages: [["autre", "bien dormi ?"]] },
    );
    expect(textes(lire30(c).nouveaux)).toEqual(["bien dormi ?"]);
  });

  it("le tout premier message, repris du tout dernier lu, suffit sous son repère ; une bulle coupée par le haut de l’écran ne compte pas", () => {
    const seul = capture(
      { date: "2026-10-30", heure: "23:10", messages: [["autre", "bonne nuit 😘"]] },
      { date: "2026-10-31", heure: "09:50", messages: [["autre", "bien dormi ?"]] },
    );
    expect(textes(lire30(seul).nouveaux)).toEqual(["bien dormi ?"]);
    /* En haut sans repère, un « bonne nuit » seul peut être celui de ce soir : il reste nouveau plutôt que perdu */
    const sansRepere = capture({ date: null, messages: [["autre", "bonne nuit 😘"]] }, { date: "2026-10-31", heure: "09:50", messages: [["autre", "bien dormi ?"]] });
    expect(textes(lire30(sansRepere).nouveaux)).toEqual(["bonne nuit 😘", "bien dormi ?"]);
    /* La bulle du haut, coupée par le bord de l’écran (le modèle la marque : `coupe`), n’est qu’un morceau de « mdr » */
    const coupee = captures({
      autre: "Léa",
      blocs: [
        { repere: null, messages: [msg("moi", "…dr", { coupe: true }), msg("autre", "tu dors ?"), msg("moi", "non et toi"), msg("autre", "bonne nuit 😘")] },
        { repere: { date: "2026-10-31", heure: "09:50" }, messages: [msg("autre", "bien dormi ?")] },
      ],
    });
    expect(textes(lire30(coupee).nouveaux)).toEqual(["bien dormi ?"]);
  });

  it("un message pareil au dernier lu, mais pas en tête ou d’un autre jour, reste nouveau", () => {
    /* En tête mais le lendemain : le repère dit qu’il n’a pas pu être lu */
    expect(
      textes(
        lire30(
          capture({
            date: "2026-10-31",
            heure: "21:00",
            messages: [
              ["autre", "bonne nuit 😘"],
              ["moi", "dors bien"],
            ],
          }),
        ).nouveaux,
      ),
    ).toEqual(["bonne nuit 😘", "dors bien"]);
    /* Le même jour, sans heure, mais après un message neuf : pas la suite de ce qui est lu */
    expect(
      textes(
        lire30(
          capture({
            date: "2026-10-30",
            messages: [
              ["moi", "t’es là ?"],
              ["autre", "bonne nuit 😘"],
            ],
          }),
        ).nouveaux,
      ),
    ).toEqual(["t’es là ?", "bonne nuit 😘"]);
  });

  it("un rituel ou deux vocaux comme à la fin de ce qui est lu ne font rien jeter (une paire seule ne suffit pas)", () => {
    const rituel = [...lus, lu("toi", "bonne nuit", "2026-10-30 23:55:00"), lu("autre", "bonne nuit 😘", "2026-10-30 23:58:00")];
    const soir = capture({
      date: "2026-10-31",
      heure: "19:02",
      messages: [
        ["autre", "t’es où ?"],
        ["moi", "chez Hugo"],
        ["autre", "tu me manques"],
        ["moi", "toi aussi"],
        ["moi", "bonne nuit"],
        ["autre", "bonne nuit 😘"],
      ],
    });
    expect(lire30(soir, rituel).nouveaux).toHaveLength(6);
    /* Deux vocaux ce matin, lus par un export ; une capture « Aujourd’hui » (WhatsApp : sans heure) qui finit par deux autres */
    const vocaux = [...lus, lu("autre", "", "2026-10-31 10:00:00", "exacte", "vocal"), lu("autre", "", "2026-10-31 10:01:00", "exacte", "vocal")];
    const c = captures({
      autre: "Léa",
      blocs: [
        {
          repere: { date: "2026-10-31", heure: null },
          messages: [msg("autre", "coucou"), msg("moi", "hey ça va ?"), msg("autre", "", { media: "vocal" }), msg("autre", "", { media: "vocal" })],
        },
      ],
    });
    expect(messagesDesCaptures(c, H, { aujourdhui: "2026-10-31", apres: Date.UTC(2026, 9, 31, 10, 1), lus: vocaux }).nouveaux).toHaveLength(4);
  });

  it("un « mdr » ou un emoji neufs, le même jour mais après un repère plus tardif, restent neufs", () => {
    expect(
      textes(
        lire30(
          capture({
            date: "2026-10-30",
            heure: "23:30",
            messages: [
              ["moi", "mdr"],
              ["autre", "😘"],
            ],
          }),
        ).nouveaux,
      ),
    ).toEqual(["mdr", "😘"]);
  });

  it("une capture « Aujourd’hui » sans heure, après l’export du matin : sa tête reprise, la suite nouvelle", () => {
    const matin = [lu("autre", "bien dormi ?", "2026-10-31 08:10:00"), lu("toi", "oui et toi", "2026-10-31 08:12:00"), lu("autre", "super", "2026-10-31 08:15:00")];
    const c = capture({
      date: "2026-10-31",
      messages: [
        ["moi", "oui et toi"],
        ["autre", "super"],
        ["autre", "on se voit ce soir ?"],
      ],
    });
    const r = messagesDesCaptures(c, H, { aujourdhui: "2026-10-31", apres: Date.UTC(2026, 9, 31, 8, 15), lus: matin });
    expect(textes(r.nouveaux)).toEqual(["on se voit ce soir ?"]);
    expect(r.aNoter.map((e) => e.heure)).toEqual(["jour"]);
  });

  it("une photo d’une capture retrouve le « <Médias omis> » d’Android, légende comprise", () => {
    const android = [
      ...lus,
      lu("toi", "t’es où", "2026-10-30 23:20:00"),
      lu("autre", "", "2026-10-30 23:21:00", "exacte", "média"),
      lu("autre", "regarde la vue [média]", "2026-10-30 23:22:00"),
    ];
    const c = captures({
      autre: "Léa",
      blocs: [
        {
          repere: { date: "2026-10-30", heure: "23:20" },
          messages: [msg("moi", "t’es où"), msg("autre", "", { media: "photo" }), msg("autre", "regarde la vue", { media: "photo" }), msg("autre", "alors ?")],
        },
      ],
    });
    expect(textes(lire30(c, android).nouveaux)).toEqual(["alors ?"]);
  });

  it("un passage déjà lu, plus haut que la fin : rien de neuf, et toute la capture est ce qu’il remontre", () => {
    const c = capture({
      date: "2026-10-30",
      messages: [
        ["autre", "😘"],
        ["moi", "mdr"],
        ["autre", "tu dors ?"],
      ],
    });
    const r = lire30(c);
    expect(r.nouveaux).toEqual([]);
    expect([textes(r.remontres), r.dejaLus]).toEqual([["😘", "mdr", "tu dors ?"], true]);
  });

  it("la même capture renvoyée, une fois ses messages notés : plus rien de neuf", () => {
    const c = capture(
      {
        date: "2026-10-30",
        heure: "22:58",
        messages: [
          ["autre", "tu dors ?"],
          ["moi", "non et toi"],
          ["autre", "bonne nuit 😘"],
        ],
      },
      { date: "2026-10-31", heure: "10:02", messages: [["autre", "bien dormi ?"]] },
    );
    const premiere = lire30(c);
    const seconde = lire30(c, inserer(lus, premiere.aNoter, premiere.ancre));
    expect([seconde.nouveaux, seconde.dejaLus]).toEqual([[], true]);
  });

  it("des captures plus anciennes que ce qui est lu : un échange qu’il remontre, pas de nouveaux messages", () => {
    const c = capture({
      date: "2026-10-29",
      heure: "18:10",
      messages: [
        ["autre", "t’as pensé à moi ?"],
        ["moi", "grave"],
      ],
    });
    const r = messagesDesCaptures(c, H, { aujourdhui: "2026-11-02", apres: Date.UTC(2026, 9, 28, 21), vuJusqua: Date.UTC(2026, 9, 31, 20), lus: [] });
    expect([r.nouveaux, textes(r.remontres), r.dejaLus]).toEqual([[], ["t’as pensé à moi ?", "grave"], false]);
  });

  it("deux écrans dans le désordre : trois messages lus de suite, ailleurs qu’en tête, sont reconnus", () => {
    const c = capture(
      {
        date: "2026-09-14",
        heure: "21:40",
        messages: [
          ["autre", "t’as vu ce que Marc a dit ?"],
          ["moi", "non quoi"],
        ],
      },
      {
        date: "2026-10-30",
        heure: "22:58",
        messages: [
          ["autre", "tu dors ?"],
          ["moi", "non et toi"],
          ["autre", "bonne nuit 😘"],
        ],
      },
      { date: "2026-10-31", heure: "10:02", messages: [["autre", "bien dormi ?"]] },
    );
    expect(textes(lire30(c).nouveaux)).toEqual(["bien dormi ?"]);
  });
});

describe("des captures datées trop tard, jamais trop tôt", () => {
  it("prise la veille au soir, envoyée le matin : « Aujourd’hui » se lit le jour de l’envoi, ce qui est lu se retrouve quand même", () => {
    const soir = [
      lu("autre", "tu fais quoi ce soir ?", "2026-10-31 20:00:10"),
      lu("toi", "rien et toi ?", "2026-10-31 20:05:00"),
      lu("autre", "je sors avec les filles", "2026-10-31 20:10:00"),
    ];
    const c = capture(
      {
        date: "2026-11-01",
        heure: "20:00",
        messages: [
          ["autre", "tu fais quoi ce soir ?"],
          ["moi", "rien et toi ?"],
          ["autre", "je sors avec les filles"],
        ],
      },
      { date: "2026-11-01", heure: "22:40", messages: [["autre", "tu me rejoins ?"]] },
    );
    const r = messagesDesCaptures(c, H, { aujourdhui: "2026-11-01", apres: Date.UTC(2026, 9, 31, 20, 10), lus: soir });
    expect(textes(r.nouveaux)).toEqual(["tu me rejoins ?"]);
  });

  it("un bloc d’Instagram qui passe minuit sans nouveau repère : sa suite est nouvelle", () => {
    const nuit = [
      lu("autre", "on se voit demain ?", "2026-10-31 23:50:00"),
      lu("toi", "oui", "2026-10-31 23:52:00"),
      lu("autre", "t’es rentré ?", "2026-11-01 00:05:00"),
      lu("toi", "oui à l’instant", "2026-11-01 00:15:00"),
    ];
    const c = capture({
      date: "2026-10-31",
      heure: "23:50",
      messages: [
        ["autre", "on se voit demain ?"],
        ["moi", "oui"],
        ["autre", "t’es rentré ?"],
        ["moi", "oui à l’instant"],
        ["autre", "bonne nuit"],
      ],
    });
    const r = messagesDesCaptures(c, H, { aujourdhui: "2026-11-01", apres: Date.UTC(2026, 10, 1, 0, 15), lus: nuit });
    expect([textes(r.nouveaux), r.anciens]).toEqual([["bonne nuit"], []]);
  });

  it("deux captures d’Instagram du même jour envoyées dans le désordre : rangées à leur heure, la suivante retrouve le bout", () => {
    const apres = Date.UTC(2026, 10, 1, 22, 0);
    const premiere = messagesDesCaptures(
      capture({
        date: "2026-11-05",
        heure: "18:00",
        messages: [
          ["autre", "t’es fâché ?"],
          ["moi", "non pourquoi"],
          ["autre", "tu réponds plus"],
        ],
      }),
      H,
      { aujourdhui: "2026-11-05", apres },
    );
    const lus1 = inserer([], premiere.aNoter, premiere.ancre);
    const matin = messagesDesCaptures(
      capture({
        date: "2026-11-05",
        heure: "09:00",
        messages: [
          ["autre", "t’as oublié mon anniv"],
          ["moi", "mince désolé"],
        ],
      }),
      H,
      { aujourdhui: "2026-11-05", apres, lus: lus1 },
    );
    const lus2 = inserer(lus1, matin.aNoter, matin.ancre);
    expect(lus2.map((e) => e.t)).toEqual([...matin.aNoter.map((e) => e.t), ...premiere.aNoter.map((e) => e.t)]);
    const soir = capture({
      date: "2026-11-05",
      heure: "18:00",
      messages: [
        ["moi", "non pourquoi"],
        ["autre", "tu réponds plus"],
        ["autre", "bon ok"],
      ],
    });
    expect(textes(messagesDesCaptures(soir, H, { aujourdhui: "2026-11-05", apres, lus: lus2 }).nouveaux)).toEqual(["bon ok"]);
  });

  it("une capture « AUJOURD’HUI » sans haut repris se range après l’export du matin du même jour", () => {
    const rangees = inserer([lu("toi", "salut", "2026-10-31 10:00:00")], [lu("autre", "coucou", "2026-10-31 00:00:00", "jour")]);
    expect(rangees.map((e) => e.heure)).toEqual(["exacte", "jour"]);
  });

  it("l’écran le plus courant d’Instagram, renvoyé avec la suite : ses messages restent dans l’ordre de la conv, seule la suite est nouvelle", () => {
    const nuit = [lu("autre", "tu dors ?", "2026-10-30 22:58:03"), lu("toi", "non et toi", "2026-10-30 23:01:00"), lu("autre", "bonne nuit 😘", "2026-10-30 23:10:45")];
    const apres = Date.UTC(2026, 9, 30, 23, 10, 45);
    const ecran = (...suite: Bloc["messages"]) =>
      capture(
        {
          date: null,
          messages: [
            ["moi", "non et toi"],
            ["autre", "bonne nuit 😘"],
            ["autre", "en vrai je dors pas"],
          ],
        },
        { date: "2026-10-31", heure: "10:02", messages: [["autre", "on se voit ce soir ?"], ...suite] },
      );
    const premier = messagesDesCaptures(ecran(), H, { aujourdhui: "2026-10-31", apres, lus: nuit });
    expect(textes(premier.nouveaux)).toEqual(["en vrai je dors pas", "on se voit ce soir ?"]);
    const notes = inserer(nuit, premier.aNoter, premier.ancre);
    expect(notes.slice(-3).map((e) => e.heure)).toEqual(["exacte", "auPlusTard", "repere"]);
    const second = messagesDesCaptures(ecran(["moi", "oui 20h ?"]), H, { aujourdhui: "2026-10-31", apres, lus: notes, vuJusqua: Date.UTC(2026, 9, 31, 10, 2) });
    expect(textes(second.nouveaux)).toEqual(["oui 20h ?"]);
    /* La même, sans la suite : rien de neuf */
    expect(messagesDesCaptures(ecran(), H, { aujourdhui: "2026-10-31", apres, lus: notes }).dejaLus).toBe(true);
  });

  it("trois photos comme celles d’hier, ou une photo neuve en haut d’un écran sans repère : nouvelles, pas reprises à un jour près", () => {
    const photos = [0, 1, 2].map((k) => lu("autre", "", `2026-10-30 20:0${k}:00`, "exacte", "photo"));
    const c = captures({
      autre: "Léa",
      blocs: [
        {
          repere: { date: "2026-10-31", heure: null },
          messages: [msg("autre", "", { media: "photo" }), msg("autre", "", { media: "photo" }), msg("autre", "", { media: "photo" }), msg("autre", "regarde")],
        },
      ],
    });
    expect(messagesDesCaptures(c, H, { aujourdhui: "2026-10-31", apres: Date.UTC(2026, 9, 30, 20, 2), lus: photos }).nouveaux).toHaveLength(4);
    const haut = captures({
      autre: "Léa",
      blocs: [
        { repere: null, messages: [msg("autre", "", { media: "photo" })] },
        { repere: { date: "2026-10-31", heure: "09:00" }, messages: [msg("autre", "bien dormi ?")] },
      ],
    });
    expect(messagesDesCaptures(haut, H, { aujourdhui: "2026-10-31", apres: Date.UTC(2026, 9, 30, 20, 2), lus: photos }).nouveaux).toHaveLength(2);
  });

  it("une date lue dans le futur compte pour aujourd’hui : la même capture, renvoyée, est reconnue", () => {
    const futur = capture({
      date: "2099-12-31",
      heure: "08:15",
      messages: [
        ["autre", "bien rentré ?"],
        ["moi", "oui"],
      ],
    });
    const apres = Date.UTC(2026, 9, 30, 23, 10);
    const premiere = messagesDesCaptures(futur, H, { aujourdhui: "2026-10-31", apres });
    expect(premiere.aNoter.every((e) => e.t <= Date.UTC(2026, 9, 31, 23, 59, 59, 999))).toBe(true);
    expect(messagesDesCaptures(futur, H, { aujourdhui: "2026-10-31", apres, lus: inserer([], premiere.aNoter, premiere.ancre) }).dejaLus).toBe(true);
  });

  it("un vieil échange envoyé avec un message neuf : il passe avant lui, comme un échange qu’il remontre", () => {
    const c = capture(
      {
        date: "2026-09-14",
        heure: "21:40",
        messages: [
          ["autre", "je préfère qu’on reste amis"],
          ["moi", "ok je comprends"],
        ],
      },
      { date: "2026-10-31", heure: "10:02", messages: [["moi", "tu crois qu’on est quoi nous deux ?"]] },
    );
    const r = messagesDesCaptures(c, H, { aujourdhui: "2026-10-31", apres: Date.UTC(2026, 9, 30, 23, 10) });
    expect([textes(r.nouveaux), textes(r.anciens)]).toEqual([["tu crois qu’on est quoi nous deux ?"], ["je préfère qu’on reste amis", "ok je comprends"]]);
    const a = numeroter(r.nouveaux, [], H, { debut: 500, aujourdhui: "2026-10-31", anciens: r.anciens });
    expect(blocAjout(a)).toEqual(["(un échange plus ancien qu’il te remontre)", `  ${a.lignes[0]}`, `  ${a.lignes[1]}`, "(puis ses nouveaux messages)", `  ${a.lignes[2]}`]);
  });
});

describe("plusieurs envois de suite : ce qui est noté garde l’ordre de la conv", () => {
  it("un « bonne nuit » relu en haut d’un écran sans repère (limite acceptée) ne fait pas perdre celui du soir, après l’export", () => {
    const nuit = [lu("toi", "dors bien", "2026-11-01 23:05:00"), lu("autre", "bonne nuit 😘", "2026-11-01 23:10:00")];
    const matin = messagesDesCaptures(
      capture({
        date: null,
        messages: [
          ["autre", "bonne nuit 😘"],
          ["autre", "coucou"],
          ["moi", "salut"],
          ["autre", "ça va ?"],
        ],
      }),
      H,
      {
        aujourdhui: "2026-11-02",
        apres: Date.UTC(2026, 10, 1, 23, 10),
        lus: nuit,
      },
    );
    expect(matin.nouveaux).toHaveLength(4);
    const apresMatin = inserer(nuit, matin.aNoter, matin.ancre);
    const r = messagesDeLExport(
      ios([
        ["01/11/2026 23:10:00", "Léa", "bonne nuit 😘"],
        ["02/11/2026 08:00:00", "Léa", "coucou"],
        ["02/11/2026 08:05:00", "Tom", "salut"],
        ["02/11/2026 08:06:00", "Léa", "ça va ?"],
        ["02/11/2026 22:40:00", "Tom", "tu fais quoi demain ?"],
      ]),
      H,
      Date.UTC(2026, 10, 1, 23, 10),
      { lus: apresMatin },
    );
    if (typeof r === "string") throw new Error(r);
    expect(textes(r.nouveaux)).toEqual(["tu fais quoi demain ?"]);
    const apresExport = remplacer(apresMatin, r.aNoter, r.repris);
    const soir = capture({
      date: "2026-11-02",
      heure: "22:40",
      messages: [
        ["moi", "tu fais quoi demain ?"],
        ["autre", "bonne nuit 😘"],
      ],
    });
    expect(textes(messagesDesCaptures(soir, H, { aujourdhui: "2026-11-02", apres: r.fin, lus: apresExport }).nouveaux)).toEqual(["bonne nuit 😘"]);
  });

  it("une capture prise la veille au soir, envoyée le matin, dont le haut a des messages courts : retrouvée grâce à un message long", () => {
    const soir = [lu("autre", "tu fais quoi ce soir ?", "2026-10-31 20:00:00"), lu("toi", "rien", "2026-10-31 20:05:00"), lu("autre", "ok", "2026-10-31 20:06:00")];
    const c = capture(
      {
        date: "2026-11-01",
        heure: "20:00",
        messages: [
          ["autre", "tu fais quoi ce soir ?"],
          ["moi", "rien"],
          ["autre", "ok"],
        ],
      },
      { date: "2026-11-01", heure: "22:40", messages: [["autre", "tu me rejoins ?"]] },
    );
    expect(textes(messagesDesCaptures(c, H, { aujourdhui: "2026-11-01", apres: Date.UTC(2026, 9, 31, 20, 6), lus: soir }).nouveaux)).toEqual(["tu me rejoins ?"]);
  });

  it("trois photos neuves comme celles d’une capture du même jour, après un message neuf : nouvelles (trois de suite exigent un message long)", () => {
    const deja = [0, 1, 2].map(() => lu("autre", "", "2026-10-31 00:00:00", "jour", "photo"));
    const c = captures({
      autre: "Léa",
      blocs: [
        {
          repere: { date: "2026-10-31", heure: null },
          messages: [msg("autre", "coucou"), msg("autre", "", { media: "photo" }), msg("autre", "", { media: "photo" }), msg("autre", "", { media: "photo" })],
        },
      ],
    });
    expect(messagesDesCaptures(c, H, { aujourdhui: "2026-10-31", apres: Date.UTC(2026, 9, 30, 22), lus: deja }).nouveaux).toHaveLength(4);
  });

  it("ce qui suit un haut repris jusqu’au bout est nouveau, même d’un jour plus ancien que le dernier instant lu", () => {
    const deja = [lu("autre", "on se voit demain soir ?", "2026-10-30 23:50:00"), lu("toi", "oui grave, je passe te prendre", "2026-10-30 23:55:00")];
    const c = capture({
      date: "2026-10-30",
      heure: "23:50",
      messages: [
        ["autre", "on se voit demain soir ?"],
        ["moi", "oui grave, je passe te prendre"],
        ["autre", "à 20h alors"],
      ],
    });
    /* Un repère mal lu d’un envoi précédent a poussé le dernier instant lu au 2 novembre */
    const r = messagesDesCaptures(c, H, { aujourdhui: "2026-11-02", apres: Date.UTC(2026, 9, 30, 23, 55), vuJusqua: Date.UTC(2026, 10, 2, 10), lus: deja });
    expect([textes(r.nouveaux), r.anciens]).toEqual([["à 20h alors"], []]);
  });
});

describe("un export ajouté : ce qui est déjà lu, à l’heure près (H1, H5)", () => {
  it("des vocaux du matin lus par une capture, d’autres le soir : l’export reprend ceux qui suivent le même message", () => {
    const deja = [
      lu("toi", "tu viens ?", "2026-10-30 22:00:00"),
      lu("autre", "regarde ça", "2026-10-31 00:00:00", "jour"),
      lu("autre", "", "2026-10-31 00:00:00", "jour", "vocal"),
      lu("autre", "", "2026-10-31 00:00:00", "jour", "vocal"),
    ];
    const texte = [
      "[30/10/2026 22:00:00] Tom: tu viens ?",
      "[31/10/2026 09:00:00] Léa: regarde ça",
      "[31/10/2026 09:01:00] Léa: \u200eaudio omis",
      "[31/10/2026 09:02:00] Léa: \u200eaudio omis",
      "[31/10/2026 20:00:00] Léa: t’es où ce soir ?",
      "[31/10/2026 20:01:00] Léa: \u200eaudio omis",
      "[31/10/2026 20:02:00] Léa: \u200eaudio omis",
    ].join("\n");
    const r = messagesDeLExport(texte, H, Date.UTC(2026, 9, 30, 22), { lus: deja });
    if (typeof r === "string") throw new Error(r);
    expect(r.nouveaux.map((m) => new Date(m.t).toISOString().slice(11, 16))).toEqual(["20:00", "20:01", "20:02"]);
  });

  it("un « ok » neuf dans la même minute que le dernier lu : le lu est le plus ancien, le neuf reste neuf", () => {
    const r = lireExport_(
      ios([
        ["30/10/2026 21:59:00", "Tom", "tu viens ?"],
        ["30/10/2026 22:00:10", "Léa", "ok"],
        ["30/10/2026 22:00:40", "Léa", "ok"],
      ]),
      Date.UTC(2026, 9, 30, 22, 0, 10),
      [lu("toi", "tu viens ?", "2026-10-30 21:59:00"), lu("autre", "ok", "2026-10-30 22:00:10")],
    );
    expect(r.nouveaux.map((m) => new Date(m.t).toISOString().slice(11, 19))).toEqual(["22:00:40"]);
  });

  it("un curseur à la seconde, puis un export à la minute (Android, HTML d’Instagram) : le message neuf de la même minute est lu", () => {
    const texte = ["30/10/2026 22:50 - Tom: ça va ?", "30/10/2026 22:51 - Léa: on verra", "30/10/2026 22:51 - Tom: ok dors bien"].join("\n");
    const deja = [lu("toi", "ça va ?", "2026-10-30 22:50:12"), lu("autre", "on verra", "2026-10-30 22:51:36")];
    expect(textes(lireExport_(texte, Date.UTC(2026, 9, 30, 22, 51, 36), deja).nouveaux)).toEqual(["ok dors bien"]);
  });

  it("sans les messages lus de la minute du curseur (une conv d’avant la PR, puis une capture) : le dernier lu ne revient pas", () => {
    const texte = ios([
      ["12/03/2026 19:03:45", "Tom", "on se fait le libanais ?"],
      ["12/03/2026 22:51:36", "Léa", "je suis crevée, on verra"],
    ]);
    const r = lireExport_(texte, Date.UTC(2026, 2, 12, 22, 51, 36), [lu("autre", "bien dormi ?", "2026-03-15 00:00:00", "jour")]);
    expect(r.nouveaux).toEqual([]);
  });

  it("un export plus ancien que des captures : sa fenêtre se place avant elles, l’export complet suivant les retrouve", () => {
    const deja = [
      lu("autre", "bonne nuit", "2026-11-01 22:00:00"),
      lu("autre", "t’es fâché ?", "2026-11-05 18:00:00", "repere"),
      lu("toi", "non pourquoi", "2026-11-05 18:00:00", "repere"),
    ];
    const ancien = lireExport_(
      ios([
        ["01/11/2026 22:00:00", "Léa", "bonne nuit"],
        ["03/11/2026 18:00:00", "Tom", "coucou"],
      ]),
      Date.UTC(2026, 10, 1, 22, 0),
      deja,
    );
    const apres = remplacer(deja, ancien.aNoter, ancien.repris);
    expect(apres.map((e) => e.heure)).toEqual(["exacte", "exacte", "repere", "repere"]);
    const complet = lireExport_(
      ios([
        ["03/11/2026 18:00:00", "Tom", "coucou"],
        ["05/11/2026 18:02:00", "Léa", "t’es fâché ?"],
        ["05/11/2026 18:03:00", "Tom", "non pourquoi"],
        ["05/11/2026 18:10:00", "Léa", "bon ok"],
      ]),
      ancien.fin,
      apres,
    );
    expect(textes(complet.nouveaux)).toEqual(["bon ok"]);
  });

  function lireExport_(texte: string, apres: number, lus: readonly Lu[]) {
    const r = messagesDeLExport(texte, H, apres, { lus });
    if (typeof r === "string") throw new Error(r);
    return r;
  }

  it("une conv de captures, puis l’export : son dernier bloc, à l’heure du repère, ne revient pas", () => {
    const deja = [
      lu("autre", "tu fais quoi ce soir", "2026-10-30 21:00:00", "repere"),
      lu("toi", "rien de ouf", "2026-10-30 21:00:00", "repere"),
      lu("autre", "tu dors ?", "2026-10-30 21:00:00", "repere"),
    ];
    const r = lireExport_(
      ios([
        ["30/10/2026 21:02:10", "Léa", "tu fais quoi ce soir"],
        ["30/10/2026 21:40:33", "Tom", "rien de ouf"],
        ["30/10/2026 22:58:03", "Léa", "tu dors ?"],
        ["31/10/2026 10:02:00", "Léa", "bien dormi ?"],
      ]),
      Date.UTC(2026, 9, 30, 21, 0),
      deja,
    );
    expect(textes(r.nouveaux)).toEqual(["bien dormi ?"]);
    expect([r.repris.length, r.fin]).toEqual([3, Date.UTC(2026, 9, 31, 10, 2)]);
  });

  it("l’export après deux envois de captures : il ne relit pas ce qu’elles ont apporté, et garde ce qu’elles ne montraient pas", () => {
    const deja = [
      lu("autre", "bonne nuit", "2026-11-01 22:00:00"),
      lu("autre", "tu fais quoi samedi ?", "2026-11-05 00:00:00", "jour"),
      lu("toi", "rien de prévu", "2026-11-05 00:00:00", "jour"),
      lu("autre", "alors ce resto ?", "2026-11-08 18:30:00", "repere"),
      lu("toi", "go 20h", "2026-11-08 18:30:00", "repere"),
    ];
    const r = lireExport_(
      ios([
        ["01/11/2026 22:00:00", "Léa", "bonne nuit"],
        ["03/11/2026 18:00:00", "Léa", "pas vu par les captures"],
        ["05/11/2026 12:00:00", "Léa", "tu fais quoi samedi ?"],
        ["05/11/2026 12:05:00", "Tom", "rien de prévu"],
        ["06/11/2026 09:00:00", "Tom", "entre les deux"],
        ["08/11/2026 19:00:00", "Léa", "alors ce resto ?"],
        ["08/11/2026 19:10:00", "Tom", "go 20h"],
        ["08/11/2026 19:40:00", "Léa", "parfait"],
      ]),
      Date.UTC(2026, 10, 1, 22, 0),
      deja,
    );
    expect(textes(r.nouveaux)).toEqual(["pas vu par les captures", "entre les deux", "parfait"]);
  });

  it("les rituels des jours suivants (« bonne nuit ») restent nouveaux : un message lu par un export ne se reprend qu’à la minute", () => {
    const deja = [lu("toi", "bonne nuit", "2026-10-30 23:55:00"), lu("autre", "bonne nuit 😘", "2026-10-30 23:58:00")];
    const r = lireExport_(
      ios([
        ["30/10/2026 23:55:00", "Tom", "bonne nuit"],
        ["30/10/2026 23:58:00", "Léa", "bonne nuit 😘"],
        ["31/10/2026 23:50:00", "Tom", "bonne nuit"],
        ["31/10/2026 23:52:00", "Léa", "bonne nuit 😘"],
      ]),
      Date.UTC(2026, 9, 30, 23, 58),
      deja,
    );
    expect(r.nouveaux.map((m) => new Date(m.t).toISOString().slice(0, 16))).toEqual(["2026-10-31T23:50", "2026-10-31T23:52"]);
  });

  it("Android, à la minute : un message de la même minute que le dernier lu est nouveau", () => {
    const deja = [lu("autre", "je suis crevée, on verra", "2026-10-30 22:51:00")];
    const texte = ["30/10/2026 22:50 - Tom: ça va ?", "30/10/2026 22:51 - Léa: je suis crevée, on verra", "30/10/2026 22:51 - Tom: ok dors bien"].join("\n");
    expect(textes(lireExport_(texte, Date.UTC(2026, 9, 30, 22, 51), deja).nouveaux)).toEqual(["ok dors bien"]);
  });

  it("le curseur va au bout de l’export, même quand ses derniers messages venaient déjà de captures", () => {
    const deja = [lu("autre", "réveillé ?", "2026-10-31 00:00:00", "jour"), lu("toi", "à peine", "2026-10-31 00:00:00", "jour")];
    const r = lireExport_(
      ios([
        ["30/10/2026 22:00:00", "Léa", "on verra"],
        ["30/10/2026 23:00:00", "Tom", "pas vu par les captures"],
        ["31/10/2026 09:00:00", "Léa", "réveillé ?"],
        ["31/10/2026 09:05:00", "Tom", "à peine"],
      ]),
      Date.UTC(2026, 9, 30, 22, 0),
      [lu("autre", "on verra", "2026-10-30 22:00:00"), ...deja],
    );
    expect(textes(r.nouveaux)).toEqual(["pas vu par les captures"]);
    expect(r.fin).toBe(Date.UTC(2026, 9, 31, 9, 5));
  });

  it("deux « ok » du même jour, un seul lu par une capture : un seul reste nouveau (la capture montrait le plus récent)", () => {
    const r = lireExport_(
      ios([
        ["30/10/2026 21:59:00", "Tom", "tu viens ?"],
        ["30/10/2026 22:00:00", "Léa", "on verra"],
        ["31/10/2026 09:00:00", "Léa", "ok"],
        ["31/10/2026 21:00:00", "Léa", "ok"],
      ]),
      Date.UTC(2026, 9, 30, 22, 0),
      [lu("autre", "on verra", "2026-10-30 22:00:00"), lu("autre", "ok", "2026-10-31 00:00:00", "jour")],
    );
    expect(r.nouveaux.map((m) => new Date(m.t).toISOString().slice(11, 16))).toEqual(["09:00"]);
  });
});

describe("la clé d’un message", () => {
  it("un média légendé d’Android et la même photo d’une capture ont la même clé ; un emoji garde sa forme", () => {
    expect(cleDuMessage({ role: "autre", texte: "regarde la vue [média]" })).toBe(cleDuMessage({ role: "autre", texte: "regarde la vue [photo]" }));
    expect(cleDuMessage({ role: "autre", texte: "❤️" })).toBe(cleDuMessage({ role: "autre", texte: "❤" }));
    expect(cleDuMessage({ role: "autre", texte: "regarde la vue" })).not.toBe(cleDuMessage({ role: "autre", texte: "regarde la vue [photo]" }));
  });
});

describe("un échange qu’il remontre (H6)", () => {
  it("lu sans être nouveau : en tête, sans flèche, et l’envoi n’est pas « rien de neuf »", () => {
    const c = captures({
      autre: "Léa",
      blocs: [{ repere: { date: "2026-09-14", heure: "21:40" }, messages: [msg("autre", "t’as vu ce que Marc a dit ?"), msg("moi", "non quoi"), msg("autre", "laisse tomber")] }],
    });
    const { nouveaux, remontres } = messagesDesCaptures(c, H, { aujourdhui: "2026-10-31", apres: Date.UTC(2026, 9, 30, 23, 10) });
    expect(nouveaux).toEqual([]);
    const a = numeroter(nouveaux, [], H, { debut: 500, aujourdhui: "2026-10-31", anciens: remontres });
    expect(a).toMatchObject({ messages: 0, rappel: 3, cibles: [] });
    const bloc = blocAjout(a);
    expect(bloc[0]).toBe(`(${TETE_DU_RAPPEL})`);
    expect(bloc.slice(1).every((l) => l.startsWith("  m0"))).toBe(true);
    expect(resumeAjout(a, "captures", 2)).toBe("(2 captures\u00a0: un échange plus ancien)");
  });

  it("avec son profil et sans nouveau message, le profil a sa propre ligne", () => {
    const c = captures({
      autre: "Léa",
      blocs: [{ repere: { date: "2026-09-14", heure: "21:40" }, messages: [msg("autre", "t’as vu ce que Marc a dit ?"), msg("moi", "non quoi")] }],
    });
    const { nouveaux, remontres } = messagesDesCaptures(c, H, { aujourdhui: "2026-10-31", apres: Date.UTC(2026, 9, 30, 23, 10) });
    const a = numeroter(nouveaux, ["étudiante en droit"], H, { debut: 500, aujourdhui: "2026-10-31", anciens: remontres });
    expect(blocAjout(a).slice(-2)).toEqual(["(puis ce qu’on lit sur son profil)", `  ${a.lignes[2]}`]);
  });

  it("la mémoire le lit sous sa propre tête, et sait ce qu’un export trop long n’a pas laissé lire", () => {
    const l = (id: string, jour: string, nom: string, texte: string) => ligneMessage({ id, jour, heure: "21:40", nom, texte });
    const rappel = [l("m0500", "2026-09-14", "Léa", "je préfère qu’on reste amis"), l("m0501", "2026-09-14", "Tom", "ok je comprends")];
    expect(rendreNouveau({ date: "2026-11-02", lignes: rappel, rappel: 2, dit: "ça veut dire quoi ?" }, H, 502).texte).toContain(
      `un échange plus ancien qu’il te remontre, pas où ils en sont maintenant :\n${rappel[0]}`,
    );
    expect(rendreNouveau({ date: "2026-11-02", lignes: rappel, rappel: 2 }, H, 502).texte).not.toContain("ajouté à la conv");
    const suite = [l("m1000", "2026-04-23", "Tom", "message 1000")];
    expect(rendreNouveau({ date: "2026-11-02", lignes: suite, ignores: 600 }, H, 1001).texte).toContain(
      `ajouté à la conv :\n[… 600 nouveaux messages plus anciens, que tu n’as pas lus …]\n${suite[0]}`,
    );
  });
});

describe("la rafale à laquelle répondre (H8)", () => {
  const rafale = (texte: string) => {
    const lu = lire(texte, { ...H, format: "whatsapp-ios" });
    const a = numeroter(lu.messages, [], H, { debut: 1, aujourdhui: "2026-10-31" });
    return a.lignes.filter((l) => a.cibles.includes(l.slice(0, 5))).map((l) => l.split(" : ").slice(1).join(" : "));
  };

  it("un message supprimé de lui ne referme pas sa rafale à elle", () => {
    expect(
      rafale(
        ios([
          ["31/10/2026 18:00:00", "Léa", "on se voit demain ?"],
          ["31/10/2026 18:02:00", "Tom", "\u200eVous avez supprimé ce message."],
        ]),
      ),
    ).toEqual(["on se voit demain ?"]);
  });

  it("un appel manqué de lui ne referme pas sa rafale à elle, et n’en est pas la cible quand il vient d’elle", () => {
    expect(
      rafale(
        ios([
          ["31/10/2026 18:00:00", "Léa", "tu m’appelles ?"],
          ["31/10/2026 18:02:00", "Tom", "\u200eAppel vocal manqué, Appuyez pour rappeler"],
        ]),
      ),
    ).toEqual(["tu m’appelles ?"]);
    expect(
      rafale(
        ios([
          ["31/10/2026 18:00:00", "Léa", "décroche"],
          ["31/10/2026 18:02:00", "Léa", "\u200eAppel vocal manqué, Appuyez pour rappeler"],
        ]),
      ),
    ).toEqual(["décroche"]);
  });

  it("un appel ou un message supprimé d’elle ne sont pas la cible", () => {
    expect(
      rafale(
        ios([
          ["31/10/2026 18:00:00", "Léa", "t’es où ?"],
          ["31/10/2026 18:05:00", "Léa", "\u200eAppel vocal \u200e2 min"],
        ]),
      ),
    ).toEqual(["t’es où ?"]);
    expect(
      rafale(
        ios([
          ["31/10/2026 18:00:00", "Léa", "t’es où ?"],
          ["31/10/2026 18:01:00", "Léa", "\u200eCe message a été supprimé."],
        ]),
      ),
    ).toEqual(["t’es où ?"]);
  });
});

describe("un export trop long pour être lu en entier (H3)", () => {
  it("le dit, au modèle comme dans l’historique", () => {
    const a = { lignes: ["m0001 2026-04-23 jeu. 23:00 Tom : message 1000"], cibles: [], messages: 400, profil: 0, rappel: 0, ignores: 600, dernier: null, lus: [] };
    expect(blocAjout(a)[0]).toBe("[… 600 nouveaux messages plus anciens, que tu n’as pas lus …]");
    expect(resumeAjout(a, "export", 1)).toBe("(ton export\u00a0: les 400 derniers de tes 1\u00a0000 nouveaux messages)");
  });
});

describe("le jour et l’heure du téléphone (H7, C7)", () => {
  it("« Aujourd’hui » le soir à Fort-de-France est encore la veille à Paris", () => {
    const soir = new Date("2026-10-31T21:30:00-04:00");
    expect(jourDans("America/Martinique", soir)).toBe("2026-10-31");
    expect(jourDans("Europe/Paris", soir)).toBe("2026-11-01");
    expect(aujourdhuiDans("America/Martinique", soir).iso).toBe("2026-10-31");
  });

  it("un fuseau inconnu : Paris", () => {
    expect(fuseauSur("Lune/Base")).toBe("Europe/Paris");
    expect(fuseauSur(undefined)).toBe("Europe/Paris");
    expect(fuseauSur("America/Sao_Paulo")).toBe("America/Sao_Paulo");
  });

  it("les heures d’Instagram à l’heure du téléphone : 21:30 à São Paulo reste 21:30", () => {
    const json = JSON.stringify({ messages: [{ sender_name: "Ana", timestamp_ms: Date.parse("2026-10-01T00:30:00Z"), content: "oi" }] });
    expect(depuisInstagramJsonDans("America/Sao_Paulo", json).texte).toBe("[30/09/2026 21:30:00] Ana: oi");
    expect(lireExport([{ nom: "message_1.json", contenu: json }], { fuseau: "America/Sao_Paulo" })?.texte).toBe("[30/09/2026 21:30:00] Ana: oi");
    expect(lireExport([{ nom: "message_1.json", contenu: json }])?.texte).toBe("[01/10/2026 02:30:00] Ana: oi");
    /* Le choix de la conv montre le même jour que l’import lira */
    expect(resumeConvInstagram([{ nom: "message_1.json", contenu: json }], { fuseau: "America/Sao_Paulo" })?.derniere).toBe("2026-09-30");
  });

  it("le paquet du navigateur : lu à l’heure de son téléphone, ou à celle de la conv à laquelle il s’ajoute", async () => {
    const json = JSON.stringify({ messages: [{ sender_name: "Ana", timestamp_ms: Date.parse("2026-10-01T00:30:00Z"), content: "oi" }] });
    const paquet = (fuseau?: string) =>
      new File([gzipSync(JSON.stringify({ nom: "export", parties: [{ nom: "message_1.json", contenu: json }], ...(fuseau ? { fuseau } : {}) }))], "export.json.gz");
    expect(await depuisPaquet(paquet("America/Sao_Paulo"))).toMatchObject({ texte: "[30/09/2026 21:30:00] Ana: oi", fuseau: "America/Sao_Paulo" });
    /* Une conv importée à Paris : un export ajouté depuis São Paulo se relit à l’heure de Paris, comme le reste de la conv */
    expect(await depuisPaquet(paquet("America/Sao_Paulo"), { fuseau: "Europe/Paris" })).toMatchObject({ texte: "[01/10/2026 02:30:00] Ana: oi", fuseau: "Europe/Paris" });
    /* Un navigateur d’avant le fuseau : Paris, sans fuseau gardé (fuseauDe le redonne) */
    expect((await depuisPaquet(paquet())).fuseau).toBeUndefined();
  });
});

describe("le jour deviné et les appels décrochés (PR 5)", () => {
  it("le haut sans date et des captures sans aucune date valent « au plus tard » ; renvoyées, même le lendemain, elles sont reconnues", () => {
    const cas: [Captures, Heure[]][] = [
      [
        capture(
          {
            date: null,
            messages: [
              ["autre", "bonne nuit 😘"],
              ["moi", "dors bien"],
            ],
          },
          { date: "2026-10-31", heure: "09:50", messages: [["autre", "bien dormi ?"]] },
        ),
        ["auPlusTard", "auPlusTard", "repere"],
      ],
      [
        capture({
          date: null,
          messages: [
            ["autre", "on se voit quand pour le ciné"],
            ["moi", "samedi ?"],
            ["autre", "ok"],
          ],
        }),
        ["auPlusTard", "auPlusTard", "auPlusTard"],
      ],
    ];
    for (const [c, heures] of cas) {
      const t = versTexteCaptures(c, { moi: "Moi", autre: "Elle", aujourdhui: "2026-10-31" });
      const { messages } = lire(t.texte, { utilisateur: { ...H.utilisateur, nomExport: "Moi" }, autre: { ...H.autre, nomExport: "Elle" }, format: "captures" });
      /* Ce que la conv garde à l’import (src/server/analyse.ts, contexteDuCode) */
      const lus: Lu[] = messages.map((m) => ({ cle: cleDuMessage(m), t: m.t, heure: heureDuMessage(m) }));
      expect(lus.map((e) => e.heure)).toEqual(heures);
      for (const aujourdhui of ["2026-10-31", "2026-11-01"]) {
        const r = messagesDesCaptures(c, H, { aujourdhui, apres: Math.max(...lus.map((e) => e.t)), lus });
        expect([r.dejaLus, r.nouveaux]).toEqual([true, []]);
      }
    }
  });

  it("un appel décroché n’est pas distinctif (deux appels de 12 min, deux soirs de suite, sont deux appels), ni la cible de la réponse", () => {
    /* Hier soir, un appel de 12 min, lu dans un export */
    const hier = lu("autre", "Appel vocal, 12 min", "2026-10-30 21:00:00");
    const c = captures({
      autre: "Léa",
      blocs: [
        {
          repere: { date: "2026-10-31", heure: "20:00" },
          messages: [
            msg("autre", "Appel vocal · 12 min", { media: "appel" }),
            msg("moi", "trop bien de t’entendre"),
            msg("autre", "pareil"),
            msg("autre", "Appel vocal · 5 min", { media: "appel" }),
          ],
        },
      ],
    });
    const r = messagesDesCaptures(c, H, { aujourdhui: "2026-10-31", apres: hier.t, lus: [hier] });
    expect(textes(r.nouveaux)).toEqual(["Appel vocal, 12\u00a0min", "trop bien de t’entendre", "pareil", "Appel vocal, 5\u00a0min"]);
    expect(numeroter(r.nouveaux, [], H, { debut: 501, aujourdhui: "2026-10-31" }).cibles).toEqual(["m0503"]);
  });
});
