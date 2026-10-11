import { strToU8, zipSync } from "fflate";
import { eq, like } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Requete } from "@prompts/lib/contextes";
import { versTexteCaptures } from "@prompts/lib/captures";
import { lire } from "@prompts/lib/conv";
import { choisirParties } from "@prompts/lib/export";
import { depuisInstagramJson } from "@prompts/lib/instagram";
import { rendreMemoire } from "@prompts/lib/memoire";
import { dechiffrer } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { initialeDe } from "@/server/histoires";
import { fournisseurFactice } from "@/server/ia/factice";
import { LIMITES, sousLaLimite } from "@/server/limites";
import { masquerPrenoms } from "@/server/partages";
import type { DonneesRapport } from "@/server/stockage/types";
import { analyserExport } from "@/services/preparer-export";
import { lotsDe } from "@/services/preparer-video";
import { captures, memoire, msg } from "./aide/fabriques";
import { lirePaquet } from "./aide/fichiers";
import { avecFactice, compteDeTest, histoireLue } from "./aide/fixtures";

describe("petits cas de lecture", () => {
  it("le .txt de la conv dans un zip refait sur Mac ou Android, pas un fichier caché ni un document partagé", () => {
    const conv = "[12/09/2026 10:00:00] Léa: salut\n[12/09/2026 10:01:00] Tom: hey\n";
    const parties = choisirParties([
      { nom: "__MACOSX/._WhatsApp Chat.txt", contenu: "\u0000\u0005" },
      { nom: "liste-de-courses.txt", contenu: "pain\nlait" },
      { nom: "WhatsApp Chat avec Léa.txt", contenu: conv },
    ]);
    expect(parties && parties !== "plusieurs" && parties[0].nom).toBe("WhatsApp Chat avec Léa.txt");
  });

  it("un JSON d’Instagram déjà en bon UTF-8 n’est pas « réparé » (et abîmé)", () => {
    const json = JSON.stringify({ messages: [{ sender_name: "Léa", timestamp_ms: Date.UTC(2026, 8, 12, 19), content: "c’est mort 👍" }] });
    expect(depuisInstagramJson(json).texte).toContain("Léa: c’est mort 👍");
  });

  it("des heures AM/PM sans jour au-delà de 12 : le mois d’abord (un téléphone américain)", () => {
    const texte = ["[9/1/26, 9:05:00 AM] Léa: hi", "[9/1/26, 9:06:00 AM] Tom: hey", "[9/2/26, 10:00:00 PM] Léa: ok"].join("\n");
    const lu = lire(texte, { utilisateur: { prenom: "Tom", pronom: "il", nomExport: "Tom" }, autre: { prenom: "Léa", pronom: "elle", nomExport: "Léa" }, format: "whatsapp-ios" });
    expect(new Date(lu.messages[0].t).toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("le repère d’une capture : l’heure complétée (« 9:05 »), un repère illisible ignoré", () => {
    const c = captures({
      blocs: [
        { repere: { date: "2026-09-12", heure: "9:05" }, messages: [msg("autre", "coucou")] },
        { repere: { date: "hier", heure: null }, messages: [msg("moi", "salut")] },
      ],
    });
    const t = versTexteCaptures(c, { aujourdhui: "2026-09-14" });
    expect(t.texte).toContain("== 2026-09-12 09:05 ==");
    expect(t.texte).not.toContain("hier");
  });

  it("la mémoire garde ses messages dans l’ordre de la conv, au-delà de 9 999", () => {
    const e = memoire({ memoire: { moments: [{ quand: "a", quoi: "b", preuves: ["m10000", "m9999"] }] } });
    const rendu = rendreMemoire(e, new Map([["m9999", "m9999 …"], ["m10000", "m10000 …"]]));
    expect(rendu.indexOf("m9999 …")).toBeLessThan(rendu.indexOf("m10000 …"));
  });

  it("l’initiale d’un nom fait d’emojis n’est pas coupée en deux", () => {
    expect(initialeDe("🦋 Inaya")).toBe("🦋");
    expect(initialeDe("léa")).toBe("L");
  });

  it("le « Moi » des captures n’est pas masqué comme un prénom", () => {
    expect(masquerPrenoms("dis-moi si Léa répond", ["Léa"])).toBe("dis-moi si L. répond");
  });
});

describe("l’enregistrement d’écran", () => {
  it("coupe un lot trop lourd (en gardant l’image de recouvrement), et ne boucle pas sur une image énorme", () => {
    const lourdes = Array.from({ length: 12 }, () => 1);
    expect(lotsDe(lourdes, 12, (x) => x, 5).map((l) => l.length)).toEqual([5, 5, 4]);
    expect(lotsDe([10, 10, 10], 12, (x) => x, 5)).toHaveLength(3);
  });
});

describe("un export Instagram complet", () => {
  it("propose ses convs, puis ne fait partir que celle choisie, relue dans le zip", async () => {
    const conv = (nom: string, n: number) => JSON.stringify({ messages: Array.from({ length: n }, (_, k) => ({ sender_name: k % 2 ? "Moi" : nom, timestamp_ms: 1_790_000_000_000 - k * 60e3, content: `${nom} ${k}` })) });
    const zip = zipSync({
      "your_instagram_activity/messages/inbox/lea_1/message_1.json": strToU8(conv("Léa", 30)),
      "your_instagram_activity/messages/inbox/ines_2/message_1.json": strToU8(conv("Inès", 12)),
    });
    const pret = await analyserExport(new File([zip as BlobPart], "instagram.zip"));
    if (pret.type !== "plusieurs") throw new Error("plusieurs convs attendues");
    expect(pret.convs).toHaveLength(2);
    const ines = pret.convs.find((c) => c.messages === 12)!;
    const paquet = await lirePaquet(await pret.paquetDe(ines.id));
    expect(paquet.parties.map((p) => p.nom)).toEqual(["your_instagram_activity/messages/inbox/ines_2/message_1.json"]);
    expect(paquet.parties[0].contenu).toContain("Inès 0");
  });
});

describe("le serveur", () => {
  /** Le modèle factice qui double un chapitre du rapport, et en sort un de sa moitié. */
  const debordant = (req: Requete) => {
    const s = fournisseurFactice(req) as { chapitres?: { numero: number }[] | null };
    if (req.tache === "05-rapport" && s.chapitres?.length) return { ...s, chapitres: [...s.chapitres, s.chapitres[0], { ...s.chapitres[0], numero: s.chapitres[0].numero + 20 }] };
    return s;
  };

  it("garde chaque chapitre une fois, dans sa moitié, même si le modèle en double un", async () => {
    const u = await compteDeTest("mineurs", "blushplus");
    const imp = await avecFactice(debordant, () => histoireLue(u, "02-reciproque.txt"));
    const [r] = await db().select().from(schema.reports).where(eq(schema.reports.storyId, imp.id));
    expect(dechiffrer<DonneesRapport>(r.data!).chapitres.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("ne garde pas l’adresse IP en clair dans les limites", async () => {
    await sousLaLimite("import:203.0.113.7", LIMITES.importParIp);
    expect(await db().select().from(schema.rateLimits).where(like(schema.rateLimits.key, "%203.0.113.7%"))).toHaveLength(0);
  });
});
