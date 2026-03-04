"use client";

import posthog from "posthog-js";

type TCaptureClientEventInput = {
	event: string;
	properties?: Record<string, unknown>;
};

export function captureClientEvent({ event, properties }: TCaptureClientEventInput) {
	if (typeof window === "undefined") return;
	posthog.capture(event, properties);
}
