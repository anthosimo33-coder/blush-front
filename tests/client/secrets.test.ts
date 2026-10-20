import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Ce que l’enregistrement des visites ne lit jamais (src/lib/secrets.ts) : l’interface se lit, la conv et qui l’on est
 * non. Le texte d’une zone privée (data-prive) masqué en entier, sauf une erreur posée dedans (data-public) ; ailleurs,
 * les prénoms retenus et les emails masqués, mot entier ; le titre de la page masqué. Chaque test recharge le module :
 * ses secrets sont ceux d’une page neuve.
 */

const page = async () => {
  vi.resetModules();
  return import("@/lib/secrets");
};

/** Un élément posé dans la page, d’après son HTML ; le premier qui correspond à `cible`. */
function element(html: string, cible: string): Element {
  document.body.innerHTML = html;
  return document.querySelector(cible)!;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("le masquage de l’enregistrement des visites", () => {
  it("l’interface se lit telle quelle", async () => {
    const { masquerTexte } = await page();
    const el = element(`<main><h1 id="t">Vous vous parlez où ?</h1></main>`, "#t");
    expect(masquerTexte("Vous vous parlez où ?", el)).toBe("Vous vous parlez où ?");
    expect(masquerTexte("Ce fichier ne se lit pas. Réessaie avec l’export complet.", el)).toBe("Ce fichier ne se lit pas. Réessaie avec l’export complet.");
  });

  it("une zone privée : tout son texte masqué, jusqu’au plus profond", async () => {
    const { masquerTexte } = await page();
    const el = element(`<div data-prive=""><section><p id="b">tu me manques un peu</p></section></div>`, "#b");
    expect(masquerTexte("tu me manques un peu", el)).toBe("** ** ******* ** ***");
    expect(masquerTexte("L", element(`<span data-prive="">L</span>`, "span"))).toBe("*");
    expect(masquerTexte("x", element(`<span class="ph-mask"><b>x</b></span>`, "b"))).toBe("*");
  });

  it("une erreur dans une zone privée se lit, ses secrets masqués", async () => {
    const { masquerTexte, retenirSecrets } = await page();
    retenirSecrets(["Léa"]);
    const el = element(`<div data-prive=""><p role="alert" data-public="">x</p></div>`, "[role=alert]");
    expect(masquerTexte("Ta conv avec Léa ne s’est pas ouverte.", el)).toBe("Ta conv avec *** ne s’est pas ouverte.");
    /* Une zone privée posée dans une erreur l’emporte, elle */
    expect(masquerTexte("Léa", element(`<p data-public=""><span data-prive="">Léa</span></p>`, "span"))).toBe("***");
  });

  it("les prénoms retenus : masqués partout, mot entier, sans tenir compte des majuscules", async () => {
    const { masquerTexte, retenirSecrets } = await page();
    const el = element(`<p id="p">x</p>`, "#p");
    expect(masquerTexte("Ton rapport sur Léa", el)).toBe("Ton rapport sur Léa");
    retenirSecrets(["Léa", "Noé", null, undefined, " ", "x"]);
    expect(masquerTexte("Ton rapport sur Léa", el)).toBe("Ton rapport sur ***");
    expect(masquerTexte("LÉA et noé", el)).toBe("*** et ***");
    expect(masquerTexte("Léandre et Noémie", el)).toBe("Léandre et Noémie");
    expect(masquerTexte("« Léa », c’est elle.", el)).toBe("« *** », c’est elle.");
    /* Un prénom qui ressemble à une expression ne casse rien */
    retenirSecrets(["Jo (b)"]);
    expect(masquerTexte("avec Jo (b) hier", el)).toBe("avec ** *** hier");
  });

  it("un email, où qu’il soit ; le titre de la page", async () => {
    const { masquerTexte } = await page();
    const el = element(`<p id="p">x</p>`, "#p");
    expect(masquerTexte("Code envoyé à noe@exemple.fr, regarde tes spams.", el)).toBe("Code envoyé à **************, regarde tes spams.");
    const titre = document.createElement("title");
    document.head.append(titre);
    expect(masquerTexte("Ton rapport sur Léa · BLUSH", titre)).toBe("*** ******* *** *** * *****");
    titre.remove();
  });
});
