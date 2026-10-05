/* Icônes au trait, relevées dans les maquettes (viewBox 24). */
import type { CSSProperties } from "react";

const PATHS = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  back: "M15 5l-7 7 7 7",
  chevron: "M9 6l6 6-6 6",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z",
  arrow: ["M4 12h14.2", "M13.2 6.4c1.3 2.5 3.3 4.4 6.3 5.6-3 1.2-5 3.1-6.3 5.6"],
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  whatsapp: "M5.5 4.5h13A2.5 2.5 0 0 1 21 7v7.5a2.5 2.5 0 0 1-2.5 2.5H13l-4.2 3.4V17H5.5A2.5 2.5 0 0 1 3 14.5V7a2.5 2.5 0 0 1 2.5-2.5z",
  imessage: "M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  instagram: "M4 8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  share: "M12 3v12M7 8l5-5 5 5M5 14v5h14v-5",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.8-3.4 3.4-5.5 6.5-5.5s5.7 2.1 6.5 5.5M16 4.5a3 3 0 0 1 0 6M18.5 14.8c1.6.8 2.7 2.6 3 5.2",
  cloud: "M7 18a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6-1.5A4.5 4.5 0 1 1 17.5 18z",
  heart: "M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z",
  swap: "M7 7h12l-3-3M17 17H5l3 3",
  copy: "M8 8h11v11H8zM5 16V5h11",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6",
  close: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  photo: ["M6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11A2.5 2.5 0 0 1 6.5 4z", "M4.5 16.5l4.2-4.2a1 1 0 0 1 1.4 0l3.4 3.4 2.1-2.1a1 1 0 0 1 1.4 0l2.5 2.5", "M15 9.5h.01"],
  pencil: ["M4 20h4.2L19.4 8.8a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8z", "M13.5 6.3l4.2 4.2"],
  minus: "M6 12h12",
  list: ["M9 6.5h11", "M9 12h11", "M9 17.5h11", "M4.5 6.5h.01", "M4.5 12h.01", "M4.5 17.5h.01"],
  file: ["M7 3.5h6.6L18.5 8.4V19.5a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z", "M13.5 3.5v5h5"],
  play: "M8.5 5.8v12.4c0 .6.7 1 1.2.7l9.6-6.2c.5-.3.5-1.1 0-1.4L9.7 5.1c-.5-.3-1.2 0-1.2.7z",
  alert: "M12 8v5M12 16.5v.5M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  color = "currentColor",
  stroke = 2.2,
  fill = "none",
  className,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
  fill?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const d = PATHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0, ...style }}
    >
      {typeof d === "string" ? <path d={d} /> : d.map((p) => <path key={p} d={p} />)}
    </svg>
  );
}
