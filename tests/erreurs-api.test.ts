import { describe, expect, it, vi } from "vitest";
import { codeDe, erreurDeParcours, messageAjoutFiche, messageErreur, problemeAjout, SOUFFLE } from "@/lib/messages-erreur";
import { ErreurTache, estRefus } from "@/server/erreurs";
import { erreur, route } from "@/server/http";
import { codePublic, ERREURS_API, ErreurApi, type CodeErreur } from "@/types/erreurs-api";

/* Les codes d’erreur de l’API, du serveur (src/types/erreurs-api.ts) jusqu’aux textes des écrans (src/lib/messages-erreur.ts) */

const api = (code: CodeErreur) => new ErreurApi(code, ERREURS_API[code]);

describe("le serveur", () => {
  it("chaque code garde le statut que ses routes répondaient (le navigateur en lit certains : un lot de vidéo se rejoue sur un 5xx)", () => {
    /* Écrit en dur : une faute de frappe dans la liste ne passe pas. pas_pret vaut 409 partout (l’audio du vocal répondait 404) */
    expect(ERREURS_API).toEqual({
      origine: 403,
      connexion: 401,
      interdit: 401,
      beta: 403,
      trop: 429,
      trop_jour: 429,
      codes: 429,
      essais: 429,
      aucune: 404,
      introuvable: 404,
      lien: 404,
      pas_pret: 409,
      occupe: 409,
      sobre: 409,
      acces: 402,
      bientot: 402,
      email: 422,
      texte: 422,
      faits: 422,
      offre: 422,
      cible: 422,
      invalide: 422,
      qui: 422,
      fichier: 422,
      groupe: 422,
      courte: 422,
      capture: 422,
      autre_conv: 422,
      rien_de_neuf: 422,
      vocal: 422,
      vocal_vide: 422,
      vocal_illisible: 422,
      vocal_bientot: 503,
      refus: 502,
      transcription: 502,
      panne: 502,
      souffle: 503,
    });
  });

  it("une erreur répond son code, avec le statut de la liste", async () => {
    for (const [code, status] of Object.entries(ERREURS_API) as [CodeErreur, number][]) {
      const r = erreur(code);
      expect(r.status).toBe(status);
      expect(await r.json()).toEqual({ erreur: code });
    }
  });

  it("une erreur d’étape ne dit au navigateur que le refus, le vocal, le budget du jour ou la panne", () => {
    expect(codePublic("refus")).toBe("refus");
    expect(codePublic("refus:cyber")).toBe("refus");
    expect(codePublic("transcription")).toBe("transcription");
    expect(codePublic("budget")).toBe("souffle");
    /* Un code déjà public le reste : la route du chat applique codePublic au code de codeDErreur */
    for (const publique of ["refus", "transcription", "souffle", "panne"] as const) expect(codePublic(publique)).toBe(publique);
    for (const interne of ["sortie_illisible", "contexte_absent", "delai"]) expect(codePublic(interne)).toBe("panne");
  });

  it("un refus du modèle se reconnaît sur l’erreur comme sur le code gardé en base", () => {
    expect(estRefus(new ErreurTache("refus:cyber"))).toBe(true);
    expect(estRefus(new ErreurTache("sortie_illisible"))).toBe(false);
    expect(estRefus("refus")).toBe(true);
    expect([estRefus("coupee"), estRefus("erreur:TypeError"), estRefus(null), estRefus(undefined)]).toEqual([false, false, false, false]);
  });
});

describe("l’enveloppe des routes", () => {
  it("une erreur que la route ne rattrape pas répond « panne », et le journal n’en garde que le nom (S-44)", async () => {
    const lignes = vi.spyOn(console, "error").mockImplementation(() => {});
    const sql = Object.assign(new Error("Failed query: select * from users where email = $1\nparams: ines@exemple.test"), { name: "DrizzleQueryError" });
    const r = await route("POST /api/auth/verifier", async (req: Request) => {
      throw Object.assign(sql, { route: new URL(req.url).pathname });
    })(new Request("http://localhost/api/auth/verifier"));
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ erreur: "panne" });
    expect(lignes.mock.calls.flat().join("\n")).toContain("DrizzleQueryError");
    /* La ligne nomme la route par sa clé du contrat : on sait laquelle a lâché */
    expect(lignes.mock.calls.flat().join("\n")).toContain('"route":"POST /api/auth/verifier"');
    expect(lignes.mock.calls.flat().join("\n")).not.toContain("exemple.test");
  });

  it("une erreur attendue garde son code ; une réponse passe telle quelle", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const budget = await route("POST /api/chat", async () => {
      throw new ErreurTache("budget");
    })();
    expect([budget.status, await budget.json()]).toEqual([503, { erreur: "souffle" }]);
    const ok = await route("GET /api/compte", async () => Response.json({ ok: true }))();
    expect(await ok.json()).toEqual({ ok: true });
  });
});

