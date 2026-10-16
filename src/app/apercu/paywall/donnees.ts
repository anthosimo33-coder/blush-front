import type { ScoreRow, Story } from "@/types";

/*
 * Les données inventées des maquettes du paywall (/apercu/paywall, jamais sur Vercel : src/proxy.ts) : Nathan et Léa,
 * une conv longue comme celles des vrais exports. Ce que le code compterait sans le modèle : les lignes du paywall et
 * les trouvailles.
 */

export const STORY: Story = {
  id: "apercu-paywall",
  participants: [
    { id: "p0", name: "Nathan", initial: "N", pronoun: "il" },
    { id: "p1", name: "Léa", initial: "L", pronoun: "elle" },
  ],
  sources: [{ id: "s0", app: "whatsapp", mode: "export", fileName: "WhatsApp Chat - Léa.zip", label: "WhatsApp", period: "26 août → 15 oct.", messageCount: 5872 }],
  totalMessages: 5872,
  voiceCount: 138,
  period: "26 août → 15 oct.",
  durationLabel: "7 semaines",
  updatedLabel: "aujourd’hui",
  me: "p0",
};

export const SCORES: ScoreRow[] = [
  { label: "Qui ouvre la journée", winner: "elle", toiPercent: 34, captionRight: "léa, 7 fois sur 10" },
  { label: "Qui reprend après un silence", winner: "elle", toiPercent: 31, captionRight: "léa, 7 fois sur 10" },
  { label: "Qui relance sans réponse", winner: "toi", toiPercent: 67, captionLeft: "toi, 7 fois sur 10" },
  { label: "Qui répond vite", winner: "elle", toiPercent: 12, captionLeft: "18 min", captionRight: "3 min" },
];

export const TROUVAILLES = ["Elle ouvre la conv 7 jours sur 10", "Tu relances 2 fois plus qu’elle", "Votre mot à vous\u00a0: «\u00a0pistache\u00a0» × 315"];
