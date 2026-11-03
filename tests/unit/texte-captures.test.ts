import { describe, expect, it } from "vitest";
import { versTexteCaptures } from "@prompts/lib/captures";
import { chiffrer, lire, rendre, type Histoire } from "@prompts/lib/conv";
import { cleDuMessage, heureDuMessage } from "@prompts/lib/reconnaitre";
import type { Captures } from "@prompts/lib/schemas";
import { trouvailles } from "@/server/ecrans/trouvailles";
import { fusionnerLots } from "@/server/video";
import { captures, msg } from "../aide/fabriques";

/*
 * Le texte des captures (prompts/lib/captures.ts) et sa lecture (lire, format « captures ») : ce que leur en-tête dit des
 * messages (un jour deviné, des bulles coupées par le bord de l’écran), une réponse à une story avec son texte, et les
 * appels lus sur l’écran (chantier lecture des convs, PR 5). Noms inventés.
 */

/** Tom importe ses captures (« Moi », à droite), Léa est l’autre. */
const h = (autre = "Léa"): Histoire => ({
  utilisateur: { prenom: "Tom", pronom: "il", nomExport: "Moi" },
  autre: { prenom: "Léa", pronom: "elle", nomExport: autre },
  devinette: "parle",
  objectif: "comprendre",
  appli: "instagram",
  format: "captures",
});
/** Des captures au format « captures » (importées le 13 septembre 2026, sauf `aujourdhui`), et leur lecture. */
const lues = (c: Captures, aujourdhui = "2026-09-13") => {
  const t = versTexteCaptures(c, { aujourdhui });
  return { t, lu: lire(t.texte, h(t.autre)) };
};
type Media = Captures["blocs"][number]["messages"][number]["media"];
const A_21H05 = { date: "2026-09-08", heure: "21:05" };

