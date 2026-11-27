import { SEED_STORES, SEED_USERS } from "../ids";
import { createSeedStore, createSeedUser } from "../store";

/**
 * A store in its free trial, as `POST /api/organizations` leaves a new one: the trial base plan
 * with the trial add-ons, no Stripe customer, the trial clock running from the moment of the seed.
 *
 * The trial end is relative to when `local:setup` ran. A template older than the trial length
 * holds an expired trial — re-run `npm run local:setup` to renew it.
 */
export async function seedTrialPack() {
	await createSeedUser({ user: SEED_USERS.trialOwner, telefone: "(34) 99000-0004" });
	await createSeedStore({
		store: SEED_STORES.trial,
		owner: SEED_USERS.trialOwner,
		ownerSellerId: "seed-seller-tiago",
		basePlan: "CRM_ERP",
		subscription: "TESTE",
		cnpj: "33.444.555/0001-81",
	});
}
