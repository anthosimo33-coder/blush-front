import { cn } from "@/lib/cn";
import { CONTENEUR, PageEditoriale } from "@/components/article/cadre";
import { DateEnLettres } from "@/components/article/texte";
import { CarteDeConfiance, EnTeteDeConfiance, LIGNES_DE_CARTE } from "@/components/juridique/confiance";
import { aCote, BoutonDUrgence, LigneDUrgence, lignesAvecPhrase, numerosSeuls, pictoDe } from "@/components/juridique/urgences";
import { Icon, type IconName } from "@/components/ui/icons";
import { GROUPES_D_AIDE, PAGE_AIDE, type LigneDAide } from "@/contenu/pages-de-confiance";

/*
 * /aide, rendue sur le serveur dans l’habit des guides (le cadre « Magazine »), sans rien à vendre : ni bouton dans la
 * barre, ni fin rose, ni prix, ni lien vers l’import (la fin « pied »). Le grand titre (« en parler » en bleu : toi), son
 * chapeau, puis tous les numéros de src/contenu/aide.ts, du plus urgent au moins urgent (GROUPES_D_AIDE), chacun à un
 * toucher : les urgences d’abord, en grands boutons bleus (le 17, le 112, le 3114), puis le 114 par SMS (leurs gestes,
 * src/components/juridique/urgences.tsx, sont aussi ceux du bloc d’aide des guides) ; l’écoute ; puis
 * « Selon ta situation ». Sur un téléphone, les trois numéros d’urgence tiennent dans le premier écran ; sur un
 * ordinateur, le titre reste à gauche et les numéros à droite, les urgences en haut. Lisible sans JavaScript : de simples
 * liens tel:, sms: et https:.
 */

/** Ce que dit une ligne d’aide : son nom, pour qui, ce qu’elle promet, puis son numéro (ou son adresse) en bleu. */
function TextesDeLaLigne({ ligne }: { ligne: LigneDAide }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[17px] font-black leading-[1.3] text-ink">{ligne.nom}</span>
      {ligne.pour && <span className="text-[15px] font-extrabold leading-[1.4] text-soft">{ligne.pour}</span>}
      {ligne.detail && <span className="text-note font-bold leading-[1.45] text-grey">{ligne.detail}</span>}
      <span className="mt-1 break-words text-[18px] font-black tracking-[-0.01em] text-toi-ink tabular-nums">{ligne.label}</span>
    </span>
  );
}

/**
 * Un des deux gestes d’une ligne qui s’appelle ou s’écrit (le 3018) : une pastille de 44 px de haut, son pictogramme
 * devant, chacune à la largeur de son texte (« Écrire en tchat » ne se coupe pas). Sous 360 px, les pictogrammes
 * s’effacent.
 */
const GESTE =
  "flex min-h-11 flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[rgba(26,102,219,0.1)] px-3.5 text-detail font-black text-toi-ink no-underline transition-colors hover:bg-[rgba(26,102,219,0.16)] max-[359px]:px-3 [&>svg]:max-[359px]:hidden";

/** La boîte d’une ligne d’aide dans sa carte. */
const LIGNE = "flex items-center gap-3.5 px-4 py-4 min-[360px]:px-5 ordi:px-8 ordi:py-5";

/**
 * Une ligne d’aide, toute la ligne à un toucher, son geste en rond bleu à droite. Une ligne qui s’appelle ou s’écrit (le
 * 3018, `tchat`) n’est pas un lien entier, un lien ne pouvant en contenir un autre : sous ses textes, deux boutons,
 * « Appeler » et « Écrire en tchat ».
 */
function Ligne({ ligne }: { ligne: LigneDAide }) {
  if (!ligne.tchat)
    return (
      <a href={ligne.lien} {...aCote(ligne.lien)} className={cn("row-hover no-underline", LIGNE)}>
        <TextesDeLaLigne ligne={ligne} />
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[rgba(26,102,219,0.1)] text-toi-ink">
          <Icon name={pictoDe(ligne.lien)} size={20} stroke={2.4} />
        </span>
      </a>
    );
  return (
    <div className={cn(LIGNE, "flex-col items-stretch")}>
      <TextesDeLaLigne ligne={ligne} />
      <span className="mt-1 flex gap-2">
        <a href={ligne.lien} aria-label={`Appeler le ${ligne.label}`} className={GESTE}>
          <Icon name="phone" size={16} stroke={2.5} />
          Appeler
        </a>
        <a href={ligne.tchat} {...aCote(ligne.tchat)} aria-label={`Écrire en tchat au ${ligne.label}`} className={GESTE}>
          <Icon name="imessage" size={16} stroke={2.5} />
          Écrire en tchat
        </a>
      </span>
    </div>
  );
}

