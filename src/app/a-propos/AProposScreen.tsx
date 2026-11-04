import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CONTENEUR, GRILLE_DE_LECTURE, PageEditoriale } from "@/components/article/cadre";
import { DansCeGuide, Intertitre, LigneDeFiche, TexteDeSection, TitreDeBloc, type EntreeDuSommaire } from "@/components/article/texte";
import { ROSE_VIF } from "@/components/article/titre";
import { CarteDeConfiance, EnTeteDeConfiance, LigneVers, LIGNES, LIGNES_DE_CARTE } from "@/components/juridique/confiance";
import { Icon } from "@/components/ui/icons";
import { articlesDu, RUBRIQUES } from "@/contenu/articles";
import { PAS_UN_CONSEIL, sectionDesConditions } from "@/contenu/conditions";
import { FEUILLE_CONFIDENTIALITE, PROMESSE_CONV, PROMESSE_DONNEES, PROMESSE_EFFACEMENT, PROMESSE_LIEU } from "@/contenu/confidentialite";
import { COMPTES_OFFICIELS, nomDuCompte, PHRASE_D_IDENTITE } from "@/contenu/identite";
import { A_COMPLETER, EDITEUR, lignesEditeur } from "@/contenu/mentions-legales";
import { A_PROPOS, METHODE, PAGE_AIDE } from "@/contenu/pages-de-confiance";

/*
 * /a-propos, rendue sur le serveur dans l’habit des guides (le cadre « Magazine ») : le grand titre (BLUSH dans sa bulle
 * rose), le chapeau et la signature, puis, dans la colonne de lecture (le sommaire collé à gauche sur un ordinateur) :
 * BLUSH en bref (sa phrase, telle quelle, en tête comme la réponse courte d’un guide), ce qu’il est et n’est pas (repris
 * des conditions), les promesses sur ta conv (reprises de src/contenu/confidentialite.ts), qui l’édite (les champs de
 * src/contenu/mentions-legales.ts, comme sur les mentions légales), où nous écrire et son compte officiel, les pages
 * voisines (en lignes, dans une carte), et la fin rose de la landing. Aucune phrase sur BLUSH ou son éditeur n’est écrite ici : elles viennent toutes
 * de src/contenu. Pas d’histoire du fondateur, ni de chiffre, ni de date de création : rien de tout ça n’est dans le code.
 */

/** « Une lecture, pas un conseil », la section des conditions : son titre, et PAS_UN_CONSEIL sans la phrase sur l’IA. */
const CONSEIL = sectionDesConditions("conseil");
/** « Dès 15 ans », la section des conditions, telle quelle. */
const AGE = sectionDesConditions("age");

/**
 * Les promesses sur ta conv, telles que les écrans les disent (src/contenu/confidentialite.ts) : chiffrée, lue par BLUSH
 * et effacée, pas d’entraînement, l’autre jamais contacté, où ça vit, tout effacer. Pas la ligne « Chiffrée » de la
 * feuille du rapport (FEUILLE_CONFIDENTIALITE.chiffree) : PROMESSE_CONV dit déjà « chiffrée », le détail est sur la page
 * Confidentialité.
 */
const PROMESSES = [PROMESSE_CONV, PROMESSE_DONNEES, FEUILLE_CONFIDENTIALITE.partage.detail, PROMESSE_LIEU, PROMESSE_EFFACEMENT];

/** Les blocs de la page, dans l’ordre : leurs ancres et leurs titres, que le sommaire reprend. */
const BLOCS = [
  { id: "en-bref", titre: A_PROPOS.enBref },
  /* Les ancres des sections des conditions, les mêmes que là-bas (sectionDesConditions les cherche par elles) */
  { id: "conseil", titre: CONSEIL.titre },
  { id: "age", titre: AGE.titre },
  { id: "conv", titre: A_PROPOS.conv },
  { id: "editeur", titre: A_PROPOS.editeur },
  { id: "contact", titre: A_PROPOS.contact },
  { id: "plus-loin", titre: A_PROPOS.plusLoin },
] as const;

/** Le rang d’un bloc dans la page (son data-section, que le sommaire allume). */
const rang = (id: (typeof BLOCS)[number]["id"]) => BLOCS.findIndex((b) => b.id === id) + 1;

