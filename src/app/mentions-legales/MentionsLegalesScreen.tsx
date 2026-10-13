import { InsetGroup, InsetRow } from "@/components/ui/inset";
import { MobileTopBar, Screen } from "@/components/shell/Screen";
import { EnTeteJuridique, LiensJuridiques, SectionJuridique } from "@/components/juridique/pages";
import { A_COMPLETER, EDITEUR, HEBERGEUR, lignesEditeur, MENTIONS } from "@/contenu/mentions-legales";
import { NBSP } from "@/lib/format";

/*
 * Les mentions légales (leurs textes et l’identité de l’éditeur : src/contenu/mentions-legales.ts). Rendue sur le
 * serveur. L’éditeur n’a que les lignes de ses champs remplis (lignesEditeur) ; un champ exigé encore vide se lit « À
 * compléter », et la production reste alors fermée au public (champsEditeurManquants). Le médiateur n’a sa section que
 * si l’éditeur en a un.
 */

/** Un champ exigé, ou « À compléter » en italique s’il est vide. */
const valeur = (texte: string | null) => texte ?? <span className="italic">{A_COMPLETER}</span>;

/** La page : l’éditeur, l’hébergeur, le médiateur s’il y en a un, la marque, puis les autres pages légales. */
export function MentionsLegalesScreen() {
  const mediateur = EDITEUR.mediateur.trim();
  return (
    <Screen mobileTop={<MobileTopBar back={{ repli: "/" }} title={MENTIONS.titre} />} desktopBack={{ target: "/" }} mainWidth={640}>
      <EnTeteJuridique icone="list" titre={MENTIONS.titre} sous={MENTIONS.sous} />

      <InsetGroup title="L’éditeur" id="editeur">
        {lignesEditeur().map(({ libelle, valeur: texte, lien }) =>
          lien === "mailto" && texte ? (
            <InsetRow key={libelle} title={libelle} sub={texte} href={`mailto:${texte}`} chevron />
          ) : (
            <InsetRow key={libelle} title={libelle} sub={valeur(texte)} />
          ),
        )}
      </InsetGroup>

      <InsetGroup title="L’hébergeur" id="hebergeur" className="mt-6">
        <InsetRow title={HEBERGEUR.nom} sub={`${HEBERGEUR.adresse} · ${HEBERGEUR.site}`} />
      </InsetGroup>

      {mediateur && (
        <SectionJuridique id="mediateur" titre="Un désaccord" className="mt-6">
          <p className="m-0">
            {MENTIONS.mediateur}
            {NBSP}: {mediateur}.
          </p>
        </SectionJuridique>
      )}

      <SectionJuridique id="donnees" titre="Tes données, la marque" className="mt-6">
        <p className="m-0">{MENTIONS.donnees}</p>
        <p className="m-0">{MENTIONS.marque}</p>
      </SectionJuridique>

      <p className="m-0 mt-2 px-4 text-[12.5px] font-extrabold leading-[1.45] text-grey">{MENTIONS.maj}</p>
      <LiensJuridiques ici="/mentions-legales" className="mt-6" />
    </Screen>
  );
}
