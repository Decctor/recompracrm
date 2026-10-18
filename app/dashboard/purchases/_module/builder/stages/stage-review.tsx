"use client";

import { StageShell } from "@/app/dashboard/growth/campaigns/_module/builder/components/stage-shell";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import { Boxes, Brain, Building2, FileText, PackagePlus, ShoppingCart, Truck, Wallet, type LucideIcon } from "lucide-react";
import { resolveNewProducts } from "../helpers/review-lines";
import type { TBuilderStageId } from "../helpers/stages";
import { BUILDER_STAGES } from "../helpers/stages";
import { useBuilder } from "../components/builder-provider";
import { SectionLabel } from "../components/builder-ui";
import { useBuilderSummary } from "../components/use-builder-summary";

export default function StageReview({ onSubmit, submitting }: { onSubmit: () => void; submitting: boolean }) {
	const { back, setCurrentStage, state, lines, newSupplier, received, importData } = useBuilder();
	const summary = useBuilderSummary();
	const stage = BUILDER_STAGES.review;
	const purchase = state.purchase;
	const entry = state.lancamentoContabil;
	const activeTransactions = entry.transacoes.filter((transaction) => !transaction.deletar);
	const { newProducts } = resolveNewProducts(lines);
	const supplierName = newSupplier?.nome ?? purchase.pedidoFornecedorNome ?? null;
	const hasSupplier = !!newSupplier || !!purchase.fornecedorId;
	const rememberedCount = hasSupplier
		? lines.filter(
				(line) => line.incluir && line.lembrarVinculo && (line.codigoFornecedor?.trim() || line.ean?.trim()) && (line.produto || line.produtoNovo),
			).length
		: 0;
	const documento = importData?.documento ?? null;

	const cards: { icon: LucideIcon; label: string; main: string; sub: string; stage: TBuilderStageId }[] = [
		{
			icon: Building2,
			label: "Fornecedor",
			main: supplierName ?? "Sem fornecedor",
			sub: documento?.numero
				? `NF-e ${documento.numero}${purchase.pedidoData ? ` · ${formatDateAsLocale(purchase.pedidoData)}` : ""}`
				: purchase.pedidoData
					? `Pedido de ${formatDateAsLocale(purchase.pedidoData)}`
					: "Sem documento",
			stage: "supplier",
		},
		{
			icon: ShoppingCart,
			label: "Itens",
			main: `${summary.itemsCount} ${summary.itemsCount === 1 ? "item" : "itens"} · ${formatToMoney(summary.itemsTotal)}`,
			sub: summary.ignoredCount
				? `${summary.ignoredCount} ${summary.ignoredCount === 1 ? "linha não incluída" : "linhas não incluídas"}`
				: lines.length
					? "Todas as linhas da nota"
					: "Itens informados à mão",
			stage: "items",
		},
		{
			icon: Wallet,
			label: "Financeiro",
			main: formatToMoney(entry.valor),
			sub: `${activeTransactions.length} ${activeTransactions.length === 1 ? "transação" : "transações"} · ${summary.transactionsBalanced ? "balanceado" : "pendente"}`,
			stage: "finance",
		},
		{
			icon: Truck,
			label: "Entrega",
			main: received ? "Receber agora" : "Aguardando chegada",
			sub: purchase.entregaDataRecebimentoPrevisao
				? `Previsão ${formatDateAsLocale(purchase.entregaDataRecebimentoPrevisao)}`
				: "Sem previsão de entrega",
			stage: "delivery",
		},
	];

	const effects: { icon: LucideIcon; text: string }[] = [];
	if (newSupplier) effects.push({ icon: Building2, text: `Cadastrar o fornecedor ${newSupplier.nome}.` });
	if (newProducts.length > 0)
		effects.push({
			icon: PackagePlus,
			text: `Criar ${newProducts.length} ${newProducts.length === 1 ? "produto" : "produtos"} no catálogo: ${newProducts.map((product) => product.nome).join(", ")}.`,
		});
	if (rememberedCount > 0)
		effects.push({
			icon: Brain,
			text: `Lembrar ${rememberedCount} ${rememberedCount === 1 ? "vínculo" : "vínculos"} para as próximas notas de ${supplierName ?? "este fornecedor"}.`,
		});
	effects.push({
		icon: FileText,
		text: `Criar o lançamento contábil de ${formatToMoney(entry.valor)}${activeTransactions.length ? ` com ${activeTransactions.length} ${activeTransactions.length === 1 ? "transação" : "transações"} a pagar` : ""}.`,
	});
	effects.push({
		icon: Boxes,
		text: received
			? `Dar entrada de ${summary.itemsCount} ${summary.itemsCount === 1 ? "item" : "itens"} no estoque agora e travar a composição.`
			: "Dar entrada no estoque somente quando você registrar o recebimento.",
	});

	return (
		<StageShell>
			<StageShell.Title icon={stage.icon} label={stage.label} description={stage.description} />
			<StageShell.Body>
				<div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
					{cards.map((card) => (
						<div key={card.label} className="flex flex-col gap-1.5 rounded-xl border border-border px-3.5 py-3">
							<div className="flex items-center justify-between">
								<span className="flex items-center gap-1.5 text-[0.7rem] font-extrabold uppercase tracking-widest text-muted-foreground">
									<card.icon className="h-3 w-3" />
									{card.label}
								</span>
								<button type="button" onClick={() => setCurrentStage(card.stage)} className="text-[0.7rem] font-semibold text-primary hover:underline">
									EDITAR
								</button>
							</div>
							<span className="text-sm font-semibold">{card.main}</span>
							<span className="text-xs text-muted-foreground">{card.sub}</span>
						</div>
					))}
				</div>
				<div className="flex flex-col gap-2 rounded-xl bg-muted/70 p-3.5">
					<SectionLabel>Ao confirmar, o sistema vai</SectionLabel>
					<ul className="flex flex-col gap-1.5 text-[0.82rem]">
						{effects.map((effect) => (
							<li key={effect.text} className="flex items-start gap-2">
								<effect.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
								<span>{effect.text}</span>
							</li>
						))}
					</ul>
				</div>
			</StageShell.Body>
			<StageShell.Footer
				onBack={back}
				isFinalStage
				onFinal={onSubmit}
				finalLoading={submitting}
				finalLabel={received ? "CONFIRMAR E RECEBER" : "CONFIRMAR COMPRA"}
				nextDisabled={!!summary.firstInvalid}
				nextDisabledReason={summary.firstInvalid?.reason}
			/>
		</StageShell>
	);
}
