/**
 * Dans le navigateur, avant l’envoi : on ouvre l’export (.zip ou fichier seul), on ne garde que le texte de la conv
 * (le .txt WhatsApp, ou les message_N d’Instagram), et on le compresse. Les photos et vocaux ne partent jamais,
 * et l’envoi reste petit (Vercel refuse plus de 4,5 Mo).
 */
import { gzipSync, strFromU8, strToU8, unzip } from "fflate";
import { choisirParties, convsInstagram, estFichierUtile, resumeConvInstagram, type Partie } from "@prompts/lib/export";

const dezipper = (octets: Uint8Array) =>
  new Promise<Record<string, Uint8Array>>((ok, ko) => unzip(octets, { filter: (f) => estFichierUtile(f.name) && f.originalSize < 50 * 1024 * 1024 }, (e, r) => (e ? ko(e) : ok(r))));

export class ExportIllisible extends Error {
  constructor(readonly code: "fichier" | "plusieurs") {
    super(code);
  }
}

/** Une conv d’un export Instagram complet, telle qu’on la propose au choix. */
export type ConvInstagram = { id: string; nom: string; messages: number; derniere: string; groupe: boolean };

const paquet = (nom: string, parties: Partie[]) => new Blob([gzipSync(strToU8(JSON.stringify({ nom, parties })))], { type: "application/gzip" });

/**
 * Le fichier choisi, prêt à partir : un paquet, ou (un export Instagram complet) la liste de ses convs à choisir,
 * et de quoi faire le paquet de celle qu’on choisit. Les autres convs ne quittent jamais le navigateur.
 */
export async function analyserExport(fichier: File): Promise<{ type: "un"; paquet: Blob } | { type: "plusieurs"; convs: ConvInstagram[]; paquetDe: (id: string) => Blob }> {
  const fichiers = await lireFichiers(fichier);
  const parties = choisirParties(fichiers);
  if (!parties) throw new ExportIllisible("fichier");
  if (parties !== "plusieurs") return { type: "un", paquet: paquet(fichier.name, parties) };
  const convs = convsInstagram(fichiers);
  const resumes = convs.flatMap((c, k) => {
    const r = resumeConvInstagram(c.parties);
    return r && r.messages > 0 ? [{ id: String(k), ...r }] : [];
  });
  if (!resumes.length) throw new ExportIllisible("fichier");
  return { type: "plusieurs", convs: resumes, paquetDe: (id) => paquet(fichier.name, convs[+id].parties) };
}

async function lireFichiers(fichier: File): Promise<Partie[]> {
  const octets = new Uint8Array(await fichier.arrayBuffer());
  if (octets[0] === 0x50 && octets[1] === 0x4b) {
    const contenu = await dezipper(octets).catch(() => {
      throw new ExportIllisible("fichier");
    });
    return Object.entries(contenu).map(([nom, o]) => ({ nom, contenu: strFromU8(o) }));
  }
  return [{ nom: fichier.name, contenu: strFromU8(octets) }];
}

/** Le fichier choisi devient un petit paquet compressé : { parties: [{ nom, contenu }] } en gzip. */
export async function preparerExport(fichier: File): Promise<Blob> {
  const octets = new Uint8Array(await fichier.arrayBuffer());
  const estZip = octets[0] === 0x50 && octets[1] === 0x4b;
  let fichiers: Partie[];
  if (estZip) {
    const contenu = await dezipper(octets).catch(() => {
      throw new ExportIllisible("fichier");
    });
    fichiers = Object.entries(contenu).map(([nom, o]) => ({ nom, contenu: strFromU8(o) }));
  } else fichiers = [{ nom: fichier.name, contenu: strFromU8(octets) }];
  const parties = choisirParties(fichiers);
  if (parties === "plusieurs" || !parties) throw new ExportIllisible(parties === "plusieurs" ? "plusieurs" : "fichier");
  return new Blob([gzipSync(strToU8(JSON.stringify({ nom: fichier.name, parties })))], { type: "application/gzip" });
}
