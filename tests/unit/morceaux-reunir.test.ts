import { beforeAll, describe, expect, it } from "vitest";
import { messagesDesCaptures } from "@prompts/lib/ajouts";
import { versTexteCaptures } from "@prompts/lib/captures";
import { heure as hhmm, jour as jourIso, lire, type Message } from "@prompts/lib/conv";
import { cleDuMessage, heureLue } from "@prompts/lib/reconnaitre";
import { relier, reunir, type ConvEnMorceaux, type MorceauRecu } from "@/server/morceaux";
import { fusionnerLots } from "@/server/video";
import { captures, msg } from "../aide/fabriques";

/*
 * La réunion des morceaux d’une conv (src/server/morceaux.ts, reunir et relier ; lot B du chantier « lecture des convs »,
 * PR 5) : un message de captures n’est un doublon que dans une suite de messages repris (G4), un bout coupé se reconnaît
 * dans l’entier (G9), une légende sans son repère (G10), les messages neufs se rangent à côté de ceux qu’ils reprennent
 * (G5, règles A, B et C), et des captures sans date se rangent sur leurs ancres sûres (jamais un rituel du soir), dont
 * elles ne prennent le jour qu’entre deux du même jour, ou sont refusées (G1b). Sans base. Une conv inventée : Hugo (toi)
 * et Léa.
 */

const p2 = (x: number) => String(x).padStart(2, "0");
const L = "\u200e";
type Ligne = [date: string, nom: string, texte: string, marque?: boolean];
/** Un export WhatsApp d’iPhone : ses lignes, une marque U+200E devant un média. */
const ios = (lignes: Ligne[]) => lignes.map(([d, n, t, mq]) => `${mq ? L : ""}[${d}] ${n}: ${mq ? L : ""}${t}`).join("\n");
/** `n` messages « message k » d’Hugo et de Léa en alternance, `pas` minutes d’écart, depuis `debut` (JJ/MM/AAAA HH:MM). */
function suite(debut: string, n: number, { pas = 1, texte = (k: number) => `message ${k}` } = {}): Ligne[] {
  const [d, h] = debut.split(" ");
  const [j, mo, a] = d!.split("/");
  const t0 = Date.UTC(+a!, +mo! - 1, +j!, +h!.split(":")[0]!, +h!.split(":")[1]!);
  return Array.from({ length: n }, (_, k) => {
    const x = new Date(t0 + k * pas * 60e3);
    return [`${p2(x.getUTCDate())}/${p2(x.getUTCMonth() + 1)}/${x.getUTCFullYear()} ${p2(x.getUTCHours())}:${p2(x.getUTCMinutes())}:00`, k % 2 ? "Léa" : "Hugo", texte(k)];
  });
}
const HUGO = { prenom: "Hugo", pronom: "il" as const, nomExport: "Hugo" };
const LEA = { prenom: "Léa", pronom: "elle" as const, nomExport: "Léa" };
type MorceauLu = { messages: Message[]; exact: boolean };
/** Un export lu, Hugo en toi. */
const exporte = (lignes: Ligne[]): MorceauLu => ({
  messages: lire(ios(lignes), { utilisateur: HUGO, autre: LEA, format: "whatsapp-ios" }, { autresEnTexte: true }).messages,
  exact: true,
});
type Bloc = { repere: { date: string; heure: string | null } | null; messages: ReturnType<typeof msg>[] };
/** Le texte de captures lues (prompt 01) : sans aucun repère, il est « sans date » (lot A). */
const texteDe = (blocs: Bloc[], aujourdhui: string, appli: "whatsapp" | "instagram" = "whatsapp") =>
  versTexteCaptures(captures({ appli, autre: "Léa", blocs }), { aujourdhui }).texte;
/** Des captures lues, « Moi » en toi : leur jour deviné (jourDevine) et leurs bouts coupés (coupe), posés par la lecture (lot A). */
const lues = (texte: string): MorceauLu => ({
  messages: lire(texte, { utilisateur: { ...HUGO, nomExport: "Moi" }, autre: LEA, format: "captures" }, { autresEnTexte: true }).messages,
  exact: false,
});
const capturees = (blocs: Bloc[], aujourdhui: string, appli: "whatsapp" | "instagram" = "whatsapp") => lues(texteDe(blocs, aujourdhui, appli));
/** Un bloc de captures : ses messages (de, texte), sous un repère (un jour, et peut-être une heure) ou sans. */
const bloc = (xs: [de: "moi" | "autre", t: string][], date: string | null = "2026-09-02", heure: string | null = null): Bloc => ({
  repere: date ? { date, heure } : null,
  messages: xs.map(([d, x]) => msg(d, x)),
});
const textes = (ms: Message[]) => ms.map((m) => (m.media ? `[${m.media}]` : m.texte));
/** Le jour et l’heure d’un message de la conv réunie, comme le modèle les lit, puis l’heure lue sur sa capture et son jour deviné. */
const quand = (m: Message) =>
  `${jourIso(m.t)} ${m.approx === false ? hhmm(m.t) : m.approx === "heure" ? `~${hhmm(m.t)}` : "--:--"}${m.tLu === undefined ? "" : ` lu ${jourIso(m.tLu)} ${hhmm(m.tLu)}`}${m.jourDevine ? ` ${m.jourDevine}` : ""}`;

const LONG = "Bon j’ai réfléchi à ce que tu m’as dit hier soir et franchement je pense que t’as raison, on devrait se voir samedi au calme";
/** Un export du 2 septembre, 58 « message k » à la minute depuis 10:00, puis LONG (Léa), « on dit 15h ? » (Hugo) et « parfait » (Léa). */
const exportLong = () =>
  exporte([...suite("02/09/2026 10:00", 58), ["02/09/2026 10:59:00", "Léa", LONG], ["02/09/2026 11:00:00", "Hugo", "on dit 15h ?"], ["02/09/2026 11:01:00", "Léa", "parfait"]]);
/** Le 2 septembre, 60 « message k » toutes les 3 minutes depuis 9:00 (le dernier, « message 59 », à 11:57). */
const exportMatin = () => exporte(suite("02/09/2026 09:00", 60, { pas: 3 }));
/** Le 2 septembre, 60 « message k » toutes les 2 minutes depuis 20:00 (« message 57 » à 21:54, le dernier à 21:58). */
const exportSoir = () => exporte(suite("02/09/2026 20:00", 60, { pas: 2 }));
/** Leur premier soir (le 1er septembre), 20 messages du 5, puis leur dernier soir (le 15) : des messages qui en disent assez. */
const exportDuMois = () =>
  exporte([
    ["01/09/2026 21:00:00", "Hugo", "salut c’est Hugo de la soirée chez Inès"],
    ["01/09/2026 21:05:00", "Léa", "ah oui coucou ! ça va ?"],
    ["01/09/2026 21:06:00", "Hugo", "super et toi"],
    ["01/09/2026 21:10:00", "Léa", "tranquille je rentre du sport"],
    ["01/09/2026 21:12:00", "Hugo", "ok"],
    ...suite("05/09/2026 10:00", 20, { pas: 30, texte: (k) => `on parle du film numéro ${k}` }),
    ["15/09/2026 22:00:00", "Léa", "bon je vais dormir"],
    ["15/09/2026 22:01:00", "Hugo", "bonne nuit"],
  ]);
