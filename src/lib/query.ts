"use client";

/* Petit cache de lecture autour de src/services/api.ts (pas de dépendance externe). */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Account, AchatDuCompte, FeuilleDuPaiement, ReportPayload } from "@/types/api";
import type { Fiche } from "@/types";

/**
 * Ce que le cache garde, clé par clé, et sous quelle forme. La fiche a une clé par conv (`fiche:<id>`, l’identifiant de
 * la conv affichée tel que le serveur l’a résolu : idDeLaConv, src/services/serveur.ts, jamais le cookie brut, absent
 * après une connexion) : celle d’une autre conv ne s’affiche jamais à la place de la sienne. « fiche-apercu » : l’aperçu
 * figé d’une vraie fiche. « feuille » : ce que la feuille du paiement doit savoir (comment payer, les avoirs du compte).
 * Ce qui se relit quand la conv change : src/lib/requetes.ts.
 */
export type Requetes = {
  report: ReportPayload;
  account: Account;
  achats: AchatDuCompte[];
  feuille: FeuilleDuPaiement;
  "fiche-apercu": Fiche;
  [cle: `fiche:${string}`]: Fiche;
};
export type Cle = keyof Requetes;

type Listener = (data?: unknown) => void;
const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<Listener>>();
/* L’heure (Date.now()) de chaque écriture du cache : une donnée écrite après le rendu serveur d’une page passe avant lui */
const ecritLe = new Map<string, number>();
/* L’heure de la dernière mise à jour optimiste : une lecture partie avant elle rapporte une donnée déjà dépassée */
const modifieLe = new Map<string, number>();
/* L’heure de la dernière invalidation : un rendu serveur pris avant elle n’est plus frais (renduFrais), il faut relire */
const invalideLe = new Map<string, number>();
/*
 * Les lectures en route, par clé : deux écrans montés ensemble (« Mon compte » et sa coque lisent le compte) n’en font
 * qu’une. Une invalidation l’oublie : la lecture d’après repart du serveur.
 */
const lectures = new Map<string, Promise<unknown>>();
/*
 * Les rendus serveur déjà montés (clé et heure du rendu), et le montage de page qui les a pris (MontageDeLaPage) : une
 * page revue par l’historique repasse le même, peut-être périmé
 */
const rendusVus = new Map<string, object | undefined>();

/**
 * Le montage de la page (un objet neuf à chaque fois qu’elle est montée : src/components/shell/PoseConv.tsx). Les écrans
 * d’une même page qui lisent la même clé, rendue par le serveur au même moment (la coque et son écran lisent le compte),
 * la prennent tous pour fraîche ; la page revue par l’historique est un autre montage : elle relit. Hors d’une page qui
 * le donne, chaque rendu n’est frais qu’une fois.
 */
export const MontageDeLaPage = createContext<object | undefined>(undefined);

function ecrire(key: string, data: unknown) {
  cache.set(key, data);
  ecritLe.set(key, Date.now());
}

/**
 * Relit la donnée depuis la couche de service. Le cache est vidé : un écran qui s’ouvre ensuite (une autre conv, une
 * histoire supprimée) ne montre pas l’ancienne donnée le temps de relire.
 */
export function invalidate(...keys: Cle[]) {
  keys.forEach((k) => {
    cache.delete(k);
    ecritLe.delete(k);
    invalideLe.set(k, Date.now());
    lectures.delete(k);
    listeners.get(k)?.forEach((l) => l());
  });
}

/** Met à jour la donnée en cache sans la relire (mise à jour optimiste). */
export function setQueryData<K extends Cle>(key: K, data: Requetes[K]) {
  ecrire(key, data);
  modifieLe.set(key, Date.now());
  listeners.get(key)?.forEach((l) => l(data));
}

/** Une lecture partagée : la même clé demandée deux fois pendant qu’elle est en route ne part qu’une fois. */
export function lirePartage<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const deja = lectures.get(key);
  if (deja) return deja as Promise<T>;
  const p = fn();
  lectures.set(key, p);
  const fin = () => {
    if (lectures.get(key) === p) lectures.delete(key);
  };
  p.then(fin, fin);
  return p;
}

