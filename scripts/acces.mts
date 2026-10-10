#!/usr/bin/env -S npx tsx
/*
 * Donner (ou retirer) l’accès à un compte, sans paiement (la bêta) :
 *   DATABASE_URL=… npm run acces -- ami@exemple.fr blushplus
 *   DATABASE_URL=… npm run acces -- ami@exemple.fr gratuit
 * Le compte doit exister (la personne s’est connectée une fois). Pour la bêta, BLUSH_ACCES_LIBRE fait la même chose à la connexion.
 */
import postgres from "postgres";

const [email, plan] = process.argv.slice(2);
if (!email || !["gratuit", "rapport", "blushplus"].includes(plan ?? "")) {
  console.error("usage : npm run acces -- <email> <gratuit|rapport|blushplus>");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL ?? "postgres://localhost:5432/blush_dev", { max: 1, prepare: false });
const lignes = await sql`update users set plan = ${plan} where email = ${email.trim().toLowerCase()} returning email, plan`;
console.log(lignes.length ? `${lignes[0].email} : ${lignes[0].plan}` : `aucun compte pour ${email} (il doit s’être connecté une fois)`);
await sql.end();
