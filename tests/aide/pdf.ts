import { inflateSync } from "node:zlib";

/*
 * Un PDF relu comme le lirait une visionneuse, sans dépendance : ses objets, ses pages, ses métadonnées, ses polices et
 * son texte. Le texte se retrouve comme une visionneuse le copie : les glyphes des opérateurs Tj et TJ, traduits en
 * caractères par la table ToUnicode de leur police. Assez pour les PDF que BLUSH écrit (src/server/rapport-pdf.tsx, par
 * pdfkit : des objets en clair, des flux compressés en Flate), pas pour tous les PDF.
 */

/** Ce qu’on lit d’un PDF : son en-tête, ses pages et leur taille, ses métadonnées, ses polices, ses images, son texte. */
export type PdfLu = {
  entete: string;
  pages: { largeur: number; hauteur: number; texte: string }[];
  meta: Record<string, string>;
  /** Les polices : leur nom (BaseFont, préfixe du sous-ensemble compris) et si leur fichier est dans le PDF (FontFile2). */
  polices: { nom: string; embarquee: boolean }[];
  /** Les images : leur largeur et leur hauteur en pixels. */
  images: { largeur: number; hauteur: number }[];
  /** Les adresses des liens. */
  liens: string[];
  /** Tout le texte, page après page. */
  texte: string;
};

type Objet = { dict: string; flux?: Buffer };

/** Une chaîne littérale du PDF (« (…) ») décodée : ses échappements, et l’UTF-16 si elle commence par sa marque. */
function litterale(brut: string): string {
  const octets: number[] = [];
  const echappes: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
  for (let i = 0; i < brut.length; i++) {
    const c = brut[i]!;
    if (c !== "\\") {
      octets.push(c.charCodeAt(0));
      continue;
    }
    const s = brut[++i]!;
    if (s in echappes) octets.push(echappes[s]!);
    else if (/[0-7]/.test(s)) {
      const oct = /^[0-7]{1,3}/.exec(brut.slice(i))![0];
      octets.push(parseInt(oct, 8));
      i += oct.length - 1;
    }
  }
  const b = Buffer.from(octets);
  return b[0] === 0xfe && b[1] === 0xff ? Buffer.from(b.subarray(2)).swap16().toString("utf16le") : b.toString("latin1");
}

/** Une chaîne hexadécimale UTF-16BE (« 00450020 ») en texte. */
const utf16 = (hex: string) => Buffer.from(hex, "hex").swap16().toString("utf16le");

/** La table ToUnicode d’une police : chaque glyphe (son code hexadécimal, en minuscules) et ses caractères. */
function tableDe(cmap: string): Map<string, string> {
  const table = new Map<string, string>();
  const code = (n: number, gabarit: string) => n.toString(16).padStart(gabarit.length, "0");
  for (const [, bloc] of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const [, glyphe, texte] of bloc!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F\s]+)>/g)) table.set(glyphe!.toLowerCase(), utf16(texte!.replace(/\s/g, "")));
  for (const [, bloc] of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const [, de, a, cible] of bloc!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F\s]+>)/g)) {
      const [debut, fin] = [parseInt(de!, 16), parseInt(a!, 16)];
      if (cible!.startsWith("[")) [...cible!.matchAll(/<([0-9a-fA-F\s]+)>/g)].forEach((m, k) => table.set(code(debut + k, de!), utf16(m[1]!.replace(/\s/g, ""))));
      else {
        const base = parseInt(cible!.slice(1, -1).replace(/\s/g, ""), 16);
        for (let g = debut; g <= fin; g++) table.set(code(g, de!), String.fromCodePoint(base + g - debut));
      }
    }
  return table;
}

