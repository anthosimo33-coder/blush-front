#!/usr/bin/env -S npx tsx --conditions=react-server
/*
 * L’outil de l’équipe dans le terminal, sans paiement : débloquer le rapport d’un compte, ou lui donner des bulles. Les
 * mêmes gestes que /admin (src/server/equipe.ts), notés au journal de l’équipe comme venus du terminal.
 *   DATABASE_URL=… BLUSH_CLE=… npm run acces -- ami@exemple.fr debloquer            toutes ses convs d’aujourd’hui
 *   DATABASE_URL=… BLUSH_CLE=… npm run acces -- ami@exemple.fr debloquer <conv>     une conv (son id, stories.id)
 *   DATABASE_URL=… BLUSH_CLE=… npm run acces -- ami@exemple.fr bulles 50            50 bulles de plus (négatif : en retirer)
 * Les variables sont celles du serveur (src/server/env.ts) : le modèle n’est jamais appelé ici, et le modèle factice
 * suffit quand sa clé manque. Le compte doit exister (la personne s’est connectée une fois). Une conv débloquée écrit son
 * rapport à sa prochaine ouverture (reparerLaChaine). Les comptes de l’équipe (BLUSH_ACCES_LIBRE) n’en ont pas besoin :
 * tout leur est ouvert. Hors de la machine, le certificat de la base est vérifié (S-36, src/server/db).
 */
const [email, action, valeur] = process.argv.slice(2);
const n = Number(valeur);
const usage = () => {
  console.error("usage : npm run acces -- <email> debloquer [<conv>]   ou   npm run acces -- <email> bulles <n>");
  process.exit(1);
};
if (!email || (action !== "debloquer" && action !== "bulles")) usage();
if (action === "bulles" && (!Number.isSafeInteger(n) || n === 0)) usage();
if (action === "debloquer" && valeur && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valeur)) usage();
/* Rien ne part au modèle : sans sa clé, le modèle factice laisse env() accepter la configuration */
if (!process.env.ANTHROPIC_API_KEY) process.env.BLUSH_IA_FACTICE ??= "1";

const { debloquerDesConvs, donnerDesBulles } = await import("@/server/equipe");
const adresse = email!.trim().toLowerCase();
if (action === "debloquer") {
  const r = await debloquerDesConvs(adresse, valeur ? { conv: valeur } : "toutes", null);
  if (!r) console.log(`aucun compte pour ${adresse} (il doit s’être connecté une fois)`);
  else console.log(r.convs.length ? `${adresse} : ${r.convs.length} conv(s) débloquée(s) (${r.convs.join(", ")})` : `${adresse} : rien à débloquer`);
} else {
  const r = await donnerDesBulles(adresse, n, null);
  if (!r) console.log(`aucun compte pour ${adresse} (il doit s’être connecté une fois)`);
  else console.log(`${adresse} : ${n > 0 ? "+" : ""}${n} bulles (${r.ref}), solde ${r.solde}`);
}
/* Le pool de la base garde le processus en vie */
process.exit(0);
