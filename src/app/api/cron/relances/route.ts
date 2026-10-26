import { empreinte, memeEmpreinte } from "@/server/chiffrement";
import { purgerLesEcrans } from "@/server/ecrans-gardes";
import { env } from "@/server/env";
import { erreur, repondre, route } from "@/server/http";
import { auMieux } from "@/server/journal";
import { purgerLesLecturesDesLots } from "@/server/lots";
import { traiterLesLots } from "@/server/memoire-en-lot";
import { reprendreLesChainesEnPlan } from "@/server/pipeline";
import { rangerLesCouts } from "@/server/population";
import { envoyerLesRelances } from "@/server/relances";
import { envoyerLesSequences } from "@/server/sequences";
import { renommerLesPrises } from "@/server/tournage";

/**
 * Les relances par mail (« Ton rapport t’attend », src/server/relances.ts), puis les mails des séquences
 * (src/server/sequences.ts : `sequences`, ceux partis), appelées toutes les 5 minutes par Vercel Cron
 * (vercel.json), et en secours par la veille de GitHub (.github/workflows/veille.yml), avec le secret CRON_SECRET,
 * comparé à temps constant comme pour la purge. Chaque passage ne relance qu’une fois chaque compte : deux passages
 * proches ne font rien de plus. Et,
 * au même passage, les chaînes des tâches restées en plan, chacune reprise dans sa fonction (`chaines`, le filet du
 * relais), et les prises du mode tournage qui disent encore le prénom de la source (`prises`, renommerLesPrises). Les
 * lots de la mémoire tournent à côté des chaînes, sans les retarder (traiterLesLots, src/server/memoire-en-lot.ts, qui ne
 * lève jamais et s’arrête au bout d’une minute : relevés, puis les mises à jour calmées envoyées ; `lotsEnvoyes`,
 * `lotsLus`, `lotsAnnules`) : une mise à jour revenue de son lot en direct part par son relais. Et les lectures des lots
 * d’un enregistrement dont les dix minutes sont passées (`lecturesEffacees`, purgerLesLecturesDesLots, src/server/lots.ts :
 * leur texte ne reste pas plus en base, à 5 minutes près), et les écrans gardés des longues vidéos dont l’heure est passée
 * (`ecrans`, purgerLesEcrans, src/server/ecrans-gardes.ts : une conv qui n’a rien payé les perd à son échéance, à 5
 * minutes près) ; une panne de la base n’arrête pas le reste, la purge de la nuit repasse. Et le rattrapage de la règle
 * « qui est qui » (rangerLesCouts, src/server/population.ts : `couts`, les lignes d’ai_usage pas encore rangées, puis les
 * lectures sans compte dont la conv a trouvé un compte ; `achats`, les achats payés pas encore rangés), qui se rejoue sans
 * risque : la marge produit de /admin se lit juste une fois qu’il répond deux zéros. Elle ne répond que des nombres : les
 * logs de la veille, qui les écrivent, sont publics. Rien à faire : 200, avec des zéros.
 */
export const GET = route("GET /api/cron/relances", async (req: Request) => {
  const secret = env().CRON_SECRET;
  if (!secret || !memeEmpreinte(req.headers.get("authorization") ?? "", empreinte(`Bearer ${secret}`))) return erreur("interdit");
  /* Les séquences après les relances : la relance d’abord, dans le plafond du jour qu’elles partagent */
  const mails = envoyerLesRelances().then(async (relances) => ({ relances, sequences: await envoyerLesSequences() }));
  let lecturesEffacees = 0;
  const lectures = auMieux(async () => {
    lecturesEffacees = await purgerLesLecturesDesLots();
  }, "purge des lectures des lots en échec");
  let ecrans = 0;
  const gardes = auMieux(async () => {
    ecrans = await purgerLesEcrans();
  }, "purge des écrans gardés en échec");
  let rangement = { couts: 0, achats: 0 };
  const rangees = auMieux(async () => {
    rangement = await rangerLesCouts();
  }, "rattrapage des populations en échec");
  const [{ relances, sequences }, lots, chaines, prises] = await Promise.all([
    mails,
    traiterLesLots(),
    reprendreLesChainesEnPlan(),
    renommerLesPrises(),
    lectures,
    gardes,
    rangees,
  ]);
  return repondre("GET /api/cron/relances", {
    ...relances,
    chaines,
    prises,
    sequences: sequences.envoyes,
    lotsEnvoyes: lots.envoyes,
    lotsLus: lots.lus,
    lotsAnnules: lots.annules,
    lecturesEffacees,
    ecrans,
    ...rangement,
  });
});