/** Le pictogramme et le ton des groupes qui suivent les urgences : l’écoute en vert, les situations en bleu. */
const ALLURES: Record<string, { icone: IconName; ton: "vrai" | "toi" }> = {
  ecoute: { icone: "heart", ton: "vrai" },
  situation: { icone: "shield", ton: "toi" },
};

/** La page : le titre et son chapeau, puis chaque groupe d’aide, sa phrase, ses numéros ; la date de la version. */
export function AideScreen() {
  const [urgences, ...autres] = GROUPES_D_AIDE;
  return (
    <PageEditoriale rubrique={{ nom: PAGE_AIDE.court, chemin: "/aide" }} surLaRubrique fin="pied" ici="/aide">
      <div className={cn(CONTENEUR, "pt-5 min-[360px]:pt-7 ordi:grid ordi:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] ordi:items-start ordi:gap-x-16 ordi:pt-20")}>
        <EnTeteDeConfiance titre={PAGE_AIDE.titre} surligne={PAGE_AIDE.surligne} sous={PAGE_AIDE.sous} className="ordi:sticky ordi:top-32" />

        <div className="mt-6 flex flex-col gap-5 min-[360px]:mt-7 ordi:mt-0 ordi:gap-6">
          {urgences && (
            <section aria-labelledby={urgences.id} className="relative overflow-hidden rounded-[28px] bg-white shadow-card ordi:rounded-[32px]">
              {/* En tête comme la réponse courte d’un guide : le groupe en surtitre rouge, sa phrase à lire d’abord */}
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-danger" />
              <div className="px-4 pt-5 min-[360px]:px-5 ordi:px-8 ordi:pt-8">
                <div className="flex items-center gap-1.5 text-danger">
                  <Icon name="alert" size={17} stroke={2.5} />
                  <h2 id={urgences.id} className="m-0 text-detail font-black ordi:text-corps">
                    {urgences.titre}
                  </h2>
                </div>
                <p className="m-0 mt-2.5 text-[17px] font-extrabold leading-[1.45] text-ink [text-wrap:pretty] ordi:mt-3 ordi:text-[20px] ordi:leading-[1.45]">{urgences.texte}</p>
              </div>
              {/* Les numéros seuls en grands boutons, côte à côte ; puis ceux qui ont leur phrase (le 114 par SMS) */}
              <ul className="m-0 grid list-none grid-cols-3 gap-2 px-4 pb-2 pt-4 min-[360px]:px-5 ordi:gap-3 ordi:px-8 ordi:pt-6">
                {numerosSeuls(urgences.lignes).map((l) => (
                  <li key={l.lien} className="flex">
                    <BoutonDUrgence ligne={l} />
                  </li>
                ))}
              </ul>
              <ul className="m-0 flex list-none flex-col gap-2 px-4 pb-4 min-[360px]:px-5 ordi:px-8 ordi:pb-8">
                {lignesAvecPhrase(urgences.lignes).map((l) => (
                  <li key={l.lien}>
                    <LigneDUrgence ligne={l} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {autres.map((g) => (
            <CarteDeConfiance key={g.id} id={g.id} titre={g.titre} sous={g.texte} {...(ALLURES[g.id] ?? { icone: "shield", ton: "toi" })}>
              <ul className={LIGNES_DE_CARTE}>
                {g.lignes.map((l) => (
                  <li key={l.lien}>
                    <Ligne ligne={l} />
                  </li>
                ))}
              </ul>
            </CarteDeConfiance>
          ))}

          {/* La date de sa version, écrite comme sous un guide (sans point final) : en bas, les numéros passent devant */}
          <p className="m-0 px-1 text-note font-extrabold leading-[1.45] text-grey">
            Mis à jour le <DateEnLettres jour={PAGE_AIDE.misAJourLe} />
          </p>
        </div>
      </div>
    </PageEditoriale>
  );
}
