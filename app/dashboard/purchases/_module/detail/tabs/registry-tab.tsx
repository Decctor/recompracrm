"use client";

import DateInput from "@/components/Inputs/DateInput";
import SelectSupplierInput from "@/components/Inputs/SelectSupplierInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import TextInput from "@/components/Inputs/TextInput";
import { Section } from "@/components/ui/section";
import { formatDateAsLocale, formatDateForInputValue, formatDateOnInputChange, formatToCNPJ } from "@/lib/formatting";
import type { TUsePurchaseState } from "@/state-hooks/use-purchase-state";
import { Building2, LayoutGrid, Truck } from "lucide-react";
import { FieldLabel, StaticField } from "../../builder/components/builder-ui";
import type { TPurchaseById } from "../helpers/hydrate";

type RegistryTabProps = {
	purchase: TPurchaseById;
	editor: TUsePurchaseState;
	editable: boolean;
};

export default function RegistryTab({ purchase, editor, editable }: RegistryTabProps) {
	const { state, updatePurchase } = editor;
	const current = state.purchase;
	const document = purchase.documentosImportados?.documentos?.[0] ?? null;

	return (
		<div className="flex w-full flex-col gap-6">
			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<LayoutGrid />
					</Section.Icon>
					<Section.Title>Informações gerais</Section.Title>
				</Section.Header>
				<Section.Body>
					<TextInput
						label="TÍTULO"
						value={current.titulo}
						placeholder="Preencha aqui o título da compra..."
						editable={editable}
						handleChange={(value) => updatePurchase({ titulo: value ?? "" })}
					/>
					<TextareaInput
						label="ANOTAÇÕES"
						value={current.anotacoes ?? ""}
						placeholder="Preencha aqui anotações sobre a compra..."
						editable={editable}
						handleChange={(value) => updatePurchase({ anotacoes: value || null })}
					/>
				</Section.Body>
			</Section.Root>

			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<Building2 />
					</Section.Icon>
					<Section.Title>Fornecedor & pedido</Section.Title>
				</Section.Header>
				<Section.Body className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
					<SelectSupplierInput
						label="FORNECEDOR"
						editable={editable}
						value={current.fornecedorId ? { id: current.fornecedorId, nome: current.pedidoFornecedorNome || "Fornecedor sem nome" } : null}
						onSelect={(supplier) =>
							updatePurchase({
								fornecedorId: supplier.id,
								pedidoFornecedorNome: supplier.nome,
								pedidoFornecedorCnpj: supplier.cpfCnpj ? formatToCNPJ(supplier.cpfCnpj) : current.pedidoFornecedorCnpj,
								pedidoFornecedorTelefone: supplier.telefone || current.pedidoFornecedorTelefone,
								pedidoFornecedorEmail: supplier.email || current.pedidoFornecedorEmail,
							})
						}
						onClear={() => updatePurchase({ fornecedorId: null })}
					/>
					<TextInput
						label="CNPJ"
						value={current.pedidoFornecedorCnpj ?? ""}
						placeholder="CNPJ do fornecedor"
						editable={editable}
						handleChange={(value) => updatePurchase({ pedidoFornecedorCnpj: formatToCNPJ(value ?? "") })}
					/>
					<div className="flex flex-col gap-1">
						<FieldLabel>Nº DO DOCUMENTO</FieldLabel>
						<StaticField muted={!document?.numero}>
							{document?.numero ? `${document.numero}${document.serie ? ` · série ${document.serie}` : ""}` : "Sem documento importado"}
						</StaticField>
					</div>
					<DateInput
						label="DATA DO PEDIDO"
						value={formatDateForInputValue(current.pedidoData)}
						editable={editable}
						handleChange={(value) => updatePurchase({ pedidoData: formatDateOnInputChange(value, "date") })}
					/>
				</Section.Body>
			</Section.Root>

			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<Truck />
					</Section.Icon>
					<Section.Title>Entrega & transporte</Section.Title>
				</Section.Header>
				<Section.Body className="grid grid-cols-1 gap-3 md:grid-cols-3">
					<TextInput
						label="TRANSPORTADORA"
						value={current.transporteTransportadoraNome ?? ""}
						placeholder="Opcional"
						editable={editable}
						handleChange={(value) => updatePurchase({ transporteTransportadoraNome: value || null })}
					/>
					<DateInput
						label="PREVISÃO DE ENTREGA"
						value={formatDateForInputValue(current.entregaDataRecebimentoPrevisao)}
						editable={editable}
						handleChange={(value) => updatePurchase({ entregaDataRecebimentoPrevisao: formatDateOnInputChange(value, "date") })}
					/>
					<div className="flex flex-col gap-1">
						<FieldLabel>RECEBIDA EM</FieldLabel>
						<StaticField muted={!purchase.entregaDataRecebimentoEfetivacao}>
							{purchase.entregaDataRecebimentoEfetivacao ? formatDateAsLocale(purchase.entregaDataRecebimentoEfetivacao) : "Ainda não recebida"}
						</StaticField>
					</div>
				</Section.Body>
			</Section.Root>
		</div>
	);
}