/** Une page voisine, en ligne sous « Pour aller plus loin » : la ligne qui y mène. */
type Voisine = ComponentProps<typeof LigneVers>;

/**
 * Un bloc de la colonne de lecture : à droite du sommaire sur un ordinateur, de l’air au-dessus, en rembourrage et non
 * en marge : les blocs se touchent, et la bande où le sommaire lit le bloc en cours ne tombe jamais entre deux.
 */
const DANS_LA_COLONNE = "pt-14 ordi:col-start-2 ordi:pt-20";

/** Un bloc de la colonne qui est une carte : l’air au-dessus, son rang pour le sommaire (data-section), et la carte. */
function BlocEnCarte({ id, children }: { id: (typeof BLOCS)[number]["id"]; children: ReactNode }) {
  return (
    <div data-section={rang(id)} className={DANS_LA_COLONNE}>
      {children}
    </div>
  );
}

/** Une section de texte des conditions, telle quelle : son intertitre, puis ses paragraphes (la première phrase en attaque). */
function SectionDeTexte({ id, titre, blocs }: { id: (typeof BLOCS)[number]["id"]; titre: string; blocs: readonly string[] }) {
  return (
    <section aria-labelledby={id} data-section={rang(id)} className={DANS_LA_COLONNE}>
      <Intertitre id={id} numero={null}>
        {titre}
      </Intertitre>
      <TexteDeSection morceaux={blocs.map((texte) => ({ type: "paragraphe", texte }))} />
    </section>
  );
}

