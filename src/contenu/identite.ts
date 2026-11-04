/*
 * BLUSH en une phrase, reprise telle quelle partout où le site se présente : la landing (ses données structurées),
 * /llms.txt, /a-propos et la fin de chaque article. Les moteurs et les assistants décrivent une marque d’après ce qu’elle
 * dit d’elle-même : toujours la même phrase, avec toutes les sources qu’on importe, sans nom d’IA.
 */

/** Ce que fait BLUSH, en une phrase. */
export const PHRASE_D_IDENTITE = "BLUSH lit une conv que tu importes (captures d’écran, export Instagram ou WhatsApp) et te dit ce qui se passe vraiment entre vous.";

/**
 * Les comptes officiels de BLUSH : le réseau et l’adresse de chacun, seulement ceux qu’on sait être à nous. Les données
 * structurées les donnent aux moteurs (`sameAs`, src/lib/donnees-structurees.tsx), /a-propos les montre.
 * TODO(produit): le compte TikTok officiel et les autres (YouTube, Snapchat…), quand leur adresse exacte est confirmée :
 * jamais une adresse devinée, elle relierait BLUSH au compte de quelqu’un d’autre.
 */
export const COMPTES_OFFICIELS = [{ reseau: "Instagram", url: "https://www.instagram.com/askblush_/" }] as const;

/** Le nom d’un compte tel qu’on l’écrit, tiré de son adresse : « https://www.instagram.com/askblush_/ » → « @askblush_ ». */
export const nomDuCompte = (url: string) => `@${new URL(url).pathname.split("/").filter(Boolean)[0] ?? ""}`;
