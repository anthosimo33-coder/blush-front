import { describe, expect, it } from "vitest";
import { margeApresIA } from "@/contenu/pilotage";
import { etapeDe } from "@/lib/presence";
import { lieuDe, sourceDe } from "@/server/visites";

/* Les navigateurs intégrés des applis, tels qu’ils se présentent */
const TIKTOK = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 musical_ly_36.5.0 BytedanceWebview/d8a21c6";
const INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 350.0.0.0";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

describe("d’où vient un visiteur", () => {
  it("le lien d’une créatrice d’abord (utm_source), quelle que soit sa graphie", () => {
    expect(sourceDe({ utm: "TikTok", agent: SAFARI })).toBe("tiktok");
    expect(sourceDe({ utm: " ig ", agent: SAFARI })).toBe("instagram");
    expect(sourceDe({ utm: "snap", referent: "https://www.google.com", agent: INSTAGRAM })).toBe("snapchat");
    expect(sourceDe({ utm: "newsletter", agent: SAFARI })).toBe("autre");
  });

  it("puis un verdict partagé, puis le site d’avant (pas le nôtre), puis l’appli qui l’a ouvert, sinon direct", () => {
    expect(sourceDe({ chemin: "/v/abc", referent: "https://www.tiktok.com/", agent: TIKTOK })).toBe("partage");
    expect(sourceDe({ referent: "https://www.tiktok.com/", agent: SAFARI })).toBe("tiktok");
    expect(sourceDe({ referent: "https://l.instagram.com", agent: SAFARI })).toBe("instagram");
    expect(sourceDe({ referent: "https://www.google.fr", agent: SAFARI })).toBe("google");
    expect(sourceDe({ referent: "https://exemple.org", agent: SAFARI })).toBe("autre");
    expect(sourceDe({ referent: "https://www.askblush.com", agent: TIKTOK })).toBe("tiktok");
    expect(sourceDe({ referent: "pas une adresse", agent: INSTAGRAM })).toBe("instagram");
    expect(sourceDe({ agent: SAFARI })).toBe("direct");
    expect(sourceDe({ agent: null })).toBe("direct");
  });
});

describe("le lieu d’une connexion, d’après l’hébergeur", () => {
  const avec = (entetes: Record<string, string>) => lieuDe(new Request("http://localhost/api/presence", { headers: entetes }));

  it("la ville décodée, le pays, les coordonnées arrondies", () => {
    expect(avec({ "x-vercel-ip-city": "Saint-%C3%89tienne", "x-vercel-ip-country": "FR", "x-vercel-ip-latitude": "45.43391", "x-vercel-ip-longitude": "4.3897" })).toEqual({
      ville: "Saint-Étienne",
      pays: "FR",
      lat: 45.43,
      lon: 4.39,
    });
  });

  it("rien en local, et rien d’inventé quand un en-tête est faux", () => {
    expect(avec({})).toEqual({ ville: null, pays: null, lat: null, lon: null });
    expect(avec({ "x-vercel-ip-city": "%E0%A4%A", "x-vercel-ip-country": "France", "x-vercel-ip-latitude": "nord" })).toEqual({
      ville: "%E0%A4%A",
      pays: null,
      lat: null,
      lon: null,
    });
  });
});

describe("l’écran d’un onglet, d’après son chemin", () => {
  it("chaque partie du parcours a son étape", () => {
    expect(etapeDe("/")).toBe("accueil");
    expect(etapeDe("/v/k3j2")).toBe("partage");
    expect(etapeDe("/importer/export")).toBe("import");
    expect(etapeDe("/qui")).toBe("import");
    expect(etapeDe("/lecture")).toBe("verdict");
    expect(etapeDe("/rapport/verdict")).toBe("verdict");
    expect(etapeDe("/rapport")).toBe("rapport");
    expect(etapeDe("/rapport/debloque")).toBe("paiement");
    expect(etapeDe("/paiement/retour")).toBe("paiement");
    expect(etapeDe("/app")).toBe("chat");
    expect(etapeDe("/compte")).toBe("compte");
    expect(etapeDe("/conditions")).toBe("autre");
  });

  it("les outils de l’équipe ne font pas signe", () => {
    expect(etapeDe("/admin")).toBeNull();
    expect(etapeDe("/admin/direct")).toBeNull();
    expect(etapeDe("/apercu/admin")).toBeNull();
    expect(etapeDe("/styleguide")).toBeNull();
  });
});

describe("la marge après l’IA", () => {
  it("(CA hors taxes − l’IA en euros) ÷ CA hors taxes, et rien sans vente", () => {
    /* 120 € TTC = 100 € HT ; 10 $ d’IA = 8,60 € */
    expect(margeApresIA(12_000, 10)).toBeCloseTo(91.4, 5);
    expect(margeApresIA(0, 3)).toBeNull();
    expect(margeApresIA(-500, 0)).toBeNull();
  });
});
