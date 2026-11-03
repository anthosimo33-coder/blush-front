import { describe, expect, it } from "vitest";
import { groupeDArrivee, margeApresIA } from "@/contenu/pilotage";
import { arriveeDe } from "@/lib/chemins";
import { ARRIVEE_MAX } from "@/lib/limites";
import { etapeDe, referentDe } from "@/lib/presence";
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

  it("« Google » ne garde que la recherche : Gemini (avant la règle de Google), Gmail et les autres sites de Google n’y comptent pas", () => {
    for (const google of ["https://www.google.com", "https://www.google.fr/", "https://google.com", "https://www.google.co.uk"])
      expect(sourceDe({ referent: google, agent: SAFARI }), google).toBe("google");
    expect(sourceDe({ referent: "https://gemini.google.com", agent: SAFARI })).toBe("assistants");
    expect(sourceDe({ referent: "https://bard.google.com", agent: SAFARI })).toBe("assistants");
    expect(sourceDe({ referent: "https://mail.google.com", agent: SAFARI })).toBe("mail");
    expect(sourceDe({ referent: "https://docs.google.com", agent: SAFARI })).toBe("autre");
  });

  it("les autres moteurs", () => {
    for (const moteur of [
      "https://www.bing.com",
      "https://cn.bing.com",
      "https://duckduckgo.com",
      "https://www.qwant.com",
      "https://lite.qwant.com",
      "https://www.ecosia.org",
      "https://fr.search.yahoo.com",
      "https://search.brave.com",
      "https://yandex.ru",
      "https://ya.ru",
      "https://www.startpage.com",
      "https://search.lilo.org",
    ])
      expect(sourceDe({ referent: moteur, agent: SAFARI }), moteur).toBe("moteurs");
    /* Brave le navigateur n’est pas Brave Search */
    expect(sourceDe({ referent: "https://brave.com", agent: SAFARI })).toBe("autre");
  });

  it("les assistants IA, par le site d’avant comme par leur utm_source (ChatGPT ajoute « chatgpt.com » à ses liens)", () => {
    for (const assistant of [
      "https://chatgpt.com",
      "https://chat.openai.com",
      "https://www.perplexity.ai",
      "https://perplexity.ai",
      "https://claude.ai",
      "https://copilot.microsoft.com",
      "https://chat.mistral.ai",
      "https://www.meta.ai",
      "https://chat.deepseek.com",
    ])
      expect(sourceDe({ referent: assistant, agent: SAFARI }), assistant).toBe("assistants");
    for (const utm of ["chatgpt.com", "ChatGPT.com", "perplexity", "perplexity.ai", "claude.ai", "gemini.google.com", "copilot.microsoft.com", "chat.mistral.ai", "lechat"])
      expect(sourceDe({ utm, referent: "https://www.google.com", agent: SAFARI }), utm).toBe("assistants");
  });

  it("les messageries, et les liens de nos mails (utm_source=email, src/server/email.ts)", () => {
    for (const mail of [
      "https://mail.google.com",
      "https://outlook.live.com",
      "https://outlook.office.com",
      "https://mail.yahoo.com",
      "https://fr.mail.yahoo.com",
      "https://mail.proton.me",
      "https://webmail.sfr.fr",
    ])
      expect(sourceDe({ referent: mail, agent: SAFARI }), mail).toBe("mail");
    /* Le lien d’un mail ouvert dans Gmail : utm_source=email l’emporte sur le site d’avant (google.com/url, la redirection de Gmail) */
    expect(sourceDe({ utm: "email", referent: "https://www.google.com", agent: SAFARI })).toBe("mail");
    expect(sourceDe({ utm: "email", agent: INSTAGRAM })).toBe("mail");
    /* Un nom de site inconnu dans utm_source reste « autre » */
    expect(sourceDe({ utm: "exemple.org", agent: SAFARI })).toBe("autre");
  });

  it("une appli Android (android-app://<paquet>) : la recherche de l’appli Google, Gmail, les assistants ; un autre paquet compte « autre »", () => {
    const depuis = (paquet: string) => sourceDe({ referent: `android-app://${paquet}`, agent: SAFARI });
    expect(depuis("com.google.android.googlequicksearchbox")).toBe("google");
    expect(depuis("com.google.android.gm")).toBe("mail");
    expect(depuis("com.microsoft.office.outlook")).toBe("mail");
    expect(depuis("com.openai.chatgpt")).toBe("assistants");
    expect(depuis("com.google.android.apps.bard")).toBe("assistants");
    expect(depuis("com.instagram.android")).toBe("instagram");
    expect(depuis("com.zhiliaoapp.musically")).toBe("tiktok");
    expect(depuis("com.microsoft.bing")).toBe("moteurs");
    /* YouTube est une appli de Google, pas sa recherche */
    expect(depuis("com.google.android.youtube")).toBe("autre");
    expect(depuis("com.exemple.appli")).toBe("autre");
    /* Le chemin d’un vieux navigateur qui l’enverrait ne change rien */
    expect(sourceDe({ referent: "android-app://com.google.android.gm/", agent: SAFARI })).toBe("mail");
  });
});

