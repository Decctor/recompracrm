import "dotenv/config";
import { AppSubscriptionPlans, SUBSCRIPTION_ADDONS } from "@/config";
import { StripeAccountEnum, type TStripeAccountEnum } from "@/schemas/enums";
import { getStripeClient, getStripeSalesAccount } from "@/services/stripe";

// Cria, numa conta Stripe, os produtos e prices do modelo plano-base + adicionais que ainda não
// existem: o plano CRM + ERP e o adicional Hub de Atendimentos, mensal e anual. O plano CRM e a
// consultoria reutilizam os prices que já estão em uso.
//
// Os valores vêm do config — o mesmo que o app mostra e cobra. Idempotente: produto por id fixo,
// price por lookup_key; rodar de novo só reporta o que já existe. Os ids não usam o prefixo
// chats_, que pertence ao app recompracrm-chats na mesma conta.
//
// Por padrão só mostra o que faria. Para criar:
//   npx tsx ./scripts/create-subscription-prices.ts --apply
//   npx tsx ./scripts/create-subscription-prices.ts --account RECOMPRACRM --apply
// Sem --account, usa a conta de vendas do ambiente (STRIPE_SALES_ACCOUNT).
// No fim imprime as variáveis NEXT_PUBLIC_STRIPE_* para colar no ambiente correspondente.

type TPriceSpec = {
	envVar: string;
	lookupKey: string;
	productId: string;
	productName: string;
	productDescription: string;
	unitAmountCents: number;
	interval: "month" | "year";
};

const toCents = (value: number) => Math.round(value * 100);

const CRM_ERP = AppSubscriptionPlans.CRM_ERP;
const HUB = SUBSCRIPTION_ADDONS.HUB_ATENDIMENTOS;
if (!HUB.pricing.yearly) throw new Error("O Hub de Atendimentos precisa de preço anual no config.");

const PRICE_SPECS: TPriceSpec[] = [
	{
		envVar: "NEXT_PUBLIC_STRIPE_CRM_ERP_MONTHLY_PLAN_PRICE_ID",
		lookupKey: "recompracrm_crm_erp_mensal",
		productId: "recompracrm_crm_erp",
		productName: "RecompraCRM — CRM + ERP",
		productDescription: CRM_ERP.description,
		unitAmountCents: toCents(CRM_ERP.pricing.monthly.price),
		interval: "month",
	},
	{
		envVar: "NEXT_PUBLIC_STRIPE_CRM_ERP_YEARLY_PLAN_PRICE_ID",
		lookupKey: "recompracrm_crm_erp_anual",
		productId: "recompracrm_crm_erp",
		productName: "RecompraCRM — CRM + ERP",
		productDescription: CRM_ERP.description,
		unitAmountCents: toCents(CRM_ERP.pricing.yearly.price),
		interval: "year",
	},
	{
		envVar: "NEXT_PUBLIC_STRIPE_HUB_ATENDIMENTOS_MONTHLY_PRICE_ID",
		lookupKey: "recompracrm_hub_atendimentos_mensal",
		productId: "recompracrm_hub_atendimentos",
		productName: "RecompraCRM — Hub de Atendimentos",
		productDescription: HUB.description,
		unitAmountCents: toCents(HUB.pricing.monthly.price),
		interval: "month",
	},
	{
		envVar: "NEXT_PUBLIC_STRIPE_HUB_ATENDIMENTOS_YEARLY_PRICE_ID",
		lookupKey: "recompracrm_hub_atendimentos_anual",
		productId: "recompracrm_hub_atendimentos",
		productName: "RecompraCRM — Hub de Atendimentos",
		productDescription: HUB.description,
		unitAmountCents: toCents(HUB.pricing.yearly.price),
		interval: "year",
	},
];

function readAccount(): TStripeAccountEnum {
	const index = process.argv.indexOf("--account");
	if (index === -1) return getStripeSalesAccount();
	const parsed = StripeAccountEnum.safeParse(process.argv[index + 1]);
	if (!parsed.success) throw new Error(`Conta inválida. Use uma de: ${StripeAccountEnum.options.join(", ")}.`);
	return parsed.data;
}

async function main() {
	const apply = process.argv.includes("--apply");
	const account = readAccount();
	const stripe = getStripeClient(account);
	console.log(`Conta Stripe: ${account} — ${apply ? "CRIANDO o que faltar" : "simulação (use --apply para criar)"}\n`);

	const envLines: string[] = [];
	for (const spec of PRICE_SPECS) {
		const existing = await stripe.prices.list({ lookup_keys: [spec.lookupKey], limit: 1 });
		const existingPrice = existing.data[0];
		if (existingPrice) {
			// Um price não muda de valor no Stripe: se o config mudou, é um price novo, com outra lookup_key.
			const matches = existingPrice.unit_amount === spec.unitAmountCents && existingPrice.recurring?.interval === spec.interval;
			console.log(`= ${spec.lookupKey}: já existe (${existingPrice.id})${matches ? "" : " — ATENÇÃO: valor ou intervalo diferente do config"}`);
			envLines.push(`${spec.envVar}=${existingPrice.id}`);
			continue;
		}

		if (!apply) {
			console.log(`+ ${spec.lookupKey}: criaria R$ ${(spec.unitAmountCents / 100).toFixed(2)} / ${spec.interval} no produto ${spec.productId}`);
			envLines.push(`${spec.envVar}=<criado com --apply>`);
			continue;
		}

		const product = await stripe.products.retrieve(spec.productId).catch(() => null);
		if (!product) {
			await stripe.products.create({ id: spec.productId, name: spec.productName, description: spec.productDescription });
			console.log(`+ produto ${spec.productId} criado`);
		}
		const price = await stripe.prices.create({
			product: spec.productId,
			currency: "brl",
			unit_amount: spec.unitAmountCents,
			recurring: { interval: spec.interval },
			lookup_key: spec.lookupKey,
			nickname: `${spec.productName} (${spec.interval === "year" ? "anual" : "mensal"})`,
		});
		console.log(`+ ${spec.lookupKey}: criado (${price.id})`);
		envLines.push(`${spec.envVar}=${price.id}`);
	}

	console.log(`\nVariáveis de ambiente (prices da conta ${account}):\n${envLines.join("\n")}`);
}

main().catch((error) => {
	console.error("Falha ao criar os prices:", error);
	process.exit(1);
});
