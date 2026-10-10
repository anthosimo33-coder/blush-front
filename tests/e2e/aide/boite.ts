import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { BOITE_MAILS } from "../reglages";

/*
 * La boîte à mails des tests : le serveur y écrit chaque mail au lieu de l’envoyer (BLUSH_BOITE_MAILS,
 * src/server/email.ts), un fichier JSON par mail. Le code de connexion y est aussi à part.
 */

/** Un mail écrit par le serveur. `code` : le code de connexion, pour le mail du code seulement. */
export type Mail = { pour: string; sujet: string; texte: string; html: string; code?: string; envoye: string };

/**
 * Les mails de la boîte, avec leur fichier. Le serveur écrit chaque mail d’un coup (un .tmp renommé) : jamais à moitié.
 * Un autre worker peut en retirer entre la liste et la lecture (oublierMails) : ceux-là sont passés.
 */
function boite(): { fichier: string; mail: Mail }[] {
  if (!existsSync(BOITE_MAILS)) return [];
  return readdirSync(BOITE_MAILS)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      const fichier = join(BOITE_MAILS, f);
      try {
        return [{ fichier, mail: JSON.parse(readFileSync(fichier, "utf8")) as Mail }];
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw e;
      }
    });
}

/** Les mails reçus par cet email, du plus ancien au plus récent. */
export function mailsPour(email: string): Mail[] {
  const pour = email.toLowerCase();
  return boite()
    .map((m) => m.mail)
    .filter((m) => m.pour === pour)
    .sort((a, b) => Date.parse(a.envoye) - Date.parse(b.envoye));
}

/** Les mails reçus par cet email depuis `depuis` (un Date.now() pris avant le geste qui les envoie), du plus ancien au plus récent. */
export const mailsDepuis = (email: string, depuis: number): Mail[] => mailsPour(email).filter((m) => Date.parse(m.envoye) >= depuis);

/** Retire de la boîte les mails de cet email (oublierEmail, aide/base.ts : un invité repart d’une boîte vide). */
export function oublierMails(email: string): void {
  const pour = email.toLowerCase();
  for (const { fichier, mail } of boite()) if (mail.pour === pour) rmSync(fichier, { force: true });
}

/**
 * Le dernier mail reçu par cet email depuis `depuis` (un Date.now() pris juste avant le geste qui l’envoie) et qui passe
 * `filtre`. Le serveur l’écrit avant ou juste après sa réponse (les codes et la liste d’attente : after()) : on relit
 * la boîte jusqu’à le trouver.
 */
export async function attendreMail(
  email: string,
  { depuis = 0, filtre = () => true, timeout = 10_000 }: { depuis?: number; filtre?: (m: Mail) => boolean; timeout?: number } = {},
): Promise<Mail> {
  const fin = Date.now() + timeout;
  for (;;) {
    const mail = mailsDepuis(email, depuis).filter(filtre).at(-1);
    if (mail) return mail;
    if (Date.now() > fin) {
      const avant = mailsPour(email).filter((m) => Date.parse(m.envoye) < depuis && filtre(m)).length;
      throw new Error(`aucun mail pour ${email} en ${timeout} ms${avant ? ` (${avant} plus ancien(s) que \`depuis\`)` : ""} (boîte : ${BOITE_MAILS})`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Le dernier code de connexion envoyé à cet email depuis `depuis`. */
export async function dernierCode(email: string, options: { depuis?: number; timeout?: number } = {}): Promise<string> {
  return (await attendreMail(email, { ...options, filtre: (m) => !!m.code })).code!;
}
