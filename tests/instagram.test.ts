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

const html = `<html><body><header><time datetime="2026-10-07T06:15Z">Le Mardi 6 octobre 2026 à 23:15 (UTC)</time></header><main>
<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">Dozo</h2><div class="_3-95 _a6-p"><div><div></div><div>ah merde</div><div></div><div></div></div></div><div class="_3-94 _a6-o">sep 11, 2026 9:52 am</div></div>
<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">charlyse :)</h2><div class="_3-95 _a6-p"><div><div></div><div></div><div></div><div></div><div><div><audio src="x/audio/1.ogg" controls="1"><a href="x/audio/1.ogg">x/audio/1.ogg</a></audio></div></div><div><ul class="_a6-q"><li><span>❤Dozo</span></li></ul></div></div></div><div class="_3-94 _a6-o">sep 11, 2026 9:51 am</div></div>
</main></body></html>`;

describe("export Instagram", () => {
  it("relit le JSON : accents réparés, messages système retirés, ordre et heure de Paris", () => {
    const r = depuisInstagramJson(json);
    expect(r.participants).toEqual(["Malik", "Léa"]);
    expect(r.texte.split("\n")).toEqual(["[12/09/2026 20:30:00] Malik: t’es dispo jeudi ?", "[12/09/2026 20:58:00] Léa: audio omitted", "[12/09/2026 21:00:00] Malik: à demain alors 😊"]);
  });

  it("relit le HTML : heures ramenées à Paris d’après l’en-tête, vocal reconnu, réactions et deux-points retirés", () => {
    const r = depuisInstagramHtml(html);
    expect(r.texte.split("\n")).toEqual(["[11/09/2026 18:51:00] charlyse ): audio omitted", "[11/09/2026 18:52:00] Dozo: ah merde"]);
    const f = detecterFormat(r.texte)!;
    expect(f).toBe("whatsapp-ios");
    const p = participantsDe(r.texte, f as "whatsapp-ios");
    const lu = lire(r.texte, { utilisateur: { prenom: "Dozo", pronom: "il", nomExport: "Dozo" }, autre: { prenom: "Charlyse", pronom: "elle", nomExport: "charlyse )" }, format: f });
    expect(p).toHaveLength(2);
    expect(lu.messages.map((m) => m.media ?? m.texte)).toEqual(["vocal", "ah merde"]);
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