describe("le site d’avant, tel que le navigateur l’envoie (src/lib/presence.ts)", () => {
  const ICI = "https://www.askblush.com";
  it("son nom seul, jamais son chemin ni sa requête ; rien pour le nôtre", () => {
    expect(referentDe("https://www.google.fr/search?q=blush+conv", ICI)).toBe("https://www.google.fr");
    expect(referentDe(`${ICI}/rapport`, ICI)).toBeUndefined();
    expect(referentDe("", ICI)).toBeUndefined();
    expect(referentDe("pas une adresse", ICI)).toBeUndefined();
  });

  it("une appli Android : son paquet seul (son origine vaut « null »), jamais le chemin ni la requête", () => {
    expect(referentDe("android-app://com.google.android.googlequicksearchbox/https/www.google.com", ICI)).toBe("android-app://com.google.android.googlequicksearchbox");
    expect(referentDe("android-app://com.google.android.gm/?compte=lea@exemple.fr", ICI)).toBe("android-app://com.google.android.gm");
    /* Une autre adresse sans origine : rien plutôt que « null » */
    expect(referentDe("about:blank", ICI)).toBeUndefined();
  });
});

describe("la page d’arrivée d’une visite (src/lib/chemins.ts)", () => {
  it("le chemin seul, sans requête, fragment, barre finale ni identifiant", () => {
    expect(arriveeDe("/")).toBe("/");
    expect(arriveeDe("/?utm_source=tiktok#haut")).toBe("/");
    expect(arriveeDe("/guides/il-ne-repond-plus?ref=x")).toBe("/guides/il-ne-repond-plus");
    expect(arriveeDe("/lexique/ghosting/")).toBe("/lexique/ghosting");
    expect(arriveeDe("/conditions/")).toBe("/conditions");
    expect(arriveeDe("/v/Ab3dE9xYz")).toBe("/v/:id");
    expect(arriveeDe("/v/Ab3dE9xYz/essayer")).toBe("/v/:id/essayer");
    expect(arriveeDe("/p/abcdefg")).toBe("/p/:id");
    expect(arriveeDe("/ouvrir/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed?m=s3_rapport")).toBe("/ouvrir/:id");
    expect(arriveeDe("/rapport/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed")).toBe("/rapport/:id");
    expect(arriveeDe("/qui?prenom=Lea")).toBe("/qui");
  });

  it("ce qui ne ressemble pas à un nom de page (tapé dans l’adresse d’une page qui n’existe pas) devient « :id », et pas plus de quatre morceaux", () => {
    expect(arriveeDe("/lea.martin@exemple.fr")).toBe("/:id");
    expect(arriveeDe("/0612345678")).toBe("/:id");
    expect(arriveeDe("/commande-1234567")).toBe("/:id");
    expect(arriveeDe("/%C3%A9t%C3%A9")).toBe("/:id");
    expect(arriveeDe("/guides/un truc")).toBe("/guides/:id");
    expect(arriveeDe("/a/b/c/d/e/f")).toBe("/a/b/c/d");
    expect(arriveeDe(`/guides/${"x".repeat(200)}`)).toBe("/guides/:id");
  });

  it("jamais plus long que ce que POST /api/presence accepte : les derniers morceaux tombent, le premier reste", () => {
    const morceau = (c: string) => c.repeat(80);
    expect(arriveeDe(`/${["a", "b", "c", "d"].map(morceau).join("/")}`)).toBe(`/${morceau("a")}/${morceau("b")}`);
    expect(arriveeDe(`/guides/${morceau("b")}/${morceau("c")}/${morceau("d")}`)).toBe(`/guides/${morceau("b")}/${morceau("c")}`);
    for (const adresse of [`/${morceau("a")}`, `/${["a", "b", "c", "d"].map(morceau).join("/")}`, `/${"%/".repeat(300)}`, `/guides/${"x-".repeat(500)}`])
      expect(arriveeDe(adresse)!.length, adresse.slice(0, 30)).toBeLessThanOrEqual(ARRIVEE_MAX);
  });

  it("pas un chemin : rien", () => {
    expect(arriveeDe("https://www.askblush.com/")).toBeNull();
    expect(arriveeDe("")).toBeNull();
    expect(arriveeDe("guides")).toBeNull();
  });

  it("son groupe, pour « Pages d’arrivée » d’/admin", () => {
    expect(groupeDArrivee("/")).toBe("landing");
    expect(groupeDArrivee("/guides/il-ne-repond-plus")).toBe("guides");
    expect(groupeDArrivee("/guides")).toBe("guides");
    expect(groupeDArrivee("/lexique/ghosting")).toBe("guides");
    expect(groupeDArrivee("/v/:id")).toBe("partage");
    expect(groupeDArrivee("/p/:id")).toBe("parrainage");
    for (const legale of ["/conditions", "/confidentialite", "/mentions-legales"]) expect(groupeDArrivee(legale)).toBe("legales");
    for (const autre of ["/commencer", "/rapport", "/app", "/:id", "/guidesx", "/conditions/plus"]) expect(groupeDArrivee(autre), autre).toBe("autres");
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
    expect(etapeDe("/guides/il-ne-repond-plus")).toBe("guides");
    expect(etapeDe("/lexique/ghosting")).toBe("guides");
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
