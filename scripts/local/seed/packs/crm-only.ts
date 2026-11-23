import { formatPhoneAsBase } from "@/lib/formatting";
import { db } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import { SEED_STORES, SEED_USERS } from "../ids";
import { createSeedStore, createSeedUser } from "../store";

/**
 * A paying store on the CRM plan, with no ERP: no register, no stock, no Operação tab on the hub.
 * It exists to check that ERP-only surfaces stay hidden, so it carries only a few clients.
 */
export async function seedCrmOnlyPack() {
	const store = SEED_STORES.crmOnly;
	await createSeedUser({ user: SEED_USERS.crmOwner, telefone: "(34) 99000-0003" });
	await createSeedStore({
		store,
		owner: SEED_USERS.crmOwner,
		ownerSellerId: "seed-seller-carla",
		basePlan: "CRM",
		subscription: "PAGANTE",
		cnpj: "22.333.444/0001-81",
	});

	const names = ["Bruno Cliente", "Débora Cliente", "Eduardo Cliente", "Fernanda Cliente"];
	await db.insert(clients).values(
		names.map((nome, index) => {
			const telefone = `(34) 99222-000${index + 1}`;
			return {
				id: `seed-crm-client-${index + 1}`,
				organizacaoId: store.id,
				nome,
				telefone,
				telefoneBase: formatPhoneAsBase(telefone),
				analiseRFMTitulo: index === 0 ? "CAMPEÕES" : "CLIENTES RECENTES",
				autorId: SEED_USERS.crmOwner.id,
			};
		}),
	);
}
