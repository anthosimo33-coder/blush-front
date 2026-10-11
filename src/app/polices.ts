import localFont from "next/font/local";

/*
 * Les polices, servies par BLUSH : les fichiers mêmes que Google Fonts servait (assets/polices, licence SIL OFL 1.1),
 * découpés par alphabet comme chez Google. Le build ne télécharge plus rien : Google renvoyait parfois des adresses que
 * Turbopack refuse (« next/font/google queries have exactly one entry »), et le build échouait.
 *
 * Chaque alphabet est une police à part, bornée par son unicode-range (les plages de Google). Dans la pile
 * (--font-nunito et --font-figtree, globals.css), les alphabets rares passent d’abord, sans police de repli : un
 * caractère latin les traverse jusqu’au latin, seul préchargé, dont la police de repli (Arial ajustée à ses mesures)
 * évite le saut de mise en page au chargement.
 * next/font exige des valeurs écrites en toutes lettres : pas de constantes ni de fonctions dans ces appels.
 */

/* Nunito pour toute l’interface (titres en 900, texte en 700-800) : une police variable, de 600 à 900 */
const nunitoLatin = localFont({
  src: "../../assets/polices/nunito-latin.woff2",
  weight: "600 900",
  display: "swap",
  variable: "--font-nunito-latin",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});
const nunitoLatinExt = localFont({
  src: "../../assets/polices/nunito-latin-ext.woff2",
  weight: "600 900",
  display: "swap",
  variable: "--font-nunito-latin-ext",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
  preload: false,
  adjustFontFallback: false,
});
const nunitoVietnamien = localFont({
  src: "../../assets/polices/nunito-vietnamien.woff2",
  weight: "600 900",
  display: "swap",
  variable: "--font-nunito-vietnamien",
  declarations: [
    {
      prop: "unicode-range",
      value: "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
    },
  ],
  preload: false,
  adjustFontFallback: false,
});
const nunitoCyrillique = localFont({
  src: "../../assets/polices/nunito-cyrillique.woff2",
  weight: "600 900",
  display: "swap",
  variable: "--font-nunito-cyrillique",
  declarations: [{ prop: "unicode-range", value: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" }],
  preload: false,
  adjustFontFallback: false,
});
const nunitoCyrilliqueExt = localFont({
  src: "../../assets/polices/nunito-cyrillique-ext.woff2",
  weight: "600 900",
  display: "swap",
  variable: "--font-nunito-cyrillique-ext",
  declarations: [{ prop: "unicode-range", value: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F" }],
  preload: false,
  adjustFontFallback: false,
});

/* Figtree (les bulles de vrais messages) n’est pas ici : src/lib/fonts.ts, posée seulement sur les écrans à bulles */

/** Les classes à poser sur <html> : elles définissent les variables que globals.css assemble en --font-nunito. */
export const classesDesPolices = [nunitoLatin, nunitoLatinExt, nunitoVietnamien, nunitoCyrillique, nunitoCyrilliqueExt].map((p) => p.variable).join(" ");