/**
 * D’où part l’écran : la donnée rendue par le serveur (`initial`), qui passe avant le cache (il peut venir d’une autre
 * conv ouverte entre-temps), sauf si le cache de cette clé a été écrit après `rendu` (l’heure de ce rendu) : une
 * modification faite depuis, que la page préchargée ne connaît pas. Sans `initial`, le cache.
 */
export function depart<T>(key: string, initial: T | undefined, rendu?: number): { valeur: T | undefined; duServeur: boolean } {
  if (initial === undefined) return { valeur: cache.has(key) ? (cache.get(key) as T) : undefined, duServeur: false };
  if (rendu !== undefined && cache.has(key) && (ecritLe.get(key) ?? 0) > rendu) return { valeur: cache.get(key) as T, duServeur: false };
  return { valeur: initial, duServeur: true };
}

/**
 * La donnée rendue par le serveur dispense de la relire au montage : rendue il y a moins de `frais` ms, et montée pour la
 * première fois (une page revue par l’historique repasse le même rendu : elle est relue), ou par le même `montage` de
 * page (MontageDeLaPage : ses écrans montés ensemble). L’écart compare l’horloge du serveur à celle du téléphone : un
 * rendu « dans le futur » de plus de 2 s (horloges décalées) ne compte pas comme frais. Une clé invalidée depuis `rendu`
 * ne l’est plus, même pour le même montage : « une invalidation l’oublie, la lecture d’après repart du serveur ».
 */
export function renduFrais(key: string, rendu: number | undefined, frais: number, montage?: object): boolean {
  if (rendu === undefined) return false;
  if ((invalideLe.get(key) ?? -Infinity) > rendu) return false;
  const vu = `${key}@${rendu}`;
  if (rendusVus.has(vu) && (montage === undefined || rendusVus.get(vu) !== montage)) return false;
  rendusVus.set(vu, montage);
  const age = Date.now() - rendu;
  return frais > 0 && age > -2000 && age < frais;
}

/**
 * La fraîcheur d’une donnée rendue par le serveur, la même pour toutes les pages qui s’en servent : rendue il y a moins
 * de 10 s, elle dispense de la relire au montage (voir renduFrais, et `frais` dans useQuery).
 */
export const FRAIS_DU_RENDU = 10_000;

/**
 * Une écriture faite par ce navigateur sur une donnée hors du cache (« chat » : un message, le mode vocal) : une page
 * préchargée avant elle (Next garde une page préchargée 5 min) ne la connaît pas. Voir ecritDepuis.
 */
export function noterEcriture(key: "chat") {
  ecritLe.set(key, Date.now());
}

/**
 * Ce navigateur a-t-il écrit la donnée `key` depuis `rendu` (l’heure du serveur) ? Alors le rendu ne la montre pas
 * forcément, il faut la relire. Avec la marge de renduFrais (2 s d’horloges décalées) : dans le doute, on relit.
 */
export function ecritDepuis(key: "chat", rendu: number): boolean {
  return (ecritLe.get(key) ?? -Infinity) > rendu - 2000;
}

/** Un objet tel que JSON en rend (ni tableau, ni Date, ni classe) : ses champs se comparent un à un. */
const objetSimple = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && Object.getPrototypeOf(v) === Object.prototype;

/**
 * La nouvelle réponse `apres`, où chaque partie identique à celle d’`avant` garde son objet (le partage de structure) :
 * tout pareil, c’est `avant` lui-même, et l’écran ne se re-rend pas pour rien ; sinon, seul ce qui a changé est neuf. Un
 * rapport relu toutes les 2 s pendant son écriture change presque à chaque fois (le temps qui reste, l’avancement), mais
 * ses chapitres déjà écrits gardent leurs objets : leurs sections mémorisées (ChapterSection) ne se refont pas.
 */
