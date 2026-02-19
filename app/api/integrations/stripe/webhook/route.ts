import { db } from "@/services/drizzle";
import { organizations } from "@/services/drizzle/schema";
import { stripe } from "@/services/stripe";
import { waitUntil } from "@vercel/functions";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

const allowedStripeEvents: Stripe.Event.Type[] = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];

export async function POST(req: NextRequest) {
	const body = await req.text();

	const signature = (await headers()).get("Stripe-Signature");

	if (!signature) return NextResponse.json({}, { status: 400 });

	async function doEventProcessing() {
		if (typeof signature !== "string") {
			throw new Error("[STRIPE HOOK] Header isn't a string???");
		}

		const event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SIGNATURE_SECRET as string);
		waitUntil(processEvent(event));
	}
	try {
		await doEventProcessing();
	} catch (error) {
		console.log("[STRIPE HOOK] Error processing event", error);
	}
	return NextResponse.json({ received: true });
}

async function processEvent(event: Stripe.Event) {
	// Skip processing if the event isn't one I'm tracking (list of all events below)
	if (!allowedStripeEvents.includes(event.type)) return;

	// All the events I track have a customerId
	const { customer: customerId } = event?.data?.object as {
		customer: string; // Sadly TypeScript does not know this
	};
	if (typeof customerId !== "string") {
		throw new Error(`[STRIPE HOOK] Customer ID is not a string??? \n Event type: ${event.type}`);
	}

	if (event.type === "customer.subscription.deleted") {
		console.log("[STRIPE HOOK] [HANDLE_SUBSCRIPTION_DELETED]", {
			customerId,
			event,
		});
		return await db.update(organizations).set({ stripeSubscriptionStatus: "canceled", stripeSubscriptionStatusUltimaAlteracao: new Date() }).where(eq(organizations.stripeCustomerId, customerId));
	}
	if (event.type === "customer.subscription.created" || event.type === "customer.discount.updated") {
		const { id, status } = event.data.object as Stripe.Subscription;

		console.log("[STRIPE HOOK] [HANDLE_SUBSCRIPTION_CREATED_DISCOUNT_UPDATED]", {
			customerId,
			event,
			eventObject: event.data.object,
		});
		return await db
			.update(organizations)
			.set({
				stripeSubscriptionStatus: status,
				stripeSubscriptionId: id,
				stripeSubscriptionStatusUltimaAlteracao: new Date(),
			})
			.where(eq(organizations.stripeCustomerId, customerId));
	}

	if (event.type === "customer.subscription.updated") {
		console.log("[STRIPE HOOK] [HANDLE_SUBSCRIPTION_UPDATED]", {
			customerId,
			event,
			eventObject: event.data.object,
		});
		const { id, status } = event.data.object as Stripe.Subscription;
		return await db
			.update(organizations)
			.set({
				stripeSubscriptionStatus: status,
				stripeSubscriptionId: id,
				stripeSubscriptionStatusUltimaAlteracao: new Date(),
			})
			.where(eq(organizations.stripeCustomerId, customerId));
	}
	return;
}
