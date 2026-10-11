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

/* TypingDots vit dans feedback.tsx : la réexportation garde ses importeurs tels quels, le temps que 9a les bascule */
export { TypingDots } from "./feedback";