const DEBUT: [de: "moi" | "autre", t: string][] = [
  ["moi", "je t’ajoute ici"],
  ["moi", "salut c’est Hugo de la soirée chez Inès"],
  ["autre", "ah oui coucou ! ça va ?"],
  ["moi", "super et toi"],
  ["autre", "tranquille je rentre du sport"],
  ["moi", "ok"],
];
const COURTS: [de: "moi" | "autre", t: string][] = [
  ["moi", "ok"],
  ["autre", "mdr"],
  ["moi", "tu fais quoi"],
  ["autre", "rien"],
];
/** Leur rituel du soir : assez de mots pour être distinctif, mais écrit tous les soirs. */
const RITUEL: [de: "moi" | "autre", t: string][] = [
  ["autre", "bonne nuit mon cœur"],
  ["moi", "toi aussi mon amour"],
];
/** Trente soirs de septembre : deux messages du jour, tous différents, puis leur rituel du soir. */
const exportDesSoirs = () =>
  exporte(
    Array.from({ length: 30 }, (_, d): Ligne[] => [
      [`${p2(d + 1)}/09/2026 22:00:00`, "Hugo", `t’as fait quoi le jour ${d} de ce mois`],
      [`${p2(d + 1)}/09/2026 22:01:00`, "Léa", `pas grand chose le jour ${d}`],
      [`${p2(d + 1)}/09/2026 22:30:00`, "Léa", "bonne nuit mon cœur"],
      [`${p2(d + 1)}/09/2026 22:31:00`, "Hugo", "toi aussi mon amour"],
    ]).flat(),
  );

describe("des captures sur la conv : plus de faux doublons (G4)", () => {
  it("des petits mots et des médias de la veille ne sont pas ceux de l’export", () => {
    const exp = exporte([
      ["02/09/2026 08:12:40", "Léa", "image absente", true],
      ["02/09/2026 08:13:02", "Léa", "coucou"],
      ["02/09/2026 08:20:11", "Hugo", "coucou toi"],
      ["02/09/2026 08:21:30", "Hugo", "audio omis", true],
      ["02/09/2026 08:30:00", "Léa", "mdr"],
      ...suite("02/09/2026 09:00", 60),
    ]);
    const veille = capturees(
      [
        {
          repere: { date: "2026-09-01", heure: null },
          messages: [
            msg("moi", "coucou"),
            msg("autre", "", { media: "vocal" }),
            msg("autre", "mdr"),
            msg("moi", "", { media: "photo" }),
            msg("autre", "coucou toi"),
            msg("moi", "bonne nuit"),
          ],
        },
      ],
      "2026-09-02",
    );
    expect(reunir([exp, veille])).toMatchObject({ doublons: 0, gardes: [65, 6] });
  });

  it("deux soirs voisins de captures, les mêmes rituels : rien n’est en double", () => {
    const soir = (date: string, x: string) =>
      capturees(
        [
          {
            repere: { date, heure: "22:40" },
            messages: [
              msg("autre", "coucou"),
              msg("moi", "coucou"),
              msg("autre", x),
              msg("moi", "mdr"),
              msg("autre", "", { media: "photo" }),
              msg("moi", "bonne nuit"),
              msg("autre", "bonne nuit"),
            ],
          },
        ],
        "2026-10-31",
        "instagram",
      );
    expect(reunir([soir("2026-08-20", "t’as fait quoi aujourd’hui"), soir("2026-08-21", "tu dors ?")])).toMatchObject({ doublons: 0, gardes: [7, 7] });
  });

  it("le même jour, un « mdr » du matin n’efface pas celui du soir (repère 21:00)", () => {
    const exp = exporte([
      ["02/09/2026 08:10:00", "Léa", "coucou"],
      ["02/09/2026 08:11:00", "Hugo", "salut toi"],
      ["02/09/2026 08:12:00", "Léa", "mdr"],
      ...suite("02/09/2026 09:00", 50),
    ]);
    const soir = capturees(
      [
        bloc(
          [
            ["moi", "t’es rentrée ?"],
            ["autre", "oui"],
            ["moi", "raconte"],
            ["autre", "mdr"],
            ["autre", "coucou"],
          ],
          "2026-09-02",
          "21:00",
        ),
      ],
      "2026-09-02",
    );
    expect(reunir([exp, soir])).toMatchObject({ doublons: 0, gardes: [53, 5] });
  });

  it("limites écrites : un rituel distinctif deux soirs de suite est encore pris pour un doublon ; des rituels courts datés un jour trop tard restent en double", () => {
    const soir = (date: string, x: string) =>
      capturees(
        [{ repere: { date, heure: "23:30" }, messages: [msg("autre", x), msg("moi", "bonne nuit mon cœur"), msg("autre", "toi aussi mon amour")] }],
        "2026-10-31",
        "instagram",
      );
    expect(reunir([soir("2026-08-20", "j’ai trop ri ce soir"), soir("2026-08-21", "t’as passé une bonne journée ?")])).toMatchObject({ doublons: 2, gardes: [3, 1] });
    const exp = exporte([
      ...suite("02/09/2026 20:00", 40),
      ["02/09/2026 23:20:00", "Léa", "bonne nuit"],
      ["02/09/2026 23:21:00", "Hugo", "bonne nuit"],
      ["02/09/2026 23:22:00", "Léa", "dors bien"],
      ["02/09/2026 23:23:00", "Hugo", "toi aussi"],
    ]);
    const lendemain = capturees(
      [
        bloc(
          [
            ["autre", "bonne nuit"],
            ["moi", "bonne nuit"],
            ["autre", "dors bien"],
            ["moi", "toi aussi"],
            ["autre", "t’es encore là ?"],
          ],
          "2026-09-03",
        ),
      ],
      "2026-09-03",
    );
    expect(reunir([exp, lendemain])).toMatchObject({ doublons: 0, gardes: [44, 5] });
  });
});

