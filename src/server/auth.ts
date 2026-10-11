import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { alerter } from "./alertes";
import { empreinte, jeton, memeEmpreinte } from "./chiffrement";
import { passerEnBlushPlus } from "./comptes";
import { db, schema, uneLigne } from "./db";
import { envoyerCodeParEmail, ErreurResend } from "./email";
import { emailCanonique } from "./email-canonique";
import { accesLibre, boiteAMails, peutEntrer } from "./env";
import { compteDe as compteDeLaLimite, compter, LIMITES, limiteAtteinte, rendre, sousLaLimite } from "./limites";
import { CODE_MINUTES, CODE_RENVOI_S } from "@/lib/limites";

/** Une session dure un mois, et chaque visite la prolonge d’autant (prolongerSession) : un mois sans visite la ferme. */
const SESSION_JOURS = 30;
/** Les essais d’un code : au-delà, il ne vaut plus rien (prendreCode). */
export const CODE_ESSAIS = 5;

export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

export type Utilisateur = typeof schema.users.$inferSelect;

/* La ligne d’un navigateur : l’empreinte du jeton de son cookie (src/server/cookies.ts, lireNavigateur) */
const empreinteNavigateur = (navigateur: string) => empreinte(`code:${navigateur}`);

/**
 * Prépare un nouveau code pour cet email, valable seulement dans le navigateur dont `navigateur` est le jeton, et le
 * renvoie : il reste à l’écrire (envoyerCode). On n’en garde que l’empreinte, liée à l’email. null : le code de ce
 * navigateur, encore bon, a moins d’une minute (CODE_RENVOI_S) ; il marche, pas de nouveau mail. Les demandes d’un autre
 * navigateur ont leur propre ligne : elles ne remplacent jamais ce code.
 * `envoye` faux (bêta fermée, un email hors de la liste) : la ligne existe aussi, mais aucun code ne la prend. Les essais
 * y comptent donc comme chez un invité (prendreCode) : rien ne dit qui l’est.
 * Un nouveau code repart de cinq essais : son navigateur est le seul à pouvoir les jouer, et celui qui veut deviner
 * prendrait de toute façon un autre navigateur. Les vraies bornes sont celles des essais ratés de la journée (prendreCode),
 * qu’aucun code ne remet à zéro.
 */
export async function preparerCode(email: string, navigateur: string, { envoye }: { envoye: boolean }): Promise<string | null> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const c = schema.loginCodes;
  const ligne = { codeHash: empreinte(envoye ? `${email}:${code}` : jeton()), expiresAt: new Date(Date.now() + CODE_MINUTES * 60e3), attempts: 0, createdAt: new Date() };
  const [prise] = await db()
    .insert(c)
    .values({ email, navigateur: empreinteNavigateur(navigateur), ...ligne })
    .onConflictDoUpdate({
      target: [c.email, c.navigateur],
      set: ligne,
      /* Remplacé seulement s’il ne sert plus (expiré, ou ses essais épuisés), ou s’il a plus d’une minute */
      setWhere: or(lt(c.createdAt, new Date(Date.now() - CODE_RENVOI_S * 1e3)), lt(c.expiresAt, new Date()), sql`${c.attempts} >= ${CODE_ESSAIS}`),
    })
    .returning({ email: c.email });
  return prise ? code : null;
}

/* Le plafond des mails de code ne compte que ceux qui partent : pas ceux de la boîte des tests de bout en bout */
const plafondDesMails = () => (boiteAMails() ? null : LIMITES.mailsCodeParJour);

/** Les mails de code du jour ont-ils atteint leur plafond ? Rien n’est compté : la même question pour tous, invités ou non. */
export async function mailsDeCodeEpuises(): Promise<boolean> {
  const plafond = plafondDesMails();
  return !!plafond && (await limiteAtteinte("code:mails", plafond));
}

/**
 * Écrit le code à cet email, compté dans le plafond du jour (mailsCodeParJour) : l’équipe est prévenue à 80 % (alerteA),
 * puis quand il est atteint (tout le monde voit alors « trop de codes »). Un mail qui ne part pas la prévient aussi, sans
 * l’email : l’écran dit « regarde tes mails ». Elle tourne après la réponse : elle ne rejette que si la base ne répond
 * pas, et la route prévient alors l’équipe (src/app/api/auth/code).
 */
