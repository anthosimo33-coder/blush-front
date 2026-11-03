import { describe, expect, it } from "vitest";
import { AIDE_SANS_BULLES, LIGNES_D_ECOUTE, LIGNES_PAR_SITUATION, URGENCES } from "@/contenu/aide";

/*
 * L’aide écrite une fois (src/contenu/aide.ts) : les numéros d’urgence, les lignes d’écoute et les lignes par situation
 * (le 114 par SMS, le 119, le 3919, le 3018, le tchat de commentonsaime.fr). Chaque ligne se joint d’un toucher par son
 * lien, son lien et ce qu’on lit désignent le même numéro (ou la même adresse), aucune ne revient deux fois, et ce
 * qu’elles promettent reste ce que disent les sources officielles (vérifiées le 2026-11-03) : jamais « anonyme » là où
 * l’appel est identifié, jamais « appelle » pour le 114, qui ne prend que les SMS.
 */

/** Ce qu’une ligne affiche, à l’écran comme dans le PDF. */
const textes = (l: (typeof LIGNES_PAR_SITUATION)[number]) => [l.name, l.pour, l.detail, l.label];

describe("les lignes par situation", () => {
  it("sont les cinq, du plus urgent au moins urgent : le 114 par SMS, le 119, le 3919, le 3018, puis le tchat", () => {
    expect(LIGNES_PAR_SITUATION.map((l) => l.lien)).toEqual(["sms:114", "tel:119", "tel:3919", "tel:3018", "https://commentonsaime.fr/besoin-daide/le-tchat-pour-discuter/"]);
  });

  it("se joignent par un appel, un SMS ou une page sécurisée, et leur lien désigne ce qu’on lit", () => {
    for (const l of LIGNES_PAR_SITUATION) {
      expect(l.lien, l.name).toMatch(/^(tel:|sms:|https:\/\/)/);
      if (l.lien.startsWith("https://")) {
        /* Une page : ce qu’on lit est son domaine, sans « www. » */
        expect(new URL(l.lien).hostname.replace(/^www\./, ""), l.name).toBe(l.label);
      } else {
        /* Un numéro : les chiffres du lien sont ceux qu’on lit, espaces ôtées */
        expect(l.lien.replace(/^(tel|sms):/, ""), l.name).toMatch(/^\d+$/);
        expect(l.lien.replace(/^(tel|sms):/, ""), l.name).toBe(l.label.replace(/\s/g, ""));
      }
    }
  });

  it("ne reviennent jamais deux fois, ni entre elles ni parmi les lignes d’écoute et les numéros d’urgence", () => {
    const liens = [...LIGNES_D_ECOUTE.map((l) => `tel:${l.tel}`), ...LIGNES_PAR_SITUATION.map((l) => l.lien)];
    expect(new Set(liens).size).toBe(liens.length);
    const noms = [...LIGNES_D_ECOUTE, ...LIGNES_PAR_SITUATION].map((l) => l.name);
    expect(new Set(noms).size).toBe(noms.length);
    /* Le 17, le 112 et le 3114 sont dans URGENCES : aucune ligne ne les redit */
    for (const numero of URGENCES.match(/\d+/g)!) expect(LIGNES_PAR_SITUATION.map((l) => l.label)).not.toContain(numero);
  });

  it("disent pour qui elles sont, en tutoiement", () => {
    for (const l of LIGNES_PAR_SITUATION) expect(l.pour, l.name).toMatch(/^Si (tu|on|ta|ton) /);
  });

  it("respectent la typographie : apostrophes courbes, insécable avant : ; ? ! et entre une heure et « h », ni blanc doublé ni point final", () => {
    for (const l of LIGNES_PAR_SITUATION)
      for (const texte of textes(l)) {
        expect(texte, texte).not.toContain("'");
        expect(texte, texte).not.toMatch(/[^\u00a0][:;?!»]|«[^\u00a0]/u);
        expect(texte, texte).not.toMatch(/\d h\b/);
        expect(texte, texte).not.toMatch(/\s{2}|^\s|\s$|\.$/);
      }
  });

  it("ne promettent que ce que disent les sources", () => {
    const [sms, enfance, femmes, numerique, tchat] = LIGNES_PAR_SITUATION;
    /* Le 114 ne prend que les SMS, demande le nom et l’adresse : ni « appelle », ni « anonyme » */
    expect(sms.name).toMatch(/SMS/);
    expect(textes(sms).join(" ")).not.toMatch(/appel|anonyme/i);
    expect(sms.detail).toMatch(/adresse précise/);
    /* Le 119 et le 3018 : confidentiels, pas anonymes (l’appel au 119 est identifié ; le 3018 peut lever l’anonymat) */
    for (const l of [enfance, numerique]) {
      expect(l.detail, l.name).toMatch(/confidentiel/);
      expect(textes(l).join(" "), l.name).not.toMatch(/anonyme/i);
    }
    /* Le 3919 écoute les femmes : il le dit, et ne se présente pas comme un numéro d’urgence */
    expect(femmes.pour).toMatch(/une femme/);
    expect(textes(femmes).join(" ")).not.toMatch(/urgence/i);
    /* Le 3018 répond de 9 h à 23 h, pas la nuit, et pour les moins de 25 ans */
    expect(numerique.detail).toMatch(/9\u00a0h à 23\u00a0h/);
    expect(numerique.detail).toMatch(/25 ans/);
    /* Le tchat a ses horaires, et ne promet pas la confidentialité (un signalement est possible pour un mineur) */
    expect(tchat.detail).toMatch(/lundi au jeudi/);
    expect(textes(tchat).join(" ")).not.toMatch(/confidentiel/i);
  });
});

describe("la réponse 402 « bulles »", () => {
  it("porte les numéros d’urgence, puis les lignes d’écoute, puis les lignes par situation, une ligne chacune", () => {
    expect(AIDE_SANS_BULLES).toEqual([
      URGENCES,
      "Fil Santé Jeunes\u00a0: 0 800 235 236 (Anonyme et gratuit, tous les jours de 9 h à 23 h)",
      "SOS Amitié\u00a0: 09 72 39 40 50 (À l’écoute 24 h sur 24)",
      "Urgence par SMS\u00a0: 114 (Si tu es en danger et ne peux pas parler à voix haute, gratuit, 24\u00a0h sur 24\u00a0: écris ton nom, ton adresse précise et ce qui se passe)",
      "Enfance en danger\u00a0: 119 (Si tu as moins de 18 ans et que tu es en danger, ou qu’un enfant l’est, appel gratuit et confidentiel, 24\u00a0h sur 24, invisible sur la facture)",
      "Violences Femmes Info\u00a0: 3919 (Si tu es une femme victime de violences, dans ton couple ou ailleurs, appel gratuit et anonyme, 24\u00a0h sur 24, invisible sur la facture)",
      "Harcèlement en ligne\u00a0: 3018 (Si on diffuse tes photos intimes ou qu’on te fait chanter en ligne, moins de 25 ans, gratuit et confidentiel, tous les jours de 9\u00a0h à 23\u00a0h, ou en tchat sur 3018.fr)",
      "Comment on s’aime\u00a0: commentonsaime.fr (Si ta relation te fait du mal et que tu préfères écrire, tchat anonyme et gratuit, du lundi au jeudi de 10\u00a0h à minuit, vendredi et samedi de 10\u00a0h à 21\u00a0h)",
    ]);
  });
});