describe("les vrais recouvrements restent des doublons", () => {
  it("la fin d’un export reprise par des captures du même soir, puis trois messages neufs après elle", () => {
    const exp = exporte([
      ...suite("02/09/2026 20:00", 40),
      ["02/09/2026 21:10:00", "Léa", "tu fais quoi samedi soir"],
      ["02/09/2026 21:11:00", "Hugo", "rien de prévu"],
      ["02/09/2026 21:12:00", "Léa", "ok"],
      ["02/09/2026 21:13:00", "Hugo", "mdr"],
      ["02/09/2026 21:14:00", "Léa", "image absente", true],
    ]);
    const caps = capturees(
      [
        {
          repere: { date: "2026-09-02", heure: "21:10" },
          messages: [
            msg("autre", "tu fais quoi samedi soir"),
            msg("moi", "rien de prévu"),
            msg("autre", "ok"),
            msg("moi", "mdr"),
            msg("autre", "", { media: "photo" }),
            msg("moi", "trop belle"),
            msg("autre", "merci"),
            msg("moi", "on se voit samedi alors"),
          ],
        },
      ],
      "2026-09-02",
    );
    const r = reunir([exp, caps]);
    expect(r).toMatchObject({ doublons: 5, gardes: [45, 3] });
    expect(r.messages.slice(-3).map(quand)).toEqual(Array(3).fill("2026-09-02 ~21:14 lu 2026-09-02 21:10"));
  });

  it("« Aujourd’hui » lu un jour trop tard : les doublons prennent le jour de l’export (parMorceau), les neufs gardent le leur", () => {
    const exp = exporte([
      ...suite("02/09/2026 20:00", 40),
      ["02/09/2026 23:20:00", "Léa", "tu fais quoi samedi soir"],
      ["02/09/2026 23:21:00", "Hugo", "rien de prévu encore"],
      ["02/09/2026 23:22:00", "Léa", "ok"],
      ["02/09/2026 23:23:00", "Hugo", "bonne nuit"],
    ]);
    const caps = capturees(
      [
        bloc(
          [
            ["autre", "tu fais quoi samedi soir"],
            ["moi", "rien de prévu encore"],
            ["autre", "ok"],
            ["moi", "bonne nuit"],
            ["autre", "dors bien"],
            ["moi", "toi aussi"],
          ],
          "2026-09-03",
        ),
      ],
      "2026-09-03",
    );
    const r = reunir([exp, caps]);
    expect(r).toMatchObject({ doublons: 4, gardes: [44, 2] });
    expect(r.parMorceau[1]!.map((m) => jourIso(m.t))).toEqual(["2026-09-02", "2026-09-02", "2026-09-02", "2026-09-02", "2026-09-03", "2026-09-03"]);
  });

  it("un bloc d’Instagram qui passe minuit : reconnu ; le message neuf reste à son repère (la règle A ne passe pas d’un jour à l’autre)", () => {
    const exp = exporte([
      ...suite("02/09/2026 20:00", 40),
      ["02/09/2026 23:52:00", "Léa", "t’as vu le match ce soir"],
      ["02/09/2026 23:58:00", "Hugo", "ouais de ouf"],
      ["03/09/2026 00:03:00", "Léa", "mdr"],
      ["03/09/2026 00:05:00", "Hugo", "bonne nuit"],
      ["03/09/2026 00:06:00", "Léa", "bonne nuit"],
    ]);
    const caps = capturees(
      [
        {
          repere: { date: "2026-09-02", heure: "23:50" },
          messages: [
            msg("autre", "t’as vu le match ce soir"),
            msg("moi", "ouais de ouf"),
            msg("autre", "mdr"),
            msg("moi", "bonne nuit"),
            msg("autre", "bonne nuit"),
            msg("moi", "à demain"),
          ],
        },
      ],
      "2026-10-31",
      "instagram",
    );
    const r = reunir([exp, caps]);
    expect(r).toMatchObject({ doublons: 5, gardes: [45, 1] });
    expect(textes(r.messages.slice(-6))).toEqual(["à demain", "t’as vu le match ce soir", "ouais de ouf", "mdr", "bonne nuit", "bonne nuit"]);
  });

  it("deux lots de captures du même soir, et des captures importées avant l’export qui reprend leur fin", () => {
    const lot = (xs: [de: "moi" | "autre", t: string][]) => capturees([bloc(xs, "2026-09-02", "21:00")], "2026-09-02", "instagram");
    expect(
      reunir([
        lot([
          ["autre", "coucou"],
          ["moi", "salut"],
          ["autre", "tu fais quoi samedi soir"],
          ["moi", "rien"],
          ["autre", "ok"],
          ["moi", "mdr"],
        ]),
        lot([
          ["moi", "rien"],
          ["autre", "ok"],
          ["moi", "mdr"],
          ["autre", "on se voit ?"],
          ["moi", "carrément"],
        ]),
      ]),
    ).toMatchObject({ doublons: 3, gardes: [6, 2] });
    const avant = capturees(
      [
        bloc(
          [
            ["moi", "salut"],
            ["autre", "coucou"],
            ["moi", "ça va ?"],
            ["autre", "oui et toi"],
            ["moi", "tu fais quoi samedi soir"],
            ["autre", "rien"],
            ["moi", "ok"],
            ["autre", "mdr"],
          ],
          "2026-08-20",
          "21:00",
        ),
      ],
      "2026-10-31",
      "instagram",
    );
    const exp = exporte([
      ["20/08/2026 21:20:00", "Hugo", "tu fais quoi samedi soir"],
      ["20/08/2026 21:21:00", "Léa", "rien"],
      ["20/08/2026 21:22:00", "Hugo", "ok"],
      ["20/08/2026 21:23:00", "Léa", "mdr"],
      ...suite("21/08/2026 10:00", 30),
    ]);
    expect(reunir([avant, exp])).toMatchObject({ doublons: 4, gardes: [4, 34] });
  });

  it("entre deux exports, rien ne change : la minute, autant de fois qu’il est écrit", () => {
    const a = exporte(suite("01/09/2026 10:00", 60));
    const b = exporte([...suite("01/09/2026 10:00", 60).slice(40), ...suite("01/09/2026 11:00", 20, { texte: (k) => `nouveau ${k}` })]);
    expect(reunir([a, b])).toMatchObject({ doublons: 20, gardes: [60, 20] });
  });
});

