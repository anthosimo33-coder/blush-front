import { describe, expect, it } from "vitest";
import { chiffrer, erreurImport, lire, participantsDe, principaux } from "@prompts/lib/conv";
import { depuisInstagramHtml, depuisInstagramJson } from "@prompts/lib/instagram";

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
});