export function garderCeQuiNaPasChange<T>(avant: unknown, apres: T): T {
  if (Object.is(avant, apres)) return avant as T;
  if (Array.isArray(avant) && Array.isArray(apres)) {
    let pareil = avant.length === apres.length;
    const r = apres.map((v, i) => {
      const g = garderCeQuiNaPasChange(avant[i], v);
      if (g !== avant[i]) pareil = false;
      return g;
    });
    return (pareil ? avant : r) as T;
  }
  if (objetSimple(avant) && objetSimple(apres)) {
    const cles = Object.keys(apres);
    let pareil = cles.length === Object.keys(avant).length;
    const r: Record<string, unknown> = {};
    for (const k of cles) {
      r[k] = garderCeQuiNaPasChange(avant[k], apres[k]);
      if (r[k] !== avant[k] || !(k in avant)) pareil = false;
    }
    return (pareil ? avant : r) as T;
  }
  return apres;
}

/** Comment useQuery lit sa donnée (voir useQuery). */
export type OptionsLecture = { fetch?: boolean; rendu?: number; frais?: number };

/**
 * `initial` : la donnée rendue par le serveur pour cette page (voir depart). `fetch: false` : la donnée reste celle
 * donnée au départ (un aperçu figé), sans relire. Une lecture qui échoue garde la donnée qu’on a (`error` le dit).
 * `rendu` : l’heure (Date.now() côté serveur) où `initial` a été rendu. `frais` : pendant combien de millisecondes après
 * `rendu` la donnée du serveur dispense de la relecture au montage (0, par défaut : on relit toujours, ce qui rattrape
 * une page revue par l’historique ou une mise à jour faite ailleurs). Voir renduFrais.
 * Une réponse identique à ce qu’on montre ne re-rend pas l’écran ; deux lectures de la même clé en même temps n’en font
 * qu’une (lirePartage).
 */
export function useQuery<K extends Cle>(key: K, fn: () => Promise<Requetes[K]>, initial?: Requetes[K], { fetch = true, rendu, frais = 0 }: OptionsLecture = {}) {
  type T = Requetes[K];
  const [premier] = useState(() => depart(key, initial, rendu));
  const montageDeLaPage = useContext(MontageDeLaPage);
  const [data, setData] = useState<T | undefined>(premier.valeur);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  /*
   * Une lecture en route (depuis quand) : une relecture demandée pendant ce temps (le suivi du rapport, toutes les 2 s)
   * attend sa réponse au lieu de la jeter. Sur un réseau lent, la réponse arrive quand même. Au-delà de 15 s, on n’attend plus.
   */
  const enRoute = useRef(0);
  const aRelire = useRef(false);
  const montage = useRef(true);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    let set = listeners.get(key);
    if (!set) listeners.set(key, (set = new Set()));
    const l: Listener = (d) => {
      if (d !== undefined) return setData(d as T);
      if (enRoute.current && Date.now() - enRoute.current < 15_000) aRelire.current = true;
      else setVersion((v) => v + 1);
    };
    set.add(l);
    return () => {
      set.delete(l);
    };
  }, [key]);

  useEffect(() => {
    if (!fetch) return;
    /* Au montage, une donnée que le serveur vient de rendre n’est pas relue : elle sert aussi aux autres écrans de la clé */
    const auMontage = montage.current;
    montage.current = false;
    if (auMontage && premier.duServeur && renduFrais(key, rendu, frais, montageDeLaPage)) {
      ecrire(key, premier.valeur);
      return;
    }
    let alive = true;
    const debut = Date.now();
    enRoute.current = debut;
    const fin = () => {
      if (!alive) return;
      enRoute.current = 0;
      /* Une relecture a été demandée pendant la lecture : elle part maintenant */
      if (aRelire.current) {
        aRelire.current = false;
        setVersion((v) => v + 1);
      }
    };
    lirePartage(key, () => fnRef.current()).then(
      (d) => {
        if (!alive) return;
        /* Partie avant une mise à jour optimiste : la réponse est déjà dépassée, on garde ce qu’on montre */
        if ((modifieLe.get(key) ?? 0) <= debut) {
          ecrire(key, d);
          setData((avant) => garderCeQuiNaPasChange(avant, d));
        }
        setError(false);
        fin();
      },
      () => {
        if (!alive) return;
        setError(true);
        fin();
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `premier`, `rendu`, `frais` et le montage de la page ne comptent qu’au montage
  }, [key, version, fetch]);

  return { data, error, loading: data === undefined && !error, refresh: useCallback(() => invalidate(key), [key]) };
}
