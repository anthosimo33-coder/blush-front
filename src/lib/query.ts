"use client";

/* Petit cache de lecture autour de src/services/api.ts (pas de dépendance externe). */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Account, ReportPayload } from "@/types/api";
import type { Fiche } from "@/types";

/**
 * Ce que le cache garde, clé par clé, et sous quelle forme. La fiche a une clé par conv (`fiche:<id>`) : celle d’une
 * autre conv ne s’affiche jamais à la place de la sienne. « fiche-apercu » : l’aperçu figé d’une vraie fiche. Ce qui
 * se relit quand la conv change : src/lib/requetes.ts.
 */
export type Requetes = { report: ReportPayload; account: Account; "fiche-apercu": Fiche; [cle: `fiche:${string}`]: Fiche };
export type Cle = keyof Requetes;

type Listener = (data?: unknown) => void;
const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<Listener>>();
/* L’heure (Date.now()) de chaque écriture du cache : une donnée écrite après le rendu serveur d’une page passe avant lui */
const ecritLe = new Map<string, number>();
/* L’heure de la dernière mise à jour optimiste : une lecture partie avant elle rapporte une donnée déjà dépassée */
const modifieLe = new Map<string, number>();
/*
 * Les lectures en route, par clé : deux écrans montés ensemble (« Mon compte » et sa coque lisent le compte) n’en font
 * qu’une. Une invalidation l’oublie : la lecture d’après repart du serveur.
 */
const lectures = new Map<string, Promise<unknown>>();
/* Les rendus serveur déjà montés (clé et heure du rendu) : une page revue par l’historique repasse le même, peut-être périmé */
const rendusVus = new Set<string>();

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
 * première fois (une page revue par l’historique repasse le même rendu : elle est relue). L’écart compare l’horloge du
 * serveur à celle du téléphone : un rendu « dans le futur » de plus de 2 s (horloges décalées) ne compte pas comme frais.
 */
export function renduFrais(key: string, rendu: number | undefined, frais: number): boolean {
  if (rendu === undefined) return false;
  const vu = `${key}@${rendu}`;
  if (rendusVus.has(vu)) return false;
  rendusVus.add(vu);
  const age = Date.now() - rendu;
  return frais > 0 && age > -2000 && age < frais;
}

/* Chaque donnée n’est mise en texte qu’une fois (le rapport, relu toutes les 2 s pendant son écriture, pèse son poids) */
const textes = new WeakMap<object, string>();
const texteDe = (v: unknown) => {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  let t = textes.get(v);
  if (t === undefined) textes.set(v, (t = JSON.stringify(v)));
  return t;
};

/** Deux réponses identiques : l’écran ne se re-rend pas pour rien. */
export function memeValeur(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === undefined || b === undefined) return false;
  try {
    return texteDe(a) === texteDe(b);
  } catch {
    return false;
  }
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
    if (auMontage && premier.duServeur && renduFrais(key, rendu, frais)) {
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
          setData((avant) => (memeValeur(avant, d) ? avant : d));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `premier`, `rendu` et `frais` ne comptent qu’au montage
  }, [key, version, fetch]);

  return { data, error, loading: data === undefined && !error, refresh: useCallback(() => invalidate(key), [key]) };
}