describe("un bout coupé (G9), une légende sans son repère (G10)", () => {
  it("coupée en haut de la capture : reconnue dans le message entier de l’export", () => {
    const caps = capturees(
      [
        {
          repere: { date: "2026-09-02", heure: "10:40" },
          messages: [
            msg("autre", "et franchement je pense que t’as raison, on devrait se voir samedi au calme", { coupe: true }),
            msg("moi", "on dit 15h ?"),
            msg("autre", "parfait"),
            msg("moi", "trop bien"),
            msg("autre", "à samedi alors"),
          ],
        },
      ],
      "2026-09-02",
    );
    const r = reunir([exportLong(), caps]);
    expect(r).toMatchObject({ doublons: 3, gardes: [61, 2] });
    expect(textes(r.messages.slice(-3))).toEqual(["parfait", "trop bien", "à samedi alors"]);
    /* La même, dans un haut sans repère */
    const haut = capturees(
      [
        {
          repere: null,
          messages: [
            msg("autre", "et franchement je pense que t’as raison, on devrait se voir samedi au calme", { coupe: true }),
            msg("moi", "on dit 15h ?"),
            msg("autre", "parfait"),
          ],
        },
        { repere: { date: "2026-09-02", heure: "11:30" }, messages: [msg("moi", "trop bien"), msg("autre", "à samedi alors")] },
      ],
      "2026-09-02",
    );
    expect(reunir([exportLong(), haut])).toMatchObject({ doublons: 3, gardes: [61, 2] });
  });

  it("la fin seule d’une bulle de plus de 200 lettres, coupée en haut : reconnue dans tout son texte, pas seulement dans sa clé", () => {
    const tresLong = `${LONG}, sans tes potes ni les miens, parce que par message ça part toujours de travers entre nous et j’en ai marre qu’on se prenne la tête pour rien`;
    expect(tresLong.length).toBeGreaterThan(250);
    const exp = exporte([
      ...suite("02/09/2026 10:00", 58),
      ["02/09/2026 10:59:00", "Léa", tresLong],
      ["02/09/2026 11:00:00", "Hugo", "on dit 15h ?"],
      ["02/09/2026 11:01:00", "Léa", "parfait"],
    ]);
    const caps = capturees(
      [
        {
          repere: { date: "2026-09-02", heure: "10:40" },
          messages: [
            msg("autre", tresLong.slice(-90), { coupe: true }),
            msg("moi", "on dit 15h ?"),
            msg("autre", "parfait"),
            msg("moi", "trop bien"),
            msg("autre", "à samedi alors"),
          ],
        },
      ],
      "2026-09-02",
    );
    expect(reunir([exp, caps])).toMatchObject({ doublons: 3, gardes: [61, 2] });
  });

  it("coupée en bas, puis un export qui la reprend entière ; deux lots de captures : l’entier gardé à la place du bout", () => {
    const caps = capturees(
      [
        {
          repere: { date: "2026-08-20", heure: "21:00" },
          messages: [
            msg("moi", "salut"),
            msg("autre", "coucou"),
            msg("moi", "ça va ?"),
            msg("autre", "oui et toi"),
            msg("moi", "tu fais quoi samedi soir"),
            msg("autre", "Bon j’ai réfléchi à ce que tu m’as dit hier", { coupe: true }),
          ],
        },
      ],
      "2026-10-31",
      "instagram",
    );
    expect(
      reunir([caps, exporte([["20/08/2026 21:20:00", "Hugo", "tu fais quoi samedi soir"], ["20/08/2026 21:22:00", "Léa", LONG], ...suite("21/08/2026 10:00", 30)])]),
    ).toMatchObject({ doublons: 2, gardes: [4, 32] });
    const l1 = capturees(
      [
        {
          repere: { date: "2026-09-02", heure: "21:00" },
          messages: [msg("autre", "coucou"), msg("moi", "salut"), msg("autre", "tu fais quoi samedi soir"), msg("moi", "Bon j’ai réfléchi à ce que", { coupe: true })],
        },
      ],
      "2026-10-31",
      "instagram",
    );
    const l2 = capturees(
      [{ repere: { date: "2026-09-02", heure: "21:00" }, messages: [msg("moi", LONG), msg("autre", "ok on fait ça"), msg("moi", "top")] }],
      "2026-10-31",
      "instagram",
    );
    const r = reunir([l1, l2]);
    expect(r).toMatchObject({ doublons: 1, gardes: [4, 2] });
    expect(r.messages[3]).toMatchObject({ texte: LONG, morceau: 0 });
    expect(r.messages[3]!.coupe).toBeUndefined();
  });

  it("une vidéo dont la bulle du tout début est coupée (fusionnerLots)", () => {
    const lot1 = captures({
      autre: "Léa",
      blocs: [
        {
          repere: { date: "2026-09-02", heure: "10:40" },
          messages: [
            msg("autre", "et franchement je pense que t’as raison, on devrait se voir samedi au calme", { coupe: true }),
            msg("moi", "on dit 15h ?"),
            msg("autre", "parfait"),
          ],
        },
      ],
    });
    const lot2 = captures({
      autre: "Léa",
      blocs: [{ repere: null, messages: [msg("moi", "on dit 15h ?"), msg("autre", "parfait"), msg("moi", "trop bien"), msg("autre", "à samedi alors")] }],
    });
    const video = lues(versTexteCaptures(fusionnerLots([lot1, lot2], "whatsapp"), { aujourdhui: "2026-09-02" }).texte);
    expect(reunir([exportLong(), video])).toMatchObject({ doublons: 3, gardes: [61, 2] });
  });

  it("un GIF légendé lu « vidéo », une photo dont on ne voit que la légende, un document : reconnus ; un GIF seul l’est toujours", () => {
    const exp = (lignes: Ligne[]) => exporte([...suite("08/09/2026 20:00", 40), ...lignes]);
    const caps = (ms: ReturnType<typeof msg>[]) => capturees([{ repere: { date: "2026-09-08", heure: "21:40" }, messages: ms }], "2026-09-08");
    expect(
      reunir([
        exp([
          ["08/09/2026 21:41:00", "Hugo", "tu fais quoi demain"],
          ["08/09/2026 21:42:00", "Léa", "moi demain GIF omitted"],
          ["08/09/2026 21:43:00", "Hugo", "mdr"],
          ["08/09/2026 21:44:00", "Léa", "GIF omitted", true],
        ]),
        caps([
          msg("moi", "tu fais quoi demain"),
          msg("autre", "moi demain", { media: "video" }),
          msg("moi", "mdr"),
          msg("autre", "", { media: "video" }),
          msg("moi", "t’es folle"),
        ]),
      ]),
    ).toMatchObject({ doublons: 4, gardes: [44, 1] });
    expect(
      reunir([
        exp([
          ["08/09/2026 21:41:00", "Léa", "regarde ma tenue image omitted"],
          ["08/09/2026 21:42:00", "Hugo", "trop belle"],
          ["08/09/2026 21:43:00", "Léa", "merci"],
        ]),
        caps([msg("autre", "regarde ma tenue", { coupe: true }), msg("moi", "trop belle"), msg("autre", "merci"), msg("moi", "on sort samedi ?")]),
      ]),
    ).toMatchObject({ doublons: 3, gardes: [43, 1] });
    expect(
      reunir([
        exp([
          ["08/09/2026 21:41:00", "Hugo", "t’as les billets ?"],
          ["08/09/2026 21:42:00", "Léa", `Billets.pdf • ${L}2 pages ${L}document omitted`],
          ["08/09/2026 21:43:00", "Hugo", "top merci"],
        ]),
        caps([msg("moi", "t’as les billets ?"), msg("autre", "Billets.pdf"), msg("moi", "top merci"), msg("autre", "de rien")]),
      ]),
    ).toMatchObject({ doublons: 3, gardes: [43, 1] });
    expect(
      reunir([
        exp([
          ["08/09/2026 21:41:00", "Hugo", "tu fais quoi demain"],
          ["08/09/2026 21:42:00", "Léa", "GIF omitted", true],
          ["08/09/2026 21:43:00", "Hugo", "mdr"],
        ]),
        caps([msg("moi", "tu fais quoi demain"), msg("autre", "", { media: "video" }), msg("moi", "mdr"), msg("autre", "t’as vu")]),
      ]),
    ).toMatchObject({ doublons: 3, gardes: [43, 1] });
  });
});

