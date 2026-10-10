"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { invalidate, setQueryData, useQuery } from "@/lib/query";
import { play, setSoundsEnabled, useSoundsEnabled } from "@/lib/sound";
import { cancelSubscription, deleteAccount, deleteStory, getAccount, openConv, setPaused, type Account } from "@/services/api";
import { OFFERS } from "@/contenu/offres";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TypingDots } from "@/components/ui/FileInput";
import { Switch } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { InsetGroup, InsetRow, RowIcon } from "@/components/ui/inset";
import { Tag } from "@/components/ui/messages";
import { Sheet } from "@/components/ui/surfaces";
import { AppScreen } from "@/components/shell/AppScreen";
import { MobileTopBar } from "@/components/shell/Screen";
import { resetJourney } from "@/state/journey";
import type { ConvSummary, Person } from "@/types";
import { pagePrecedente } from "@/lib/navigation";

type Confirm = "stop" | "keep" | "story" | "all" | null;

/* Écran 20 — Mon compte, à la manière des Réglages : toi en haut, l’abonnement, puis tes données (les gestes qui effacent en rouge). */
export type NomsDuCompte = { me: Person; other: Person; period: string };

/**
 * `convs` : toutes les convs du compte, quand il y en a plusieurs (sinon, celle de `noms`).
 * `compte` : le compte lu par la page serveur à l’heure `rendu` : l’abonnement est là dès l’affichage, rien ne descend
 * ensuite, et il n’est pas relu tout de suite.
 */
