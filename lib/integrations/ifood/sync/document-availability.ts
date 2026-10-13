import { db } from "@/services/drizzle";
import { catalogLinks } from "@/services/drizzle/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import { loadChannelState } from "@/lib/products/sales-channels-store";
import { resolveChannelOptionAvailability } from "@/lib/products/sales-channels";
import { applyManagedOptionAvailability } from "../option-state";
import type { TIfoodItemDocument } from "../item-document";

/** Chamado imediatamente antes de TODO PUT /items, inclusive o editor do catálogo. */
export async function protectManagedOptionAvailability(merchantId: string, doc: TIfoodItemDocument) {
	const desired = new Map<string, { disponivel: boolean; excluida: boolean }>();
	if (!doc.options.length) return desired;
	const links = await db.query.catalogLinks.findMany({
		where: and(
			eq(catalogLinks.provider, "IFOOD"),
			eq(catalogLinks.merchantId, merchantId),
			eq(catalogLinks.tipo, "ADD_ON_OPCAO"),
			ne(catalogLinks.status, "DESVINCULADO"),
			inArray(
				catalogLinks.externoOptionId,
				doc.options.map((option) => option.id),
			),
		),
		with: { produtoAddOnOpcao: true },
	});
	for (const orgId of new Set(links.map((link) => link.organizacaoId))) {
		const channel = await loadChannelState({ orgId, canal: "IFOOD", refExterno: merchantId });
		for (const link of links.filter((link) => link.organizacaoId === orgId)) {
			const option = link.produtoAddOnOpcao;
			if (!option || option.organizacaoId !== orgId || !link.externoOptionId) continue;
			const deleted = !!option.dataExclusao;
			if (!deleted && !link.sincronizar.disponibilidade) continue;
			if (desired.has(link.externoOptionId)) throw new Error("A opção do iFood tem vínculos conflitantes entre organizações.");
			desired.set(link.externoOptionId, {
				disponivel: !deleted && resolveChannelOptionAvailability(option, channel?.optionOverrides),
				excluida: deleted,
			});
		}
	}
	applyManagedOptionAvailability(doc, desired);
	return desired;
}
