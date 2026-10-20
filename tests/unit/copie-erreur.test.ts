import { describe, expect, it } from "vitest";
import { MIN_MESSAGES, MIN_MESSAGES_CAPTURES } from "@prompts/lib/conv";
import { copieDe } from "@/lib/copie-erreur";

/*
 * Les textes et les liens des écrans d’erreur du parcours (copieDe, src/lib/copie-erreur.ts), d’après l’écran où
 * l’erreur arrive : réessayer y ramène avec son appli et son mode (sans `?erreur=`), une conv trop courte mène aux
 * captures (ou à en choisir plus, sur des captures), et les autres erreurs gardent leurs liens à elles.
 */

const params = (q: string) => new URLSearchParams(q);

describe("copieDe", () => {
  it("un fichier illisible : réessayer et revenir ramènent à l’écran, avec son appli, sans l’erreur", () => {
    const c = copieDe("fichier", "/importer/export", params("app=whatsapp&erreur=fichier"));
    expect(c.title).toBe("On n’arrive pas à lire ce fichier.");
    expect(c.href).toBe("/importer/export?app=whatsapp");
    expect(c.back).toBe("/importer/export?app=whatsapp");
  });

  it("sans autre paramètre que l’erreur : l’écran seul, sans « ? » qui traîne", () => {
    for (const kind of ["capture", "video"] as const) {
      const c = copieDe(kind, "/importer/captures", params("erreur=" + kind));
      expect(c.href).toBe("/importer/captures");
      expect(c.back).toBe("/importer/captures");
    }
  });

  it("une conv trop courte, sur un export : passer aux captures de la même appli, le retour sur l’export", () => {
    const c = copieDe("courte", "/importer/export", params("app=instagram&erreur=courte"));
    expect(c.text).toContain(`au moins ${MIN_MESSAGES} messages`);
    expect(c.text).toContain(`${MIN_MESSAGES_CAPTURES} suffisent`);
    expect(c.action).toBe("Envoyer des captures");
    expect(c.href).toBe("/importer/captures?app=instagram");
    expect(c.back).toBe("/importer/export?app=instagram");
  });

  it("une conv trop courte, sur un export sans appli : les captures, tout court ; une appli à coder l’est", () => {
    expect(copieDe("courte", "/importer/export", params("erreur=courte")).href).toBe("/importer/captures");
    expect(copieDe("courte", "/importer/export", params("app=a b&erreur=courte")).href).toBe("/importer/captures?app=a%20b");
  });

  it("une conv trop courte, sur des captures : en choisir plus, ici même, avec le seuil des captures", () => {
    const c = copieDe("courte", "/importer/captures", params("app=hinge&mode=ajout&erreur=courte"));
    expect(c.text).toBe(
      `Il faut au moins ${MIN_MESSAGES_CAPTURES} messages pour un verdict juste. Ajoute des captures, depuis le début de votre conv, ou reviens dans quelques jours.`,
    );
    expect(c.action).toBe("Choisir plus de captures");
    expect(c.href).toBe("/importer/captures?app=hinge&mode=ajout");
    expect(c.back).toBe(c.href);
  });

  it("un groupe, une lecture ratée : leurs liens à eux, quel que soit l’écran", () => {
    expect(copieDe("groupe", "/importer/export", params("app=whatsapp&erreur=groupe"))).toMatchObject({ href: "/commencer", back: "/commencer" });
    expect(copieDe("lecture", "/lecture", params("erreur=lecture"))).toMatchObject({ action: "Relancer l’analyse", href: "/lecture", back: "/email" });
  });

  it("ne touche pas aux paramètres reçus (ceux de la page)", () => {
    const p = params("app=whatsapp&erreur=fichier");
    copieDe("fichier", "/importer/export", p);
    expect(p.get("erreur")).toBe("fichier");
  });
});