export async function envoyerCode(email: string, code: string): Promise<void> {
  const plafond = plafondDesMails();
  if (plafond) {
    const n = await compter("code:mails", plafond);
    if (n === Math.ceil(plafond.max * plafond.alerteA) || n === plafond.max)
      await alerter(
        n === plafond.max ? "mails de code : plafond du jour atteint" : `mails de code : ${Math.round(plafond.alerteA * 100)} % du plafond du jour`,
        [
          `${n} mails de code depuis le début de la fenêtre, pour un plafond de ${plafond.max} par jour (LIMITES.mailsCodeParJour).`,
          "Au plafond, plus personne ne reçoit de code : chacun voit « trop de codes » jusqu’à la fin de la fenêtre.",
        ],
        /* Touche tout le monde : passe dans la réserve des alertes importantes (S-19) */
        { importante: true },
      );
    /* Passé le plafond entre la question et l’envoi (des demandes en même temps) : pas de mail */
    if (n > plafond.max) return;
  }
  try {
    await envoyerCodeParEmail(email, code);
  } catch (e) {
    /* Une erreur réseau peut contenir l’email : seul le statut de Resend passe */
    await alerter("code de connexion non envoyé", ["Le mail du code n’est pas parti.", `Erreur : ${e instanceof ErreurResend ? `Resend : ${e.statut}` : "le réseau"}`]);
  }
}

/**
 * Les codes demandés pour cet email (canonique : ses alias avec lui) depuis l’adresse `ip` : sous ses plafonds du jour
 * (LIMITES.codeParEmailEtIp, puis codeParEmail), ou, au-delà, dans la réserve des codes (S-08) : un code de plus par
 * adresse, cinq pour l’email (LIMITES.codeReserveParEmailEtIp, codeReserveParEmail). Un tiers qui demande les codes d’une
 * personne ne l’en prive donc qu’en écrivant depuis cinq adresses. Compte la demande.
 */
export async function codeAccorde(email: string, ip: string): Promise<boolean> {
  const canonique = emailCanonique(email);
  if ((await sousLaLimite(`code:email-ip:${canonique}:${ip}`, LIMITES.codeParEmailEtIp)) && (await sousLaLimite(`code:email:${canonique}`, LIMITES.codeParEmail)))
    return true;
  return (await sousLaLimite(`code:reserve-ip:${canonique}:${ip}`, LIMITES.codeReserveParEmailEtIp)) && (await sousLaLimite(`code:reserve:${canonique}`, LIMITES.codeReserveParEmail));
}

/*
 * Les essais ratés de la journée (S-07, S-08), comptés pour l’email (canonique : ses alias avec lui), pour son adresse IP
 * et pour le navigateur qui tape. Un tiers qui rate exprès les codes d’une personne épuise les essais de son navigateur :
 * elle, dans le sien, garde les siens. Quand les essais ratés d’une adresse sont pleins, un navigateur de cette adresse
 * qui en a déjà raté cinq s’arrête là (LIMITES.echecsCodeParEmailEtIp.reserveNavigateur) ; celui de la personne sur le
 * même Wi-Fi garde ses cinq. Ce compteur ne freine pas un tiers qui change de navigateur : ses codes le bornent
 * (codeAccorde). Seule la borne de l’email, celle de tout ce qui se devine en un jour, arrête tout le monde, et un tiers
 * ne l’atteint qu’avec tous les codes du jour, réserve comprise.
 */
const clesDesEchecs = (email: string, ip: string) => {
  const canonique = emailCanonique(email);
  return { email: `code:echecs:${canonique}`, ip: `code:echecs-ip:${canonique}:${ip}`, navigateur: (jeton: string) => `code:echecs-nav:${canonique}:${jeton}` };
};
type Echecs = { email: number; ip: number; navigateur: number };

/** Ces essais ratés ferment-ils la porte ? `de` : au-delà du plafond (un essai qu’on vient de compter), ou dès lui (avant d’en compter un). */
function porteFermee(n: Echecs, de: "au-dela" | "des-le-plafond"): boolean {
  const passe = (compte: number, max: number) => (de === "au-dela" ? compte > max : compte >= max);
  const { echecsCodeParEmail, echecsCodeParEmailEtIp, echecsCodeParNavigateur } = LIMITES;
  if (passe(n.email, echecsCodeParEmail.max) || passe(n.navigateur, echecsCodeParNavigateur.max)) return true;
  /* L’adresse IP est pleine : seul un navigateur encore dans sa réserve essaie */
  return passe(n.ip, echecsCodeParEmailEtIp.max) && passe(n.navigateur, echecsCodeParEmailEtIp.reserveNavigateur);
}

