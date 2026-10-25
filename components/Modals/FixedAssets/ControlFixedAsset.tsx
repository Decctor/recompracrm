"use client";

import DateInput from "@/components/Inputs/DateInput";
import NumberInput from "@/components/Inputs/NumberInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatDateAsLocale, formatDateForInputValue, formatDateOnInputChange, formatToMoney } from "@/lib/formatting";
import { runFixedAssetAction, updateFixedAsset } from "@/lib/mutations/fixed-assets";
import { appRoutes } from "@/lib/navigation/routes";
import { useFixedAssetById } from "@/lib/queries/fixed-assets";
import { FIXED_ASSET_STATUS_LABELS } from "@/schemas/enums";
import { serializeFixedAssetState, useInternalFixedAssetState } from "@/state-hooks/use-internal-fixed-asset-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Scissors, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import FixedAssetGeneralBlock from "./Blocks/General";
import FixedAssetValuesBlock from "./Blocks/Values";

type ControlFixedAssetProps = {
	assetId: string;
	closeModal: () => void;
	editable?: boolean;
};

export default function ControlFixedAsset({ assetId, closeModal, editable = true }: ControlFixedAssetProps) {
	const queryClient = useQueryClient();
	const { data: asset, isLoading, isError, error, queryKey } = useFixedAssetById({ assetId });
	const { state, updateAsset, redefineState } = useInternalFixedAssetState();
	const hydratedRef = useRef<string | null>(null);
	const [split, setSplit] = useState({ parte: 1, codigoPatrimonio: "" });
	const [writeOff, setWriteOff] = useState({ parte: 0, dataBaixa: new Date(), motivoBaixa: "", valorBaixa: 0 });

	useEffect(() => {
		if (!asset || hydratedRef.current === asset.id) return;
		hydratedRef.current = asset.id;
		redefineState({
			asset: {
				produtoId: asset.produtoId,
				produtoVarianteId: asset.produtoVarianteId,
				produtoNome: asset.produto?.nome ?? null,
				codigoPatrimonio: asset.codigoPatrimonio,
				descricao: asset.descricao,
				numeroSerie: asset.numeroSerie,
				localizacao: asset.localizacao,
				responsavelId: asset.responsavelId,
				status: asset.status,
				quantidade: asset.quantidade,
				valorAquisicao: asset.valorAquisicao,
				dataInicioUso: new Date(asset.dataInicioUso),
				vidaUtilMeses: asset.vidaUtilMeses,
				valorResidual: asset.valorResidual,
				depreciacaoAcumuladaInicial: asset.depreciacaoAcumuladaInicial,
				creditoIcmsCiap: asset.creditoIcmsCiap,
				anotacoes: asset.anotacoes,
			},
		});
	}, [asset, redefineState]);

	async function refresh() {
		await queryClient.invalidateQueries({ queryKey: ["fixed-assets"] });
		await queryClient.invalidateQueries({ queryKey });
	}

	const { mutate: save, isPending: saving } = useMutation({
		mutationKey: ["update-fixed-asset", assetId],
		mutationFn: updateFixedAsset,
		onSuccess: async (response) => {
			await refresh();
			toast.success(response.message);
			closeModal();
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});
	const { mutate: runAction, isPending: acting } = useMutation({
		mutationKey: ["fixed-asset-action", assetId],
		mutationFn: runFixedAssetAction,
		onSuccess: async (response) => {
			await refresh();
			toast.success(response.message);
			if (response.data.closing) closeModal();
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	const isWrittenOff = asset?.status === "BAIXADO";
	const fromPurchase = !!asset?.compraItemId;
	const canEdit = editable && !isWrittenOff;

	return (
		<ResponsiveMenu
			menuTitle={isWrittenOff ? "BEM BAIXADO" : "EDITAR BEM"}
			menuDescription={asset ? `${FIXED_ASSET_STATUS_LABELS[asset.status]} · ${asset.quantidade} un. · aquisição ${formatToMoney(asset.valorAquisicao)}` : "Carregando bem..."}
			menuActionButtonText="SALVAR"
			menuCancelButtonText="FECHAR"
			actionFunction={() => save({ assetId, asset: serializeFixedAssetState(state.asset) })}
			actionIsLoading={saving}
			stateIsLoading={isLoading}
			stateError={isError ? getErrorMessage(error) : null}
			closeMenu={closeModal}
			dialogVariant="lg"
		>
			{asset ? (
				<ResponsiveMenuSection title="POSIÇÃO CONTÁBIL" icon={<Scissors className="h-4 w-4 opacity-0" />}>
					<div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
						<Stat label="MESES EM USO" value={String(asset.posicao.mesesEmUso)} />
						<Stat label="DEPRECIAÇÃO ACUMULADA" value={formatToMoney(asset.posicao.depreciacaoAcumulada)} />
						<Stat label="VALOR CONTÁBIL" value={formatToMoney(asset.posicao.valorContabil)} />
						<Stat label="CIAP APROPRIADO / RESTANTE" value={`${formatToMoney(asset.posicao.ciapApropriado)} / ${formatToMoney(asset.posicao.ciapRestante)}`} />
					</div>
					<p className="text-xs text-muted-foreground">
						Posição até {asset.posicao.mesReferencia}
						{asset.ultimoFechamento ? ` · último fechamento lançado: ${asset.ultimoFechamento}` : " · nenhum fechamento mensal lançado ainda"}.
						{asset.compra ? (
							<>
								{" "}
								Origem:{" "}
								<Link href={appRoutes.purchase(asset.compra.id)} className="underline">
									{asset.compra.titulo}
								</Link>
								.
							</>
						) : null}
						{isWrittenOff ? ` Baixado em ${formatDateAsLocale(asset.dataBaixa)}: ${asset.motivoBaixa ?? "sem motivo informado"}.` : null}
					</p>
				</ResponsiveMenuSection>
			) : null}
			<FixedAssetGeneralBlock asset={state.asset} updateAsset={updateAsset} productEditable={!fromPurchase} editable={canEdit} />
			<FixedAssetValuesBlock asset={state.asset} updateAsset={updateAsset} acquisitionEditable={!fromPurchase} editable={canEdit} />
			{canEdit && asset && asset.quantidade > 1 ? (
				<ResponsiveMenuSection title="DIVIDIR O REGISTRO" icon={<Scissors className="h-4 w-4" />}>
					<p className="text-xs text-muted-foreground">
						Separa unidades num registro próprio (plaqueta individual), com valores proporcionais. Datas e vida útil continuam as mesmas.
					</p>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
						<NumberInput label="UNIDADES" placeholder="1" value={split.parte} handleChange={(value) => setSplit((prev) => ({ ...prev, parte: Math.round(value) }))} />
						<TextInput
							label="PLAQUETA DO SEPARADO"
							placeholder="Opcional"
							value={split.codigoPatrimonio}
							handleChange={(value) => setSplit((prev) => ({ ...prev, codigoPatrimonio: value }))}
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={acting || split.parte < 1 || split.parte >= asset.quantidade}
							onClick={() => runAction({ action: "DIVIDIR", assetId, parte: split.parte, separado: { codigoPatrimonio: split.codigoPatrimonio || null } })}
						>
							DIVIDIR
						</Button>
					</div>
				</ResponsiveMenuSection>
			) : null}
			{canEdit && asset ? (
				<ResponsiveMenuSection title="BAIXAR O BEM" icon={<Trash2 className="h-4 w-4" />}>
					<p className="text-xs text-muted-foreground">
						A baixa encerra a depreciação e o CIAP e lança a saída do bem (depreciação acumulada e valor contábil contra o imobilizado). Informe
						unidades para baixar só parte do registro.
					</p>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<DateInput
							label="DATA DA BAIXA"
							value={formatDateForInputValue(writeOff.dataBaixa)}
							handleChange={(value) => setWriteOff((prev) => ({ ...prev, dataBaixa: formatDateOnInputChange(value, "date") ?? prev.dataBaixa }))}
							required
						/>
						<NumberInput
							label={asset.quantidade > 1 ? `UNIDADES (VAZIO = TODAS AS ${asset.quantidade})` : "UNIDADES"}
							placeholder="Todas"
							value={writeOff.parte}
							editable={asset.quantidade > 1}
							handleChange={(value) => setWriteOff((prev) => ({ ...prev, parte: Math.round(value) }))}
						/>
						<TextInput
							label="MOTIVO"
							placeholder="Ex.: venda, sucata, roubo, obsolescência"
							value={writeOff.motivoBaixa}
							handleChange={(value) => setWriteOff((prev) => ({ ...prev, motivoBaixa: value }))}
							required
						/>
						<NumberInput
							label="VALOR RECEBIDO (SE VENDIDO)"
							placeholder="0,00"
							value={writeOff.valorBaixa}
							handleChange={(value) => setWriteOff((prev) => ({ ...prev, valorBaixa: value }))}
						/>
					</div>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						className="w-fit"
						disabled={acting || writeOff.motivoBaixa.trim().length < 3 || (writeOff.parte > 0 && writeOff.parte >= asset.quantidade)}
						onClick={() =>
							runAction({
								action: "BAIXAR",
								assetId,
								parte: writeOff.parte > 0 && writeOff.parte < asset.quantidade ? writeOff.parte : null,
								dataBaixa: writeOff.dataBaixa.toISOString(),
								motivoBaixa: writeOff.motivoBaixa,
								valorBaixa: writeOff.valorBaixa > 0 ? writeOff.valorBaixa : null,
							})
						}
					>
						<Trash2 className="h-3.5 w-3.5" />
						REGISTRAR BAIXA
					</Button>
				</ResponsiveMenuSection>
			) : null}
		</ResponsiveMenu>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
			<span className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground">{label}</span>
			<span className="font-mono text-sm font-semibold">{value}</span>
		</div>
	);
}