describe("l’ordre : les messages neufs à côté de ceux qu’ils reprennent (G5)", () => {
  it("règle A : après le plus récent repris du même jour, l’heure lue gardée (sans heure, puis repère 21:54)", () => {
    const sansHeure = reunir([
      exportMatin(),
      capturees(
        [
          bloc([
            ["autre", "message 57"],
            ["moi", "message 58"],
            ["autre", "message 59"],
            ["moi", "on se voit ce soir ?"],
            ["autre", "je sais pas trop…"],
            ["moi", "ok"],
          ]),
        ],
        "2026-09-02",
      ),
    ]);
    expect(textes(sansHeure.messages.slice(-4))).toEqual(["message 59", "on se voit ce soir ?", "je sais pas trop…", "ok"]);
    expect(sansHeure.messages.slice(-3).map(quand)).toEqual(Array(3).fill("2026-09-02 --:-- lu 2026-09-02 00:00"));
    expect(sansHeure.messages.at(-1)!.t).toBe(Date.UTC(2026, 8, 2, 11, 57));
    const repere = reunir([
      exportSoir(),
      capturees(
        [
          bloc(
            [
              ["autre", "message 57"],
              ["moi", "message 58"],
              ["autre", "message 59"],
              ["moi", "t’es où ?"],
              ["autre", "j’arrive dans 5 min"],
              ["moi", "ok je t’attends"],
            ],
            "2026-09-02",
            "21:54",
          ),
        ],
        "2026-09-02",
      ),
    ]);
    expect(repere.messages.slice(-3).map(quand)).toEqual(Array(3).fill("2026-09-02 ~21:58 lu 2026-09-02 21:54"));
  });

  it("règle A : des doublons dans le désordre (le plus récent compte), plusieurs blocs, un repère plus tôt que l’ancre", () => {
    const desordre = reunir([
      exportMatin(),
      capturees(
        [
          bloc([
            ["autre", "message 57"],
            ["moi", "message 58"],
            ["autre", "message 59"],
            ["moi", "X après 59"],
            ["moi", "message 54"],
            ["autre", "message 55"],
            ["moi", "message 56"],
            ["moi", "Y après 56"],
          ]),
        ],
        "2026-09-02",
      ),
    ]);
    expect(desordre).toMatchObject({ doublons: 6 });
    expect(textes(desordre.messages.slice(-3))).toEqual(["message 59", "X après 59", "Y après 56"]);
    const blocs = reunir([
      exportSoir(),
      capturees(
        [
          bloc(
            [
              ["autre", "message 57"],
              ["moi", "message 58"],
              ["autre", "message 59"],
              ["moi", "X1"],
            ],
            "2026-09-02",
            "21:54",
          ),
          bloc([["autre", "X2"]], "2026-09-02", "22:30"),
          bloc([["moi", "X3"]], "2026-09-03"),
        ],
        "2026-09-03",
      ),
    ]);
    expect(blocs.messages.slice(-4).map((m) => `${m.texte} ${quand(m)}`)).toEqual([
      "message 59 2026-09-02 21:58",
      "X1 2026-09-02 ~21:58 lu 2026-09-02 21:54",
      "X2 2026-09-02 ~22:30",
      "X3 2026-09-03 --:--",
    ]);
    const tot = reunir([
      exportSoir(),
      capturees(
        [
          bloc(
            [
              ["autre", "message 57"],
              ["moi", "message 58"],
              ["autre", "message 59"],
            ],
            "2026-09-02",
            "21:54",
          ),
          bloc([["moi", "X4 sous un repère mal lu"]], "2026-09-02", "21:30"),
        ],
        "2026-09-02",
      ),
    ]);
    expect(tot.messages.at(-1)).toMatchObject({ texte: "X4 sous un repère mal lu", t: Date.UTC(2026, 8, 2, 21, 58), tLu: Date.UTC(2026, 8, 2, 21, 30) });
  });

  it("règle A : depuis le dernier message de Léa, trois messages d’Hugo sans réponse", () => {
    const r = reunir([
      exportMatin(),
      capturees(
        [
          bloc([
            ["autre", "message 57"],
            ["moi", "message 58"],
            ["autre", "message 59"],
            ["moi", "on se voit ce soir ?"],
            ["moi", "allo"],
            ["moi", "bon tant pis"],
          ]),
        ],
        "2026-09-02",
      ),
    ]);
    expect(textes(r.messages.slice(-4))).toEqual(["message 59", "on se voit ce soir ?", "allo", "bon tant pis"]);
    expect(r.messages.slice(-3).map((m) => m.role)).toEqual(["toi", "toi", "toi"]);
  });

  it("règle B : un message sans heure avant le premier repris passe juste avant lui ; sous un repère à l’heure, il garde son repère", () => {
    const xs: [de: "moi" | "autre", t: string][] = [
      ["moi", "X0 avant le premier doublon"],
      ["moi", "message 56"],
      ["autre", "message 57"],
      ["moi", "message 58"],
      ["autre", "message 59"],
      ["moi", "X1"],
    ];
    const sansHeure = reunir([exportSoir(), capturees([bloc(xs)], "2026-09-02")]);
    expect(textes(sansHeure.messages.slice(-7))).toEqual(["message 55", "X0 avant le premier doublon", "message 56", "message 57", "message 58", "message 59", "X1"]);
    const aLHeure = reunir([exportSoir(), capturees([bloc(xs, "2026-09-02", "21:50")], "2026-09-02")]);
    const x0 = aLHeure.messages.find((m) => m.texte.startsWith("X0"))!;
    expect(x0.t).toBe(Date.UTC(2026, 8, 2, 21, 50));
    expect(x0.tLu).toBeUndefined();
  });

  it("règle C : sans rien de repris, des messages sans heure du jour où finit l’export passent après sa fin ; d’un autre jour, ils ne bougent pas", () => {
    const fin = reunir([
      exportMatin(),
      capturees(
        [
          bloc([
            ["moi", "on se voit ce soir ?"],
            ["autre", "je sais pas trop…"],
            ["moi", "ok"],
          ]),
        ],
        "2026-09-02",
      ),
    ]);
    expect(textes(fin.messages.slice(-4))).toEqual(["message 59", "on se voit ce soir ?", "je sais pas trop…", "ok"]);
    const veille = reunir([
      exportMatin(),
      capturees(
        [
          bloc(
            [
              ["moi", "on se voit ce soir ?"],
              ["autre", "je sais pas trop…"],
            ],
            "2026-09-01",
          ),
        ],
        "2026-09-02",
      ),
    ]);
    expect(textes(veille.messages.slice(0, 3))).toEqual(["on se voit ce soir ?", "je sais pas trop…", "message 0"]);
    expect(veille.messages[0]!.tLu).toBeUndefined();
    const lendemain = reunir([
      exportMatin(),
      capturees(
        [
          bloc(
            [
              ["moi", "coucou"],
              ["autre", "hey"],
            ],
            "2026-09-03",
          ),
        ],
        "2026-09-03",
      ),
    ]);
    expect(lendemain.messages.slice(-2).map(quand)).toEqual(["2026-09-03 --:--", "2026-09-03 --:--"]);
  });

  it("des captures sur des captures, en chaîne, ou importées avant l’export : départagées par le rang de réunion", () => {
    const instagram = capturees(
      [
        bloc(
          [
            ["moi", "A1 salut"],
            ["autre", "A2 coucou"],
            ["moi", "A3 ça va"],
            ["autre", "A4 oui et toi"],
          ],
          "2026-09-02",
          "21:00",
        ),
      ],
      "2026-09-02",
      "instagram",
    );
    const whatsapp = capturees(
      [
        bloc([
          ["moi", "A3 ça va"],
          ["autre", "A4 oui et toi"],
          ["moi", "B1 super"],
          ["autre", "B2 on se voit ?"],
        ]),
      ],
      "2026-09-02",
    );
    expect(textes(reunir([instagram, whatsapp]).messages)).toEqual(["A1 salut", "A2 coucou", "A3 ça va", "A4 oui et toi", "B1 super", "B2 on se voit ?"]);
    const chaine = reunir([
      exportMatin(),
      capturees(
        [
          bloc([
            ["autre", "message 57"],
            ["moi", "message 58"],
            ["autre", "message 59"],
            ["moi", "A on se voit ce soir ?"],
            ["autre", "B je sais pas trop"],
          ]),
        ],
        "2026-09-02",
      ),
      capturees(
        [
          bloc([
            ["moi", "A on se voit ce soir ?"],
            ["autre", "B je sais pas trop"],
            ["moi", "C allez"],
            ["autre", "D bon ok"],
          ]),
        ],
        "2026-09-02",
      ),
    ]);
    expect(chaine).toMatchObject({ doublons: 5, gardes: [60, 2, 2] });
    expect(textes(chaine.messages.slice(-5))).toEqual(["message 59", "A on se voit ce soir ?", "B je sais pas trop", "C allez", "D bon ok"]);
    const avant = reunir([
      capturees(
        [
          bloc([
            ["autre", "message 57"],
            ["moi", "message 58"],
            ["autre", "message 59"],
            ["moi", "X après 59"],
          ]),
        ],
        "2026-09-02",
      ),
      exportMatin(),
    ]);
    expect(avant).toMatchObject({ doublons: 3, gardes: [1, 60] });
    expect(textes(avant.messages.slice(-2))).toEqual(["message 59", "X après 59"]);
  });
});

