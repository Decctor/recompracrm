"use client";
import { FiscalCreditChoices } from "@/components/Fiscal/FiscalCreditChoices";
import { useFiscalPreview } from "@/lib/queries/fiscal-preview";
import { useInternalFiscalDocumentState } from "@/state-hooks/use-internal-fiscal-document-state";

import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import { EXCEPTIONAL_PRESENCE_JUSTIFICATION_MAX_LENGTH, EXCEPTIONAL_PRESENCE_JUSTIFICATION_MIN_LENGTH } from "@/lib/fiscal/exceptional-presence";
import { emitFiscalDocumentMutation } from "@/lib/mutations/fiscal";
import { cn } from "@/lib/utils";
import type { TDeliveryModeEnum, TFiscalDocumentTypeEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ReceiptText } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type TEmissionMode = "REGULAR" | "PRESENCIAL_EXCEPCIONAL";

type ManualFiscalEmissionProps = {
	saleId: string;
	tipo?: Extract<TFiscalDocumentTypeEnum, "NFCE" | "NFE">;
	entregaModalidade?: TDeliveryModeEnum | null;
	exceptionalPresenceEnabled: boolean;
	// Crédito de ICMS por operação ligado na organização. Desligado, a emissão não consulta a prévia.
	resaleCreditEnabled: boolean;
	canConfigureFiscal: boolean;
	closeMenu: () => void;
};

