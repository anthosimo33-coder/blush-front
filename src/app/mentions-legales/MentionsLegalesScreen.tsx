import { InsetGroup, InsetRow } from "@/components/ui/inset";
import { MobileTopBar, Screen } from "@/components/shell/Screen";
import { EnTeteJuridique, LiensJuridiques, SectionJuridique } from "@/components/juridique/pages";
import { A_COMPLETER, CHAMPS_EDITEUR, EDITEUR, HEBERGEUR, MENTIONS } from "@/contenu/mentions-legales";
import { NBSP } from "@/lib/format";

/*
 * Les mentions légales (leurs textes et l’identité de l’éditeur : src/contenu/mentions-legales.ts). Rendue sur le
 * serveur. Un champ de l’éditeur encore vide se lit « À compléter » : la production ne s’ouvre pas au public tant qu’il
 * en reste un (editeurComplet, src/server/juridique.ts).
 */

/** Un champ, ou « À compléter » en gris s’il est vide. */
const valeur = (texte: string) => texte.trim() || <span className="italic">{A_COMPLETER}</span>;

/** La page : l’éditeur, l’hébergeur, le médiateur, la marque, puis les autres pages légales. */
export function MentionsLegalesScreen() {
  return (
    <Screen mobileTop={<MobileTopBar back={{ repli: "/" }} title={MENTIONS.titre} />} desktopBack={{ target: "/" }} mainWidth={640}>
      <EnTeteJuridique icone="list" titre={MENTIONS.titre} sous={MENTIONS.sous} />

      <InsetGroup title="L’éditeur" id="editeur">
        {CHAMPS_EDITEUR.map(({ cle, libelle }) =>
          cle === "email" ? (
            <InsetRow key={cle} title={libelle} sub={EDITEUR.email} href={`mailto:${EDITEUR.email}`} chevron />
          ) : (
            <InsetRow key={cle} title={libelle} sub={valeur(EDITEUR[cle])} />
          ),
        )}
      </InsetGroup>

      <InsetGroup title="L’hébergeur" id="hebergeur" className="mt-6">
        <InsetRow title={HEBERGEUR.nom} sub={`${HEBERGEUR.adresse} · ${HEBERGEUR.site}`} />
      </InsetGroup>

      <SectionJuridique id="mediateur" titre="Un désaccord" className="mt-6">
        <p className="m-0">
          {MENTIONS.mediateur}
          {NBSP}: {valeur(EDITEUR.mediateur)}.
        </p>
      </SectionJuridique>

      <SectionJuridique id="donnees" titre="Tes données, la marque" className="mt-6">
        <p className="m-0">{MENTIONS.donnees}</p>
        <p className="m-0">{MENTIONS.marque}</p>
      </SectionJuridique>

      <p className="m-0 mt-2 px-4 text-[12.5px] font-extrabold leading-[1.45] text-grey">{MENTIONS.maj}</p>
      <LiensJuridiques ici="/mentions-legales" className="mt-6" />
    </Screen>
  );
}
