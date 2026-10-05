import { redirect } from "next/navigation";

/* La landing n’est pas dans ce périmètre : son bouton « Commencer » mène à /commencer. */
export default function Home() {
  redirect("/commencer");
}
