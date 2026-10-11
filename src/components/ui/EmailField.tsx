"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

/** Le champ « Ton email » : sa forme se vérifie à côté (emailValide, src/lib/email.ts), le champ montre l’erreur qu’on lui passe. */
export function EmailField({
  value,
  onChange,
  invalid = false,
  errorText,
  onBlur,
  onEnter,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  errorText?: string;
  onBlur?: () => void;
  onEnter?: () => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-legende font-black text-soft">
        Ton email
      </label>
      <span
        className={cn(
          "flex h-[60px] items-center gap-3 rounded-field bg-white pl-[18px] pr-2 transition-shadow",
          /* Au focus, le liseré rose de BLUSH et un léger halo */
          invalid
            ? "shadow-[inset_0_0_0_2px_var(--danger)]"
            : "shadow-[inset_0_0_0_1px_rgba(17,17,20,0.09),0_1px_2px_rgba(17,17,20,0.04)] focus-within:shadow-[inset_0_0_0_2px_var(--elle),0_0_0_4px_rgb(255_79_154/0.16)]",
        )}
      >
        <Icon name="mail" size={20} stroke={2} className="text-muted" />
        <input
          id={id}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="ton@email.com"
          value={value}
          autoFocus={autoFocus}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errId : undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter?.();
          }}
          className="h-full min-w-0 flex-1 border-none bg-transparent text-accent font-extrabold text-ink outline-none focus-visible:outline-none [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_white]"
        />
      </span>
      {invalid && errorText && (
        <span id={errId} role="alert" className="text-legende font-extrabold text-danger-ink">
          {errorText}
        </span>
      )}
    </div>
  );
}
