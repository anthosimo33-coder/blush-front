"use client";

import type { RefObject } from "react";

/** Champ fichier invisible, ouvert par un vrai bouton (useFilePicker). */
export function FileInput({
  inputRef,
  accept,
  multiple,
  onFiles,
  label,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  label: string;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple={multiple}
      aria-label={label}
      tabIndex={-1}
      className="sr-only"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (files.length) onFiles(files);
      }}
    />
  );
}

/** Trois points animés (« en train d’écrire »). */
export function TypingDots({ color = "#8A8780", size = 6, label }: { color?: string; size?: number; label?: string }) {
  return (
    <span data-dots="" role={label ? "status" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="inline-flex items-center" style={{ gap: size * 0.66 }}>
      <span className="inline-block rounded-full" style={{ width: size, height: size, background: color }} />
      <span className="inline-block rounded-full" style={{ width: size, height: size, background: color }} />
      <span className="inline-block rounded-full" style={{ width: size, height: size, background: "linear-gradient(120deg, #A8FFE4 0%, #8FC8FF 35%, #E6A8FF 68%, #FFD3A1 100%)" }} />
    </span>
  );
}
