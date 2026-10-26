/*
 * Les fautes de frappe dans le domaine d’un email (« gmial.com », « hotmail.fe », « gmail.fr ») : le champ propose
 * l’adresse corrigée avant que le code parte (useSaisieEmail, src/lib/email.ts). Un code envoyé à un domaine mal tapé
 * rebondit (le domaine n’existe pas : le serveur le refuse aussi, src/server/domaine-email.ts), ou pire, part chez celui
 * qui a acheté la faute pour en recevoir les mails (gmai.com, gamil.com, hotmial.fr en ont un). Seul le domaine se
 * corrige : une faute avant le @ ne se devine pas, c’est l’écran du code qui la dit, une fois le mail revenu.
 * Sans server-only : le navigateur la lit pendant la frappe, le serveur y prend les domaines qu’il sait bons.
 */

/**
 * Les messageries courantes, chacune avec les seules extensions où elle donne des adresses, la plus courante d’abord :
 * une extension proche d’une des siennes (« fe », « con ») s’y corrige. Une autre extension, loin des siennes, peut être
 * un vrai domaine (orange.com, laposte.fr : ceux de leurs salariés) : elle reste.
 */
const MESSAGERIES: Record<string, readonly string[]> = {
  gmail: ["com"],
  googlemail: ["com"],
  hotmail: ["fr", "com", "be", "ch", "co.uk", "es", "it", "de"],
  outlook: ["fr", "com", "be", "es", "it", "de"],
  live: ["fr", "com", "be", "co.uk", "ca"],
  msn: ["com"],
  icloud: ["com"],
  me: ["com"],
  mac: ["com"],
  yahoo: ["fr", "com", "be", "ca", "co.uk", "es", "it", "de"],
  ymail: ["com"],
  orange: ["fr"],
  wanadoo: ["fr"],
  laposte: ["net"],
  free: ["fr"],
  sfr: ["fr"],
  neuf: ["fr"],
  bbox: ["fr"],
  numericable: ["fr"],
  aol: ["com", "fr"],
  gmx: ["fr", "com", "de", "net"],
  protonmail: ["com", "ch"],
  proton: ["me"],
  skynet: ["be"],
  bluewin: ["ch"],
  videotron: ["ca"],
};

/**
 * Les messageries dont aucune autre extension ne donne d’adresse : « gmail.fr » ou « icloud.fr » n’en sont jamais une,
 * quelle que soit leur distance à la bonne.
 */
const SANS_AUTRE_EXTENSION = new Set(["gmail", "googlemail", "icloud"]);

/** De vrais domaines proches d’une messagerie (« email.com » est à une lettre de « gmail.com ») : jamais corrigés. */
const AUTRES_DOMAINES_BONS = ["email.com", "mail.com", "gmx.com", "yandex.com", "yandex.ru", "mail.ru", "web.de", "hey.com", "pm.me", "tutanota.com", "zoho.com"];

/** Tous les domaines qu’on sait bons : jamais corrigés, et le serveur ne les vérifie pas (src/server/domaine-email.ts). */
export const DOMAINES_CONNUS: ReadonlySet<string> = new Set([
  ...Object.entries(MESSAGERIES).flatMap(([nom, extensions]) => extensions.map((e) => `${nom}.${e}`)),
  ...AUTRES_DOMAINES_BONS,
]);

/**
 * La distance entre deux mots : le nombre de lettres à changer, ajouter, retirer, ou de lettres voisines à intervertir
 * (« gmial » est à une de « gmail »).
 */
export function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cout);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  return d[a.length]![b.length]!;
}

/** Les lettres qu’une messagerie tolère de travers : une, deux pour un nom de sept lettres et plus ; aucune sous cinq (« sfr », « live » : trop de vrais domaines autour). */
const ecartPermis = (nom: string) => (nom.length >= 7 ? 2 : nom.length >= 5 ? 1 : 0);

/** La messagerie qu’un nom mal tapé voulait dire (« gmial » : gmail), la plus proche ; null : aucune assez proche. */
function messagerieProche(nom: string): string | null {
  if (nom in MESSAGERIES) return nom;
  let meilleure: { nom: string; ecart: number } | null = null;
  for (const m of Object.keys(MESSAGERIES)) {
    const ecart = distance(nom, m);
    if (ecart > 0 && ecart <= ecartPermis(m) && (!meilleure || ecart < meilleure.ecart)) meilleure = { nom: m, ecart };
  }
  return meilleure?.nom ?? null;
}

/** L’extension d’une messagerie que celle tapée voulait dire (« con » : com) : la sienne si elle est bonne, la plus proche à une lettre près, sinon null. */
function extensionDe(messagerie: string, tapee: string): string | null {
  const siennes = MESSAGERIES[messagerie]!;
  if (siennes.includes(tapee)) return tapee;
  if (SANS_AUTRE_EXTENSION.has(messagerie)) return siennes[0]!;
  let meilleure: { extension: string; ecart: number } | null = null;
  for (const e of siennes) {
    const ecart = distance(tapee, e);
    if (ecart <= 1 && (!meilleure || ecart < meilleure.ecart)) meilleure = { extension: e, ecart };
  }
  return meilleure?.extension ?? null;
}

/**
 * L’adresse que l’email tapé voulait sans doute dire, son domaine corrigé (« alex@gmial.com » : « alex@gmail.com »), ou
 * null : un domaine qu’on sait bon, ou qui n’est proche d’aucune messagerie courante. Lit l’email sans les espaces du
 * bord, son domaine en minuscules, sans le point final qu’un clavier ajoute parfois.
 */
export function suggestionEmail(email: string): string | null {
  const brut = email.trim();
  const arobase = brut.lastIndexOf("@");
  if (arobase < 1) return null;
  const domaine = brut
    .slice(arobase + 1)
    .toLowerCase()
    .replace(/\.+$/, "");
  if (DOMAINES_CONNUS.has(domaine)) return null;
  const point = domaine.indexOf(".");
  if (point < 1) return null;
  const messagerie = messagerieProche(domaine.slice(0, point));
  if (!messagerie) return null;
  const extension = extensionDe(messagerie, domaine.slice(point + 1));
  if (!extension) return null;
  const corrige = `${messagerie}.${extension}`;
  return corrige === domaine ? null : `${brut.slice(0, arobase)}@${corrige}`;
}

/** Le nom qu’on connaît de chaque messagerie, par son nom de domaine : celui que l’écran du code cite quand le mail revient. */
const NOMS_DES_MESSAGERIES: Record<string, string> = {
  gmail: "Gmail",
  googlemail: "Gmail",
  hotmail: "Outlook",
  outlook: "Outlook",
  live: "Outlook",
  msn: "Outlook",
  icloud: "iCloud",
  me: "iCloud",
  mac: "iCloud",
  yahoo: "Yahoo",
  ymail: "Yahoo",
  orange: "Orange",
  wanadoo: "Orange",
};

/** La messagerie de cet email (« Gmail » pour alex@gmail.com), parmi les courantes ; null pour toute autre. */
export function nomDeMessagerie(email: string): string | null {
  const domaine = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  if (!DOMAINES_CONNUS.has(domaine)) return null;
  return NOMS_DES_MESSAGERIES[domaine.slice(0, domaine.indexOf("."))] ?? null;
}
