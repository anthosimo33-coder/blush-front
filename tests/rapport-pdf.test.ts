import { beforeAll, describe, expect, it, vi } from "vitest";

/*
 * Le rapport en PDF (GET /api/rapport/pdf), appelé comme par le navigateur : son propriétaire seulement, avec l’accès
 * de la lecture du rapport (rapportDe). Le rapport débloqué donne tous ses chapitres ; re-verrouillé (un achat repris),
 * plus rien de ses chapitres payants, même écrits, seulement leurs titres ; un autre compte, ou personne, n’a rien.
 * Le modèle factice écrit le rapport (src/server/ia/factice.ts) ; les cookies de la requête sont simulés.
 */
const cookies = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (cookies.has(n) ? { name: n, value: cookies.get(n)! } : undefined),
    has: (n: string) => cookies.has(n),
    set: (n: string, v: string) => cookies.set(n, v),
    delete: (n: string | { name: string }) => cookies.delete(typeof n === "string" ? n : n.name),
  }),
  headers: async () => new Headers(),
}));

import { GET as rapportEnPdf } from "@/app/api/rapport/pdf/route";
import { ouvrirSession } from "@/server/auth";
import { FACTICE } from "@/server/ia/factice-valeurs";
import { STORY_COOKIE } from "@/services/session";
import { compteDeTest, debloquerLaConv, histoireLue } from "./aide/fixtures";
import { texteDeConv } from "./aide/fichiers";
import { lirePdf } from "./aide/pdf";

const SESSION = "blush-session";
const telecharger = () => rapportEnPdf(new Request("http://localhost/api/rapport/pdf"));
/** Le texte du PDF, ses blancs ramenés à une espace (une ligne coupée se recolle). */
const texteDe = async (r: Response) => lirePdf(new Uint8Array(await r.arrayBuffer())).texte.replace(/\s+/g, " ");

/** Les messages de la conv d’essai, d’au moins vingt caractères (un « oui » se trouverait partout). */
const messages = texteDeConv("01-a-deux-doigts.txt")
  .split("\n")
  .map((l) => /^\[[^\]]+\] [^:]+: (.*)$/.exec(l)?.[1]?.trim() ?? "")
  .filter((m) => m.length >= 20);

describe("le rapport en PDF", () => {
  let conv: string;
  let session: string;

  beforeAll(async () => {
    const u = await compteDeTest("rapport-pdf", "debloque");
    conv = (await histoireLue(u, "01-a-deux-doigts.txt", { qui: { moi: "Hugo" } })).id;
    session = (await ouvrirSession(u.id)).secret;
  });

  it("débloqué : un PDF de plusieurs pages A4, tous ses chapitres, jamais gardé", async () => {
    cookies.set(SESSION, session);
    cookies.set(STORY_COOKIE, conv);
    const r = await telecharger();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="rapport-blush.pdf"');
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    const pdf = lirePdf(new Uint8Array(await r.clone().arrayBuffer()));
    expect(pdf.pages.length).toBeGreaterThan(2);
    expect(pdf.pages.every((p) => Math.round(p.largeur) === 595 && Math.round(p.hauteur) === 842)).toBe(true);
    const texte = await texteDe(r);
    /* La page de garde (les deux prénoms, ton document à toi), puis les huit chapitres écrits */
    expect(texte).toContain("Hugo & Sophie");
    expect(texte).toContain("Le rapport de votre histoire");
    for (const titre of Object.values(FACTICE.titres("Sophie"))) expect(texte).toContain(titre);
    expect(texte.split("Le soir où tout a basculé.").length - 1).toBe(FACTICE.chapitres);
  });

  it("re-verrouillé (un achat repris) : le verdict et le chapitre 1, les titres des autres, rien de leur contenu", async () => {
    cookies.set(SESSION, session);
    cookies.set(STORY_COOKIE, conv);
    await debloquerLaConv(conv, false);
    try {
      const r = await telecharger();
      expect(r.status).toBe(200);
      const texte = await texteDe(r);
      expect(texte).toContain("Vous êtes à deux doigts.");
      expect(texte).toContain("La suite t’attend sur askblush.com");
      for (const titre of Object.values(FACTICE.titres("Sophie"))) expect(texte).toContain(titre);
      /* Les chapitres sont écrits en base, mais fermés à ce compte : ni leur récit, ni leurs messages cités */
      expect(texte).not.toContain("Le soir où tout a basculé.");
      expect(texte).not.toContain("Assieds-toi.");
      expect(messages.length).toBeGreaterThan(50);
      expect(messages.filter((m) => texte.includes(m))).toEqual([]);
    } finally {
      await debloquerLaConv(conv);
    }
  });

  it("sans session : 401 ; un autre compte, même avec le cookie de cette conv : rien (404)", async () => {
    cookies.clear();
    const sans = await telecharger();
    expect(sans.status).toBe(401);
    expect(await sans.json()).toEqual({ erreur: "connexion" });

    const autre = await compteDeTest("rapport-pdf-autre");
    cookies.set(SESSION, (await ouvrirSession(autre.id)).secret);
    cookies.set(STORY_COOKIE, conv);
    const r = await telecharger();
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).not.toBe("application/pdf");
  });
});