describe("des captures où l’on ne voit aucune date (G1b)", () => {
  it("elles reprennent le début de l’export : rangées au début, écrites le jour de leur premier repris au plus tard, l’heure lue « au plus tard »", () => {
    const r = reunir([exportDuMois(), capturees([bloc(DEBUT, null)], "2026-10-31")]);
    expect(r).toMatchObject({ doublons: 5, gardes: [27, 1] });
    expect(r.messages[0]).toMatchObject({ texte: "je t’ajoute ici", t: Date.UTC(2026, 8, 1, 21, 0), tLu: Date.UTC(2026, 9, 31), approx: "jour", jourDevine: "auPlusTard" });
    expect(r.parMorceau[1]!.map((m) => jourIso(m.t))).toEqual(Array(6).fill("2026-09-01"));
    expect(heureLue(r.messages[0]!)).toEqual({ t: Date.UTC(2026, 9, 31), heure: "auPlusTard" });
  });

  it("elles reprennent la fin de l’export : rangées après, leur jour reste inconnu (écrites ce jour-là ou bien après : pas un silence)", () => {
    const r = reunir([
      exportDuMois(),
      capturees(
        [
          bloc(
            [
              ["autre", "bon je vais dormir"],
              ["moi", "bonne nuit"],
              ["autre", "attends t’as vu mon message de ce matin"],
              ["moi", "lequel"],
            ],
            null,
          ),
        ],
        "2026-10-31",
      ),
    ]);
    expect(r).toMatchObject({ doublons: 2, gardes: [27, 2] });
    expect(r.messages.slice(-2).map(quand)).toEqual(Array(2).fill("2026-09-15 --:-- lu 2026-10-31 00:00 inconnu"));
    expect(heureLue(r.messages.at(-1)!)).toEqual({ t: Date.UTC(2026, 9, 31), heure: "auPlusTard" });
  });

  it("entre deux repris du même jour, un message prend ce jour ; entre deux jours, il reste inconnu", () => {
    const xs: [de: "moi" | "autre", t: string][] = [
      ["moi", "salut c’est Hugo de la soirée chez Inès"],
      ["autre", "ah oui coucou ! ça va ?"],
      ["autre", "X1 attends deux secondes"],
      ["moi", "super et toi"],
      ["autre", "tranquille je rentre du sport"],
      ["autre", "X2 au fait"],
      ["moi", "on parle du film numéro 0"],
      ["autre", "on parle du film numéro 1"],
    ];
    const r = reunir([exportDuMois(), capturees([bloc(xs, null)], "2026-10-31")]);
    expect(r).toMatchObject({ doublons: 6, gardes: [27, 2] });
    expect(textes(r.messages.slice(1, 7))).toEqual(["ah oui coucou ! ça va ?", "X1 attends deux secondes", "super et toi", "tranquille je rentre du sport", "X2 au fait", "ok"]);
    expect(r.messages.filter((m) => m.morceau === 1).map(quand)).toEqual(["2026-09-01 --:-- lu 2026-10-31 00:00", "2026-09-01 --:-- lu 2026-10-31 00:00 inconnu"]);
  });

  it("rien que des mots courts en commun : aucune ancre, le jour reste inconnu", () => {
    const r = reunir([exportDuMois(), capturees([bloc(COURTS, null)], "2026-10-31")]);
    expect(r).toMatchObject({ doublons: 0, gardes: [27, 4] });
    expect(r.messages.at(-1)).toMatchObject({ jourDevine: "inconnu", t: Date.UTC(2026, 9, 31) });
  });

  it("un rituel du soir, qui revient tous les soirs de l’export, n’est pas une ancre : ni pour des captures sans date, ni pour un haut sans repère", () => {
    const exp = exportDesSoirs();
    const ceSoir = capturees([bloc([["moi", "t’es rentrée de ton dîner ?"], ["autre", "oui à l’instant"], ...RITUEL], null)], "2026-10-31", "instagram");
    const r = reunir([exp, ceSoir]);
    expect(r).toMatchObject({ doublons: 0, gardes: [120, 4] });
    expect(r.messages.filter((m) => m.morceau === 1).every((m) => m.jourDevine === "inconnu")).toBe(true);
    const haut = capturees(
      [
        bloc(RITUEL, null),
        bloc(
          [
            ["autre", "bien dormi ?"],
            ["moi", "comme un bébé"],
          ],
          "2026-10-31",
          "09:12",
        ),
      ],
      "2026-10-31",
      "instagram",
    );
    expect(haut.messages.map((m) => m.jourDevine ?? null)).toEqual(["auPlusTard", "auPlusTard", null, null]);
    expect(reunir([exportDesSoirs(), haut])).toMatchObject({ doublons: 0, gardes: [120, 4] });
  });

  it("d’abord sans date, puis le même échange daté : les captures datées se réunissent avant, celles sans date s’y ancrent", () => {
    const A: [de: "moi" | "autre", t: string][] = [
      ["autre", "t’es rentré de ton week-end à Lyon ?"],
      ["moi", "oui ce midi, crevé"],
      ["autre", "repose toi bien alors"],
    ];
    const r = reunir([
      capturees([bloc([["moi", "salut"], ...A, ["autre", "bisous"]], null)], "2026-10-31"),
      capturees([bloc([["moi", "coucou"], ...A], "2026-09-04", "22:00")], "2026-10-31", "instagram"),
    ]);
    expect(r).toMatchObject({ doublons: 3, gardes: [2, 4] });
    expect(textes(r.messages)).toEqual(["coucou", "salut", "t’es rentré de ton week-end à Lyon ?", "oui ce midi, crevé", "repose toi bien alors", "bisous"]);
    /* Deux morceaux sans date, et rien de daté : le jour reste inconnu */
    const deux = reunir([capturees([bloc([["moi", "salut"], ...A], null)], "2026-10-31"), capturees([bloc([...A, ["moi", "merci toi aussi"]], null)], "2026-10-31")]);
    expect(deux.messages.every((m) => m.jourDevine === "inconnu")).toBe(true);
  });

  it("un haut sans repère, repris daté par un autre morceau : le jumeau gardé prend la date, et la place du doublon", () => {
    const m1 = capturees(
      [
        bloc(
          [
            ["autre", "t’es rentré de ton week-end à Lyon ?"],
            ["moi", "oui ce midi, crevé"],
          ],
          null,
        ),
        bloc(
          [
            ["autre", "on se fait un ciné demain ?"],
            ["moi", "carrément"],
          ],
          "2026-09-05",
          "21:00",
        ),
      ],
      "2026-10-31",
      "instagram",
    );
    const m2 = capturees(
      [
        bloc(
          [
            ["moi", "bonne soirée"],
            ["autre", "t’es rentré de ton week-end à Lyon ?"],
            ["moi", "oui ce midi, crevé"],
          ],
          "2026-09-04",
          "22:00",
        ),
      ],
      "2026-10-31",
      "instagram",
    );
    const r = reunir([m1, m2]);
    expect(r.messages.map((m) => `${m.texte} ${quand(m)}`)).toEqual([
      "bonne soirée 2026-09-04 ~22:00",
      "t’es rentré de ton week-end à Lyon ? 2026-09-04 ~22:00 lu 2026-09-05 00:00",
      "oui ce midi, crevé 2026-09-04 ~22:00 lu 2026-09-05 00:00",
      "on se fait un ciné demain ? 2026-09-05 ~21:00",
      "carrément 2026-09-05 ~21:00",
    ]);
    expect(heureLue(r.messages[1]!)).toEqual({ t: Date.UTC(2026, 8, 5), heure: "auPlusTard" });
  });
});