describe("l’en-tête des captures dit ce que la lecture doit savoir de leurs messages", () => {
  it("« haut sans date » : le haut sans repère emprunte le jour du premier repère, et lire le marque « au plus tard »", () => {
    const { t, lu } = lues(
      captures({
        blocs: [
          { repere: null, messages: [msg("autre", "salut"), msg("moi", "coucou")] },
          { repere: A_21H05, messages: [msg("autre", "ça va ?")] },
        ],
      }),
    );
    expect(t.texte).toBe("# captures · instagram · 1 captures · haut sans date\n== 2026-09-08 ==\nLéa: salut\nMoi: coucou\n== 2026-09-08 21:05 ==\nLéa: ça va ?");
    /* Comme avant : les lignes du haut (sansRepere), aucune coupée */
    expect([t.sansRepere, t.coupees]).toEqual([4, []]);
    expect(lu.messages.map((m) => [m.texte, m.approx, m.jourDevine ?? null])).toEqual([
      ["salut", "jour", "auPlusTard"],
      ["coucou", "jour", "auPlusTard"],
      ["ça va ?", "heure", null],
    ]);
    expect(lu.captures).toBe(1);
    expect(lu.messages.map(heureDuMessage)).toEqual(["auPlusTard", "auPlusTard", "repere"]);
  });

  it("« sans date » : aucune capture ne montre de date, tous les messages sont datés du jour de l’import et marqués « inconnu »", () => {
    /* « hier » n’est pas un repère lisible (AAAA-MM-JJ) : comme sans repère */
    const { t, lu } = lues(
      captures({
        blocs: [
          { repere: null, messages: [msg("autre", "salut"), msg("moi", "coucou")] },
          { repere: { date: "hier", heure: null }, messages: [msg("autre", "ça va ?")] },
        ],
      }),
    );
    expect(t.texte).toBe("# captures · instagram · 1 captures · sans date\n== 2026-09-13 ==\nLéa: salut\nMoi: coucou\nLéa: ça va ?");
    expect(t.sansRepere).toBe(5);
    expect(lu.messages.map((m) => [m.t, m.approx, m.jourDevine])).toEqual(Array(3).fill([Date.UTC(2026, 8, 13), "jour", "inconnu"]));
    expect(lu.messages.map(heureDuMessage)).toEqual(Array(3).fill("auPlusTard"));
  });

  it("un haut sans repère qui n’a aucun message ne se marque pas", () => {
    const { t } = lues(
      captures({
        blocs: [
          { repere: null, messages: [msg("autre", "  ")] },
          { repere: A_21H05, messages: [msg("autre", "ça va ?")] },
        ],
      }),
    );
    expect(t.texte).toBe("# captures · instagram · 1 captures\n== 2026-09-08 ==\n== 2026-09-08 21:05 ==\nLéa: ça va ?");
  });

  it("« coupées » : les lignes des messages coupés par le bord de l’écran (TexteCaptures.coupees), que lire marque", () => {
    const { t, lu } = lues(
      captures({
        blocs: [{ repere: A_21H05, messages: [msg("autre", "…ien et toi", { coupe: true }), msg("moi", "deux\nlignes"), msg("autre", "tu fais quoi ce", { coupe: true })] }],
      }),
    );
    expect(t.texte).toBe("# captures · instagram · 1 captures · coupées 3,6\n== 2026-09-08 21:05 ==\nLéa: …ien et toi\nMoi: deux\nlignes\nLéa: tu fais quoi ce");
    expect(t.coupees).toEqual([3, 6]);
    expect(lu.messages.map((m) => m.coupe ?? false)).toEqual([true, false, true]);
  });

  it("les deux marques ensemble : un ancien lecteur compte toujours les captures, et messagesDesCaptures (PR 4) en déduit la même chose par les numéros de ligne", () => {
    const { t, lu } = lues(
      captures({
        captures: [1, 2, 3].map((k) => ({ numero: k, place: k, hors_sujet: false })),
        blocs: [
          { repere: null, messages: [msg("autre", "…dr", { coupe: true }), msg("moi", "quoi")] },
          { repere: { date: "2026-09-08", heure: null }, messages: [msg("autre", "rien", { coupe: true })] },
        ],
      }),
    );
    expect(t.texte.split("\n")[0]).toBe("# captures · instagram · 3 captures · haut sans date · coupées 3,6");
    /* La lecture d’une conv en morceaux (src/server/morceaux.ts, lectureReunie) et lire */
    expect(t.texte.match(/^# captures · [^\n]* · (\d+) captures?/)?.[1]).toBe("3");
    expect(lu.captures).toBe(3);
    expect(lu.messages.map((m) => [m.jourDevine ?? null, m.coupe ?? false])).toEqual([
      ["auPlusTard", true],
      ["auPlusTard", false],
      [null, true],
    ]);
    expect(lu.messages.map((m) => [m.ligne <= t.sansRepere, t.coupees.includes(m.ligne)])).toEqual(lu.messages.map((m) => [!!m.jourDevine, !!m.coupe]));
  });

  it("l’appli lue par le modèle ne peut ni couper l’en-tête, ni y ajouter une marque", () => {
    const { t, lu } = lues(captures({ appli: "insta\n· sans date", blocs: [{ repere: A_21H05, messages: [msg("autre", "salut")] }] }));
    expect(t.texte).toBe("# captures · insta sans date · 1 captures\n== 2026-09-08 21:05 ==\nLéa: salut");
    expect(lu.messages[0]!.jourDevine).toBeUndefined();
  });

  it("un texte gardé avant ces marques se lit comme avant : ni jour deviné, ni bulle coupée", () => {
    const lu = lire("# captures · autre · 1 captures\n== 2026-09-08 ==\nLéo: salut\n== 2026-09-08 ==\nMoi: audio omis", h("Léo"));
    expect(lu.messages).toEqual([
      { id: "m0001", t: Date.UTC(2026, 8, 8), nom: "Léo", role: "autre", texte: "salut", approx: "jour", ligne: 3 },
      { id: "m0002", t: Date.UTC(2026, 8, 8), nom: "Moi", role: "toi", texte: "", media: "vocal", approx: "jour", ligne: 5 },
    ]);
    expect(lu.messages.map(heureDuMessage)).toEqual(["jour", "jour"]);
  });
});

describe("une réponse à une story", () => {
  it("avec son texte : la forme de l’export Instagram, leurs mots et un média ; sans texte, ou le libellé de l’appli recopié : comme avant", () => {
    const { t, lu } = lues(
      captures({
        blocs: [
          {
            repere: A_21H05,
            messages: [
              msg("autre", "trop belle 😍", { media: "story" }),
              msg("moi", "", { media: "story" }),
              msg("moi", "A répondu à ta story", { media: "story" }),
              msg("autre", "deux\nlignes", { media: "story", coupe: true }),
            ],
          },
        ],
      }),
    );
    expect(t.texte.split("\n").slice(2)).toEqual([
      "Léa: trop belle 😍 <réponse à une story>",
      "Moi: A répondu à ta story",
      "Moi: A répondu à ta story",
      "Léa: deux",
      "lignes <réponse à une story>",
    ]);
    /* Sur deux lignes, la réponse coupée garde son numéro */
    expect(t.coupees).toEqual([6]);
    expect(lu.messages.map((m) => [m.media ?? m.texte, m.coupe ?? false])).toEqual([
      ["trop belle 😍 [réponse à une story]", false],
      ["réponse à ta story", false],
      ["réponse à ta story", false],
      ["deux\nlignes [réponse à une story]", true],
    ]);
    const c = chiffrer(h(), lu.messages);
    expect(c.medias).toEqual({ toi: { "réponse à ta story": 2 }, autre: { "réponse à une story": 2 } });
    expect(c.motsExacts).toEqual({ toi: "—", autre: 2.5 });
    /* La même réponse dans un export Instagram (lib/instagram.ts) : la même clé, un doublon reconnu entre deux morceaux */
    const insta = lire("[08/09/2026 21:05:00] Léa: trop belle 😍 <réponse à une story>", {
      utilisateur: { prenom: "Tom", pronom: "il", nomExport: "Tom" },
      autre: { prenom: "Léa", pronom: "elle", nomExport: "Léa" },
      format: "whatsapp-ios",
    });
    expect(cleDuMessage(lu.messages[0]!)).toBe("autre|#tropbelle");
    expect(cleDuMessage(insta.messages[0]!)).toBe(cleDuMessage(lu.messages[0]!));
  });

  it("une réaction recopiée avec son emoji : le libellé de l’appli ne compte pas, seuls ses emojis restent en légende", () => {
    const formes: ["moi" | "autre", string, string][] = [
      ["autre", "A réagi 😍 à votre story", "Léa: 😍 <réponse à une story>"],
      ["autre", "A réagi à votre story 😍", "Léa: 😍 <réponse à une story>"],
      ["autre", "A réagi à votre story : 😍", "Léa: 😍 <réponse à une story>"],
      ["autre", "Reacted 😂 to your story", "Léa: 😂 <réponse à une story>"],
      ["autre", "A réagi avec 👍🏽 à votre story", "Léa: 👍🏽 <réponse à une story>"],
      ["moi", "Vous avez réagi 🔥 à sa story", "Moi: 🔥 <réponse à une story>"],
      /* Sans emoji, ou de vrais mots : comme avant */
      ["autre", "A réagi à votre story", "Léa: A répondu à ta story"],
      ["autre", "trop belle 😍", "Léa: trop belle 😍 <réponse à une story>"],
    ];
    const { t, lu } = lues(captures({ blocs: [{ repere: A_21H05, messages: formes.map(([de, texte]) => msg(de, texte, { media: "story" })) }] }));
    expect(t.texte.split("\n").slice(2)).toEqual(formes.map((f) => f[2]));
    /* Ni distinctive, ni la même clé pour toutes : la réaction est son emoji */
    expect(cleDuMessage(lu.messages[0]!)).toBe("autre|#😍");
    /* Six soirs de réactions : ni « réagi », ni « votre », ni « story » ne sont ses mots */
    const soir = (k: number) => ({
      repere: { date: `2026-09-0${k + 1}`, heure: "21:00" },
      messages: [msg("autre", "A réagi à votre story 😍", { media: "story" }), msg("moi", "merci toi"), msg("autre", "tu fais quoi ce soir"), msg("moi", "rien de spécial")],
    });
    const six = lues(captures({ blocs: Array.from({ length: 6 }, (_, k) => soir(k)) })).lu;
    const c = chiffrer(h(), six.messages);
    for (const w of ["réagi", "votre", "story"]) expect(c.recurrents.map(([x]) => x)).not.toContain(w);
    expect(trouvailles(c, h(), six.messages).join(" ")).not.toMatch(/réagi|story/);
  });
});

describe("les appels lus sur l’écran", () => {
  it("décroché, quand une durée le prouve : gardé pour le modèle, hors de leurs mots ; manqué, sans réponse, sans durée : appel manqué ; un message tapé reste un message", () => {
    /* [media, texte du modèle, ligne écrite après « Nom: », ce que lit lire (média ou texte), deWhatsApp] */
    const formes: [Media, string, string, string, boolean][] = [
      /* Media « appel » (l’appel manqué du prompt 01) : décroché seulement si une durée se lit */
      ["appel", "Appel vocal · 23 min", "\u200eAppel vocal, 23\u00a0min", "Appel vocal, 23\u00a0min", true],
      ["appel", "Appel vidéo terminé · 1 h 05", "\u200eAppel vidéo, 1\u00a0h\u00a005", "Appel vidéo, 1\u00a0h\u00a005", true],
      ["appel", "Appel vocal (12 min 30 s)", "\u200eAppel vocal, 12\u00a0min\u00a030\u00a0s", "Appel vocal, 12\u00a0min\u00a030\u00a0s", true],
      ["appel", "FaceTime Audio · 4 min", "\u200eAppel vocal, 4\u00a0min", "Appel vocal, 4\u00a0min", true],
      /* Le bouton de la bulle ne dit rien de l’issue : la durée décide */
      ["appel", "Appel vocal · 23 min · Rappeler", "\u200eAppel vocal, 23\u00a0min", "Appel vocal, 23\u00a0min", true],
      ["appel", "Audio call · 5 min · Call back", "\u200eAppel vocal, 5\u00a0min", "Appel vocal, 5\u00a0min", true],
      ["appel", "Appel vocal · Rappeler", "Appel vocal manqué", "appel manqué", false],
      /* Sans durée, comme avant : un appel manqué, de son genre (l’heure de la bulle n’est pas une durée) */
      ["appel", "Appel vidéo", "Appel vidéo manqué", "appel manqué", false],
      ["appel", "Appel audio", "Appel vocal manqué", "appel manqué", false],
      ["appel", "Appel vocal · 21:05", "Appel vocal manqué", "appel manqué", false],
      ["appel", "Appel vocal · 21h05", "Appel vocal manqué", "appel manqué", false],
      ["appel", "Appel vocal manqué", "Appel vocal manqué", "appel manqué", false],
      ["appel", "Appel vidéo manqué", "Appel vidéo manqué", "appel manqué", false],
      ["appel", "Appel manqué", "Appel vocal manqué", "appel manqué", false],
      ["appel", "", "Appel vocal manqué", "appel manqué", false],
      /* Personne n’a décroché, vu du téléphone de celui qui appelle : un appel manqué (décision du 3 novembre 2026), même avec un nombre */
      ["appel", "Appel vocal · Sans réponse", "Appel vocal manqué", "appel manqué", false],
      ["appel", "Video call · No answer", "Appel vidéo manqué", "appel manqué", false],
      ["appel", "Missed voice call", "Appel vocal manqué", "appel manqué", false],
      ["appel", "FaceTime manqué", "Appel vidéo manqué", "appel manqué", false],
      ["appel", "Appel vocal annulé", "Appel vocal manqué", "appel manqué", false],
      ["appel", "Appel vocal manqué · 2 min", "Appel vocal manqué", "appel manqué", false],
      /* Comme avant : media « appel » sans libellé lisible (le bouton, l’heure, un mot) */
      ["appel", "Rappeler", "Appel vocal manqué", "appel manqué", false],
      ["appel", "21:05", "Appel vocal manqué", "appel manqué", false],
      ["appel", "ok", "Appel vocal manqué", "appel manqué", false],
      /* L’heure de la bulle écrite sans espace, même à un chiffre, n’est jamais une durée ; « 1 h 05 », avec ses espaces, en est une */
      ["appel", "Appel vocal · 9h05", "Appel vocal manqué", "appel manqué", false],
      ["appel", "Appel vocal · 2h14", "Appel vocal manqué", "appel manqué", false],
      ["appel", "Appel vidéo · 8h30", "Appel vidéo manqué", "appel manqué", false],
      ["appel", "9h05", "Appel vocal manqué", "appel manqué", false],
      ["appel", "Appel vocal · 23 min · 9h05", "\u200eAppel vocal, 23\u00a0min", "Appel vocal, 23\u00a0min", true],
      ["appel", "Appel vocal · 1 h 05", "\u200eAppel vocal, 1\u00a0h\u00a005", "Appel vocal, 1\u00a0h\u00a005", true],
      /* Une durée entière, telle que l’appli l’écrit : l’heure et ses minutes, « hr », « mins », « heure » ; « 21 h 05 » reste l’heure de la bulle */
      ["appel", "Appel vocal · 1 h 5 min", "\u200eAppel vocal, 1\u00a0h\u00a05\u00a0min", "Appel vocal, 1\u00a0h\u00a05\u00a0min", true],
      ["appel", "Voice call · 1 hr, 2 min", "\u200eAppel vocal, 1\u00a0hr,\u00a02\u00a0min", "Appel vocal, 1\u00a0hr,\u00a02\u00a0min", true],
      ["appel", "Appel vidéo · 10 h 2 min", "\u200eAppel vidéo, 10\u00a0h\u00a02\u00a0min", "Appel vidéo, 10\u00a0h\u00a02\u00a0min", true],
      ["appel", "Voice call · 2 mins", "\u200eAppel vocal, 2\u00a0mins", "Appel vocal, 2\u00a0mins", true],
      ["appel", "Voice call · 1 hr", "\u200eAppel vocal, 1\u00a0hr", "Appel vocal, 1\u00a0hr", true],
      ["appel", "Appel vocal · 1 heure", "\u200eAppel vocal, 1\u00a0heure", "Appel vocal, 1\u00a0heure", true],
      ["appel", "Voice call · 45 secs", "\u200eAppel vocal, 45\u00a0secs", "Appel vocal, 45\u00a0secs", true],
      ["appel", "Appel vocal · 21 h 05", "Appel vocal manqué", "appel manqué", false],
      /* Sans media : tout le texte est un libellé d’appel, décroché sauf un mot de manque ou un bouton sans durée */
      [null, "Appel vocal · 12 min", "\u200eAppel vocal, 12\u00a0min", "Appel vocal, 12\u00a0min", true],
      [null, "Voice call, 3 min", "\u200eAppel vocal, 3\u00a0min", "Appel vocal, 3\u00a0min", true],
      [null, "FaceTime audio", "\u200eAppel vocal", "Appel vocal", true],
      [null, "Appel vocal · 23 min · Rappeler", "\u200eAppel vocal, 23\u00a0min", "Appel vocal, 23\u00a0min", true],
      [null, "Voice call · 3 min · Call back", "\u200eAppel vocal, 3\u00a0min", "Appel vocal, 3\u00a0min", true],
      [null, "Appel vocal · Rappeler", "Appel vocal manqué", "appel manqué", false],
      [null, "Appel vidéo manqué", "Appel vidéo manqué", "appel manqué", false],
      [null, "Appel vocal manqué 21:05", "Appel vocal manqué", "appel manqué", false],
      [null, "Missed video call", "Appel vidéo manqué", "appel manqué", false],
      [null, "Missed voice call · Tap to call back", "Appel vocal manqué", "appel manqué", false],
      /* Sans media non plus, l’heure de la bulle n’est pas une durée ; une durée entière se lit (« hr », « mins ») */
      [null, "Appel vocal · 9h05", "\u200eAppel vocal", "Appel vocal", true],
      [null, "Appel vocal · 1h05", "\u200eAppel vocal", "Appel vocal", true],
      [null, "Appel vidéo 21:05", "\u200eAppel vidéo", "Appel vidéo", true],
      [null, "Voice call · 1 hr, 2 min", "\u200eAppel vocal, 1\u00a0hr,\u00a02\u00a0min", "Appel vocal, 1\u00a0hr,\u00a02\u00a0min", true],
      [null, "Voice call · 2 mins", "\u200eAppel vocal, 2\u00a0mins", "Appel vocal, 2\u00a0mins", true],
      /* Des messages tapés qui parlent d’appel restent des messages */
      [null, "appel vidéo ce soir ?", "appel vidéo ce soir ?", "appel vidéo ce soir ?", false],
      [null, "Appel moi quand tu peux", "Appel moi quand tu peux", "Appel moi quand tu peux", false],
      [null, "un appel vocal ça te va", "un appel vocal ça te va", "un appel vocal ça te va", false],
      [null, "Appel vidéo à 21:05", "Appel vidéo à 21:05", "Appel vidéo à 21:05", false],
      [null, "Appel", "Appel", "Appel", false],
      /* Un mot d’appel et une heure, sans genre, issue ni durée : un rendez-vous tapé (« 21h », « 22h30 » ne sont pas des mots d’appel) */
      [null, "facetime 21h", "facetime 21h", "facetime 21h", false],
      [null, "Facetime 22h30", "Facetime 22h30", "Facetime 22h30", false],
      [null, "appel 21h", "appel 21h", "appel 21h", false],
      [null, "Appel 20:30", "Appel 20:30", "Appel 20:30", false],
      [null, "call 9:30", "call 9:30", "call 9:30", false],
      [null, "appel vidéo 22h30", "appel vidéo 22h30", "appel vidéo 22h30", false],
      [null, "appel 2", "appel 2", "appel 2", false],
      [null, "Vidéo chat", "Vidéo chat", "Vidéo chat", false],
      [null, "Vidéo · 0:45", "Vidéo · 0:45", "Vidéo · 0:45", false],
      /* Les marques de sens d’écriture du modèle sont retirées : seul un appel décroché en porte une */
      [null, "\u200fsalut\u200e toi", "salut toi", "salut toi", false],
    ];
    const { t, lu } = lues(captures({ blocs: [{ repere: A_21H05, messages: formes.map(([media, texte], k) => msg(k % 2 ? "moi" : "autre", texte, { media })) }] }));
    expect(
      t.texte
        .split("\n")
        .slice(2)
        .map((l) => l.slice(l.indexOf(": ") + 2)),
    ).toEqual(formes.map((f) => f[2]));
    expect(lu.messages.map((m) => [m.media ?? m.texte, !!m.deWhatsApp])).toEqual(formes.map((f) => [f[3], f[4]]));
  });

  it("ni leurs mots, ni un média : six soirs d’appels laissent leurs vrais mots, et le modèle lit l’appel entre crochets", () => {
    const soir = (k: number) => ({
      repere: { date: `2026-09-0${k + 1}`, heure: "22:00" },
      messages: [msg("moi", "bonne nuit"), msg("autre", "bonne nuit"), msg("autre", "Appel vocal · 12 min"), msg("moi", "j’adore t’entendre")],
    });
    const { lu } = lues(captures({ blocs: Array.from({ length: 6 }, (_, k) => soir(k)) }));
    expect(lu.messages.filter((m) => m.deWhatsApp)).toHaveLength(6);
    const c = chiffrer(h(), lu.messages);
    for (const w of ["appel", "vocal", "min"]) expect(c.recurrents.map(([x]) => x)).not.toContain(w);
    expect(c.medias).toEqual({ toi: {}, autre: {} });
    expect(trouvailles(c, h(), lu.messages).join(" ")).not.toContain("vocal");
    expect(rendre(h(), lu).conversation).toContain("m0003 ~22:00 Léa : [Appel vocal, 12 min]");
  });

  it("un texte gardé avant ce changement se lit comme avant : un appel écrit en texte, sans U+200E, reste du texte", () => {
    const lu = lire("# captures · instagram · 1 captures\n== 2026-09-08 21:05 ==\nLéa: Appel vocal manqué\nMoi: A répondu à ta story\nLéa: Appel vocal · 12 min", h());
    expect(lu.messages.map((m) => [m.media ?? m.texte, !!m.deWhatsApp])).toEqual([
      ["appel manqué", false],
      ["réponse à ta story", false],
      ["Appel vocal · 12 min", false],
    ]);
  });
});

describe("une vidéo", () => {
  it("les lots rassemblés (fusionnerLots) passent par versTexteCaptures : la réponse à la story, l’appel et le haut sans date y sont", () => {
    const f = fusionnerLots(
      [
        captures({
          blocs: [
            {
              repere: null,
              messages: [
                msg("autre", "salut toi ça va depuis hier"),
                msg("moi", "trop beau ce coucher de soleil", { media: "story" }),
                msg("autre", "Appel vidéo · 14 min", { media: "appel" }),
                msg("moi", "on se capte demain soir alors", { coupe: true }),
              ],
            },
          ],
        }),
        captures({
          blocs: [
            { repere: null, messages: [msg("autre", "Appel vidéo · 14 min", { media: "appel" }), msg("moi", "on se capte demain soir alors ?? ou pas")] },
            { repere: { date: "2026-10-20", heure: "22:10" }, messages: [msg("autre", "oui carrément vers 20 h")] },
          ],
        }),
      ],
      "instagram",
    );
    const t = versTexteCaptures(f, { aujourdhui: "2026-10-21" });
    /* Le message coupé d’un lot a laissé place à l’entier de l’autre : plus aucune ligne coupée */
    expect(t.texte).toBe(
      "# captures · instagram · 1 captures · haut sans date\n== 2026-10-20 ==\nLéa: salut toi ça va depuis hier\nMoi: trop beau ce coucher de soleil <réponse à une story>\nLéa: \u200eAppel vidéo, 14\u00a0min\nMoi: on se capte demain soir alors ?? ou pas\n== 2026-10-20 22:10 ==\nLéa: oui carrément vers 20 h",
    );
    expect(lire(t.texte, h()).messages.map((m) => [m.jourDevine ?? null, !!m.deWhatsApp])).toEqual([
      ["auPlusTard", false],
      ["auPlusTard", false],
      ["auPlusTard", true],
      ["auPlusTard", false],
      [null, false],
    ]);
  });
});
