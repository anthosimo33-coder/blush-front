"use client";

/* Petit cache de lecture autour de src/services/api.ts (pas de dépendance externe). */
import { useEffect, useRef, useState } from "react";

type Listener = (data?: unknown) => void;
const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<Listener>>();

/** Relit la donnée depuis la couche de service. */
export function invalidate(...keys: string[]) {
  keys.forEach((k) => listeners.get(k)?.forEach((l) => l()));
}

/** Met à jour la donnée en cache sans la relire (mise à jour optimiste). */
export function setQueryData<T>(key: string, data: T) {
  cache.set(key, data);
  listeners.get(key)?.forEach((l) => l(data));
}

export function useQuery<T>(key: string, fn: () => Promise<T>, initial?: T) {
  const [data, setData] = useState<T | undefined>(() => (cache.has(key) ? (cache.get(key) as T) : initial));
  const [version, setVersion] = useState(0);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    let set = listeners.get(key);
    if (!set) listeners.set(key, (set = new Set()));
    const l: Listener = (d) => (d === undefined ? setVersion((v) => v + 1) : setData(d as T));
    set.add(l);
    return () => {
      set.delete(l);
    };
  }, [key]);

  useEffect(() => {
    let alive = true;
    fnRef.current().then((d) => {
      if (!alive) return;
      cache.set(key, d);
      setData(d);
    });
    return () => {
      alive = false;
    };
  }, [key, version]);

  return { data, loading: data === undefined, refresh: () => invalidate(key) };
}