describe("les écrans", () => {
  it("chaque action dit le texte de son code, sinon son texte par défaut (le réseau, un bug)", () => {
    expect(messageErreur("code", api("trop"))).toBe("Trop de codes demandés. Réessaie dans une heure.");
    expect(messageErreur("code", api("codes"))).toBe("Trop de codes demandés aujourd’hui. Réessaie demain.");
    expect(messageErreur("verification", api("essais"))).toBe("Trop d’essais pour aujourd’hui avec cet email. Réessaie demain.");
    expect(messageErreur("code", api("essais"))).toBe(messageErreur("verification", api("essais")));
    expect(messageErreur("code", new TypeError("Failed to fetch"))).toBe("Le code n’est pas parti. Réessaie dans un instant.");
    expect(messageErreur("verification", api("beta"))).toBe("Cet email n’est pas encore dans la bêta.");
    expect(messageErreur("relance", api("pas_pret"))).toBe("Ça n’a pas pu repartir. Vérifie ta connexion et réessaie.");
    expect(messageErreur("fiche", api("trop"))).toBe("Tu as beaucoup modifié sa fiche aujourd’hui\u00a0: ta dernière modification n’a pas été enregistrée. Réessaie demain.");
  });

  it("le chat répond en bulles, la question en une phrase ; un refus n’est pas un bug", () => {
    expect(messageErreur("chat", api("refus"))).toEqual(["là-dessus je peux pas t’aider", "reformule, ou envoie-moi autre chose"]);
    expect(messageErreur("chat", api("panne"))).toBe("j’ai eu un bug, renvoie-moi ça");
    expect(messageErreur("chat", new ErreurApi("erreur", 500))).toBe("j’ai eu un bug, renvoie-moi ça");
    expect(messageErreur("question", api("refus"))).toBe("là-dessus je peux pas t’aider, reformule ta question");
    expect(messageErreur("question", api("acces"))).toBe("le chat avec moi, c’est dans BLUSH+");
    expect(messageErreur("question", api("panne"))).toBe("j’ai eu un bug, renvoie-moi ta question");
  });

  it("un vocal illisible dit le texte de la transcription en panne (qu’il écrive), pas celui d’un vocal vide (qu’il renvoie)", () => {
    expect(messageErreur("chat", api("vocal_illisible"))).toBe("j’arrive pas à écouter ton vocal là, écris-moi");
    expect(messageErreur("chat", api("vocal_illisible"))).toBe(messageErreur("chat", api("transcription")));
    expect(messageErreur("chat", api("vocal_vide"))).toBe("j’ai rien entendu dans ton vocal, tu me le renvoies\u00a0?");
  });

  it("le budget de l’IA du jour atteint : « BLUSH souffle un peu, réessaie demain », dit par BLUSH au chat", () => {
    expect(SOUFFLE).toBe("BLUSH souffle un peu, réessaie demain.");
    expect(messageErreur("chat", api("souffle"))).toBe("je souffle un peu, réessaie demain");
    expect(messageErreur("question", api("souffle"))).toBe("je souffle un peu, réessaie demain");
    expect(problemeAjout(api("souffle"))).toBe("souffle");
    expect(messageAjoutFiche("souffle", "ta capture", "Inès")).toEqual({ title: "BLUSH souffle un peu", detail: "Réessaie demain." });
  });

  it("l’import de captures arrêté par le budget du jour le dit, sans prendre les captures pour illisibles", () => {
    expect(messageErreur("captures", api("souffle"))).toBe("BLUSH souffle un peu, réessaie demain. Tes captures restent là.");
    expect(erreurDeParcours("captures", api("souffle"))).toBeNull();
    expect(messageErreur("captures", api("trop"))).toBe("BLUSH a lu beaucoup de captures d’un coup\u00a0: réessaie un peu plus tard. Tes captures restent là.");
    expect(messageErreur("captures", new TypeError("Failed to fetch"))).toBe("Ta conv n’a pas pu partir. Vérifie ta connexion et réessaie.");
  });

  it("le fichier ou la conv elle-même ouvrent l’écran d’erreur de l’import ; le reste se dit sur l’écran", () => {
    expect(erreurDeParcours("export", api("groupe"))).toBe("groupe");
    expect(erreurDeParcours("export", api("trop"))).toBeNull();
    /* Le budget d’octets du jour (S-02) ne promet pas « dans une heure » : il dure jusqu’au lendemain */
    expect(erreurDeParcours("export", api("trop_jour"))).toBeNull();
    expect(messageErreur("export", api("trop_jour"))).toBe("Beaucoup de convs importées aujourd’hui. Réessaie demain.");
    expect(erreurDeParcours("captures", new ErreurApi("longue", 422))).toBe("longue");
    /* Des captures : un « fichier » n’a pas d’écran à lui, l’écran des captures dit qu’elles sont illisibles */
    expect(erreurDeParcours("captures", api("fichier"))).toBeNull();
    expect(erreurDeParcours("captures", new Error("réseau"))).toBeNull();
  });

  it("un ajout à la fiche : ce que l’écran sait dire, rien si rien n’était neuf, un bug pour le reste", () => {
    expect(problemeAjout(api("rien_de_neuf"))).toBeUndefined();
    expect(problemeAjout(api("autre_conv"))).toBe("autre_conv");
    expect(problemeAjout(api("panne"))).toBe("bug");
    expect(problemeAjout(new Error("réseau"))).toBe("bug");
    expect(messageAjoutFiche("autre_conv", "votre conv", "Inès")).toEqual({ title: "Ce n’est pas votre conv", detail: "Envoie l’export de ta conv avec Inès." });
    expect(messageAjoutFiche("capture", "ta capture", "Inès").detail).toBe("Renvoie-la en entier, sans la rogner.");
  });

  it("un refus de l’IA (malgré son repli) se dit, jamais comme un bug ni comme le réseau : à la fiche et à l’import de captures", () => {
    expect(problemeAjout(api("refus"))).toBe("refus");
    expect(messageAjoutFiche("refus", "tes 3 captures", "Inès")).toEqual({ title: "BLUSH ne peut pas lire tes 3 captures", detail: "Essaie avec d’autres captures." });
    expect(messageErreur("captures", api("refus"))).toBe("BLUSH ne peut pas lire ces captures. Essaie avec d’autres.");
    expect(erreurDeParcours("captures", api("refus"))).toBeNull();
  });

  it("seule une ErreurApi a un code", () => {
    expect(codeDe(api("trop"))).toBe("trop");
    expect([codeDe(new Error("trop")), codeDe("trop"), codeDe(null)]).toEqual([null, null, null]);
  });
});
