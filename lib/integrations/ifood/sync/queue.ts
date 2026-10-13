import { pushAddOnGroupToLinkedMerchants } from "./add-ons";
import { pushProductToLinkedMerchants } from "./push";
import { assertCatalogPushComplete, catalogPushRetry } from "./queue-policy";

/**
 * Transporte do push de catálogo para o iFood (produto ou grupo de adicionais).
 *
 * O push roda DEPOIS da resposta do save: o cadastro não pode falhar nem esperar pelo iFood. Antes
 * ele era um `void push()` solto na função da rota — na Vercel a função é congelada assim que
 * responde, o push só acordava quando outra requisição caía na mesma instância e o timeout de 30s
 * do axios, que continuou contando, estourava no meio de um lote (gelato da Congelatte, 03/10/2026).
 *
 * - `queue` (padrão na Vercel): publica em Vercel Queues; o consumer em
 *   `app/api/queues/ifood-catalog-push` roda o push com `maxDuration` próprio e retry se a função
 *   morrer no meio. Seguro de reentregar: o push é diferencial por `ultimo_snapshot` e marca cada
 *   vínculo ao aplicar, então a segunda passada só refaz o que faltou.
 * - `inline` (fora da Vercel, ou `IFOOD_CATALOG_PUSH_TRANSPORT=inline` como rollback): o mesmo
 *   `void push()` de antes — em dev a função não é congelada.
 */
export const IFOOD_CATALOG_PUSH_TOPIC = "ifood-catalog-push";

export type TIfoodCatalogPushMessage = { orgId: string } & (
	| { tipo: "PRODUTO"; produtoId: string }
	| { tipo: "ADD_ON_GROUP"; produtoAddOnId: string; availabilityOnly?: boolean }
);

/** Chave de serialização: dois pushes do mesmo nó não rodam ao mesmo tempo (ver o consumer). */
export function ifoodCatalogPushLockKey(message: TIfoodCatalogPushMessage) {
	const nodeId = message.tipo === "PRODUTO" ? message.produtoId : message.produtoAddOnId;
	return `ifood-catalog-push:${message.orgId}:${message.tipo}:${nodeId}`;
}

export async function runIfoodCatalogPush(message: TIfoodCatalogPushMessage) {
	if (message.tipo === "PRODUTO") return pushProductToLinkedMerchants({ orgId: message.orgId, produtoId: message.produtoId });
	return pushAddOnGroupToLinkedMerchants({ orgId: message.orgId, produtoAddOnId: message.produtoAddOnId, availabilityOnly: message.availabilityOnly });
}

function transport(): "queue" | "inline" {
	const forced = process.env.IFOOD_CATALOG_PUSH_TRANSPORT;
	if (forced === "queue" || forced === "inline") return forced;
	return process.env.VERCEL ? "queue" : "inline";
}

function runInline(message: TIfoodCatalogPushMessage) {
	void (async () => {
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				assertCatalogPushComplete(await runIfoodCatalogPush(message));
				return;
			} catch (error) {
				const decision = catalogPushRetry(error, attempt);
				console.error("[IFOOD_PUSH] Falha no push assíncrono.", { ...message, tentativa: attempt, error });
				if ("acknowledge" in decision) return;
				await new Promise((resolve) => setTimeout(resolve, decision.afterSeconds * 1000));
			}
		}
	})();
}

/**
 * Agenda o push sem bloquear o chamador. Se a fila recusar a publicação, cai no inline em vez de
 * falhar o save — o pior caso volta a ser o comportamento antigo, não um cadastro perdido.
 */
export async function scheduleIfoodCatalogPush(message: TIfoodCatalogPushMessage): Promise<void> {
	if (transport() === "inline") return runInline(message);
	try {
		// Import dinâmico: o SDK da fila só carrega onde o transporte está ativo.
		const { send } = await import("@vercel/queue");
		// Pequeno atraso: saves em sequência (produto + canais) tendem a virar um push só com o
		// estado final, e quem chegar depois encontra o lock do consumer e espera.
		await send(IFOOD_CATALOG_PUSH_TOPIC, message, { delaySeconds: 3 });
	} catch (error) {
		console.error("[IFOOD_PUSH] Falha ao publicar na fila; executando inline.", { ...message, error });
		runInline(message);
	}
}

export function schedulePushForProduct({ orgId, produtoId }: { orgId: string; produtoId: string }) {
	return scheduleIfoodCatalogPush({ tipo: "PRODUTO", orgId, produtoId });
}

export function scheduleAddOnGroupPush({
	orgId,
	produtoAddOnId,
	availabilityOnly,
}: {
	orgId: string;
	produtoAddOnId: string;
	availabilityOnly?: boolean;
}) {
	return scheduleIfoodCatalogPush({ tipo: "ADD_ON_GROUP", orgId, produtoAddOnId, availabilityOnly });
}