describe("relier : la même conv, et des captures sans date qu’on ne sait où ranger", () => {
  const conv: ConvEnMorceaux = {
    morceaux: [{ format: "whatsapp-ios", texte: ios([["01/09/2026 21:00:00", "Hugo", "salut c’est Hugo de la soirée chez Inès"]]), noms: ["Hugo", "Léa"], empreinte: "e0" }],
  };
  /* L’export du mois, en texte : relier lit lui-même chaque morceau */
  const duMois: ConvEnMorceaux = {
    morceaux: [
      {
        format: "whatsapp-ios",
        texte: ios([
          ["01/09/2026 21:00:00", "Hugo", "salut c’est Hugo de la soirée chez Inès"],
          ["01/09/2026 21:05:00", "Léa", "ah oui coucou ! ça va ?"],
          ["01/09/2026 21:06:00", "Hugo", "super et toi"],
          ["01/09/2026 21:10:00", "Léa", "tranquille je rentre du sport"],
          ["01/09/2026 21:12:00", "Hugo", "ok"],
          ["15/09/2026 22:00:00", "Léa", "bon je vais dormir"],
        ]),
        noms: ["Hugo", "Léa"],
        empreinte: "e0",
      },
    ],
  };
  const recues = (blocs: Bloc[], autre = "Léa"): MorceauRecu => {
    const t = versTexteCaptures(captures({ appli: "whatsapp", autre, blocs }), { aujourdhui: "2026-10-31" });
    return { format: "captures", texte: t.texte, noms: ["Moi", t.autre], empreinte: `c-${autre}-${t.texte.length}`, contact: t.autre };
  };

  it("sans date et sans rien en commun avec une conv datée : refusées (« sans_date »)", () => {
    expect(() => relier(duMois, { noms: ["Hugo", "Léa"], contact: 1 }, recues([bloc(COURTS, null)]))).toThrow(expect.objectContaining({ code: "sans_date" }));
    /* Sur des captures datées seules, pareil */
    const datees: ConvEnMorceaux = {
      morceaux: [
        {
          format: "captures",
          texte: texteDe(
            [
              bloc(
                [
                  ["moi", "salut"],
                  ["autre", "coucou"],
                ],
                "2026-10-20",
                "21:00",
              ),
            ],
            "2026-10-31",
          ),
          noms: ["Moi", "Léa"],
          empreinte: "c0",
        },
      ],
    };
    expect(() => relier(datees, { noms: ["Moi", "Léa"], moi: 0 }, recues([bloc(COURTS, null)]))).toThrow(expect.objectContaining({ code: "sans_date" }));
    /* Rien que leur rituel du soir en commun : pas une ancre, pareil */
    const soirs: ConvEnMorceaux = {
      morceaux: [
        {
          format: "whatsapp-ios",
          texte: ios(
            Array.from({ length: 5 }, (_, d): Ligne[] => [
              [`0${d + 1}/09/2026 22:00:00`, "Léa", `pas grand chose le jour ${d}`],
              [`0${d + 1}/09/2026 22:30:00`, "Léa", "bonne nuit mon cœur"],
              [`0${d + 1}/09/2026 22:31:00`, "Hugo", "toi aussi mon amour"],
            ]).flat(),
          ),
          noms: ["Hugo", "Léa"],
          empreinte: "e1",
        },
      ],
    };
    expect(() =>
      relier(soirs, { noms: ["Hugo", "Léa"], contact: 1 }, recues([bloc([["moi", "t’es rentrée de ton dîner ?"], ["autre", "oui à l’instant"], ...RITUEL], null)])),
    ).toThrow(expect.objectContaining({ code: "sans_date" }));
  });

  it("sans date mais avec des messages repris : ajoutées ; sans date sur une conv sans date : ajoutées ; datées sans rien en commun : ajoutées", () => {
    expect(relier(duMois, { noms: ["Hugo", "Léa"], contact: 1 }, recues([bloc(DEBUT, null)])).morceaux).toHaveLength(2);
    const sansDate: ConvEnMorceaux = {
      morceaux: [
        {
          format: "captures",
          texte: texteDe(
            [
              bloc(
                [
                  ["moi", "salut"],
                  ["autre", "coucou"],
                ],
                null,
              ),
            ],
            "2026-10-30",
          ),
          noms: ["Moi", "Léa"],
          empreinte: "c0",
        },
      ],
    };
    expect(relier(sansDate, { noms: ["Moi", "Léa"], moi: 0 }, recues([bloc(COURTS, null)])).morceaux).toHaveLength(2);
    expect(relier(conv, { noms: ["Hugo", "Léa"], contact: 1 }, recues([bloc(COURTS, "2026-10-20")])).morceaux).toHaveLength(2);
  });

  it("quelqu’un d’autre l’emporte sur « sans_date » ; des rituels en commun ne font plus la même conv", () => {
    expect(() => relier(duMois, { noms: ["Hugo", "Léa"], contact: 1 }, recues([bloc(COURTS, null)], "Sarah"))).toThrow(expect.objectContaining({ code: "autre_conv" }));
    const soir = (autre: string, date: string, x: string) =>
      texteDe(
        [
          {
            repere: { date, heure: "22:40" },
            messages: [
              msg("autre", "coucou"),
              msg("moi", "coucou"),
              msg("autre", x),
              msg("moi", "mdr"),
              msg("autre", "", { media: "photo" }),
              msg("moi", "bonne nuit"),
              msg("autre", "bonne nuit"),
            ],
          },
        ],
        "2026-10-31",
        "instagram",
      );
    const lea: ConvEnMorceaux = { morceaux: [{ format: "captures", texte: soir("Léa", "2026-08-20", "t’as fait quoi aujourd’hui"), noms: ["Moi", "Léa"], empreinte: "c0" }] };
    const chloe = versTexteCaptures(
      captures({
        appli: "instagram",
        autre: "Chloé",
        blocs: [
          {
            repere: { date: "2026-08-21", heure: "22:40" },
            messages: [
              msg("autre", "coucou"),
              msg("moi", "coucou"),
              msg("autre", "tu dors ?"),
              msg("moi", "mdr"),
              msg("autre", "", { media: "photo" }),
              msg("moi", "bonne nuit"),
              msg("autre", "bonne nuit"),
            ],
          },
        ],
      }),
      { aujourdhui: "2026-10-31" },
    );
    expect(() => relier(lea, { noms: ["Moi", "Léa"], moi: 0 }, { format: "captures", texte: chloe.texte, noms: ["Moi", "Chloé"], empreinte: "c1", contact: "Chloé" })).toThrow(
      expect.objectContaining({ code: "autre_conv" }),
    );
  });
});

