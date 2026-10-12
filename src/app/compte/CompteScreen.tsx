"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FRAIS_DU_RENDU } from "@/lib/query";
import { changerDeConv, useCompte } from "@/lib/requetes";
import { play, setSoundsEnabled, useSoundsEnabled } from "@/lib/sound";
import { tracer } from "@/lib/tracer";
import { deleteAccount, deleteStory, seDeconnecter } from "@/services/api";
import type { Account } from "@/types/api";
import { PROMESSE_CONV, PROMESSE_DONNEES, PROMESSE_EFFACEMENT, PROMESSE_LIEU } from "@/contenu/confidentialite";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/controls";
import { Alert, TypingDots } from "@/components/ui/feedback";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { NotePrivee } from "@/components/ui/NotePrivee";
import { Sheet } from "@/components/ui/surfaces";
import { AppScreen } from "@/components/shell/AppScreen";
import { MobileTopBar } from "@/components/shell/Screen";
import { resetJourney } from "@/state/journey";
import type { ConvSummary, Person } from "@/types";
import { useRetourSinon } from "@/lib/navigation";

/* La feuille ouverte : ce que BLUSH garde, une suppression (l’histoire, tout), ou une déconnexion (cet appareil, partout) */
type Confirm = "keep" | "story" | "all" | "sortie" | "partout" | null;

/** Se déconnecter n’efface rien : dit une fois, sous « Ta connexion » et dans ses deux feuilles. */
const RIEN_N_EST_EFFACE = "Tes histoires restent gardées\u00a0: ton email et un code suffisent pour les retrouver.";

/*
 * Écran 20 — Mon compte, à la manière des Réglages : toi en haut, tes histoires, tes bulles, l’app, ta connexion (se
 * déconnecter), puis tes données (les gestes qui effacent en rouge).
 */
export type NomsDuCompte = { me: Person; other: Person; period: string };

/**
 * `convs` : toutes les convs du compte, quand il y en a plusieurs (sinon, celle de `noms`).
 * `compte` : le compte lu par la page serveur à l’heure `rendu` : ses bulles sont là dès l’affichage, rien ne descend
 * ensuite, et il n’est pas relu tout de suite.
 */
