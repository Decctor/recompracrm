import { createSession, generateSessionToken, validateSession } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";

/**
 * The session object the app's services expect, for a seeded user. It is a real session row read
 * back through `validateSession`, so permissions and subscription state are the ones the app
 * computes — a seed cannot do what that user could not do in the browser.
 */
export async function createSeedActorSession(userId: string): Promise<TAuthUserSession> {
	const token = await generateSessionToken();
	await createSession({ token, userId });
	const session = await validateSession(token);
	if (!session?.membership) throw new Error(`[local-dev] Seed user ${userId} has no organization membership.`);
	return session;
}
