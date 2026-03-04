import { PostHog } from "posthog-node";

type TCaptureServerEventInput = {
	distinctId: string;
	event: string;
	properties?: Record<string, unknown>;
};

export async function captureServerEvent({ distinctId, event, properties }: TCaptureServerEventInput) {
	const apiKey = process.env.POSTHOG_API_KEY;
	if (!apiKey) return;

	const host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
	const client = new PostHog(apiKey, { host });

	client.capture({
		distinctId,
		event,
		properties,
	});

	await client.shutdown();
}
