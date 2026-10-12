/*
 * Les trouvailles de la lecture : trois phrases courtes, calculées par le code sur les chiffres de la conv
 * (jamais par le modèle), qui apparaissent pendant que BLUSH lit. D’abord ce qui est déséquilibré entre eux
 * (qui ouvre, qui relance, qui répond vite, qui écrit long), puis leur mot à eux, puis le volume.
 * Textes validés le 8 octobre. Des textes de l’appli : ils vivaient dans le sous-module des prompts (prompts/lib/trouvailles.ts).
 */
import type { Chiffres, Histoire, Message } from "@prompts/lib/conv";
import { formatCount } from "@/lib/format";
import { joursCouverts } from "../temps";

const H = 3600e3;

/* Les mots trop courants pour dire quelque chose d’eux (en plus des mots vides de prompts/lib/conv.ts) */
const BANALS = new Set(
  "qu’on qu’il qu’elle qu’ils qu’elles quand comment pourquoi envie merci coucou salut bisous bisou bonne bonnes nuit journée soirée matin semaine weekend week-end après avant toujours jamais beaucoup maintenant moment peut-être petit petite gros grosse super cool truc trucs chose choses fois gens monde parce cette celle celui ceux leur leurs notre votre dire dit voir aller venir viens vient faut fallait pense crois sait savoir avais avait était étais serait sera haha ahah ahahah hahaha lol mdrr vrm hein enfin quand même bientôt cours boulot travail taff jsuis j’suis chuis week tient lundi mardi mercredi jeudi vendredi samedi dimanche ptn putain wsh wesh déjà chez beau belle vers sans sous entre depuis pendant contre autre autres chaque plein très assez tant tellement mieux pire grand grande vraie franchement carrément direct wallah".split(
    " ",
  ),
);

const duree = (ms: number) => {
  if (ms < 60e3) return "moins d’une minute";
  if (ms < H) return `${Math.round(ms / 60e3)}\u00a0min`;
  const h = Math.floor(ms / H);
  const m = Math.round((ms % H) / 60e3);
  return `${h}\u00a0h${m ? `\u00a0${String(m).padStart(2, "0")}` : ""}`;
};
const pourcent = (s: string) => parseInt(s, 10) || 0;

/** Un prénom ou un lieu : le mot s’écrit surtout avec une majuscule dans leurs messages. */
function nomPropre(mot: string, messages: Message[]): boolean {
  let majuscule = 0;
  let total = 0;
  const re = new RegExp(`(^|[^\\p{L}’])(${mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![\\p{L}’])`, "giu");
  for (const m of messages) {
    if (m.media) continue;
    for (const x of m.texte.normalize("NFC").replace(/'/g, "’").matchAll(re)) {
      total++;
      if (/^\p{Lu}/u.test(x[2]!)) majuscule++;
    }
  }
  return total > 0 && majuscule / total >= 0.6;
}

/** `messages` : pour écarter les prénoms et les lieux du « mot à vous ». */
export function trouvailles(c: Chiffres, h: Pick<Histoire, "autre">, messages: Message[] = []): string[] {
  const elle = h.autre.pronom === "il" ? "il" : "elle";
  const Elle = elle === "il" ? "Il" : "Elle";

  /* Qui ouvre la journée : seulement si l’un le fait nettement plus que l’autre */
  const jours = c.ouvre.toi + c.ouvre.autre;
  const sur10 = jours >= 5 ? Math.round((10 * c.ouvre.autre) / jours) : 5;
  const ouvre = sur10 >= 6 ? `${Elle} ouvre la conv ${sur10}\u00a0jours sur\u00a010` : sur10 <= 4 ? `Tu ouvres la conv ${10 - sur10}\u00a0jours sur\u00a010` : null;

  /* Qui relance sans réponse : au moins deux fois plus, et quelques fois */
  const { toi: rt, autre: ra } = c.relance;
  const relance =
    Math.max(rt, ra) >= 4 && (Math.min(rt, ra) === 0 || Math.max(rt, ra) / Math.min(rt, ra) >= 2)
      ? rt > ra
        ? ra === 0
          ? `Tu relances, ${elle} jamais`
          : `Tu relances ${Math.round(rt / ra)}\u00a0fois plus qu’${elle}`
        : rt === 0
          ? `${Elle} relance, toi jamais`
          : `${Elle} relance ${Math.round(ra / rt)}\u00a0fois plus que toi`
      : null;

  /* Les délais de réponse médians : un écart net, sinon leur rythme commun (moins prioritaire) */
  const { toi: dt, autre: da } = c.delai;
  const deux = dt != null && da != null ? { dt, da } : null;
  const net = !!deux && Math.max(deux.dt, deux.da) >= 60e3 && Math.max(deux.dt, deux.da) / Math.max(1, Math.min(deux.dt, deux.da)) >= 1.5;
  const delai = deux && net ? `${Elle} te répond en ${duree(deux.da)}, toi en ${duree(deux.dt)}` : null;
  const rythme = deux && !net ? `Vous vous répondez en ${duree(Math.max(deux.dt, deux.da))}` : null;

  /* La longueur des messages : nettement plus longs d’un côté */
  const { toi: lt, autre: la } = c.motsMoyens;
  const longueur =
    typeof lt === "number" && typeof la === "number" && lt > 0 && la > 0 && Math.max(lt, la) / Math.min(lt, la) >= 1.8
      ? la > lt
        ? `${Elle} écrit ${Math.round(la / lt)}\u00a0fois plus long que toi`
        : `Tu écris ${Math.round(lt / la)}\u00a0fois plus long qu’${elle}`
      : null;

  /* Le soir (22 h – 2 h), sur l’ensemble de leurs messages */
  const total = c.total.toi + c.total.autre;
  const soirPct = total ? Math.round((pourcent(c.soir.toi) * c.total.toi + pourcent(c.soir.autre) * c.total.autre) / total) : 0;
  const soir = soirPct >= 40 ? `${soirPct}\u00a0% de vos messages entre 22\u00a0h et 2\u00a0h` : null;

  /* Leur mot à eux : le plus fréquent qui ne soit pas banal */
  const mot = c.recurrents.find(([w, n]) => n >= 5 && !BANALS.has(w) && !nomPropre(w, messages));
  const motAVous = mot ? `Votre mot à vous\u00a0: «\u00a0${mot[0]}\u00a0»\u00a0×\u00a0${mot[1]}` : null;

  /* Le volume, toujours disponible */
  const etendue = c.debut && c.fin ? joursCouverts(c.debut, c.fin) : 0;
  const volume = etendue
    ? `${formatCount(total)}\u00a0messages en ${etendue >= 60 ? `${Math.round(etendue / 30)}\u00a0mois` : `${etendue}\u00a0jour${etendue > 1 ? "s" : ""}`}`
    : null;

  /* Deux déséquilibres au plus, puis leur mot, puis de quoi compléter */
  const desequilibres = [ouvre, relance, delai, longueur, soir].filter((x): x is string => !!x);
  const choix = [...desequilibres.slice(0, 2), ...(motAVous ? [motAVous] : [])];
  for (const x of [...desequilibres.slice(2), rythme, volume]) if (choix.length < 3 && x) choix.push(x);
  return choix.slice(0, 3);
}