export default function ManualFiscalEmission({
	saleId,
	tipo,
	entregaModalidade,
	exceptionalPresenceEnabled,
	resaleCreditEnabled,
	canConfigureFiscal,
	closeMenu,
}: ManualFiscalEmissionProps) {
	const queryClient = useQueryClient();
	const { state: fiscalState, updateDocument } = useInternalFiscalDocumentState({ initialState: { vendaId: saleId, tipo } });
	const preview = useFiscalPreview(
		{
			saleId,
			entregaModalidade: entregaModalidade ?? "PRESENCIAL",
			emissaoFiscalDocumento: tipo,
			fiscalDestinacao: fiscalState.fiscalDestinacao,
			fiscalCreditoIcms: fiscalState.fiscalCreditoIcms,
		},
		resaleCreditEnabled,
	);
	const credit = preview.data?.creditoIcms;
	useEffect(() => {
		if (!credit?.habilitado || fiscalState.fiscalDestinacao !== undefined) return;
		const destination = credit.escolhas.fiscalDestinacao ?? credit.destinacaoSugerida;
		updateDocument({
			fiscalDestinacao: destination,
			fiscalCreditoIcms: credit.escolhas.fiscalCreditoIcms ?? (destination === "CONSUMO_FINAL" ? "SEM_CREDITO" : "NAO_CONFIRMADO"),
		});
	}, [
		credit?.habilitado,
		credit?.destinacaoSugerida,
		credit?.escolhas.fiscalDestinacao,
		credit?.escolhas.fiscalCreditoIcms,
		fiscalState.fiscalDestinacao,
		updateDocument,
	]);
	const choices = {
		fiscalDestinacao: fiscalState.fiscalDestinacao === undefined ? credit?.escolhas.fiscalDestinacao : fiscalState.fiscalDestinacao,
		fiscalCreditoIcms: fiscalState.fiscalCreditoIcms === undefined ? credit?.escolhas.fiscalCreditoIcms : fiscalState.fiscalCreditoIcms,
	};
	// Só o fluxo de crédito depende da prévia; sem ele a emissão segue como antes.
	const creditBlocked =
		resaleCreditEnabled && (preview.isLoading || preview.isError || (!!credit?.habilitado && (preview.isFetching || credit.problemas.length > 0)));
	const [mode, setMode] = useState<TEmissionMode>("REGULAR");
	const [justification, setJustification] = useState("");
	const [acknowledged, setAcknowledged] = useState(false);
	const canOfferExceptionalMode = entregaModalidade === "ENTREGA" && exceptionalPresenceEnabled && canConfigureFiscal;
	const normalizedJustification = justification.trim();
	const exceptionalModeIsValid =
		mode === "PRESENCIAL_EXCEPCIONAL" &&
		acknowledged &&
		normalizedJustification.length >= EXCEPTIONAL_PRESENCE_JUSTIFICATION_MIN_LENGTH &&
		normalizedJustification.length <= EXCEPTIONAL_PRESENCE_JUSTIFICATION_MAX_LENGTH;

	const mutation = useMutation({
		mutationKey: ["manual-fiscal-emission", saleId, tipo ?? "automatic-type"],
		mutationFn: emitFiscalDocumentMutation,
		onSuccess: async (response) => {
			toast.success(response.message);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["sales"] }),
				queryClient.invalidateQueries({ queryKey: ["sales-by-id", saleId] }),
				queryClient.invalidateQueries({ queryKey: ["fiscal-documents"] }),
			]);
			closeMenu();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const emitDocument = () => {
		if (mode === "PRESENCIAL_EXCEPCIONAL") {
			if (!exceptionalModeIsValid) return;
			mutation.mutate({
				vendaId: saleId,
				tipo,
				...(credit?.habilitado ? choices : {}),
				classificacaoPresencialExcepcional: {
					confirmada: true,
					justificativa: normalizedJustification,
				},
			});
			return;
		}
		mutation.mutate({ vendaId: saleId, tipo, ...(credit?.habilitado ? choices : {}) });
	};

	return (
		<ResponsiveMenu
			menuTitle={tipo ? "EMITIR DOCUMENTO NOVAMENTE" : "EMITIR NOTA FISCAL"}
			menuDescription="Revise como a presença do consumidor será informada antes de enviar o documento fiscal."
			menuActionButtonText={mode === "PRESENCIAL_EXCEPCIONAL" ? "CONFIRMAR E EMITIR" : "EMITIR DOCUMENTO"}
			menuActionButtonVariant={mode === "PRESENCIAL_EXCEPCIONAL" ? "destructive" : "default"}
			menuActionButtonDisabled={creditBlocked || (mode === "PRESENCIAL_EXCEPCIONAL" && !exceptionalModeIsValid)}
			menuCancelButtonText="VOLTAR"
			actionFunction={emitDocument}
			actionIsLoading={mutation.isPending}
			stateIsLoading={false}
			closeMenu={closeMenu}
			lockClose={mutation.isPending}
		>
			<div className="space-y-4">
				{preview.isError ? (
					<p role="alert" className="text-sm text-destructive">
						{getErrorMessage(preview.error)}
					</p>
				) : null}
				{credit?.habilitado ? (
					<div className="flex flex-col gap-3">
						<FiscalCreditChoices value={choices} onChange={updateDocument} disabled={mutation.isPending} />
						{choices.fiscalCreditoIcms === "COM_CREDITO" && credit.calculo ? (
							<p className="text-sm">
								Crédito previsto: {credit.calculo.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · Competência{" "}
								{credit.competencia} · {credit.calculo.parcelas.map((p) => `${p.percentual}%`).join(", ")}
							</p>
						) : null}
						{credit.problemas.map((problem) => (
							<p key={problem} role="status" className="text-sm text-destructive">
								{problem}
							</p>
						))}
						{canConfigureFiscal ? (
							<a className="text-sm underline" href="/dashboard/fiscal?view=configuration&section=credit-rates" target="_blank" rel="noreferrer">
								Configurar percentuais e grupos tributários
							</a>
						) : null}
					</div>
				) : null}
				<button
					type="button"
					onClick={() => setMode("REGULAR")}
					className={cn(
						"flex w-full items-start gap-3 rounded-lg border-2 p-4 text-left transition-colors",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
						mode === "REGULAR" ? "border-primary bg-primary/5" : "border-transparent bg-muted/40 hover:bg-muted",
					)}
				>
					<CheckCircle2 className={cn("mt-0.5 h-5 w-5 shrink-0", mode === "REGULAR" ? "text-primary" : "text-muted-foreground")} />
					<div>
						<p className="text-sm font-semibold">Usar a natureza real da venda</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Opção recomendada. Vendas com entrega serão informadas como operação não presencial e exigem CPF ou CNPJ válido do destinatário.
						</p>
					</div>
				</button>

				{canOfferExceptionalMode ? (
					<button
						type="button"
						onClick={() => setMode("PRESENCIAL_EXCEPCIONAL")}
						className={cn(
							"flex w-full items-start gap-3 rounded-lg border-2 p-4 text-left transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
							mode === "PRESENCIAL_EXCEPCIONAL" ? "border-destructive bg-destructive/5" : "border-transparent bg-muted/40 hover:bg-muted",
						)}
					>
						<AlertTriangle className={cn("mt-0.5 h-5 w-5 shrink-0", mode === "PRESENCIAL_EXCEPCIONAL" ? "text-destructive" : "text-muted-foreground")} />
						<div>
							<p className="text-sm font-semibold">Declarar como presencial excepcionalmente</p>
							<p className="mt-1 text-xs text-muted-foreground">
								Use somente sob orientação contábil específica. A venda continuará registrada como entrega e esta declaração será auditada.
							</p>
						</div>
					</button>
				) : null}

				{mode === "PRESENCIAL_EXCEPCIONAL" ? (
					<div className="space-y-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
						<div className="flex items-start gap-2 text-sm">
							<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
							<div>
								<p className="font-semibold text-destructive">Evite esta classificação sempre que puder identificar o destinatário.</p>
								<p className="mt-1 text-muted-foreground">A autorização do documento não comprova que a declaração corresponde à operação realizada.</p>
							</div>
						</div>
						<div className="space-y-2">
							<div className="flex items-center justify-between gap-3">
								<Label htmlFor="exceptional-presence-justification">JUSTIFICATIVA OBRIGATÓRIA</Label>
								<span className="text-xs tabular-nums text-muted-foreground">
									{normalizedJustification.length}/{EXCEPTIONAL_PRESENCE_JUSTIFICATION_MAX_LENGTH}
								</span>
							</div>
							<Textarea
								id="exceptional-presence-justification"
								value={justification}
								onChange={(event) => setJustification(event.target.value)}
								maxLength={EXCEPTIONAL_PRESENCE_JUSTIFICATION_MAX_LENGTH}
								rows={4}
								aria-invalid={normalizedJustification.length > 0 && normalizedJustification.length < EXCEPTIONAL_PRESENCE_JUSTIFICATION_MIN_LENGTH}
								placeholder="Descreva a situação excepcional e a orientação contábil recebida."
							/>
							<p className="text-xs text-muted-foreground">
								Mínimo de {EXCEPTIONAL_PRESENCE_JUSTIFICATION_MIN_LENGTH} caracteres. O texto será salvo no histórico fiscal.
							</p>
						</div>
						<div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-background/70 p-3">
							<Checkbox id="confirm-exceptional-presence" checked={acknowledged} onCheckedChange={(checked) => setAcknowledged(checked === true)} />
							<Label htmlFor="confirm-exceptional-presence" className="cursor-pointer text-sm font-normal leading-5">
								Confirmo que esta venda possui entrega, mas estou instruindo o sistema a informar presença física do consumidor nesta tentativa.
							</Label>
						</div>
					</div>
				) : (
					<div className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
						<ReceiptText className="mt-0.5 h-4 w-4 shrink-0" />
						<span>O sistema usará o perfil fiscal correspondente ao canal e à modalidade registrados na venda.</span>
					</div>
				)}
			</div>
		</ResponsiveMenu>
	);
}
