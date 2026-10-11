import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/apercu/demander/route";

/*
 * Le vrai chat de l’aperçu (src/app/apercu/demander/route.ts), outil de l’équipe en local : il appelle le vrai modèle
 * avec la clé du poste. Il ne répond qu’à ce poste (l’hôte demandé, et l’origine de la page), et refuse une question ou
 * un fil hors bornes avant de rien lancer. Sa configuration (BLUSH_DEMANDER) pointe ici un lanceur qui n’existe pas :
 * une demande qui passerait les contrôles le lancerait, aucun test ne va jusque-là.
 */
let dossier: string;

beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), "blush-demander-"));
  const config = join(dossier, "config.json");
  writeFileSync(config, JSON.stringify({ lanceur: join(dossier, "absent.mjs"), cas: "cas.json", memoire: "memoire.json", cle: join(dossier, "cle") }));
  vi.stubEnv("BLUSH_DEMANDER", config);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dossier, { recursive: true, force: true });
});

/** Une demande de la page de l’aperçu, servie sous `hote` (son origine la suit, sauf `origine` donnée). */
function demande(corps: unknown, { hote = "localhost:3000", origine = `http://${hote}`, entetes = {} }: { hote?: string; origine?: string; entetes?: Record<string, string> } = {}) {
  return new Request(`http://${hote}/apercu/demander`, {
    method: "POST",
    headers: { host: hote, origin: origine, "content-type": "application/json", ...entetes },
    body: typeof corps === "string" ? corps : JSON.stringify(corps),
  });
}

const statut = async (req: Request) => (await POST(req)).status;

describe("/apercu/demander : ce poste seulement", () => {
  it("sans BLUSH_DEMANDER, il n’existe pas", async () => {
    vi.stubEnv("BLUSH_DEMANDER", "");
    expect(await statut(demande({ text: "salut" }))).toBe(404);
  });

  it("joint depuis le Wi-Fi (l’adresse du poste sur le réseau) ou par un domaine qui pointe sur le poste : refusé", async () => {
    expect(await statut(demande({ text: "salut" }, { hote: "192.168.1.20:3000" }))).toBe(403);
    expect(await statut(demande({ text: "salut" }, { hote: "mon-mac.local:3000" }))).toBe(403);
    /* DNS rebinding : la page et l’hôte demandé sont du même site, qui n’est pas ce poste */
    expect(await statut(demande({ text: "salut" }, { hote: "attaquant.example:3000" }))).toBe(403);
    /* Derrière un relais qui dit un autre hôte */
    expect(await statut(demande({ text: "salut" }, { entetes: { "x-forwarded-host": "attaquant.example" } }))).toBe(403);
  });

  it("une page d’un autre site, même sur ce poste : refusé", async () => {
    expect(await statut(demande({ text: "salut" }, { origine: "https://attaquant.example" }))).toBe(403);
  });

  it("une question vide, trop longue, ou un fil trop long ou mal formé : 400, rien ne part", async () => {
    for (const hote of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) expect(await statut(demande({ text: "   " }, { hote }))).toBe(400);
    expect(await statut(demande({ text: "a".repeat(4001) }))).toBe(400);
    expect(await statut(demande({ text: "salut", history: Array.from({ length: 7 }, () => ({ from: "toi", text: "et là ?" })) }))).toBe(400);
    expect(await statut(demande({ text: "salut", history: [{ from: "elle", text: "coucou" }] }))).toBe(400);
    expect(await statut(demande({ text: "salut", history: [{ from: "blush", text: "a".repeat(4001) }] }))).toBe(400);
    expect(await statut(demande("pas du json"))).toBe(400);
  });
});