/**
 * Plus aucun essai aujourd’hui pour cet email, dans ce navigateur (son jeton, s’il en a un) et depuis cette adresse IP ?
 * Rien n’est compté. La demande d’un code le regarde d’abord : un code qu’on ne pourrait pas taper ne fait que consommer
 * un mail (src/app/api/auth/code).
 */
export async function essaisEpuises(email: string, navigateur: string | undefined, ip: string): Promise<boolean> {
  const cles = clesDesEchecs(email, ip);
  const [parEmail, parIp, parNavigateur] = await Promise.all([
    compteDeLaLimite(cles.email, LIMITES.echecsCodeParEmail),
    compteDeLaLimite(cles.ip, LIMITES.echecsCodeParEmailEtIp),
    /* Un navigateur sans cookie n’a encore rien tapé : rien ne lui est compté */
    navigateur ? compteDeLaLimite(cles.navigateur(navigateur), LIMITES.echecsCodeParNavigateur) : 0,
  ]);
  return porteFermee({ email: parEmail, ip: parIp, navigateur: parNavigateur }, "des-le-plafond");
}

/**
 * Ce que vaut un code tapé : bon (et consommé : il ne sert qu’une fois) ; faux (mauvais, expiré, ses essais épuisés, ou
 * demandé dans un autre navigateur) ; ou « essais », trop d’essais ratés aujourd’hui pour cet email, depuis ce
 * navigateur ou cette adresse IP (essaisEpuises).
 */
export type Essai = "bon" | "faux" | "essais";

/**
 * Prend le code tapé dans le navigateur dont `navigateur` est le jeton (sans lui, aucun code ne vaut rien), depuis
 * l’adresse `ip` (ipDe, src/server/limites.ts).
 */
export async function prendreCode(email: string, code: string, { navigateur, ip }: { navigateur: string | undefined; ip: string }): Promise<Essai> {
  /* Sans le cookie du navigateur qui l’a demandé : rien à deviner, donc rien à compter */
  if (!navigateur) return "faux";
  const c = schema.loginCodes;
  const ici = and(eq(c.email, email), eq(c.navigateur, empreinteNavigateur(navigateur)));
  /*
   * L’essai est compté avant de comparer, en une seule requête : des essais envoyés en même temps ne passent pas tous
   * sous la limite (lire puis écrire laissait chacun voir le même compte).
   */
  const [ligne] = await db()
    .update(c)
    .set({ attempts: sql`${c.attempts} + 1` })
    .where(and(ici, lt(c.attempts, CODE_ESSAIS), gt(c.expiresAt, new Date())))
    .returning({ codeHash: c.codeHash });
  if (!ligne) return "faux";
  /* Les essais de la journée, comptés aussi avant de comparer : un bon code rend le sien à chacun */
  const cles = clesDesEchecs(email, ip);
  const comptees = [cles.email, cles.ip, cles.navigateur(navigateur)];
  const [parEmail, parIp, parNavigateur] = await Promise.all([
    compter(cles.email, LIMITES.echecsCodeParEmail),
    compter(cles.ip, LIMITES.echecsCodeParEmailEtIp),
    compter(cles.navigateur(navigateur), LIMITES.echecsCodeParNavigateur),
  ]);
  if (porteFermee({ email: parEmail, ip: parIp, navigateur: parNavigateur }, "au-dela")) return "essais";
  if (!/^\d{6}$/.test(code) || !memeEmpreinte(`${email}:${code}`, ligne.codeHash)) return "faux";
  /* Le code ne sert qu’une fois : deux bons essais en même temps, un seul ouvre la session */
  const [pris] = await db()
    .delete(c)
    .where(and(ici, eq(c.codeHash, ligne.codeHash)))
    .returning({ email: c.email });
  if (!pris) return "faux";
  await Promise.all(comptees.map((cle) => rendre(cle)));
  return "bon";
}

