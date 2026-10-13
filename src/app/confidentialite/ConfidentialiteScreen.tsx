import type { ReactNode } from "react";
import { HeroHeader, InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { Icon } from "@/components/ui/icons";
import { MobileTopBar, Screen } from "@/components/shell/Screen";
import { LiensJuridiques } from "@/components/juridique/pages";
import { NBSP } from "@/lib/format";

/*
 * Ce que BLUSH fait de ta conv, en mots simples. Les faits suivent le code (src/server : chiffrement, purge,
 * hébergement à Francfort). Textes relus le 8 octobre. Les promesses courtes des écrans (src/contenu/confidentialite.ts)
 * la résument : un changement ici se reporte là-bas.
 * TODO(produit): à faire relire par un juriste avant d’ouvrir au public.
 * TODO(produit): lignes ajoutées le 12 octobre 2026 pour le lancement, à valider : le paiement par Whop (ce qu’il voit),
 * la vérification anti-robots de Cloudflare, le mail de rappel d’un paiement pas terminé, tes achats. « Ton email » ne
 * dit plus « pas de pub, jamais partagé » (Whop le reçoit pour ton reçu, Resend pour les mails, et le rappel parle d’une offre) ; la promesse
 * courte « Ton email n’est jamais partagé » (src/contenu/confidentialite.ts) est à revoir avec lui.
 */

function Ligne({ icone, ton, titre, children }: { icone: Parameters<typeof RowIcon>[0]["icon"]; ton?: Parameters<typeof RowIcon>[0]["tone"]; titre: string; children: ReactNode }) {
  return <InsetRow leading={<RowIcon icon={icone} tone={ton} />} title={titre} sub={children} className="items-start [&>span:first-child]:mt-0.5" />;
}

/** La page, rendue sur le serveur : seul son « Retour » tourne dans le navigateur (la page d’avant, ou la landing). */
export function ConfidentialiteScreen() {
  return (
    <Screen mobileTop={<MobileTopBar back={{ repli: "/" }} title="Confidentialité" />} desktopBack={{ target: "/" }} mainWidth={640}>
      <HeroHeader
        visual={
          <span className="flex size-16 items-center justify-center rounded-full bg-ink shadow-[0_14px_30px_-14px_rgba(17,17,20,0.6)]">
            <Icon name="lock" size={28} stroke={2.2} className="text-white" />
          </span>
        }
        title="Ta conv, en sécurité."
        sub="Tu nous confies des messages qui comptent. Voilà, sans jargon, ce qui part, qui les lit, et combien de temps on les garde."
        className="mb-6 mt-2"
      />

      <InsetGroup title="Ce que tu nous envoies" id="envoi">
        <Ligne icone="file" ton="toi" titre="Le texte de votre conv">
          Ton export est ouvert sur ton appareil{NBSP}: seuls les messages partent. Les photos, les vidéos et les vocaux ne quittent jamais ton téléphone.
        </Ligne>
        <Ligne icone="photo" ton="elle" titre="Ou des captures, ou un enregistrement de l’écran">
          Les captures sont lues une fois pour en tirer le texte, puis oubliées{NBSP}: on ne garde aucune image. Un enregistrement ne quitte pas ton téléphone{NBSP}: seuls les
          écrans de la conv en partent, et ils sont lus puis oubliés de la même façon.
        </Ligne>
        {/* Resend l’envoie (les mails) et Whop le reçoit (le reçu) : « il ne part que chez Whop » contredisait la liste des prestataires, plus bas */}
        <Ligne icone="mail" titre="Ton email">
          Pour ton code de connexion, et pour te prévenir quand ton rapport est prêt. Pas de mot de passe, jamais vendu. Il ne sort de BLUSH que pour t’écrire (Resend) et, quand tu
          paies, pour ton reçu (Whop).
        </Ligne>
        {/* Le mail ② du lot « prêt à lancer » : une offre unique, deux heures après une feuille du paiement ouverte sans payer */}
        <Ligne icone="clock" titre="Un rappel, une seule fois">
          Si tu ouvres le paiement sans aller au bout, BLUSH peut t’envoyer un mail deux heures après, une seule fois. Rien de ta conv, aucun prénom, et un lien pour ne plus en
          recevoir.
        </Ligne>
      </InsetGroup>

      <InsetGroup title="Qui la lit" id="lecture" className="mt-6">
        {/* Les prestataires d’IA et de voix ne sont pas nommés (choix du 9 octobre 2026) : leur rôle, et où ils sont, suffisent. Les autres (l’hébergement, la base, les mails) le sont, plus bas */}
        <Ligne icone="sparkle" ton="toi" titre="Une IA, et seulement elle">
          Elle lit votre conv pour écrire ton verdict, ton rapport et ses réponses dans le chat. Notre prestataire d’IA ne s’en sert pas pour entraîner ses modèles.
        </Ligne>
        <Ligne icone="sound" ton="elle" titre="La voix de BLUSH">
          Pour les vocaux de BLUSH (ton rapport, ses réponses dans le chat), notre prestataire de voix reçoit seulement leur texte, jamais ta conv entière. Tes vocaux à toi passent
          aussi par lui, le temps d’être transcrits{NBSP}: BLUSH ne garde pas le son, seulement le texte, chiffré.
        </Ligne>
        <Ligne icone="eye" titre="Personne d’autre">
          Personne chez BLUSH ne lit ta conv. Et la personne avec qui tu parles n’est jamais contactée.
        </Ligne>
        {/*
         * Le lien ne montre que le verdict ; l’image, une réponse du chat (avec ta question) ou la chute d’un chapitre. Les deux
         * sont masqués par le serveur (src/server/partages.ts). Ligne ajoutée et validée le 12 octobre 2026.
         */}
        <Ligne icone="share" ton="elle" titre="Rien ne sort sans toi">
          Tu choisis ce que tu partages{NBSP}: ton verdict, par un lien, ou en image une réponse de BLUSH (avec ta question) ou un passage de ton rapport. Son prénom y devient une
          initiale, le tien reste. Ta conv entière ne part jamais.
        </Ligne>
      </InsetGroup>

      <InsetGroup title="Comment on la protège" id="protection" className="mt-6">
        <Ligne icone="lock" ton="vrai" titre="Chiffrée">
          Tout ce qui vient de ta conv (le texte, ton rapport, sa fiche, le chat) est chiffré avec une clé gardée à part. Sans elle, c’est illisible.
        </Ligne>
        <Ligne icone="cloud" titre="Où ça vit">
          Le site et la base de données sont à Francfort, en Allemagne. L’analyse par l’IA et les vocaux passent par les serveurs de nos prestataires, aux États-Unis.
        </Ligne>
        <Ligne icone="heart" ton="elle" titre="Ce que tu confies au chat">
          Même ce qui est intime (ta santé, ta vie amoureuse) reste dans la mémoire de BLUSH, chiffré, et n’est montré qu’à toi.
        </Ligne>
        {/* L’accord de l’import (src/contenu/consentements.ts) : gardé avec la conv, son heure et sa version (src/server/juridique.ts) */}
        <Ligne icone="check" ton="vrai" titre="Ton accord, avant chaque conv">
          Avant d’importer une conv, tu acceptes que BLUSH la lise en entier, même ce qu’elle dit d’intime. BLUSH garde la date de cet accord avec la conv.
        </Ligne>
        <Ligne icone="shield" titre="Pas de robots">
          Avant d’envoyer un code de connexion, ou une conv sans compte, Cloudflare vérifie que tu n’es pas un robot, le plus souvent sans rien te demander. Il voit ton adresse IP
          et ton navigateur, jamais ta conv.
        </Ligne>
      </InsetGroup>

      {/* Whop est vendeur en titre (le lot « prêt à lancer ») : il reçoit l’id de l’achat, l’email du compte et le montant, jamais la conv ni un prénom */}
      <InsetGroup title="Quand tu paies" id="paiement" className="mt-6">
        <Ligne icone="bolt" ton="toi" titre="Whop, pour le paiement">
          Whop encaisse en son nom et t’envoie ton reçu. Il reçoit ton email, le montant et un numéro de commande{NBSP}: jamais ta conv, ni un prénom. Ta carte, BLUSH ne la voit
          jamais.
        </Ligne>
      </InsetGroup>

      <InsetGroup title="Combien de temps" id="duree" className="mt-6">
        <Ligne icone="trash" titre="La conv brute, effacée après ton rapport">
          Dès que ton rapport et la mémoire de BLUSH sont prêts. Tant que ton rapport n’est pas débloqué, elle reste gardée, chiffrée, pour pouvoir l’écrire{NBSP}: tu la supprimes
          quand tu veux, dans ton compte. Une conv jamais lue est effacée au bout de 24{NBSP}h.
        </Ligne>
        <Ligne icone="list" titre="Ce qui reste, tant que tu le gardes">
          Ton rapport, son vocal, sa fiche et ton chat, chiffrés. Tu les supprimes quand tu veux, dans ton compte{NBSP}: tout part, vraiment.
        </Ligne>
        {/* La durée suit ATTENTE_GARDEE_JOURS (S-30, src/server/attente.ts) */}
        <Ligne icone="mail" titre="Ton email sur la liste d’attente">
          Chiffré, et gardé un an au plus. Tu t’en retires avec le lien de son mail, et «{NBSP}Tout effacer{NBSP}» l’efface aussi.
        </Ligne>
        {/* TODO(produit): ce que deviennent les achats à « Tout effacer », et ce que la loi oblige à garder (juriste) */}
        <Ligne icone="file" titre="Tes achats">
          La date, l’offre, le montant et ce qu’il est devenu (payé, remboursé), sans rien de ta conv, tant que ton compte existe. Whop garde ses reçus de son côté.
        </Ligne>
      </InsetGroup>

      <InsetGroup title="Nos prestataires" id="prestataires" className="mt-6" footer={`BLUSH est ouvert dès 15 ans. Dernière mise à jour\u00a0: 13 octobre 2026.`}>
        <InsetRow title="Vercel" sub="L’hébergement du site, à Francfort" />
        <InsetRow title="Neon" sub="La base de données, à Francfort" />
        <InsetRow title="Un prestataire d’IA" sub="L’IA qui lit ta conv, aux États-Unis" />
        {/* ElevenLabs reçoit le script du vocal (des prénoms et quelques phrases de la conv), pas la conv : src/server/ia/voix.ts */}
        <InsetRow title="Un prestataire de voix" sub="La voix de BLUSH, et la transcription de tes vocaux, aux États-Unis" />
        <InsetRow title="Resend" sub="L’envoi des mails (ton code, ton rapport prêt, le rappel d’un paiement, la liste d’attente)" />
        {/* TODO(produit): vérifier où Whop et Cloudflare traitent ces données (leurs conditions) */}
        <InsetRow title="Whop" sub="Le paiement, qu’il encaisse en son nom (vendeur en titre), aux États-Unis" />
        {/* Le CAPTCHA (src/server/captcha.ts) : Cloudflare voit l’adresse IP et le navigateur, jamais la conv (« Pas de robots », plus haut) */}
        <InsetRow title="Cloudflare" sub="La vérification anti-robots, aux États-Unis" />
        <InsetRow
          leading={<RowIcon icon="mail" tone="toi" />}
          title={<span className="text-toi-ink">Une question{NBSP}? Écris-nous</span>}
          sub="bonjour@askblush.com"
          href="mailto:bonjour@askblush.com"
          chevron
        />
      </InsetGroup>
      <LiensJuridiques ici="/confidentialite" className="mt-6" />
    </Screen>
  );
}
