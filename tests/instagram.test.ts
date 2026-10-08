import { describe, expect, it } from "vitest";
import { detecterFormat, erreurImport, lire, participantsDe } from "@prompts/lib/conv";
import { choisirParties, lireExport } from "@prompts/lib/export";
import { depuisInstagramHtml, depuisInstagramJson } from "@prompts/lib/instagram";

/* Un export Instagram JSON tel qu’Instagram l’écrit : l’UTF-8 octet par octet (« Ã© »), du plus récent au plus ancien */
const latin1 = (s: string) => String.fromCharCode(...new TextEncoder().encode(s));
const json = JSON.stringify({
  participants: [{ name: latin1("Léa") }, { name: "Malik" }],
  messages: [
    { sender_name: "Malik", timestamp_ms: Date.UTC(2026, 8, 12, 19, 0), content: latin1("à demain alors 😊") },
    { sender_name: latin1("Léa"), timestamp_ms: Date.UTC(2026, 8, 12, 18, 59), content: latin1("Léa a aimé un message") },
    { sender_name: latin1("Léa"), timestamp_ms: Date.UTC(2026, 8, 12, 18, 58), audio_files: [{ uri: "audio/1.mp4" }] },
    { sender_name: "Malik", timestamp_ms: Date.UTC(2026, 8, 12, 18, 30), content: latin1("t’es dispo jeudi ?") },
  ],
});

const html = `<html><body><header><time datetime="2026-09-20T05:40Z">Le Samedi 19 septembre 2026 à 22:40 (UTC)</time></header><main>
<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">Malik</h2><div class="_3-95 _a6-p"><div><div></div><div>ah mince</div><div></div><div></div></div></div><div class="_3-94 _a6-o">sep 18, 2026 8:30 am</div></div>
<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">lea :)</h2><div class="_3-95 _a6-p"><div><div></div><div></div><div></div><div></div><div><div><audio src="x/audio/1.ogg" controls="1"><a href="x/audio/1.ogg">x/audio/1.ogg</a></audio></div></div><div><ul class="_a6-q"><li><span>❤Malik</span></li></ul></div></div></div><div class="_3-94 _a6-o">sep 18, 2026 8:29 am</div></div>
</main></body></html>`;

describe("export Instagram", () => {
  it("relit le JSON : accents réparés, messages système retirés, ordre et heure de Paris", () => {
    const r = depuisInstagramJson(json);
    expect(r.participants).toEqual(["Malik", "Léa"]);
    expect(r.texte.split("\n")).toEqual(["[12/09/2026 20:30:00] Malik: t’es dispo jeudi ?", "[12/09/2026 20:58:00] Léa: audio omitted", "[12/09/2026 21:00:00] Malik: à demain alors 😊"]);
  });

  it("relit le HTML : heures ramenées à Paris d’après l’en-tête, vocal reconnu, réactions et deux-points retirés", () => {
    const r = depuisInstagramHtml(html);
    expect(r.texte.split("\n")).toEqual(["[18/09/2026 17:29:00] lea ): audio omitted", "[18/09/2026 17:30:00] Malik: ah mince"]);
    const f = detecterFormat(r.texte)!;
    expect(f).toBe("whatsapp-ios");
    const p = participantsDe(r.texte);
    const lu = lire(r.texte, { utilisateur: { prenom: "Malik", pronom: "il", nomExport: "Malik" }, autre: { prenom: "Léa", pronom: "elle", nomExport: "lea )" }, format: f });
    expect(p).toHaveLength(2);
    expect(lu.messages.map((m) => m.media ?? m.texte)).toEqual(["vocal", "ah mince"]);
    expect(erreurImport(lu)).toBe("courte");
  });

  it("choisit les bons fichiers d’un export", () => {
    expect(choisirParties([{ nom: "a/inbox/x/message_2.json", contenu: "" }, { nom: "a/inbox/x/message_1.json", contenu: "" }])).toEqual([
      { nom: "a/inbox/x/message_1.json", contenu: "" },
      { nom: "a/inbox/x/message_2.json", contenu: "" },
    ]);
    expect(choisirParties([{ nom: "a/inbox/x/message_1.json", contenu: "" }, { nom: "a/inbox/y/message_1.json", contenu: "" }])).toBe("plusieurs");
    expect(choisirParties([{ nom: "WhatsApp Chat/_chat.txt", contenu: "x" }, { nom: "autre.txt", contenu: "y" }])).toEqual([{ nom: "WhatsApp Chat/_chat.txt", contenu: "x" }]);
    expect(lireExport([{ nom: "message_1.json", contenu: json }])?.appli).toBe("instagram");
  });
});

describe("un export Instagram complet", () => {
  const conv = (titre: string, noms: string[], n: number, debut: number) =>
    JSON.stringify({
      title: titre,
      participants: noms.map((name) => ({ name })),
      messages: Array.from({ length: n }, (_, k) => ({ sender_name: noms[k % noms.length], timestamp_ms: debut + (n - k) * 60_000, content: `message ${k}` })),
    });
  const fichiers = [
    { nom: "your_instagram_activity/messages/inbox/ines_1/message_1.json", contenu: conv("Inès", ["Inès", "Léo"], 120, Date.UTC(2026, 8, 20)) },
    { nom: "your_instagram_activity/messages/inbox/maxime_2/message_1.json", contenu: conv("maxime.drn", ["maxime.drn", "Léo"], 30, Date.UTC(2026, 7, 1)) },
    { nom: "your_instagram_activity/messages/inbox/groupe_3/message_1.json", contenu: conv("Les zinzins", ["A", "B", "Léo"], 60, Date.UTC(2026, 9, 1)) },
  ];

  it("se range par conv, chacune avec son nom, son nombre de messages, sa dernière date, et les groupes repérés", async () => {
    const { choisirParties, convsInstagram, resumeConvInstagram } = await import("@prompts/lib/export");
    expect(choisirParties(fichiers)).toBe("plusieurs");
    const convs = convsInstagram(fichiers);
    expect(convs).toHaveLength(3);
    const resumes = convs.map((c) => resumeConvInstagram(c.parties)!);
    expect(resumes.map((r) => [r.nom, r.messages, r.groupe])).toEqual([
      ["Inès", 120, false],
      ["maxime.drn", 30, false],
      ["Les zinzins", 60, true],
    ]);
    expect(resumes[0].derniere).toMatch(/^2026-09-2\d$/);
  });
});