export function CompteScreen({ noms, convs = [], compte, rendu }: { noms: NomsDuCompte | null; convs?: ConvSummary[]; compte?: Account | null; rendu?: number }) {
  const router = useRouter();
  const { data: account } = useCompte(compte ?? undefined, { rendu, frais: FRAIS_DU_RENDU });
  /* L’accueil s’ouvre : la ligne touchée le montre jusqu’à son arrivée. Sans remise en haut : il s’ouvre sur le dernier échange */
  const [ouverture, demarrer] = useTransition();
  const [ouverte, setOuverte] = useState<string | null>(null);
  const versAccueil = () => demarrer(() => router.push("/app", { scroll: false }));
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const sons = useSoundsEnabled();

  /* La page d’avant ; ouvert d’ailleurs (un lien, un nouvel onglet, un retour du système), l’accueil, comme versAccueil */
  const retourSinon = useRetourSinon("/app", { scroll: false });
  const retour = () => demarrer(retourSinon);

  /* Un geste qui n’a pas abouti (réseau, serveur) : on le dit dans la feuille, et le bouton se libère pour réessayer */
  const [souci, setSouci] = useState<string | null>(null);
  const fermer = () => {
    setConfirm(null);
    setSouci(null);
  };
  const run = async (fn: () => Promise<void>, after: () => void) => {
    setBusy(true);
    setSouci(null);
    try {
      await fn();
    } catch (e) {
      tracer("compte:geste", e);
      setBusy(false);
      setSouci("Ça n’a pas marché. Vérifie ta connexion et réessaie.");
      return;
    }
    setBusy(false);
    setConfirm(null);
    after();
  };

  return (
    <AppScreen
      srTitle="Mon compte"
      aside={null}
      mise="etroit"
      contentGap={0}
      mobileTop={<MobileTopBar back={retour} title="Mon compte" />}
      desktopBack={{ target: retour, trailing: "Mon compte" }}
    >
      {/* Toi, en haut, comme en tête des Réglages */}
      <div className="flex flex-col items-center pt-2 text-center">
        <span
          aria-hidden="true"
          className="flex size-[76px] items-center justify-center rounded-full text-titre-2 font-black text-white"
          style={{ background: "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.42), rgba(255,255,255,0) 58%), var(--toi)" }}
        >
          {noms?.me.initial ?? account?.email?.[0]?.toUpperCase()}
        </span>
        {noms && <div className="mt-3 text-titre-3 font-black leading-none tracking-[-0.01em]">{noms.me.name}</div>}
        {account?.email && <div className="mt-1.5 text-note font-extrabold text-grey">{account.email}</div>}
      </div>

      {/* Tes histoires : celle en cours (ou toutes, s’il y en a plusieurs), et de quoi en commencer une autre */}
      <InsetGroup title="Tes histoires" id="histoires" className="mt-7">
        {convs.length > 1 &&
          convs.map((c) => (
            <InsetRow
              key={c.storyId}
              leading={
                <Avatar tone="elle" size={36} fontSize={15} className="lift-pop">
                  {c.person.initial}
                </Avatar>
              }
              title={`${c.person.name} et toi`}
              sub={c.current ? "Ouverte sur l’accueil" : c.lastLabel}
              onClick={() => {
                if (ouverture) return;
                changerDeConv(c.storyId, router);
                setOuverte(c.storyId);
                versAccueil();
              }}
              trailing={ouverture && ouverte === c.storyId ? <TypingDots size={5} label="Ouverture de la conv" /> : undefined}
              chevron={!(ouverture && ouverte === c.storyId)}
            />
          ))}
        {convs.length <= 1 && !account?.storyDeleted && noms && (
          <InsetRow
            leading={
              <Avatar tone="elle" size={36} fontSize={15} className="lift-pop">
                {noms.other.initial}
              </Avatar>
            }
            title={`${noms.other.name} et toi`}
            sub={noms.period}
            href="/app"
            scroll={false}
            chevron
          />
        )}
        <InsetRow
          leading={<RowIcon icon="plus" tone="vrai" />}
          title={<span className="text-toi-ink">Nouvelle histoire</span>}
          sub="Une autre conv, un autre rapport"
          href="/commencer"
        />
      </InsetGroup>

      {/*
       * Tes bulles : le solde (illimitées pour l’équipe). La recharge, « C’est quoi une bulle ? » et la liste des achats
       * viennent avec les écrans des bulles. TODO(produit): le texte de l’équipe (« illimitées »), pas encore décidé
       */}
      <InsetGroup title="Tes bulles" id="bulles" className="mt-6">
        <InsetRow
          leading={<RowIcon icon="bolt" tone="elle" />}
          title={account ? (account.equipe ? "Tes bulles\u00a0: illimitées" : `Tes bulles\u00a0: ${account.bulles}`) : "Tes bulles"}
          sub="1 bulle = 1 réponse de BLUSH · elles n’expirent jamais"
        />
        {/* Aucun rapport débloqué : la suite du rapport ouvert, à payer */}
        {account && !account.client && <InsetRow title={<span className="text-toi-ink">Lire la suite</span>} href="/rapport?paiement=1" chevron />}
      </InsetGroup>

      {/* Un seul réglage pour les sons et les vibrations (textes relus le 8 octobre) */}
      <InsetGroup title="L’app" id="app" className="mt-6" footer="En mode silencieux, BLUSH se tait de lui-même.">
        <InsetRow
          leading={<RowIcon icon="sound" tone="elle" />}
          title="Sons et vibrations"
          trailing={
            <Switch
              checked={sons}
              label="Sons et vibrations"
              onChange={(v) => {
                setSoundsEnabled(v);
                if (v) play("oui");
              }}
            />
          }
        />
      </InsetGroup>

      {/* Se déconnecter : de cet appareil, ou de tous (un appareil perdu, prêté). Rien n’est effacé */}
      <InsetGroup title="Ta connexion" id="connexion" className="mt-6" footer={RIEN_N_EST_EFFACE}>
        <InsetRow leading={<RowIcon icon="user" />} title="Se déconnecter" sub="Sur cet appareil" onClick={() => setConfirm("sortie")} chevron />
        <InsetRow
          leading={<RowIcon icon="shield" />}
          title="Se déconnecter de tous les appareils"
          sub="Un téléphone perdu, un ordi prêté"
          onClick={() => setConfirm("partout")}
          chevron
        />
      </InsetGroup>

      {/* Tes données : ce qui est gardé, puis les gestes qui effacent (en rouge) */}
      <InsetGroup title="Tes données" id="donnees" className="mt-6" footer={PROMESSE_DONNEES}>
        <InsetRow leading={<RowIcon icon="eye" tone="vrai" />} title="Ta conv, en sécurité" sub="Ce qui part, qui la lit, combien de temps" href="/confidentialite" chevron />
        <InsetRow leading={<RowIcon icon="lock" />} title="Ce que BLUSH garde" sub="Votre histoire analysée, sa fiche, tes notes" onClick={() => setConfirm("keep")} chevron />
        <InsetRow
          leading={<RowIcon icon="trash" tone="danger" />}
          title={`Supprimer l’histoire avec ${noms?.other.name ?? "elle"}`}
          sub="Le rapport, la fiche et les captures"
          onClick={() => setConfirm("story")}
          danger
        />
        <InsetRow leading={<RowIcon icon="trash" tone="danger" />} title="Tout effacer" sub="Ton compte et toutes tes histoires" onClick={() => setConfirm("all")} danger />
      </InsetGroup>

      {/* Les panneaux de confirmation, absents des maquettes : leurs textes reprennent les libellés de l’écran (validés) */}
      <Sheet open={confirm !== null} onClose={fermer} labelledBy="confirm-title">
        {confirm === "keep" && (
          <>
            <h2 id="confirm-title" className="m-0 text-titre-3 font-black leading-[1.1] tracking-[-0.02em]">
              Ce que BLUSH garde
            </h2>
            <p className="m-0 text-detail font-extrabold leading-[1.45]">Votre histoire analysée, sa fiche, tes notes.</p>
            <NotePrivee>{PROMESSE_CONV}</NotePrivee>
            {/* « Hébergement en Europe » taisait les États-Unis (l’IA et la voix de BLUSH) : la page Confidentialité le dit, ceci aussi */}
            <p className="m-0 text-legende font-bold leading-[1.45] text-grey">{`${PROMESSE_DONNEES} ${PROMESSE_LIEU} ${PROMESSE_EFFACEMENT}`}</p>
            <Button variant="secondary" onClick={fermer}>
              Fermer
            </Button>
          </>
        )}
        {(confirm === "story" || confirm === "all") && (
          <>
            <h2 id="confirm-title" className="m-0 text-titre-3 font-black leading-[1.1] tracking-[-0.02em]">
              {confirm === "story" ? `Supprimer l’histoire avec ${noms?.other.name ?? "elle"}\u00a0?` : "Tout effacer\u00a0?"}
            </h2>
            <p className="m-0 text-detail font-extrabold leading-[1.45] text-soft">
              {confirm === "story" ? "Le rapport, la fiche et les captures." : "Ton compte et toutes tes histoires."}
            </p>
            {souci && <Alert>{souci}</Alert>}
            <Button
              aria-busy={busy}
              onClick={() => {
                if (busy) return;
                void run(confirm === "story" ? deleteStory : deleteAccount, () => {
                  resetJourney();
                  /*
                   * Un chargement neuf, comme à la déconnexion : rien de l’histoire effacée ne reste en mémoire (le cache des
                   * requêtes, les pages déjà chargées par le routeur). Une autre conv reste : elle s’ouvre à la place
                   */
                  window.location.assign(confirm === "story" && convs.length > 1 ? "/app" : "/commencer");
                });
              }}
            >
              {confirm === "story" ? "Supprimer l’histoire" : "Tout effacer"}
            </Button>
            <Button variant="link" onClick={fermer}>
              Annuler
            </Button>
          </>
        )}
        {(confirm === "sortie" || confirm === "partout") && (
          <>
            <h2 id="confirm-title" className="m-0 text-titre-3 font-black leading-[1.1] tracking-[-0.02em]">
              {confirm === "sortie" ? "Se déconnecter\u00a0?" : "Se déconnecter de tous les appareils\u00a0?"}
            </h2>
            <p className="m-0 text-detail font-extrabold leading-[1.45] text-soft">{confirm === "sortie" ? RIEN_N_EST_EFFACE : `Celui-ci compris. ${RIEN_N_EST_EFFACE}`}</p>
            {souci && <Alert>{souci}</Alert>}
            <Button
              aria-busy={busy}
              onClick={() => {
                if (busy) return;
                void run(
                  () => seDeconnecter({ partout: confirm === "partout" }),
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- voulu : un chargement neuf, rien du compte ne reste en mémoire (le cache des requêtes, le parcours)
                  () => window.location.assign("/"),
                );
              }}
            >
              {confirm === "sortie" ? "Se déconnecter" : "Se déconnecter de partout"}
            </Button>
            <Button variant="link" onClick={fermer}>
              Annuler
            </Button>
          </>
        )}
      </Sheet>
    </AppScreen>
  );
}
