import { describe, expect, it } from "vitest";
import { versTexteCaptures } from "@prompts/lib/captures";
import { chiffrer, erreurImport, jour, lire, participantsDe, principaux } from "@prompts/lib/conv";
import { depuisInstagramHtml, depuisInstagramJson } from "@prompts/lib/instagram";
import { captures, msg } from "./aide/fabriques";

/* Une conv WhatsApp iOS entre Léa et Tom : un message toutes les 10 minutes, à partir du 12 septembre 2026 à 10 h */
const pad = (n: number) => String(n).padStart(2, "0");
const ligne = (k: number, nom: string, texte: string) => {
  const d = new Date(Date.UTC(2026, 8, 12, 10, 0) + k * 10 * 60e3);
  return `[${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00] ${nom}: ${texte}`;
};
const conv = (n: number, noms = ["Léa", "Tom"]) => Array.from({ length: n }, (_, k) => ligne(k, noms[k % 2]!, `message ${k}`));
const qui = (moi: string, autre: string) => ({
  utilisateur: { prenom: moi, pronom: "il" as const, nomExport: moi },
  autre: { prenom: autre, pronom: "elle" as const, nomExport: autre },
  format: "whatsapp-ios" as const,
});
/** Une conv iOS de 60 messages entre Léa et Tom, dont les messages 10, 11… sont `textes`, écrits par Léa. */
const exportAvec = (textes: string[]) => {
  const lignes = conv(60);
  textes.forEach((t, k) => (lignes[10 + k] = ligne(10 + k, "Léa", t)));
  return lignes.join("\n");
};
const avec = (textes: string[]) => lire(exportAvec(textes), qui("Tom", "Léa"), { autresEnTexte: true });
/** Ce que la lecture garde des messages 10, 11… : leur média, sinon leur texte. */
const lus = (textes: string[]) =>
  avec(textes)
    .messages.slice(10, 10 + textes.length)
    .map((m) => m.media ?? m.texte);
/** La même conv sur Android (« 12/09/2026 10:01 - Léa: … »), un message par minute. */
const surAndroid = (textes: string[]) => {
  const l = (k: number, nom: string, texte: string) => `12/09/2026 ${pad(10 + Math.floor(k / 60))}:${pad(k % 60)} - ${nom}: ${texte}`;
  const lignes = Array.from({ length: 60 }, (_, k) => l(k, k % 2 ? "Tom" : "Léa", `message ${k}`));
  textes.forEach((t, k) => (lignes[10 + k] = l(10 + k, "Léa", t)));
  return lire(lignes.join("\n"), { ...qui("Tom", "Léa"), format: "whatsapp-android" }, { autresEnTexte: true });
};