describe("le contexte du chat garde l’heure lue (Contexte.lus, heureLue)", () => {
  it("une capture renvoyée qui reprend la fin ne fait relire que le neuf", () => {
    const r = reunir([
      exportSoir(),
      capturees(
        [
          bloc(
            [
              ["autre", "message 57"],
              ["moi", "message 58"],
              ["autre", "message 59"],
              ["moi", "ok"],
              ["autre", "👍"],
            ],
            "2026-09-02",
            "21:54",
          ),
        ],
        "2026-09-02",
      ),
    ]);
    const envoi = captures({
      appli: "whatsapp",
      autre: "Léa",
      blocs: [{ repere: { date: "2026-09-02", heure: "21:54" }, messages: [msg("moi", "ok"), msg("autre", "👍"), msg("moi", "j’arrive")] }],
    });
    const lus = r.messages.map((m) => ({ cle: cleDuMessage(m), ...heureLue(m) }));
    const lu = messagesDesCaptures(envoi, { utilisateur: HUGO, autre: LEA }, { aujourdhui: "2026-09-02", apres: r.messages.at(-1)!.t, lus });
    expect(lu.nouveaux.map((m) => m.texte)).toEqual(["j’arrive"]);
  });
});

/*
 * La borne suit la machine (comme tests/unit/import-bornes.test.ts) : chaque réunion se mesure à celle de l’export seul,
 * chronométrée dans le même fichier. Mesuré le 3 novembre : l’export et la vidéo, 1,9 fois l’export seul (1,3 à 1,6 sans
 * date) ; la conv de rituels, dont chaque rituel de la vidéo sans date cherche ses places dans toute la conv, 5,4 à 6,6
 * fois (7,7 sous la couverture) ; l’envoi forgé, arrêté par COMPARAISONS_MAX, 4,7 à 5 fois (6,7 sous la couverture). Un
 * appariement quadratique en coûterait des centaines de fois.
 */
describe("le temps", { timeout: 30_000 }, () => {
  const FOIS = 4;
  const FOIS_FORGE = 15;
  const t0 = Date.UTC(2025, 8, 1, 8, 0);
  const date = (k: number) => {
    const x = new Date(t0 + k * 13 * 60e3);
    return `${p2(x.getUTCDate())}/${p2(x.getUTCMonth() + 1)}/${x.getUTCFullYear()} ${p2(x.getUTCHours())}:${p2(x.getUTCMinutes())}:00`;
  };
  const chrono = <T>(f: () => T): [T, number] => {
    const d = performance.now();
    const r = f();
    return [r, performance.now() - d];
  };
  const MOTS = ["ok", "mdr", "ouais", "jsp", "bonne nuit", "haha"];
  const lignes: Ligne[] = Array.from({ length: 40_000 }, (_, k) => [date(k), k % 2 ? "Léa" : "Hugo", k % 3 ? MOTS[k % MOTS.length]! : `message numéro ${k}`]);
  let exp: MorceauLu;
  let seulMs = 0;
  beforeAll(() => {
    exp = exporte(lignes);
    reunir([exp]);
    seulMs = chrono(() => reunir([exp]))[1];
  });
  const vite = (ms: number, fois: number) => expect(ms, `${Math.round(ms)} ms, pour ${Math.round(seulMs)} ms l’export seul`).toBeLessThan(fois * seulMs);

  it("un export de 40 000 messages, puis une vidéo de 2 000 qui reprend ses 300 derniers", () => {
    const iso = (d: string) => d.slice(0, 10).split("/").reverse().join("-");
    const blocs: Bloc[] = [];
    for (const [d, n, x] of lignes.slice(-300)) {
      if (blocs.at(-1)?.repere?.date !== iso(d)) blocs.push({ repere: { date: iso(d), heure: null }, messages: [] });
      blocs.at(-1)!.messages.push(msg(n === "Hugo" ? "moi" : "autre", x));
    }
    const lendemain = new Date(Date.parse(`${iso(lignes.at(-1)![0])}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
    blocs.push({
      repere: { date: lendemain, heure: null },
      messages: Array.from({ length: 1700 }, (_, k) => msg(k % 2 ? "autre" : "moi", k % 3 ? MOTS[k % MOTS.length]! : `nouveau ${k}`)),
    });
    const [r, ms] = chrono(() => reunir([exp, capturees(blocs, "2026-10-31")]));
    expect(r).toMatchObject({ doublons: 300, gardes: [40_000, 1_700] });
    vite(ms, FOIS);
    /* Les mêmes, où l’on ne voit aucune date : elles s’ancrent quand même */
    const [s, ms2] = chrono(() =>
      reunir([
        exp,
        capturees(
          blocs.map((b) => ({ ...b, repere: null })),
          "2026-10-31",
        ),
      ]),
    );
    expect(s).toMatchObject({ doublons: 300, gardes: [40_000, 1_700] });
    vite(ms2, FOIS);
  });

  it("une conv de rituels (un message sur trois revient tous les soirs), puis une vidéo sans date qui reprend ses 300 derniers : ses messages neufs restent neufs", () => {
    const RITUELS = [
      "bonne nuit mon cœur",
      "toi aussi mon amour",
      "tu fais quoi ce soir",
      "je pense à toi",
      "j’ai trop hâte de te voir",
      "rentrée bien ?",
      "oui et toi ça va",
      "dors bien bébé",
      "bisous à demain",
      "tu me manques trop",
    ];
    const texte = (k: number, neuf: string) => (k % 3 === 0 ? RITUELS[k % RITUELS.length]! : k % 3 === 1 ? MOTS[k % MOTS.length]! : neuf);
    const rituels = exporte(lignes.map(([d, n], k): Ligne => [d, n, texte(k, `message numéro ${k}`)]));
    const repris = rituels.messages.slice(-300).map((m) => msg(m.role === "toi" ? "moi" : "autre", m.texte));
    const neufs = Array.from({ length: 1700 }, (_, k) => msg(k % 2 ? "autre" : "moi", texte(k, `nouveau ${k}`)));
    const [r, ms] = chrono(() => reunir([rituels, capturees([{ repere: null, messages: [...repris, ...neufs] }], "2026-10-31")]));
    expect(r).toMatchObject({ doublons: 300, gardes: [40_000, 1_700] });
    vite(ms, FOIS_FORGE);
  });

  it("un envoi forgé : le même rituel des milliers de fois des deux côtés, sans date", () => {
    const forge = exporte(lignes.map(([d], k): Ligne => [d, k % 2 ? "Léa" : "Hugo", k % 2 ? "toi aussi mon amour" : "bonne nuit mon cœur"]));
    const rituel = Array.from({ length: 2000 }, (_, k) => msg(k % 2 ? "autre" : "moi", k % 2 ? "toi aussi mon amour" : "bonne nuit mon cœur"));
    const [, ms] = chrono(() => reunir([forge, capturees([{ repere: null, messages: rituel }], "2026-10-31")]));
    vite(ms, FOIS_FORGE);
  });
});
