import localFont from "next/font/local";

/*
 * Figtree, la police des bulles de vrais messages (fichiers servis par BLUSH, comme Nunito : src/app/polices.ts).
 * Déclarée ici et non dans le layout racine : une police n’est préchargée que sur les routes qui l’importent (doc de
 * next/font). Seuls les écrans à bulles posent `figtree.variable` sur leur racine (l’accueil, le rapport et son vocal,
 * le verdict, la landing, le guide de style) ; ailleurs, elle ne passe plus devant Nunito au premier chargement.
 * next/font exige des valeurs écrites en toutes lettres : pas de constantes ni de fonctions dans ces appels.
 */

/* Variable, de 700 à 800 */
const figtreeLatin = localFont({
  src: "../../assets/polices/figtree-latin.woff2",
  weight: "700 800",
  display: "swap",
  variable: "--font-figtree-latin",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});
const figtreeLatinExt = localFont({
  src: "../../assets/polices/figtree-latin-ext.woff2",
  weight: "700 800",
  display: "swap",
  variable: "--font-figtree-latin-ext",
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
  preload: false,
  adjustFontFallback: false,
});

/*
 * Les classes à poser sur la racine d’un écran à bulles. `police-figtree` (globals.css) y assemble --font-figtree : une
 * variable qui en cite d’autres se résout là où elle est déclarée, et les alphabets ne sont définis que sur cet élément.
 */
export const figtree = { variable: `${figtreeLatin.variable} ${figtreeLatinExt.variable} police-figtree` };