describe("lire un export WhatsApp", () => {
  it("lit un pseudo qui contient des deux-points (« Léa :) »)", () => {
    const texte = conv(60, ["Léa :)", "Tom"]).join("\n");
    const noms = participantsDe(texte);
    expect(noms.map((n) => n.nom).sort()).toEqual(["Léa :)", "Tom"]);
    const lu = lire(texte, qui("Tom", "Léa :)"));
    expect(lu.messages).toHaveLength(60);
    expect(lu.messages.filter((m) => m.role === "autre")).toHaveLength(30);
    expect(erreurImport(lu)).toBeNull();
  });

  it("garde un message collé d’un autre (un nom à peine présent) comme du texte, pas comme un groupe", () => {
    const lignes = conv(80);
    /* Léa colle un message reçu ailleurs, sur deux lignes : la seconde a la forme d’un message de « Sarah » */
    lignes.splice(40, 0, ligne(40, "Léa", "regarde ce qu’elle m’a dit"), "[11/09/2026 23:12] Sarah: il t’a répondu ??");
    const texte = lignes.join("\n");
    expect(participantsDe(texte)).toHaveLength(3);
    const noms = principaux(participantsDe(texte));
    expect(noms.map((n) => n.nom)).toEqual(["Léa", "Tom"]);
    const lu = lire(texte, qui("Tom", "Léa"), { autresEnTexte: true });
    expect(erreurImport(lu)).toBeNull();
    expect(lu.messages.find((m) => m.texte.startsWith("regarde"))?.texte).toContain("Sarah: il t’a répondu ??");
    /* Sans l’option (le banc de test), la ligne reste un message : c’est un groupe */
    expect(erreurImport(lire(texte, qui("Tom", "Léa")))).toBe("groupe");
  });

  it("refuse toujours une vraie conv de groupe (un troisième qui parle vraiment)", () => {
    const texte = Array.from({ length: 90 }, (_, k) => ligne(k, ["Léa", "Tom", "Sarah"][k % 3]!, `message ${k}`)).join("\n");
    expect(principaux(participantsDe(texte))).toHaveLength(3);
  });

  it("reconnaît les médias d’un export « avec médias » (iOS et Android, français et anglais)", () => {
    const medias = [
      "\u200e<attached: 00000012-AUDIO-2026-09-12-10-45-53.opus>",
      "<attached: 00000013-PHOTO-2026-09-12-10-46-01.jpg>",
      "<pièce jointe : 00000014-VIDEO-2026-09-12-10-47-00.mp4>",
      "<attached: 00000015-STICKER-2026-09-12-10-48-00.webp>",
      "PTT-20260912-WA0003.opus (fichier joint)",
      "IMG-20260912-WA0004.jpg (file attached)",
      "VID-20260912-WA0005.mp4 (fichier joint)",
      "STK-20260912-WA0006.webp (file attached)",
      "DOC-20260912-WA0007.pdf (fichier joint)",
      "<Media omitted>",
    ];
    const lignes = conv(60);
    medias.forEach((m, k) => (lignes[10 + k] = ligne(10 + k, k % 2 ? "Tom" : "Léa", m)));
    const lu = lire(lignes.join("\n"), qui("Tom", "Léa"));
    expect(lu.messages.slice(10, 20).map((m) => m.media)).toEqual(["vocal", "photo", "vidéo", "autocollant", "vocal", "photo", "vidéo", "autocollant", "média", "média"]);
  });

  it("reconnaît les médias d’un export iOS en français « sans médias », « sticker omis » compris", () => {
    const lignes = conv(60);
    ["\u200eaudio omis", "\u200eimage absente", "\u200evidéo absente", "\u200esticker omis", "\u200eautocollant omis", "\u200eGIF retiré"].forEach(
      (m, k) => (lignes[10 + k] = ligne(10 + k, k % 2 ? "Tom" : "Léa", m)),
    );
    const lu = lire(lignes.join("\n"), qui("Tom", "Léa"));
    expect(lu.messages).toHaveLength(60);
    expect(lu.messages.slice(10, 16).map((m) => m.media)).toEqual(["vocal", "photo", "vidéo", "autocollant", "autocollant", "autocollant"]);
  });

  it("garde la légende d’un média, en français comme en anglais, et le média devient un repère", () => {
    const legendes: [string, string][] = [
      ["regarde \u200eimage absente", "regarde [photo]"],
      ["le voilà \u200evidéo absente", "le voilà [vidéo]"],
      ["regarde \u200e<pièce jointe : 00000014-PHOTO-2026-09-12-10-47-00.jpg>", "regarde [photo]"],
      ["mdr \u200e<attached: 00000015-VIDEO-2026-09-12-10-48-00.mp4>", "mdr [vidéo]"],
      ["on y va ? \u200eimage omitted", "on y va ? [photo]"],
      /* Pas un média : un texte qui finit comme un libellé, un appel manqué après un mot */
      ["il manque l’audio omis", "il manque l’audio omis"],
      ["rappelle \u200eAppel vocal manqué", "rappelle Appel vocal manqué"],
    ];
    const lignes = conv(60);
    legendes.forEach(([m], k) => (lignes[10 + k] = ligne(10 + k, "Léa", m)));
    const lu = lire(lignes.join("\n"), qui("Tom", "Léa"));
    expect(lu.messages.slice(10, 10 + legendes.length).map((m) => m.media ?? m.texte)).toEqual(legendes.map(([, attendu]) => attendu));
  });

  it("garde les appels pour le modèle, sans les compter comme leurs mots", () => {
    /* Des appels sous leur forme iOS (« Appel vocal », une espace fine, la durée) : avant, « vocal » était « leur mot » */
    const lignes = conv(60);
    for (let k = 10; k < 40; k += 2) lignes[k] = ligne(k, "Léa", k % 4 ? "\u200eAppel vocal\u202f \u200e7\u00a0s" : "\u200eVoice call, \u200e12 min");
    lignes[41] = ligne(41, "Tom", "regarde \u200e<pièce jointe : 00000014-PHOTO-2026-09-12-10-47-00.jpg>");
    const lu = lire(lignes.join("\n"), qui("Tom", "Léa"));
    expect(lu.messages).toHaveLength(60);
    const appels = lu.messages.filter((m) => m.deWhatsApp);
    expect(appels).toHaveLength(15);
    expect(appels.every((m) => /^(Appel vocal|Voice call)/.test(m.texte))).toBe(true);
    const mots = chiffrer(qui("Tom", "Léa"), lu.messages).recurrents.map(([w]) => w);
    expect(mots).toContain("message");
    for (const w of ["appel", "vocal", "voice", "call", "photo"]) expect(mots).not.toContain(w);
  });
});

