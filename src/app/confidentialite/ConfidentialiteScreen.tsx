"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { HeroHeader, InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { Icon } from "@/components/ui/icons";
import { MobileTopBar, Screen } from "@/components/shell/Screen";

/*
 * Ce que BLUSH fait de ta conv, en mots simples. Les faits suivent le code (src/server : chiffrement, purge,
 * hébergement à Francfort). Textes relus le 8 octobre. ⚠ À faire relire par un juriste avant d’ouvrir au public.
 */
const N = " ";

function Ligne({ icone, ton, titre, children }: { icone: Parameters<typeof RowIcon>[0]["icon"]; ton?: Parameters<typeof RowIcon>[0]["tone"]; titre: string; children: ReactNode }) {
  return <InsetRow leading={<RowIcon icon={icone} tone={ton} />} title={titre} sub={children} className="items-start [&>span:first-child]:mt-0.5" />;
}

export function ConfidentialiteScreen() {
  const router = useRouter();
  return (
    <Screen mobileTop={<MobileTopBar back={() => router.back()} title="Confidentialité" />} desktopBack={{ target: "/" }} mainWidth={640}>
      <HeroHeader
        visual={
          <span className="flex size-16 items-center justify-center rounded-full bg-ink shadow-[0_14px_30px_-14px_rgba(17,17,20,0.6)]">
            <Icon name="lock" size={28} color="#FFFFFF" stroke={2.2} />
          </span>
        }
        title="Ta conv, en sécurité."
        sub="Tu nous confies des messages qui comptent. Voilà, sans jargon, ce qui part, qui les lit, et combien de temps on les garde."
        className="mb-6 mt-2"
      />

      <InsetGroup title="Ce que tu nous envoies" id="envoi">
        <Ligne icone="file" ton="toi" titre="Le texte de votre conv">
          Ton export est ouvert sur ton appareil{N}: seuls les messages partent. Les photos, les vidéos et les vocaux ne quittent jamais ton téléphone.
        </Ligne>
        <Ligne icone="photo" ton="elle" titre="Ou des captures, ou un enregistrement de l’écran">
          Les captures sont lues une fois pour en tirer le texte, puis oubliées{N}: on ne garde aucune image. Un enregistrement ne quitte pas ton téléphone{N}: seuls les écrans de la conv en partent, et ils sont lus puis oubliés de la même façon.
        </Ligne>
        <Ligne icone="mail" titre="Ton email">
          Pour ton code de connexion, et pour te prévenir quand ton rapport est prêt. Pas de mot de passe, pas de pub, jamais partagé.
        </Ligne>
      </InsetGroup>

      <InsetGroup title="Qui la lit" id="lecture" className="mt-6">
        <Ligne icone="sparkle" ton="toi" titre="Claude, l’IA d’Anthropic">
          Il lit votre conv pour écrire ton verdict, ton rapport et ses réponses dans le chat. Anthropic ne s’en sert pas pour entraîner ses modèles.
        </Ligne>
        <Ligne icone="sound" ton="elle" titre="La voix de BLUSH">
          Pour le vocal de ton rapport, ElevenLabs reçoit seulement son texte (des prénoms et quelques phrases), jamais ta conv entière.
        </Ligne>
        <Ligne icone="eye" titre="Personne d’autre">
          Personne chez BLUSH ne lit ta conv. Et la personne avec qui tu parles n’est jamais contactée.
        </Ligne>
      </InsetGroup>

      <InsetGroup title="Comment on la protège" id="protection" className="mt-6">
        <Ligne icone="lock" ton="vrai" titre="Chiffrée">
          Tout ce qui vient de ta conv (le texte, ton rapport, sa fiche, le chat) est chiffré avec une clé gardée à part. Sans elle, c’est illisible.
        </Ligne>
        <Ligne icone="cloud" titre="Où ça vit">
          Le site et la base de données sont à Francfort, en Allemagne. L’analyse par Claude passe par les serveurs d’Anthropic, et la voix du vocal par ceux d’ElevenLabs, aux États-Unis.
        </Ligne>
        <Ligne icone="heart" ton="elle" titre="Ce que tu confies au chat">
          Même ce qui est intime (ta santé, ta vie amoureuse) reste dans la mémoire de BLUSH, chiffré, et n’est montré qu’à toi.
        </Ligne>
      </InsetGroup>

      <InsetGroup title="Combien de temps" id="duree" className="mt-6">
        <Ligne icone="trash" titre="La conv brute, effacée après ton rapport">
          Dès que ton rapport et la mémoire de BLUSH sont prêts, sinon au bout de 30{N}jours. Une conv jamais lue est effacée au bout de 24{N}h.
        </Ligne>
        <Ligne icone="list" titre="Ce qui reste, tant que tu le gardes">
          Ton rapport, son vocal, sa fiche et ton chat, chiffrés. Tu les supprimes quand tu veux, dans ton compte{N}: tout part, vraiment.
        </Ligne>
      </InsetGroup>

      <InsetGroup title="Nos prestataires" id="prestataires" className="mt-6" footer="BLUSH est réservé aux plus de 18 ans. Dernière mise à jour : 8 octobre 2026.">
        <InsetRow title="Vercel" sub="L’hébergement du site, à Francfort" />
        <InsetRow title="Neon" sub="La base de données, à Francfort" />
        <InsetRow title="Anthropic" sub="Claude, l’IA qui lit ta conv, aux États-Unis" />
        {/* ElevenLabs reçoit le script du vocal (des prénoms et quelques phrases de la conv), pas la conv : src/server/ia/voix.ts */}
        <InsetRow title="ElevenLabs" sub="La voix du vocal de ton rapport, aux États-Unis" />
        <InsetRow title="Resend" sub="L’envoi des mails (ton code, ton rapport prêt)" />
        <InsetRow leading={<RowIcon icon="mail" tone="toi" />} title={<span className="text-toi-ink">Une question{N}? Écris-nous</span>} sub="bonjour@askblush.com" href="mailto:bonjour@askblush.com" chevron />
      </InsetGroup>
    </Screen>
  );
}
