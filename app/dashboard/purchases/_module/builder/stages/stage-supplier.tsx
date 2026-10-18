"use client";

import { StageShell } from "@/app/dashboard/growth/campaigns/_module/builder/components/stage-shell";
import DateInput from "@/components/Inputs/DateInput";
import SelectSupplierInput from "@/components/Inputs/SelectSupplierInput";
import TextInput from "@/components/Inputs/TextInput";
import PurchaseOrderBlock from "@/components/Modals/Purchases/Blocks/Order";
import { Separator } from "@/components/ui/separator";
import { formatDateForInputValue, formatDateOnInputChange, formatToCNPJ, formatToPhone } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { Building2 } from "lucide-react";
import { BUILDER_STAGES } from "../helpers/stages";
import { useBuilder } from "../components/builder-provider";
import { FieldLabel, SectionLabel, StaticField, TONE_CLASSES } from "../components/builder-ui";

export default function StageSupplier() {
	const { origin, back, next, state, updatePurchase } = useBuilder();
	const stage = BUILDER_STAGES.supplier;

	return (
		<StageShell>
			<StageShell.Title icon={stage.icon} label={stage.label} description={stage.description} />
			<StageShell.Body>
				{origin === "document" ? <DocumentSupplier /> : <PurchaseOrderBlock purchase={state.purchase} updatePurchase={updatePurchase} />}
			</StageShell.Body>
			<StageShell.Footer onBack={back} onNext={next} />
		</StageShell>
	);
}

function DocumentSupplier() {
	const { state, updatePurchase, importData, newSupplier, updateNewSupplier, pickExistingSupplier, clearSupplier, readFields, clearReadField } =
		useBuilder();
	const purchase = state.purchase;
	const documento = importData?.documento ?? null;
	const extracted = importData?.fornecedor?.extraido ?? null;
	const isNew = !!newSupplier && !purchase.fornecedorId;
	const cnpj = isNew ? newSupplier?.cpfCnpj : purchase.pedidoFornecedorCnpj;
	const supplierMeta = [
		cnpj ? `CNPJ ${formatToCNPJ(cnpj)}` : null,
		isNew && newSupplier?.inscricaoEstadual ? `IE ${newSupplier.inscricaoEstadual}` : null,
		extracted?.cidade ?? null,
	]
		.filter(Boolean)
		.join(" · ");
	const hasSupplier = isNew || !!purchase.fornecedorId;

	function updateContact(field: "telefone" | "email", value: string) {
		clearReadField(field);
		if (field === "telefone") {
			const telefone = formatToPhone(value);
			updatePurchase({ pedidoFornecedorTelefone: telefone });
			if (isNew) updateNewSupplier({ telefone: telefone || null });
		} else {
			updatePurchase({ pedidoFornecedorEmail: value });
			if (isNew) updateNewSupplier({ email: value || null });
		}
	}

	return (
		<div className="flex w-full flex-col gap-5">
			<div className="flex flex-col gap-2.5">
				<SectionLabel>Fornecedor</SectionLabel>
				{hasSupplier ? (
					<div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3.5">
						<span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
							<Building2 className="h-4.5 w-4.5" />
						</span>
						<div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
							<div className="flex flex-wrap items-center gap-2">
								<span className="text-sm font-semibold">{isNew ? newSupplier?.nome : purchase.pedidoFornecedorNome}</span>
								<span className={cn("rounded-full px-2 py-0.5 text-[0.65rem] font-semibold", isNew ? TONE_CLASSES.warn : TONE_CLASSES.ok)}>
									{isNew ? "NOVO · SERÁ CADASTRADO AO SALVAR" : "JÁ CADASTRADO"}
								</span>
							</div>
							{supplierMeta ? <span className="text-xs text-muted-foreground">{supplierMeta}</span> : null}
						</div>
					</div>
				) : null}
				<SelectSupplierInput
					label={isNew ? "USAR FORNECEDOR EXISTENTE" : "FORNECEDOR"}
					value={purchase.fornecedorId ? { id: purchase.fornecedorId, nome: purchase.pedidoFornecedorNome || "Fornecedor sem nome" } : null}
					onSelect={pickExistingSupplier}
					onClear={clearSupplier}
				/>
				{isNew ? <p className="text-xs text-muted-foreground">Nenhum fornecedor com este CNPJ foi encontrado no seu cadastro.</p> : null}
				{!hasSupplier ? <p className="text-xs text-muted-foreground">O documento não identificou o fornecedor. Escolha um do seu cadastro.</p> : null}
			</div>
			{isNew ? (
				<TextInput
					label="NOME DO FORNECEDOR"
					value={newSupplier?.nome ?? ""}
					placeholder="Razão social do fornecedor..."
					handleChange={(value) => {
						updateNewSupplier({ nome: value ?? "" });
						updatePurchase({ pedidoFornecedorNome: value ?? "" });
					}}
				/>
			) : null}
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
				<div className="flex flex-col gap-1">
					<FieldLabel read={readFields.has("telefone")}>TELEFONE</FieldLabel>
					<TextInput
						label="TELEFONE"
						showLabel={false}
						value={purchase.pedidoFornecedorTelefone ?? ""}
						placeholder="Não consta na nota"
						handleChange={(value) => updateContact("telefone", value ?? "")}
					/>
				</div>
				<div className="flex flex-col gap-1">
					<FieldLabel read={readFields.has("email")}>EMAIL</FieldLabel>
					<TextInput
						label="EMAIL"
						showLabel={false}
						value={purchase.pedidoFornecedorEmail ?? ""}
						placeholder="Não consta na nota"
						handleChange={(value) => updateContact("email", value ?? "")}
					/>
				</div>
			</div>
			<Separator />
			<div className="flex flex-col gap-2.5">
				<SectionLabel>Pedido</SectionLabel>
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<div className="flex flex-col gap-1">
						<FieldLabel read={!!documento?.numero}>Nº DO DOCUMENTO</FieldLabel>
						<StaticField muted={!documento?.numero}>
							{documento?.numero ? `${documento.numero}${documento.serie ? ` · série ${documento.serie}` : ""}` : "Não consta no documento"}
						</StaticField>
					</div>
					<div className="flex flex-col gap-1">
						<FieldLabel read={readFields.has("pedidoData")}>DATA DO PEDIDO</FieldLabel>
						<DateInput
							label="DATA DO PEDIDO"
							showLabel={false}
							value={formatDateForInputValue(purchase.pedidoData)}
							handleChange={(value) => {
								clearReadField("pedidoData");
								updatePurchase({ pedidoData: formatDateOnInputChange(value, "date") });
							}}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