describe("ignorer les lignes système de WhatsApp", () => {
  /* Un export inventé : les lignes système d’iOS sont écrites au nom du contact, leur texte précédé d’un U+200E */
  const ios = [
    "[12/09/2026 10:00:00] Léa: \u200eLes messages et les appels sont chiffrés de bout en bout.",
    "[12/09/2026 10:01:00] Léa: salut",
    "[12/09/2026 10:02:00] Léa: \u200eVous avez bloqué ce contact.",
    "\u200e[12/09/2026 10:03:00] Léa: \u200eVotre code de sécurité avec Léa a changé.",
    "[12/09/2026 10:04:00] Léa: \u200eLéa a changé de numéro.",
    "[12/09/2026 10:05:00] Tom: première ligne",
    "deuxième ligne",
    "\u200e[12/09/2026 10:06:00] Léa: \u200eimage omitted",
    "[12/09/2026 10:07:00] Léa: \u200eThis message was deleted.",
    "[12/09/2026 10:08:00] Léa: \u200eaudio omitted",
    "[12/09/2026 10:09:00] Léa: \u200eMissed voice call",
    "[12/09/2026 10:10:00] Léa: on y va ? \u200eimage omitted",
    "[12/09/2026 10:11:00] Tom: c’est noté \u200e<This message was edited>",
    "[12/09/2026 10:12:00] Léa: \u200eLes messages éphémères sont activés.",
    "[12/09/2026 10:13:00] Léa: à plus",
  ].join("\n");

  /* Le même, sur Android : les lignes système n’ont pas de « Nom: » */
  const android = [
    "12/09/2026 10:00 - Les messages et les appels sont chiffrés de bout en bout. Appuyez pour en savoir plus.",
    "12/09/2026 10:01 - Léa: salut",
    "12/09/2026 10:02 - Vous avez bloqué ce contact. Appuyez pour débloquer.",
    "12/09/2026 10:03 - Votre code de sécurité avec Léa a changé. Appuyez pour en savoir plus.",
    "12/09/2026 10:04 - Léa a changé de numéro. Appuyez pour lui écrire ou ajouter le nouveau numéro.",
    "12/09/2026 10:05 - Tom: première ligne",
    "deuxième ligne",
    "12/09/2026 10:06 - Léa: <Médias omis>",
    "12/09/2026 10:07 - Léa: Ce message a été supprimé",
    "12/09/2026 10:08 - Léa: PTT-20260912-WA0003.opus (fichier joint)",
    "12/09/2026 10:09 - Les messages éphémères sont désactivés.",
    "12/09/2026 10:10 - Léa: à plus",
  ].join("\n");

  const resume = (texte: string, format: "whatsapp-ios" | "whatsapp-android", autresEnTexte: boolean) =>
    lire(texte, { ...qui("Tom", "Léa"), format }, { autresEnTexte }).messages.map((m) => [m.nom, m.media ?? m.texte]);

  it.each([true, false])(
    "iOS : une ligne marquée d’un U+200E n’est pas un message, sauf un média, un message supprimé ou un appel manqué (autresEnTexte : %s)",
    (autresEnTexte) => {
      expect(resume(ios, "whatsapp-ios", autresEnTexte)).toEqual([
        ["Léa", "salut"],
        ["Tom", "première ligne\ndeuxième ligne"],
        ["Léa", "photo"],
        ["Léa", "message supprimé"],
        ["Léa", "vocal"],
        ["Léa", "appel manqué"],
        ["Léa", "on y va ? [photo]"],
        ["Tom", "c’est noté"],
        ["Léa", "à plus"],
      ]);
      expect(participantsDe(ios)).toEqual([
        { nom: "Léa", messages: 7 },
        { nom: "Tom", messages: 2 },
      ]);
    },
  );

  it.each([true, false])("Android : une ligne datée sans « Nom: » n’est pas un message, ni la suite du précédent (autresEnTexte : %s)", (autresEnTexte) => {
    const lu = lire(android, { ...qui("Tom", "Léa"), format: "whatsapp-android" }, { autresEnTexte });
    expect(resume(android, "whatsapp-android", autresEnTexte)).toEqual([
      ["Léa", "salut"],
      ["Tom", "première ligne\ndeuxième ligne"],
      ["Léa", "média"],
      ["Léa", "message supprimé"],
      ["Léa", "vocal"],
      ["Léa", "à plus"],
    ]);
    expect(lu.problemes).toEqual([]);
    expect(lu.participants).toEqual(["Léa", "Tom"]);
  });

  it("compte les lignes marquées qu’aucune règle ne lit, et garde la première silhouette qui revient", () => {
    /* Un libellé qu’on ne connaît pas encore (l’espagnol « <adjunto: …> ») : jeté, mais compté, et sa silhouette revient */
    const lu = avec([
      "\u200e<adjunto: 00000005-PHOTO-2025-01-09-12-23-16.jpg>",
      "\u200e<adjunto: 00000006-VIDEO-2025-01-09-12-23-20.mp4>",
      "\u200e<adjunto: 00000007-VIDEO-2025-01-09-12-23-24.mp4>",
      "\u200eVous avez bloqué ce contact.",
      "salut, ça va ?",
    ]);
    expect(lu.messages).toHaveLength(56);
    expect(lu.inconnues).toEqual({ lignes: 3, forme: "<aaaaaaa: 00000000-AAAAA" });
    /* Un vrai message marqué d’un U+200E : compté ; répété, il ne laisse que sa silhouette, aucune lettre */
    expect(avec(["\u200eon se voit demain soir chez toi", "\u200eje t’attends en bas"]).inconnues).toEqual({ lignes: 2, forme: null });
    expect(avec(["\u200ebonne nuit mon cœur ❤️", "salut", "\u200ebonne nuit mon cœur ❤️"]).inconnues).toEqual({ lignes: 2, forme: "aaaaa aaaa aaa aaaa ··" });
    /* Les vraies lignes système (une phrase, qui finit par un point), le chiffrement et les lignes d’Android ne s’y comptent pas */
    expect(lire(ios, qui("Tom", "Léa")).inconnues).toEqual({ lignes: 0, forme: null });
    expect(lire(android, { ...qui("Tom", "Léa"), format: "whatsapp-android" }).inconnues).toEqual({ lignes: 0, forme: null });
  });

  it("Android : un texte marqué d’un U+200E avec un nom est un message ; seul un fichier joint d’une autre langue est inconnu", () => {
    /* Android n’écrit ses lignes système que sans nom : de vrais exports marquent pourtant des messages */
    const lu = surAndroid([
      "\u200ebonne nuit mon cœur ❤️",
      "\u200ebonne nuit mon cœur ❤️",
      /* Le libellé espagnol d’un fichier joint, relevé sur de vrais exports, deux fois */
      "\u200eIMG-20260912-WA0004.jpg (archivo adjunto)",
      "\u200eIMG-20260912-WA0005.jpg (archivo adjunto)",
    ]);
    expect(lu.messages).toHaveLength(58);
    expect(lu.messages.slice(10, 12).map((m) => m.texte)).toEqual(["bonne nuit mon cœur ❤️", "bonne nuit mon cœur ❤️"]);
    expect(lu.inconnues).toEqual({ lignes: 2, forme: "AAA-00000000-AA0000.aaa" });
    expect(participantsDe(lu.messages.map((m) => `12/09/2026 10:00 - ${m.nom}: ${m.texte}`).join("\n"))).toHaveLength(2);
  });

  it("Android : un fichier joint dont le nom a des espaces est un média, ses mots ne sont pas les leurs", () => {
    const lu = surAndroid(["Compte rendu réunion.pdf (fichier joint)", "\u200eBulletin de salaire Tom janvier.pdf (fichier joint)", "notes de cours (2).ipynb (file attached)"]);
    expect(lu.messages.slice(10, 13).map((m) => m.media ?? m.texte)).toEqual(["média", "média", "média"]);
    expect(lu.inconnues.lignes).toBe(0);
    /* Les autres messages de la conv (« message 12 ») : rien du nom des fichiers */
    expect(chiffrer(qui("Tom", "Léa"), lu.messages).recurrents).toEqual([["message", 57]]);
  });
});