/** Le compte de cet email, créé s’il n’existe pas. */
export async function compteDe(email: string): Promise<Utilisateur> {
  const [existant] = await db().select().from(schema.users).where(eq(schema.users.email, email));
  const utilisateur =
    existant ??
    uneLigne(
      await db()
        .insert(schema.users)
        .values({ email, plan: accesLibre(email) ? "blushplus" : "gratuit" })
        .returning(),
      "users (compte créé)",
    );
  /* La bêta sans paiement : un email ajouté à la liste après coup a son accès à la connexion suivante */
  if (existant && existant.plan === "gratuit" && accesLibre(email)) {
    await passerEnBlushPlus(existant.id);
    utilisateur.plan = "blushplus";
  }

  return utilisateur;
}

/** Ouvre une session : on garde l’empreinte du secret, le secret part dans le cookie. */
export async function ouvrirSession(userId: string): Promise<{ secret: string; expiresAt: Date }> {
  const secret = jeton();
  const expiresAt = new Date(Date.now() + SESSION_JOURS * 86400e3);
  await db().insert(schema.sessions).values({ id: empreinte(secret), userId, expiresAt });
  return { secret, expiresAt };
}

/**
 * Prolonge la session d’un mois à partir de maintenant : chaque visite (src/app/api/reveil) la garde ouverte. Au plus une
 * fois par jour. Renvoie sa nouvelle fin, que le cookie reprend, ou null : pas de session valide, ou déjà prolongée
 * aujourd’hui.
 */
export async function prolongerSession(secret: string): Promise<Date | null> {
  const fin = new Date(Date.now() + SESSION_JOURS * 86400e3);
  const s = schema.sessions;
  const [prolongee] = await db()
    .update(s)
    .set({ expiresAt: fin })
    .where(and(eq(s.id, empreinte(secret)), gt(s.expiresAt, new Date()), lt(s.expiresAt, new Date(fin.getTime() - 86400e3))))
    .returning({ id: s.id });
  return prolongee ? fin : null;
}

/**
 * Le compte d’une session encore valide, ou null, que la bêta le laisse entrer ou non. Seul « Tout effacer » s’en sert
 * (DELETE /api/compte, et l’écran /effacer par compteRetireDeLaBeta) : un testeur retiré de la bêta peut toujours effacer
 * ce qu’il a laissé. Partout ailleurs, utilisateurDeSession.
 */
export async function compteDeSession(secret: string | undefined): Promise<Utilisateur | null> {
  if (!secret) return null;
  const [ligne] = await db()
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(and(eq(schema.sessions.id, empreinte(secret)), gt(schema.sessions.expiresAt, new Date())));
  return ligne?.user ?? null;
}

/**
 * Le compte d’une session, ou null. Bêta fermée : un email retiré de la liste n’entre plus, même avec une session
 * ouverte avant (elle dure tant qu’il revient). Son plan ne change pas : ce qui a été donné reste donné, si la bêta s’ouvre.
 */
export async function utilisateurDeSession(secret: string | undefined): Promise<Utilisateur | null> {
  const utilisateur = await compteDeSession(secret);
  return utilisateur && peutEntrer(utilisateur.email) ? utilisateur : null;
}

/**
 * Le compte d’une session encore valide que la bêta ne laisse plus entrer (un testeur retiré de la liste), ou null. Il
 * n’ouvre plus rien, sauf l’écran /effacer : « Tout effacer », ou se connecter avec un autre email.
 */
export async function compteRetireDeLaBeta(secret: string | undefined): Promise<Utilisateur | null> {
  const utilisateur = await compteDeSession(secret);
  return utilisateur && !peutEntrer(utilisateur.email) ? utilisateur : null;
}

/**
 * Ferme la session ; `partout` : toutes celles de son compte (se déconnecter de tous les appareils), si elle est encore
 * valide. Les autres appareils redemandent un code à leur prochaine requête.
 */
export async function fermerSession(secret: string, { partout = false } = {}): Promise<void> {
  const s = schema.sessions;
  if (!partout) {
    await db().delete(s).where(eq(s.id, empreinte(secret)));
    return;
  }
  const duCompte = db()
    .select({ userId: s.userId })
    .from(s)
    .where(and(eq(s.id, empreinte(secret)), gt(s.expiresAt, new Date())));
  await db().delete(s).where(inArray(s.userId, duCompte));
}