export function CompteScreen({ noms, convs = [], compte, rendu }: { noms: NomsDuCompte | null; convs?: ConvSummary[]; compte?: Account | null; rendu?: number }) {
  const router = useRouter();
  const { data: account } = useQuery("account", getAccount, compte ?? undefined, { rendu, frais: 10_000 });
  /* L’accueil s’ouvre : la ligne touchée le montre jusqu’à son arrivée. Sans remise en haut : il s’ouvre sur le dernier échange */
  const [ouverture, demarrer] = useTransition();
  const [ouverte, setOuverte] = useState<string | null>(null);
  const versAccueil = () => demarrer(() => router.push("/app", { scroll: false }));
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const sub = account?.subscription;
  const plus = sub?.plan === "blushplus";
  const sons = useSoundsEnabled();

  /* Ouvert directement (un lien, un nouvel onglet) : pas de page d’avant dans l’appli, le retour mène à l’accueil */
  const retour = () => (pagePrecedente() ? router.back() : versAccueil());
  const patch = (p: Partial<Account["subscription"]>) => account && setQueryData("account", { ...account, subscription: { ...account.subscription, ...p } });

  /* Un geste qui n’a pas abouti (réseau, serveur) : on le dit dans la feuille, et le bouton se libère pour réessayer */
  const [souci, setSouci] = useState<string | null>(null);
  const [souciPause, setSouciPause] = useState(false);
  const fermer = () => {
    setConfirm(null);
    setSouci(null);
  };
  const run = async (fn: () => Promise<void>, after: () => void) => {
    setBusy(true);
    setSouci(null);
    try {
      await fn();
    } catch {
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
      mainWidth={600}
      frameWidth={600}
      contentGap={0}
      mobileTop={<MobileTopBar back={retour} title="Mon compte" />}
      desktopBack={{ target: retour, trailing: "Mon compte" }}
    >
      {/* Toi, en haut, comme en tête des Réglages */}
      <div className="flex flex-col items-center pt-2 text-center">
        <span
          aria-hidden="true"
          className="flex size-[76px] items-center justify-center rounded-full text-[30px] font-black text-white"
          style={{ background: "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.42), rgba(255,255,255,0) 58%), #3D8BFF" }}
        >
          {noms?.me.initial ?? account?.email?.[0]?.toUpperCase()}
        </span>
        {noms && <div className="mt-3 text-[24px] font-black leading-none tracking-[-0.01em]">{noms.me.name}</div>}
        {account?.email && <div className="mt-1.5 text-[14px] font-extrabold text-grey">{account.email}</div>}
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
                openConv(c.storyId);
                invalidate("report", "account", "fiche", "question");
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
        <InsetRow leading={<RowIcon icon="plus" tone="vrai" />} title={<span className="text-toi-ink">Nouvelle histoire</span>} sub="Une autre conv, un autre rapport" href="/commencer" />
      </InsetGroup>

      {/* L’abonnement */}
      <InsetGroup title="Ton abonnement" id="abonnement" className="mt-6">
        <div className="flex min-h-[76px] items-center gap-3 px-4 py-3.5">
          {sub && (
            <>
              <RowIcon icon="bolt" tone={plus ? "ink" : "grey"} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-[16px] font-black">
                  {plus ? "BLUSH+" : sub.plan === "rapport" ? OFFERS[1].title : "Ton rapport"}
                  {plus && (sub.paused ? <Tag tone="ink">en pause</Tag> : sub.active ? <Tag tone="actif" /> : <Tag tone="ink">arrêté</Tag>)}
                </span>
                <span className="text-[13px] font-extrabold leading-[1.4] text-grey">{plus ? (sub.active ? sub.renewLabel : sub.stopLabel) : sub.plan === "rapport" ? OFFERS[1].note : null}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-[18px] font-black leading-none tracking-[-0.01em]">{sub.priceLabel.split(" / ")[0]}</span>
                {sub.priceLabel.includes(" / ") && <span className="mt-1 text-[12px] font-extrabold text-grey">/ {sub.priceLabel.split(" / ")[1]}</span>}
              </span>
            </>
          )}
        </div>
        {plus && sub && (
          <InsetRow
            title="Mettre en pause"
            sub={souciPause ? "Pas enregistré : vérifie ta connexion et réessaie." : "Ton histoire reste gardée, rien n’est facturé"}
            trailing={
              <Switch
                checked={sub.paused}
                label="Mettre en pause"
                onChange={async (v) => {
                  patch({ paused: v });
                  setSouciPause(false);
                  try {
                    await setPaused(v);
                  } catch {
                    /* Le serveur n’a rien enregistré : l’interrupteur revient où il était */
                    patch({ paused: !v });
                    setSouciPause(true);
                  }
                }}
              />
            }
          />
        )}
        {plus && sub?.active && <InsetRow title="Arrêter BLUSH+" sub="En un geste, effectif lundi" onClick={() => setConfirm("stop")} chevron />}
        {sub?.plan === "gratuit" && <InsetRow title={<span className="text-toi-ink">Lire la suite</span>} href="/rapport?paiement=1" chevron />}
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

      {/* Tes données : ce qui est gardé, puis les gestes qui effacent (en rouge) */}
      <InsetGroup title="Tes données" id="donnees" className="mt-6" footer="Tes convs ne servent jamais à entraîner une IA, et tout ce qui en vient est chiffré.">
        <InsetRow leading={<RowIcon icon="eye" tone="vrai" />} title="Ta conv, en sécurité" sub="Ce qui part, qui la lit, combien de temps" href="/confidentialite" chevron />
        <InsetRow leading={<RowIcon icon="lock" />} title="Ce que BLUSH garde" sub="Votre histoire analysée, sa fiche, tes notes" onClick={() => setConfirm("keep")} chevron />
        <InsetRow leading={<RowIcon icon="trash" tone="danger" />} title={`Supprimer l’histoire avec ${noms?.other.name ?? "elle"}`} sub="Le rapport, la fiche et les captures" onClick={() => setConfirm("story")} danger />
        <InsetRow leading={<RowIcon icon="trash" tone="danger" />} title="Tout effacer" sub="Ton compte et toutes tes histoires" onClick={() => setConfirm("all")} danger />
      </InsetGroup>

      {/* ⚠ Panneaux de confirmation absents des maquettes : textes repris des libellés de l’écran */}
      <Sheet open={confirm !== null} onClose={fermer} labelledBy="confirm-title">
        {confirm === "keep" && (
          <>
            <h2 id="confirm-title" className="m-0 text-[24px] font-black leading-[1.1] tracking-[-0.02em]">
              Ce que BLUSH garde
            </h2>
            <p className="m-0 text-[15px] font-extrabold leading-[1.45]">Votre histoire analysée, sa fiche, tes notes.</p>
            <p className="m-0 flex items-start gap-2 text-[13px] font-extrabold text-grey">
              <Icon name="lock" size={16} color="#8A8780" style={{ marginTop: 1 }} />
              100 % privé : ta conv est supprimée dès que ton rapport est prêt.
            </p>
            <p className="m-0 text-[13px] font-bold leading-[1.45] text-grey">Tes convs ne servent jamais à entraîner une IA. Hébergement en Europe. Tu peux tout effacer à tout moment.</p>
            <Button variant="secondary" onClick={fermer}>
              Fermer
            </Button>
          </>
        )}
        {(confirm === "stop" || confirm === "story" || confirm === "all") && (
          <>
            <h2 id="confirm-title" className="m-0 text-[24px] font-black leading-[1.1] tracking-[-0.02em]">
              {confirm === "stop" ? "Arrêter BLUSH+ ?" : confirm === "story" ? `Supprimer l’histoire avec ${noms?.other.name ?? "elle"} ?` : "Tout effacer ?"}
            </h2>
            <p className="m-0 text-[15px] font-extrabold leading-[1.45] text-soft">
              {confirm === "stop" ? "En un geste, effectif lundi." : confirm === "story" ? "Le rapport, la fiche et les captures." : "Ton compte et toutes tes histoires."}
            </p>
            {souci && (
              <p role="alert" className="m-0 text-[14px] font-extrabold text-[#D93036]">
                {souci}
              </p>
            )}
            <Button
              aria-busy={busy}
              onClick={() =>
                busy
                  ? undefined
                  : confirm === "stop"
                    ? run(cancelSubscription, () => invalidate("account"))
                    : run(confirm === "story" ? deleteStory : deleteAccount, () => {
                        resetJourney();
                        invalidate("account", "report", "fiche", "question");
                        /* Une autre conv reste : elle s’ouvre à la place */
                        if (confirm === "story" && convs.length > 1) router.push("/app", { scroll: false });
                        else router.push("/commencer");
                      })
              }
            >
              {confirm === "stop" ? "Arrêter BLUSH+" : confirm === "story" ? "Supprimer l’histoire" : "Tout effacer"}
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
