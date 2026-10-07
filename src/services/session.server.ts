import { cookies } from "next/headers";
import { STORY_COOKIE } from "./session";

/** L’histoire ouverte, lue par les pages côté serveur (voir src/services/session.ts). */
export async function currentStoryId(): Promise<string | undefined> {
  return (await cookies()).get(STORY_COOKIE)?.value;
}
