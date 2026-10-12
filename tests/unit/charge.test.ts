import { describe, expect, it } from "vitest";
import { centile, convInventee, lireOptions, nouveauBocal, rapportMarkdown, resume, routeDe, type Mesures, type Options } from "../../scripts/charge.mjs";
import { depuisFichier } from "@/server/import";

/*
 * Le test de charge (scripts/charge.mjs, `npm run charge`) : ce qui se vérifie sans serveur. Ses options, ses centiles,
 * son bocal à cookies, la conv inventée (lue par le vrai lecteur des exports) et la forme de son rapport. Le parcours
 * lui-même tourne contre le build de production (README, « Le test de charge »).
 */

describe("les options du test de charge", () => {
  it("prennent leurs valeurs par défaut, puis celles de la ligne de commande", () => {
    expect(lireOptions([])).toMatchObject({ parcours: 5, montee: 0, duree: 0, messages: 3, garder: false });
    expect(lireOptions(["--parcours", "20", "--montee", "10", "--duree", "300", "--garder", "--sortie", "r.md"])).toMatchObject({
      parcours: 20,
      montee: 10,
      duree: 300,
      garder: true,
      sortie: "r.md",
    });
    expect(lireOptions(["--aide"])).toEqual({ aide: true });
  });

  it("refusent une option inconnue, un nombre qui n’en est pas un, ou hors de ses bornes", () => {
    expect(() => lireOptions(["--vitesse", "3"])).toThrow(/option inconnue/);
    expect(() => lireOptions(["--parcours", "beaucoup"])).toThrow(/--parcours attend un nombre/);
    expect(() => lireOptions(["--parcours"])).toThrow(/--parcours attend un nombre/);
    expect(() => lireOptions(["--parcours", "0"])).toThrow(/entre 1 et 2000/);
    /* Le rapport donne 10 bulles : au-delà, le chat demanderait une recharge */
    expect(() => lireOptions(["--messages", "11"])).toThrow(/entre 0 et 10/);
  });
});

describe("les mesures", () => {
  it("centile : au rang le plus proche, sans dépendre de l’ordre", () => {
    const valeurs = [50, 10, 40, 20, 30, 100, 90, 80, 70, 60];
    expect(centile(valeurs, 50)).toBe(50);
    expect(centile(valeurs, 95)).toBe(100);
    expect(centile(valeurs, 0)).toBe(10);
    expect(centile([7], 95)).toBe(7);
    expect(centile([], 50)).toBeNull();
  });

  it("resume : combien, p50, p95, max", () => {
    expect(resume(Array.from({ length: 100 }, (_, k) => k + 1))).toEqual({ n: 100, p50: 50, p95: 95, max: 100 });
    expect(resume([])).toBeNull();
  });

  it("routeDe : un achat devient le segment dynamique de sa route, la requête est ôtée", () => {
    expect(routeDe("GET", "/api/paiement/0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d")).toBe("GET /api/paiement/[achat]");
    expect(routeDe("POST", "/api/paiement/factice")).toBe("POST /api/paiement/factice");
    expect(routeDe("GET", "/api/rapport?x=1")).toBe("GET /api/rapport");
  });
});

describe("le bocal à cookies", () => {
  const reponse = (...cookies: string[]) => {
    const h = new Headers();
    for (const c of cookies) h.append("set-cookie", c);
    return h;
  };

  it("renvoie ce que le serveur pose, et oublie ce qu’il efface", () => {
    const bocal = nouveauBocal();
    bocal.recevoir(reponse("session=abc; Path=/; HttpOnly; SameSite=Lax", "brouillon=xyz; Path=/; Max-Age=86400"));
    expect(bocal.entete()).toBe("session=abc; brouillon=xyz");
    bocal.recevoir(reponse("brouillon=; Path=/; Max-Age=0"));
    bocal.recevoir(reponse("session=def; Path=/", "vieux=1; Expires=Thu, 01 Jan 1970 00:00:00 GMT"));
    expect(bocal.entete()).toBe("session=def");
    expect(bocal.taille()).toBe(1);
  });
});

describe("la conv inventée", () => {
  it("est un export WhatsApp que le vrai lecteur accepte, propre à chaque parcours", async () => {
    const lu = await depuisFichier(new File([convInventee(3)], "_chat.txt"));
    expect(lu.appli).toBe("whatsapp");
    expect(convInventee(3)).not.toBe(convInventee(4));
    expect(convInventee(3).split("\n")).toHaveLength(61);
  });
});

describe("le rapport", () => {
  const options = lireOptions(["--parcours", "2"]) as Options;
  const mesures = (m: Partial<Mesures> = {}): Mesures => ({
    options,
    debut: Date.UTC(2026, 9, 12, 8, 0),
    fin: Date.UTC(2026, 9, 12, 8, 0, 10),
    interrompu: false,
    machine: { systeme: "darwin", coeurs: 8, node: "24.0.0", chargeAvant: "1.0", chargeApres: "2.0" },
    build: "b",
    commit: "c",
    base: "blush_e2e_charge",
    pool: 5,
    postgres: { version: "16", maxConnexions: "100" },
    parcours: [
      { ok: true, anomalie: false },
      { ok: false, anomalie: false },
    ],
    requetes: [
      { route: "POST /api/import", ms: 40, statut: 200, erreur: null },
      { route: "POST /api/import", ms: 60, statut: 429, erreur: "429 trop" },
    ],
    etapes: new Map([["import", [40, 60]]]),
    erreurs: new Map([["import\u0000429 trop", 1]]),
    base_releves: [
      { t: 0, total: 5, actifs: 5, idleTx: 0, verrous: 0, plusLongue: 120 },
      { t: 1, total: 5, actifs: 1, idleTx: 1, verrous: 1, plusLongue: 3 },
    ],
    lentes: new Map([["select | from stories", { vues: 1, max: 120 }]]),
    stats: { xact_commit: 100, xact_rollback: 0, tup_inserted: 10, tup_updated: 5, tup_deleted: 0, blks_read: 0, blks_hit: 50, deadlocks: 0, temp_files: 0 },
    serveur_releves: [{ t: 0, rssMo: 200, cpu: 50 }],
    journal: new Map([["route /api en panne\u0000erreur", 2]]),
    ...m,
  });

  it("dit le résultat, les étapes, les routes, les erreurs, la base, le serveur et ses limites", () => {
    const md = rapportMarkdown(mesures());
    expect(md).toContain("| 2 | 1 | 1 | 10.0 s | 6.0 parcours/min | 2 | 0.2 |");
    expect(md).toContain("| import | 2 | 40 | 60 | 60 |");
    expect(md).toContain("| `POST /api/import` | 2 | 40 | 60 | 60 | 1 |");
    expect(md).toContain("| import | 429 trop | 1 |");
    expect(md).toContain("50 % des relevés");
    /* Une barre verticale dans une requête ne casse pas le tableau */
    expect(md).toContain("`select \\| from stories`");
    expect(md).toContain("| route /api en panne | erreur | 2 |");
    expect(md).toContain("Ce que ce test ne mesure pas");
    expect(md).not.toContain("Interrompu");
  });

  it("dit qu’il a été interrompu, et tient sans aucun relevé", () => {
    const md = rapportMarkdown(mesures({ interrompu: true, base_releves: [], serveur_releves: [], erreurs: new Map(), lentes: new Map(), stats: null }));
    expect(md).toContain("**Interrompu**");
    expect(md).toMatch(/## Les erreurs\n\nAucune\./);
    expect(md).toMatch(/## La base\n\nAucun relevé\./);
  });
});