/** Lit `octets` comme un PDF : une erreur s’il n’en a pas l’air. */
export function lirePdf(octets: Uint8Array): PdfLu {
  const brut = Buffer.from(octets);
  const latin1 = brut.toString("latin1");
  if (!latin1.startsWith("%PDF-")) throw new Error("pas un PDF");

  /* Les objets : leur dictionnaire, et leur flux décompressé s’ils en ont un (repéré par sa longueur, /Length) */
  const objets = new Map<number, Objet>();
  for (const m of latin1.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) {
    const corps = m[2]!;
    const debutFlux = corps.search(/stream\r?\n/);
    if (debutFlux < 0) {
      objets.set(Number(m[1]), { dict: corps });
      continue;
    }
    const dict = corps.slice(0, debutFlux);
    const longueur = Number(/\/Length (\d+)/.exec(dict)?.[1]);
    const debut = m.index + m[0].indexOf(corps) + debutFlux + corps.slice(debutFlux).indexOf("\n") + 1;
    let flux = brut.subarray(debut, debut + longueur);
    if (/\/Filter\s*\/FlateDecode/.test(dict)) flux = inflateSync(flux);
    objets.set(Number(m[1]), { dict, flux });
  }
  const ref = (texte: string, cle: string) => objets.get(Number(new RegExp(`/${cle}\\s+(\\d+) 0 R`).exec(texte)?.[1]));

  /* Les métadonnées : le dictionnaire Info du dernier trailer, ses chaînes en clair ou à part (« /Title 42 0 R ») */
  const chaine = (valeur: string): string | undefined => {
    const v = valeur.trim();
    if (v.startsWith("(")) return litterale(v.slice(1, v.lastIndexOf(")")));
    if (v.startsWith("<") && !v.startsWith("<<")) return utf16(v.slice(1, v.indexOf(">")).replace(/^feff/i, ""));
    const objet = /^(\d+) 0 R/.exec(v);
    return objet ? chaine(objets.get(Number(objet[1]))?.dict ?? "") : undefined;
  };
  const meta: Record<string, string> = {};
  const info = ref(latin1.slice(latin1.lastIndexOf("trailer")), "Info");
  for (const [, cle, valeur] of info?.dict.matchAll(/\/(\w+)\s*(\((?:\\.|[^\\)])*\)|<[0-9a-fA-F]*>|\d+ 0 R|\/\w+)/g) ?? []) {
    const texte = chaine(valeur!);
    if (texte !== undefined) meta[cle!] = texte;
  }

  /* Les polices : leur table de caractères suit leur numéro d’objet ; les pages les nomment (/F1…) */
  const tables = new Map<number, Map<string, string>>();
  const polices: PdfLu["polices"] = [];
  for (const [numero, o] of objets) {
    if (!/\/Subtype\s*\/Type0/.test(o.dict)) continue;
    tables.set(numero, tableDe(ref(o.dict, "ToUnicode")?.flux?.toString("latin1") ?? ""));
    const descendante = objets.get(Number(/\/DescendantFonts\s*\[\s*(\d+) 0 R/.exec(o.dict)?.[1]));
    const descripteur = descendante && ref(descendante.dict, "FontDescriptor");
    polices.push({ nom: /\/BaseFont\s*\/([^\s/>]+)/.exec(o.dict)?.[1] ?? "", embarquee: !!(descripteur && ref(descripteur.dict, "FontFile2")?.flux) });
  }

  const images = [...objets.values()]
    .filter((o) => /\/Subtype\s*\/Image/.test(o.dict))
    .map((o) => ({ largeur: Number(/\/Width (\d+)/.exec(o.dict)?.[1]), hauteur: Number(/\/Height (\d+)/.exec(o.dict)?.[1]) }));
  const liens = [...objets.values()].flatMap((o) => {
    const uri = /\/URI\s*\(((?:\\.|[^\\)])*)\)/.exec(o.dict)?.[1];
    return uri === undefined ? [] : [litterale(uri)];
  });

  /* Les pages, dans l’ordre de l’arbre des pages (Kids), et le texte de chacune */
  const racine = [...objets.values()].find((o) => /\/Type\s*\/Pages\b/.test(o.dict) && !/\/Parent/.test(o.dict));
  const kids = [...(/\/Kids\s*\[([^\]]*)\]/.exec(racine?.dict ?? "")?.[1] ?? "").matchAll(/(\d+) 0 R/g)].map((k) => objets.get(Number(k[1]))!);
  const pages = kids.map((page) => {
    const [, , largeur = 0, hauteur = 0] = (/\/MediaBox\s*\[([^\]]*)\]/.exec(page.dict)?.[1] ?? "").trim().split(/\s+/).map(Number);
    const ressources = ref(page.dict, "Resources")?.dict ?? page.dict;
    const blocPolices = /\/Font\s*<<([\s\S]*?)>>/.exec(ressources)?.[1] ?? ref(ressources, "Font")?.dict ?? "";
    const parNom = new Map([...blocPolices.matchAll(/\/(\S+?)\s+(\d+) 0 R/g)].map((m) => [m[1]!, tables.get(Number(m[2])) ?? new Map<string, string>()]));
    const contenus = /\/Contents\s*\[([^\]]*)\]/.exec(page.dict)?.[1] ?? /\/Contents\s+(\d+ 0 R)/.exec(page.dict)?.[1] ?? "";
    const operateurs = [...contenus.matchAll(/(\d+) 0 R/g)].map((c) => objets.get(Number(c[1]))?.flux?.toString("latin1") ?? "").join("\n");
    const morceaux: string[] = [];
    let table = new Map<string, string>();
    for (const [, police, tj, tjSimple] of operateurs.matchAll(/\/(\S+)\s+[\d.]+\s+Tf|\[((?:<[0-9a-fA-F]*>|[^\]<])*)\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj/g)) {
      if (police) table = parNom.get(police) ?? new Map();
      else {
        const hex = tj !== undefined ? [...tj.matchAll(/<([0-9a-fA-F]*)>/g)].map((m) => m[1]).join("") : tjSimple!;
        morceaux.push((hex.match(/.{4}/g) ?? []).map((g) => table.get(g.toLowerCase()) ?? "\ufffd").join(""));
      }
    }
    return { largeur, hauteur, texte: morceaux.join(" ") };
  });

  return { entete: latin1.slice(0, 8), pages, meta, polices, images, liens, texte: pages.map((p) => p.texte).join("\n") };
}
