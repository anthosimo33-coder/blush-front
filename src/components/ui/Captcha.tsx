"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionCaptcha } from "@/lib/captcha";
import { cn } from "@/lib/cn";
import { cleDuSiteCaptcha } from "@/lib/publique";
import { monterWidget } from "@/services/captcha";

/**
 * Le widget du CAPTCHA (Cloudflare Turnstile), sur les écrans d’une porte sans compte : la demande de code (`code`),
 * l’export et les captures (`import`). Géré et discret : il travaille sans se montrer, et ne prend de la place que s’il
 * demande un geste (une case à cocher), au-dessus du bouton. Le jeton qu’il rend part avec l’appel (src/services/api.ts).
 * Sans clé publique, rien : ni script, ni place.
 */
export function Captcha({ action, className }: { action: ActionCaptcha; className?: string }) {
  const conteneur = useRef<HTMLDivElement>(null);
  /* Le widget demande un geste : il se montre, et on lui fait de la place */
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!conteneur.current) return;
    return monterWidget(conteneur.current, action, setVisible);
  }, [action]);
  if (!cleDuSiteCaptcha()) return null;
  return <div ref={conteneur} data-captcha={action} className={cn("flex justify-center", visible && "mb-3", className)} />;
}
