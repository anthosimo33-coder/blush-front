"use client";

/* Petit cache de lecture autour de src/services/api.ts (pas de dépendance externe). */
import { useCallback, useEffect, useRef, useState } from "react";

type Listener = (data?: unknown) => void;
const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<Listener>>();

/**
 * Relit la donnée depuis la couche de service. Le cache est vidé : un écran qui s’ouvre ensuite (une autre conv, une
 * histoire supprimée) ne montre pas l’ancienne donnée le temps de relire.
 */
export function invalidate(...keys: string[]) {
  keys.forEach((k) => {
    cache.delete(k);
    listeners.get(k)?.forEach((l) => l());
  });
}

/** Met à jour la donnée en cache sans la relire (mise à jour optimiste). */
export function setQueryData<T>(key: string, data: T) {
  cache.set(key, data);
  listeners.get(key)?.forEach((l) => l(data));
}

/**
 * `initial` : la donnée rendue par le serveur pour cette page. Elle passe avant le cache, qui peut venir d’une autre
 * conv ouverte entre-temps. `fetch: false` : la donnée reste celle donnée au départ (un aperçu figé), sans relire.
 * Une lecture qui échoue garde la donnée qu’on a (`error` le dit).
 */
export function useQuery<T>(key: string, fn: () => Promise<T>, initial?: T, { fetch = true }: { fetch?: boolean } = {}) {
  const [data, setData] = useState<T | undefined>(() => (initial !== undefined ? initial : cache.has(key) ? (cache.get(key) as T) : undefined));
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  /*
   * Une lecture en route (depuis quand) : une relecture demandée pendant ce temps (le suivi du rapport, toutes les 2 s)
   * attend sa réponse au lieu de la jeter. Sur un réseau lent, la réponse arrive quand même. Au-delà de 15 s, on n’attend plus.
   */
  const enRoute = useRef(0);
  const aRelire = useRef(false);
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
    let alive = true;
    enRoute.current = Date.now();
    const fin = () => {
      if (!alive) return;
      enRoute.current = 0;
      /* Une relecture a été demandée pendant la lecture : elle part maintenant */
      if (aRelire.current) {
        aRelire.current = false;
        setVersion((v) => v + 1);
      }
    };
    fnRef.current().then(
      (d) => {
        if (!alive) return;
        cache.set(key, d);
        setData(d);
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
  }, [key, version, fetch]);

  return { data, error, loading: data === undefined && !error, refresh: useCallback(() => invalidate(key), [key]) };
}
