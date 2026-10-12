#!/usr/bin/env -S npx tsx
/*
 * L’outil de l’équipe, sans paiement : débloquer le rapport d’un compte, ou lui donner des bulles.
 *   DATABASE_URL=… npm run acces -- ami@exemple.fr debloquer            toutes ses convs d’aujourd’hui
 *   DATABASE_URL=… npm run acces -- ami@exemple.fr debloquer <conv>     une conv (son id, stories.id)
 *   DATABASE_URL=… npm run acces -- ami@exemple.fr bulles 50            50 bulles de plus (négatif : en retirer)
 * Le compte doit exister (la personne s’est connectée une fois). Les bulles passent par le journal des bulles
 * (mouvements_bulles, raison « equipe », une référence datée), dans la même transaction que le solde, comme dans l’appli
 * (src/server/bulles.ts). Une conv débloquée écrit son rapport à sa prochaine ouverture (reparerLaChaine). Les comptes
 * de l’équipe (BLUSH_ACCES_LIBRE) n’en ont pas besoin : tout leur est ouvert.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { sslPour } from "./base.mjs";

const [email, action, valeur] = process.argv.slice(2);
const n = Number(valeur);
const usage = () => {
  console.error("usage : npm run acces -- <email> debloquer [<conv>]   ou   npm run acces -- <email> bulles <n>");
  process.exit(1);
};
if (!email || (action !== "debloquer" && action !== "bulles")) usage();
if (action === "bulles" && (!Number.isSafeInteger(n) || n === 0)) usage();

const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/blush_dev";
/* Hors de la machine, le certificat de la base est vérifié (S-36) : l’URL de la production ne part jamais sans cette garde */
const sql = postgres(url, { max: 1, prepare: false, ssl: sslPour(url) });
const adresse = email!.trim().toLowerCase();
try {
  const [compte] = await sql<{ id: string }[]>`select id from users where email = ${adresse}`;
  if (!compte) console.log(`aucun compte pour ${adresse} (il doit s’être connecté une fois)`);
  else if (action === "debloquer") {
    const convs = await sql<{ id: string }[]>`
      update stories set debloque_le = now()
      where user_id = ${compte.id} and debloque_le is null ${valeur ? sql`and id = ${valeur}` : sql``}
      returning id`;
    console.log(convs.length ? `${adresse} : ${convs.length} conv(s) débloquée(s) (${convs.map((c) => c.id).join(", ")})` : `${adresse} : rien à débloquer`);
  } else {
    const ref = `equipe:${new Date().toISOString()}:${randomUUID().slice(0, 8)}`;
    const [solde] = await sql.begin(async (tx) => {
      await tx`insert into mouvements_bulles (user_id, delta, raison, ref) values (${compte.id}, ${n}, 'equipe', ${ref})`;
      return tx<{ bulles: number }[]>`update users set bulles = bulles + ${n} where id = ${compte.id} returning bulles`;
    });
    console.log(`${adresse} : ${n > 0 ? "+" : ""}${n} bulles (${ref}), solde ${solde?.bulles}`);
  }
} finally {
  await sql.end();
}
