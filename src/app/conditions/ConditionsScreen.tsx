import { Fragment } from "react";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { MobileTopBar, Screen } from "@/components/shell/Screen";
import { Blocs, EnTeteJuridique, LiensJuridiques, SectionJuridique } from "@/components/juridique/pages";
import { CONDITIONS, PARTIES_CONDITIONS } from "@/contenu/conditions";
import { identiteEditeur } from "@/contenu/mentions-legales";
import { NBSP } from "@/lib/format";

/*
 * Les conditions de BLUSH, d’utilisation puis de vente (leurs textes : src/contenu/conditions.ts). Rendue sur le
 * serveur, comme la page Confidentialité : seul son « Retour » tourne dans le navigateur.
 */

/** La page : deux parties (utiliser BLUSH, acheter), chacune de ses sections en carte, puis qui l’édite et où nous écrire. */
export function ConditionsScreen() {
  return (
    <Screen mobileTop={<MobileTopBar back={{ repli: "/" }} title={CONDITIONS.titre} />} desktopBack={{ target: "/" }} mainWidth={640}>
      <EnTeteJuridique icone="file" titre={CONDITIONS.titre} sous={CONDITIONS.sous} />

      {PARTIES_CONDITIONS.map((partie, k) => (
        <Fragment key={partie.titre}>
          <h2 className={k ? "m-0 mt-8 text-titre-3 font-black tracking-[-0.02em]" : "m-0 text-titre-3 font-black tracking-[-0.02em]"}>{partie.titre}</h2>
          {partie.sections.map((s) => (
            <SectionJuridique key={s.id} id={s.id} titre={s.titre} niveau={3} className="mt-4">
              <Blocs blocs={s.blocs} />
            </SectionJuridique>
          ))}
        </Fragment>
      ))}

      <InsetGroup className="mt-8" footer={CONDITIONS.maj}>
        <InsetRow leading={<RowIcon icon="list" />} title="L’éditeur" sub={identiteEditeur()} href="/mentions-legales" chevron />
        <InsetRow
          leading={<RowIcon icon="mail" tone="toi" />}
          title={<span className="text-toi-ink">Une question{NBSP}? Écris-nous</span>}
          sub="bonjour@askblush.com"
          href="mailto:bonjour@askblush.com"
          chevron
        />
      </InsetGroup>
      <LiensJuridiques ici="/conditions" className="mt-6" />
    </Screen>
  );
}
