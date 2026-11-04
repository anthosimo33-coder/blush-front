import { describe, expect, it } from "vitest";
import { evenementMetaDe, fbcDe, fbclidDe, fbpDe, traceValide } from "@/lib/pubs";
import { emailHache, evenementMeta, pageSure, traceDe } from "@/server/pubs-meta";
import { URL_SITE } from "@/server/env";

/* Une requête du navigateur, avec ses cookies et son navigateur */
const requete = (cookies: string, agent = "Mozilla/5.0 (iPhone)") => new Request("https://www.askblush.com/api/jalon", { headers: { cookie: cookies, "user-agent": agent } });
const FBP = "fb.1.1730000000000.1234567890";
const FBC = "fb.1.1730000000000.IwAR2abcdefghij";

describe("les pubs de Meta : ce que le navigateur et le serveur partagent", () => {
  it("seuls quatre jalons partent chez Meta, sous leur événement standard", () => {
    expect(evenementMetaDe("importee")).toBe("Lead");
    expect(evenementMetaDe("code")).toBe("CompleteRegistration");
    expect(evenementMetaDe("paywall")).toBe("ViewContent");
    expect(evenementMetaDe("payer")).toBe("InitiateCheckout");
    /* Premium choisi touche aussi « payer » : une seule fois InitiateCheckout */
    expect(evenementMetaDe("payer_premium")).toBeNull();
    expect(evenementMetaDe("fichier")).toBeNull();
    expect(evenementMetaDe("paye")).toBeNull();
  });

  it("le fbclid d’une adresse d’arrivée, s’il a la forme de Meta ; _fbc et _fbp au format de Meta", () => {
    expect(fbclidDe("https://www.askblush.com/?fbclid=IwAR2abcdefghij&utm_source=facebook")).toBe("IwAR2abcdefghij");
    expect(fbclidDe("https://www.askblush.com/?fbclid=court")).toBeNull();
    expect(fbclidDe("https://www.askblush.com/?fbclid=<script>alert(1)</script>")).toBeNull();
    expect(fbclidDe("pas une adresse")).toBeNull();
    expect(fbcDe("IwAR2abcdefghij", 1730000000000)).toBe(FBC);
    expect(fbpDe(1730000000000, 1234567890)).toBe(FBP);
    expect(traceValide(FBC)).toBe(true);
    expect(traceValide(FBP)).toBe(true);
    expect(traceValide("fb.1.123.x; autre=1")).toBe(false);
    expect(traceValide(undefined)).toBe(false);
  });
});

describe("ce qu’une requête peut dire à Meta (traceDe)", () => {
  it("rien sans l’accord : refusé, ou pas encore choisi ; ni en mode tournage, même avec l’accord", () => {
    expect(traceDe(requete(`_fbp=${FBP}`))).toBeNull();
    expect(traceDe(requete(`blush-pubs=non; _fbp=${FBP}`))).toBeNull();
    expect(traceDe(requete(`blush-pubs=oui; _fbp=${FBP}; blush-tournage=secret`))).toBeNull();
    expect(traceDe(requete(`blush-pubs=oui; _fbp=${FBP}; __Host-blush-tournage=secret`))).toBeNull();
  });

  it("avec l’accord : les cookies de Meta au bon format, et le navigateur", () => {
    expect(traceDe(requete(`blush-pubs=oui; _fbp=${FBP}; _fbc=${FBC}; blush-session=secret`))).toEqual({ fbp: FBP, fbc: FBC, agent: "Mozilla/5.0 (iPhone)" });
    /* Un cookie trafiqué ne part pas */
    expect(traceDe(requete(`blush-pubs=oui; _fbp=pas-un-fbp`))).toEqual({ agent: "Mozilla/5.0 (iPhone)" });
    /* Le navigateur, tronqué */
    expect(traceDe(requete("blush-pubs=oui", "x".repeat(900)))?.agent).toHaveLength(512);
  });
});

describe("un événement pour Meta (evenementMeta)", () => {
  it("l’email haché comme Meta le compare (sans espace, en minuscules, SHA-256)", () => {
    expect(emailHache("  Lea@Exemple.FR ")).toBe(emailHache("lea@exemple.fr"));
    expect(emailHache("lea@exemple.fr")).toMatch(/^[\da-f]{64}$/);
  });

  it("la page sans identifiant ni requête, sinon l’accueil", () => {
    expect(pageSure("https://www.askblush.com/importer?fbclid=abc")).toBe(`${URL_SITE}/importer`);
    expect(pageSure(null)).toBe(`${URL_SITE}/`);
    expect(pageSure("pas une adresse")).toBe(`${URL_SITE}/`);
  });

  it("un achat : son montant en euros, l’email haché, les cookies, jamais l’email en clair", () => {
    const e = evenementMeta({
      nom: "Purchase",
      id: "achat-1",
      le: new Date("2026-11-04T12:00:00Z"),
      page: `${URL_SITE}/`,
      personne: { fbp: FBP, fbc: FBC, agent: "Mozilla/5.0", email: "lea@exemple.fr" },
      centimes: 990,
    });
    expect(e).toEqual({
      event_name: "Purchase",
      event_time: 1793793600,
      event_id: "achat-1",
      action_source: "website",
      event_source_url: `${URL_SITE}/`,
      user_data: { fbp: FBP, fbc: FBC, client_user_agent: "Mozilla/5.0", em: [emailHache("lea@exemple.fr")] },
      custom_data: { value: 9.9, currency: "EUR" },
    });
    expect(JSON.stringify(e)).not.toContain("lea@exemple.fr");
  });

  it("un jalon : sans montant, avec l’adresse IP de la requête", () => {
    const e = evenementMeta({ nom: "Lead", id: "x", le: new Date(0), page: `${URL_SITE}/importer`, personne: { ip: "203.0.113.7" } });
    expect(e.custom_data).toBeUndefined();
    expect(e.user_data).toEqual({ client_ip_address: "203.0.113.7" });
  });
});