/** La page : BLUSH en bref, ce qu’il est et n’est pas, ta conv, son éditeur, où nous écrire, les pages voisines (sous leur nom court). */
export function AProposScreen() {
  const rubriques = (["guide", "lexique"] as const).filter((genre) => articlesDu(genre).length > 0);
  const entrees: EntreeDuSommaire[] = BLOCS.map((b, k) => ({ id: b.id, titre: b.titre, rang: k + 1 }));
  return (
    <PageEditoriale rubrique={{ nom: A_PROPOS.court, chemin: "/a-propos" }} surLaRubrique fin="vente" bouton={false} ici="/a-propos">
      <EnTeteDeConfiance titre={A_PROPOS.titre} surligne={A_PROPOS.surligne} sous={A_PROPOS.sous} misAJourLe={A_PROPOS.misAJourLe} className={cn(CONTENEUR, "pt-8 ordi:pt-20")} />

      <div data-lecture="" className={cn(CONTENEUR, GRILLE_DE_LECTURE, "mt-10 ordi:mt-20")}>
        {/* BLUSH en bref, en tête comme la réponse courte d’un guide : sa phrase, telle quelle */}
        <section
          aria-labelledby="en-bref"
          data-section={rang("en-bref")}
          className="relative overflow-hidden rounded-[28px] bg-white px-6 pb-7 pt-6 shadow-card ordi:col-start-2 ordi:rounded-[32px] ordi:px-10 ordi:pb-10 ordi:pt-9"
        >
          <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-[3px]", ROSE_VIF)} />
          <h2 id="en-bref" className="m-0 scroll-mt-32 text-note font-black text-elle-ink">
            {A_PROPOS.enBref}
          </h2>
          <p className="m-0 mt-3 text-[19px] font-extrabold leading-[1.55] tracking-[-0.005em] text-ink [text-wrap:pretty] ordi:mt-4 ordi:text-[22px] ordi:leading-[1.5]">
            {PHRASE_D_IDENTITE}
          </p>
        </section>

        {/* Sur un ordinateur, le sommaire collé à gauche de la lecture ; sur un téléphone, rien de plus à empiler */}
        <div className="hidden ordi:col-start-1 ordi:row-start-1 ordi:block" style={{ gridRowEnd: `span ${entrees.length + 1}` }}>
          <DansCeGuide titre="Dans cette page" entrees={entrees} className="ordi:sticky ordi:top-28" />
        </div>

        <SectionDeTexte id="conseil" titre={CONSEIL.titre} blocs={[PAS_UN_CONSEIL]} />
        <SectionDeTexte id="age" titre={AGE.titre} blocs={AGE.blocs.filter((b) => typeof b === "string")} />

        <BlocEnCarte id="conv">
          <CarteDeConfiance id="conv" titre={A_PROPOS.conv} sous={A_PROPOS.convSous} icone="lock" ton="vrai">
            <ul className={LIGNES_DE_CARTE}>
              {PROMESSES.map((p) => (
                <li key={p} className="flex gap-3.5 px-4 py-4 text-[16px] font-extrabold leading-[1.5] text-ink min-[360px]:px-5 ordi:px-8 ordi:text-[17px]">
                  <span aria-hidden="true" className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[rgba(18,192,138,0.13)] text-vrai-ink">
                    <Icon name="check" size={14} stroke={3} />
                  </span>
                  <span>{p}</span>
                </li>
              ))}
              <li>
                <LigneVers href="/confidentialite" icone="shield" ton="vrai" titre={A_PROPOS.confidentialite} />
              </li>
            </ul>
          </CarteDeConfiance>
        </BlocEnCarte>

        <BlocEnCarte id="editeur">
          <CarteDeConfiance id="editeur" titre={A_PROPOS.editeur} sous={A_PROPOS.editeurSous} icone="user">
            <dl className="m-0 mt-3 border-t border-sep px-4 text-[15.5px] font-bold leading-[1.5] text-ink min-[360px]:px-5 ordi:mt-5 ordi:px-8">
              {/* Sans le directeur de la publication : son nom reste dans les mentions légales seulement (sa décision du 4 novembre 2026) */}
              {lignesEditeur()
                .filter((l) => l.lien !== "mailto" && l.libelle !== "Directeur de la publication")
                .map(({ libelle, valeur }) => (
                  <LigneDeFiche key={libelle} titre={libelle}>
                    {valeur ?? <span className="italic text-grey">{A_COMPLETER}</span>}
                  </LigneDeFiche>
                ))}
            </dl>
            <div className="border-t border-sep">
              <LigneVers href="/mentions-legales" icone="list" titre={A_PROPOS.mentions} />
            </div>
          </CarteDeConfiance>
        </BlocEnCarte>

        <BlocEnCarte id="contact">
          <CarteDeConfiance id="contact" titre={A_PROPOS.contact} sous={A_PROPOS.contactSous} icone="mail" ton="toi">
            <ul className={LIGNES_DE_CARTE}>
              <li>
                <LigneVers href={`mailto:${EDITEUR.email}`} icone="mail" ton="toi" titre={A_PROPOS.ecrire} sous={EDITEUR.email} />
              </li>
              {COMPTES_OFFICIELS.map((c) => (
                <li key={c.url}>
                  <LigneVers href={c.url} icone="instagram" ton="elle" titre={c.reseau} sous={nomDuCompte(c.url)} />
                </li>
              ))}
            </ul>
          </CarteDeConfiance>
        </BlocEnCarte>

        {/* Les pages voisines en lignes, dans une seule carte : deux, trois ou quatre, sans rangée à moitié vide, chacune son pictogramme */}
        <section aria-labelledby="plus-loin" data-section={rang("plus-loin")} className={DANS_LA_COLONNE}>
          <TitreDeBloc id="plus-loin" titre={A_PROPOS.plusLoin} sous={A_PROPOS.plusLoinSous} grand={false} />
          <ul className={cn(LIGNES, "mt-6 overflow-hidden rounded-[26px] bg-white shadow-card ordi:rounded-[32px]")}>
            {[
              { href: "/methode", icone: "pencil", ton: "elle", titre: METHODE.court, sous: METHODE.sous } satisfies Voisine,
              { href: "/aide", icone: "phone", ton: "vrai", titre: PAGE_AIDE.court, sous: PAGE_AIDE.sous } satisfies Voisine,
              ...rubriques.map((genre): Voisine => ({
                href: RUBRIQUES[genre].chemin,
                icone: genre === "guide" ? "file" : "list",
                ton: "toi",
                titre: RUBRIQUES[genre].nom,
                sous: RUBRIQUES[genre].sous,
              })),
            ].map((v) => (
              <li key={v.href}>
                <LigneVers {...v} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageEditoriale>
  );
}
