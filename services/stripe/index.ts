import { StripeAccountEnum, type TStripeAccountEnum } from "@/schemas/enums";
import Stripe from "stripe";

// Duas contas Stripe convivem na cobrança da plataforma:
//   SYNCRONIZA  — a conta do MEI, onde nasceram as primeiras assinaturas;
//   RECOMPRACRM — a conta do CNPJ, que recebe as vendas novas.
// Nada migra entre elas. Cada customer, price e assinatura pertence à conta em que nasceu,
// gravada em `stripeConta` (organizations e deals), e toda chamada sobre eles usa o client
// dessa conta. Só a criação de um customer novo consulta a conta de vendas (getStripeSalesAccount).
//
// As variáveis sem prefixo de conta são as da SYNCRONIZA: eram as únicas antes da segunda conta,
// e mantê-las evita que o deploy desta mudança dependa de renomear segredos em produção.
const STRIPE_ACCOUNT_CREDENTIALS: Record<TStripeAccountEnum, { secretKey?: string; webhookSecret?: string }> = {
	SYNCRONIZA: {
		secretKey: process.env.STRIPE_SECRET_KEY,
		webhookSecret: process.env.STRIPE_WEBHOOK_SIGNATURE_SECRET,
	},
	RECOMPRACRM: {
		secretKey: process.env.STRIPE_RECOMPRACRM_SECRET_KEY,
		webhookSecret: process.env.STRIPE_RECOMPRACRM_WEBHOOK_SIGNATURE_SECRET,
	},
};

const STRIPE_API_VERSION = "2026-06-24.dahlia";

// Instanciado sob demanda: o SDK recusa construir sem chave, e um ambiente com uma conta só
// (preview, testes) não deve quebrar no import.
const stripeClients = new Map<TStripeAccountEnum, Stripe>();

export function getStripeClient(account: TStripeAccountEnum) {
	const cached = stripeClients.get(account);
	if (cached) return cached;

	const { secretKey } = STRIPE_ACCOUNT_CREDENTIALS[account];
	if (!secretKey) throw new Error(`Chave secreta do Stripe não configurada para a conta ${account}.`);

	const client = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION, typescript: true });
	stripeClients.set(account, client);
	return client;
}

/**
 * Conta em que nascem os customers novos. Sem STRIPE_SALES_ACCOUNT, continua a SYNCRONIZA —
 * a virada para a RECOMPRACRM é uma troca de variável, junto com os price IDs dela.
 */
export function getStripeSalesAccount(): TStripeAccountEnum {
	const parsed = StripeAccountEnum.safeParse(process.env.STRIPE_SALES_ACCOUNT);
	return parsed.success ? parsed.data : "SYNCRONIZA";
}

/**
 * Conta de um customer já gravado. `stripeConta` nulo com customer só existe em cadastro anterior
 * à coluna — a migração 0149 grava SYNCRONIZA neles, e o fallback repete a mesma regra. Nunca
 * deduzir pela conta de vendas: ela muda, o customer não.
 */
export function resolveStripeAccount(stripeConta: TStripeAccountEnum | null | undefined): TStripeAccountEnum {
	return stripeConta ?? "SYNCRONIZA";
}

/**
 * As duas contas entregam na mesma URL de webhook. A assinatura identifica a origem: o segredo
 * que valida o evento diz de qual conta ele veio. Null = nenhum segredo valida.
 */
export function constructStripeWebhookEvent({ body, signature }: { body: string; signature: string }) {
	for (const account of StripeAccountEnum.options) {
		const { webhookSecret } = STRIPE_ACCOUNT_CREDENTIALS[account];
		if (!webhookSecret) continue;
		try {
			const event = Stripe.webhooks.constructEvent(body, signature, webhookSecret);
			return { event, account };
		} catch {
			// Segredo de outra conta (ou assinatura inválida): tenta o próximo.
		}
	}
	return null;
}