describe("lire les formes réelles des exports WhatsApp", () => {
  it("iOS en français « avec médias » : des espaces dans les chevrons, seul ou après une légende", () => {
    const formes: [string, string][] = [
      ["\u200e< pièce jointe : 00000005-AUDIO-2025-01-09-12-23-16.opus >", "vocal"],
      ["\u200e< pièce jointe :00000005-PHOTO-2025-01-09-12-23-16.jpg >", "photo"],
      ["\u200e< pièce jointe : 00000012-VIDEO-2025-01-09-12-23-30.mp4 >", "vidéo"],
      ["\u200e< pièce jointe : 00000020-Facture.pdf >", "média"],
      ["regarde \u200e< pièce jointe : 00000009-PHOTO-2025-01-09-12-24-00.jpg >", "regarde [photo]"],
      /* Comme avant : la forme collée, et des messages qui leur ressemblent */
      ["\u200e<pièce jointe : 00000005-AUDIO-2025-01-09-12-23-16.opus>", "vocal"],
      ["envoie la pièce jointe : le pdf stp", "envoie la pièce jointe : le pdf stp"],
      ["< 3 tu me manques >", "< 3 tu me manques >"],
    ];
    expect(lus(formes.map(([t]) => t))).toEqual(formes.map(([, attendu]) => attendu));
    /* Une conv de 300 messages, dont 100 vocaux de Léa : rien ne se perd */
    const texte = Array.from({ length: 300 }, (_, k) =>
      ligne(k, k % 3 ? "Tom" : "Léa", k % 3 ? `message ${k}` : `\u200e< pièce jointe : ${String(k).padStart(8, "0")}-AUDIO-2026-09-12-10-00-00.opus >`),
    ).join("\n");
    const lu = lire(texte, qui("Tom", "Léa"), { autresEnTexte: true });
    expect(lu.messages).toHaveLength(300);
    expect(lu.messages.filter((m) => m.media === "vocal")).toHaveLength(100);
    expect(lu.inconnues.lignes).toBe(0);
  });

  it("un message sur plusieurs lignes : sa marque « modifié » et son média se cherchent au bout du message entier", () => {
    const formes: [string, string][] = [
      ["bon écoute\nje voulais te dire un truc \u200e<Ce message a été modifié>", "bon écoute\nje voulais te dire un truc"],
      ["ok so\nI was thinking \u200e<This message was edited>", "ok so\nI was thinking"],
      ["regarde ça\ntrop beau \u200eimage absente", "regarde ça\ntrop beau [photo]"],
      ["regarde ça\ntrop beau \u200e<pièce jointe : 00000014-PHOTO-2025-04-12-10-47-00.jpg>", "regarde ça\ntrop beau [photo]"],
      /* Comme avant : un texte qui finit comme un libellé sans en être un, un message sur deux lignes */
      ["regarde ça\nl’image absente", "regarde ça\nl’image absente"],
      ["première ligne\ndeuxième ligne", "première ligne\ndeuxième ligne"],
    ];
    expect(lus(formes.map(([t]) => t))).toEqual(formes.map(([, attendu]) => attendu));
    const mots = chiffrer(qui("Tom", "Léa"), avec(Array(6).fill(formes[0]![0])).messages).recurrents.map(([w]) => w);
    expect(mots).toContain("voulais");
    expect(mots).not.toContain("modifié");
  });

  it("… de même pour Instagram et pour les captures, qui passent par la même lecture", () => {
    const json = JSON.stringify({
      messages: [
        { sender_name: "Hugo", timestamp_ms: Date.UTC(2026, 8, 12, 10), content: "ligne 1\nligne 2", photos: [{ uri: "x" }] },
        { sender_name: "Inès", timestamp_ms: Date.UTC(2026, 8, 12, 9), content: "salut" },
      ],
    });
    expect(lire(depuisInstagramJson(json).texte, qui("Hugo", "Inès")).messages.map((m) => m.media ?? m.texte)).toEqual(["salut", "ligne 1\nligne 2 [photo]"]);
    const c = versTexteCaptures(
      captures({
        autre: "Léa",
        blocs: [
          {
            repere: { date: "2026-09-12", heure: "21:05" },
            messages: [msg("autre", "regarde\nc’est où ça ?", { media: "photo" }), msg("moi", "devine\nqui c’est", { media: "video" })],
          },
        ],
      }),
      { aujourdhui: "2026-09-13" },
    );
    const hc = { ...qui("Moi", c.autre), format: "captures" as const };
    const lu = lire(c.texte, hc);
    expect(lu.messages.map((m) => m.media ?? m.texte)).toEqual(["regarde\nc’est où ça ? [photo]", "devine\nqui c’est [vidéo]"]);
    /* Les médias légendés comptent */
    expect(chiffrer(hc, lu.messages).medias).toEqual({ toi: { vidéo: 1 }, autre: { photo: 1 } });
  });

  it("iOS : un appel manqué suivi de « Appuyez pour rappeler » ou « Tap to call back » est un appel manqué", () => {
    const formes: [string, string, boolean][] = [
      ["\u200eAppel vidéo manqué\u202f \u200eAppuyez pour rappeler", "appel manqué", false],
      ["\u200eAppel vocal manqué\u202f \u200eAppuyez pour rappeler", "appel manqué", false],
      ["\u200eAppel vocal manqué, \u200eAppuyez pour rappeler", "appel manqué", false],
      ["\u200eMissed voice call, \u200eTap to call back", "appel manqué", false],
      /* Comme avant : un appel sans réponse reste un contenu de WhatsApp, un message tapé reste un message */
      /* TODO(produit): « Sans réponse » (WhatsApp) et la fin d’appel à 0 s (Instagram) : appel manqué, ou genre à part ? */
      ["\u200eAppel vocal\u202f \u200eSans réponse", "Appel vocal\u202f Sans réponse", true],
      ["\u200eVoice call, \u200eNo answer", "Voice call, No answer", true],
      ["missed video call, tap to call back", "missed video call, tap to call back", false],
    ];
    const lu = avec(formes.map(([t]) => t));
    const messages = lu.messages.slice(10, 10 + formes.length);
    expect(messages.map((m) => [m.media ?? m.texte, !!m.deWhatsApp])).toEqual(formes.map(([, attendu, deWhatsApp]) => [attendu, deWhatsApp]));
    expect(chiffrer(qui("Tom", "Léa"), lu.messages).medias.autre).toEqual({ "appel manqué": 4 });
  });

  it("Android : la légende d’un média, écrite sur la ligne d’après, devient son texte", () => {
    const lu = surAndroid([
      "<Médias omis>\nregarde comme il est mignon",
      "IMG-20260912-WA0004.jpg (fichier joint)\nregarde comme il est mignon\nsur deux lignes",
      "<Media omitted>\nlook at him",
      /* Comme avant : une note vocale n’a pas de légende, un nom de fichier seul nomme un document, une ligne d’un autre nom collée */
      "PTT-20260912-WA0003.opus (fichier joint)\n?",
      "<Media omitted>\nMemoire_M2.pdf",
      "<Médias omis>\nCompte rendu réunion.pdf",
      "IMG-20260912-WA0005.jpg (fichier joint)\n12/09/2026 10:15 - Sarah: il t’a répondu ??",
    ]);
    expect(lu.messages.slice(10, 17).map((m) => m.media ?? m.texte)).toEqual([
      "regarde comme il est mignon [média]",
      "regarde comme il est mignon\nsur deux lignes [photo]",
      "look at him [média]",
      "vocal",
      "média",
      "média",
      "photo",
    ]);
    expect(lu.problemes).toEqual([
      expect.stringContaining("« ? »"),
      expect.stringContaining("« Memoire_M2.pdf »"),
      expect.stringContaining("« Compte rendu réunion.pdf »"),
      expect.stringContaining("Sarah"),
    ]);
    expect(chiffrer(qui("Tom", "Léa"), lu.messages).medias.autre).toEqual({ média: 4, photo: 2, vocal: 1 });
    /* Sur iOS, comme avant : la légende précède le média, une ligne après lui reste illisible */
    const ios = avec(["\u200eimage omitted\nregarde"]);
    expect(ios.messages[10]!.media).toBe("photo");
    expect(ios.problemes).toEqual([expect.stringContaining("« regarde »")]);
  });

  it("Android : la légende suit son média juste après lui, pas après une ligne collée d’un autre nom", () => {
    /* Sarah n’envoie que deux messages : collés au message d’avant (autresEnTexte), comme ce qui les suit */
    const lu = surAndroid(["<Médias omis>\n12/09/2026 10:47 - Sarah: tu viens ce soir ?\ndis-moi vite", "ok"]);
    expect(lu.messages.slice(10, 12).map((m) => [m.nom, m.media ?? m.texte])).toEqual([
      ["Léa", "média"],
      ["Léa", "ok"],
    ]);
    expect(lu.problemes).toEqual([expect.stringContaining("Sarah"), expect.stringContaining("« dis-moi vite »")]);
    expect(chiffrer(qui("Tom", "Léa"), lu.messages).recurrents.map(([w]) => w)).not.toContain("vite");
  });

  it("devine l’ordre du jour et du mois d’une conv courte : le nombre qui change le plus souvent est le jour", () => {
    /* Une semaine, du 3 au 9 novembre 2026, dix messages par jour, la date écrite comme sur chaque téléphone */
    const semaine = (entete: (j: number, k: number) => string, format: "whatsapp-ios" | "whatsapp-android") => {
      const texte = Array.from({ length: 70 }, (_, k) => `${entete(3 + Math.floor(k / 10), k % 10)}${k % 2 ? "Léa" : "Tom"}: message ${k}`).join("\n");
      const { messages } = lire(texte, { ...qui("Tom", "Léa"), format });
      return [jour(messages[0]!.t), jour(messages.at(-1)!.t)];
    };
    const novembre = ["2026-11-03", "2026-11-09"];
    /* Un téléphone en anglais (États-Unis), l’heure sur 24 h : le mois d’abord, sans AM/PM */
    expect(semaine((j, k) => `11/${j}/26, 20:0${k} - `, "whatsapp-android")).toEqual(novembre);
    expect(semaine((j, k) => `[11/${j}/26, 20:0${k}:00] `, "whatsapp-ios")).toEqual(novembre);
    /* Le jour d’abord avec des heures AM/PM (Royaume-Uni, Inde) */
    expect(semaine((j, k) => `${j}/11/26, 8:0${k} pm - `, "whatsapp-android")).toEqual(novembre);
    /* Comme avant : le français, les États-Unis en AM/PM, et sur une seule journée AM/PM tranche */
    expect(semaine((j, k) => `0${j}/11/2026 20:0${k} - `, "whatsapp-android")).toEqual(novembre);
    expect(semaine((j, k) => `11/${j}/26, 8:0${k} PM - `, "whatsapp-android")).toEqual(novembre);
    const unJour = Array.from({ length: 60 }, (_, k) => `11/3/26, 8:${pad(k)} PM - ${k % 2 ? "Léa" : "Tom"}: message ${k}`).join("\n");
    expect(jour(lire(unJour, { ...qui("Tom", "Léa"), format: "whatsapp-android" }).messages[0]!.t)).toBe("2026-11-03");
  });

  it("un média légendé compte dans les médias donnés au modèle, sa légende reste dans le texte", () => {
    const lu = avec([
      "regarde ma tenue \u200eimage omitted",
      "moi demain \u200eGIF omitted",
      "mdr \u200evideo omitted",
      "regarde ma tenue \u200eimage absente",
      "moi demain \u200eGIF retiré",
      "regarde \u200e<attached: 00000012-PHOTO-2025-04-13-09-26-34.jpg>",
      "\u200eimage omitted",
      /* Comme avant : un message qui parle d’une photo n’en est pas une */
      "j’ai vu ta photo",
    ]);
    expect(lu.messages[10]!.texte).toBe("regarde ma tenue [photo]");
    const c = chiffrer(qui("Tom", "Léa"), lu.messages);
    expect(c.medias.autre).toEqual({ photo: 4, autocollant: 2, vidéo: 1 });
    expect(c.recurrents.map(([w]) => w)).toEqual(expect.arrayContaining(["regarde", "tenue"]));
  });

  it("iOS : un document est un contenu de WhatsApp, son nom et ses pages ne sont pas leurs mots", () => {
    const formes: [string, string, boolean][] = [
      ["Devis cuisine.pdf • \u200e1 page \u200edocument manquant", "Devis cuisine.pdf • 1 page [média]", true],
      ["Billets_Concert.pdf • \u200e2 pages \u200edocument manquant", "Billets_Concert.pdf • 2 pages [média]", true],
      ["Modele.docx \u200edocument omitted", "Modele.docx [média]", true],
      ["Billets_Concert.pdf • \u200e2 pages \u200e<attached: 00000047-Billets_Concert.pdf>", "Billets_Concert.pdf • 2 pages [média]", true],
      ["Billets_Concert.pdf • \u200e2 pages \u200e<pièce jointe : 00000007-Billets_Concert.pdf>", "Billets_Concert.pdf • 2 pages [média]", true],
      /* Les diapositives d’un pptx, les feuilles d’un xlsx, comme les écrivent les vrais exports */
      ["Cours.pptx • \u200e47 slides \u200e<attached: 00000047-Cours.pptx>", "Cours.pptx • 47 slides [média]", true],
      ["Budget.xlsx • \u200e1 sheet \u200e<attached: 00000048-Budget.xlsx>", "Budget.xlsx • 1 sheet [média]", true],
      ["Cours.pptx • \u200e47 slides \u200edocument omitted", "Cours.pptx • 47 slides [média]", true],
      /* Comme avant : un message qui en parle, le libellé seul, une légende suivie d’un fichier */
      ["je t’envoie le document manquant", "je t’envoie le document manquant", false],
      ["\u200edocument manquant", "document manquant", true],
      ["regarde \u200e<pièce jointe : 00000099-Facture.pdf>", "regarde [média]", false],
    ];
    const lu = avec(formes.map(([t]) => t));
    const messages = lu.messages.slice(10, 10 + formes.length);
    expect(messages.map((m) => [m.media ?? m.texte, !!m.deWhatsApp])).toEqual(formes.map(([, attendu, deWhatsApp]) => [attendu, deWhatsApp]));
    const c = chiffrer(qui("Tom", "Léa"), lu.messages);
    expect(c.medias.autre).toEqual({ média: 9 });
    for (const w of ["billets", "concert", "pages", "devis", "modele", "cours", "slides", "budget", "sheet"]) expect(c.recurrents.map(([x]) => x)).not.toContain(w);
  });

  it("iOS : « Fiche contact manquante » reste un contenu de WhatsApp, comme « Contact card omitted »", () => {
    const texte = exportAvec(["\u200eFiche contact manquante", "\u200eContact card omitted"]);
    const lu = lire(texte, qui("Tom", "Léa"), { autresEnTexte: true });
    expect(lu.messages).toHaveLength(60);
    expect(lu.messages.slice(10, 12).map((m) => [m.texte, m.deWhatsApp])).toEqual([
      ["Fiche contact manquante", true],
      ["Contact card omitted", true],
    ]);
    expect(participantsDe(texte)).toEqual([
      { nom: "Léa", messages: 31 },
      { nom: "Tom", messages: 29 },
    ]);
  });

  it("garde un message qui parle de chiffrement ou d’un contact ; seules les lignes de WhatsApp partent", () => {
    const messages = [
      "t’inquiète c’est un contact",
      "mdr nos messages sont chiffrés de bout en bout",
      "it's end-to-end encrypted lol",
      "he is a contact",
      "c'est qui Sarah ? — personne, c'est un contact",
    ];
    expect(lus(messages)).toEqual(messages);
    expect(
      surAndroid(messages)
        .messages.slice(10, 15)
        .map((m) => m.texte),
    ).toEqual(messages);
    /* Les lignes de WhatsApp, même sans marque (un vieil export) : la phrase du chiffrement, et « Léa est un contact » au nom de Léa */
    const systeme = ["Les messages et les appels sont chiffrés de bout en bout.", "Messages and calls are end-to-end encrypted.", "Léa est un contact.", "Léa is a contact"];
    expect(avec(systeme).messages).toHaveLength(56);
    expect(participantsDe(exportAvec(systeme))).toEqual([
      { nom: "Léa", messages: 28 },
      { nom: "Tom", messages: 28 },
    ]);
  });
});

describe("lire un export Instagram", () => {
  it("garde un message qui parle de réaction, retire les vraies lignes système, garde un reel partagé", () => {
    const json = JSON.stringify({
      messages: [
        { sender_name: "Tom", timestamp_ms: Date.UTC(2026, 8, 12, 19, 3), content: "Tom a envoyé une pièce jointe.", share: { link: "https://instagram.com/reel/x" } },
        { sender_name: "Léa", timestamp_ms: Date.UTC(2026, 8, 12, 19, 2), content: "A réagi 😂 à votre message" },
        { sender_name: "Léa", timestamp_ms: Date.UTC(2026, 8, 12, 19, 1), content: "t’as vu comment elle a réagi ?" },
        { sender_name: "Tom", timestamp_ms: Date.UTC(2026, 8, 12, 19, 0), content: "Tom a aimé un message" },
      ],
    });
    expect(depuisInstagramJson(json).texte.split("\n")).toEqual(["[12/09/2026 21:01:00] Léa: t’as vu comment elle a réagi ?", "[12/09/2026 21:03:00] Tom: document omitted"]);
  });

  it("garde l’ordre des messages envoyés dans la même minute (l’export HTML va du plus récent au plus ancien)", () => {
    const bloc = (nom: string, texte: string) =>
      `<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">${nom}</h2><div class="_3-95 _a6-p"><div><div></div><div>${texte}</div><div></div><div></div></div></div><div class="_3-94 _a6-o">sep 18, 2026 8:30 am</div></div>`;
    const html = `<html><body><header><time datetime="2026-09-20T05:40Z">Le Samedi 19 septembre 2026 à 22:40 (UTC)</time></header><main>${bloc("Tom", "trois")}${bloc("Tom", "deux")}${bloc("Léa", "un")}</main></body></html>`;
    expect(
      depuisInstagramHtml(html)
        .texte.split("\n")
        .map((l) => l.split("] ")[1]),
    ).toEqual(["Léa: un", "Tom: deux", "Tom: trois"]);
  });
  it("lit le libellé d’une réponse à une story (lib/instagram.ts) : son texte reste, son repère n’est pas un mot, et elle compte", () => {
    const formes: [string, string][] = [
      ["trop belle <réponse à une story>", "trop belle [réponse à une story]"],
      ["trop belle\nsur cette photo <réponse à une story>", "trop belle\nsur cette photo [réponse à une story]"],
      ["<réponse à une story>", "réponse à une story"],
      /* Comme avant : la réponse d’une capture, un message qui en parle */
      ["A répondu à ta story", "réponse à ta story"],
      ["j’ai vu ta réponse à une story", "j’ai vu ta réponse à une story"],
    ];
    expect(lus(formes.map(([t]) => t))).toEqual(formes.map(([, attendu]) => attendu));
    const c = chiffrer(qui("Tom", "Léa"), avec(Array<string>(6).fill("trop belle <réponse à une story>")).messages);
    expect(c.medias.autre).toEqual({ "réponse à une story": 6 });
    /* « message » : les autres messages de la conv ; « réponse » et « story » n’y sont pas */
    expect(c.recurrents).toEqual([
      ["message", 54],
      ["belle", 6],
    ]);
  });
});
