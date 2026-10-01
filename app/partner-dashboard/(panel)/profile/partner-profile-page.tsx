"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { ControlPlatformPartnerChangeRequest } from "@/components/Modals/PlatformPartners/ControlPlatformPartnerChangeRequest";
import { getErrorMessage } from "@/lib/errors";
import { deletePlatformPartnerChangeRequest } from "@/lib/mutations/platform-partnerships";
import { formatPartnerDate, maskPixKey } from "@/lib/platform-partnerships/earnings";
import { usePlatformPartnerMe } from "@/lib/queries/platform-partnerships";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock3, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MainAppLink, PanelBody, TopSheet, useMainAppHref } from "../../_components/partner-shell";
import { BackHeader, PanelCard, PanelCardHeader, PanelSkeleton } from "../../_components/partner-ui";

const PIX_TYPE_LABEL: Record<string, string> = { CPF: "CPF", CNPJ: "CNPJ", EMAIL: "Email", TELEFONE: "Telefone", ALEATORIA: "Aleatória" };

function Rows({ rows }: { rows: { label: string; value: string }[] }) {
	return (
		<div className="px-5 pb-2">
			{rows.map((row, index) => (
				<div key={row.label} className={cn("flex justify-between gap-3 py-3 text-sm", index > 0 && "border-t border-border")}>
					<span className="text-muted-foreground">{row.label}</span>
					<span className="text-right font-bold break-all">{row.value}</span>
				</div>
			))}
		</div>
	);
}

export default function PartnerProfilePage() {
	const queryClient = useQueryClient();
	const { data: partner, isLoading, isError, error, queryKey } = usePlatformPartnerMe();
	const [editing, setEditing] = useState(false);
	const mainAppHref = useMainAppHref();

	const cancelMutation = useMutation({
		mutationKey: ["delete-platform-partner-change-request"],
		mutationFn: deletePlatformPartnerChangeRequest,
		onSuccess: async (data) => {
			toast.success(data.message);
			await queryClient.invalidateQueries({ queryKey });
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (isLoading || !partner) {
		return (
			<div className="p-4 md:p-0">
				<PanelSkeleton />
			</div>
		);
	}

	const pessoaJuridica = partner.tipoPessoa === "PESSOA_JURIDICA";
	const request = partner.alteracaoSolicitada;
	const pending = !!request && !request.motivoRecusa;
	const refused = !!request?.motivoRecusa;
	const requestedChanges = request
		? [
				request.email ? `Email: ${request.email}` : null,
				request.telefone ? `Telefone: ${request.telefone}` : null,
				request.chavePix
					? `Chave PIX (${PIX_TYPE_LABEL[request.chavePixTipo ?? ""] ?? "—"}): ${maskPixKey(request.chavePix, request.chavePixTipo ?? null)}`
					: null,
				request.arquivos ? "Novo documento" : null,
			].filter((item): item is string => !!item)
		: [];

	return (
		<div className="mx-auto flex w-full max-w-[640px] flex-col md:gap-4">
			<TopSheet className="gap-[18px]">
				<BackHeader href="/partner-dashboard" title="Meus dados" />
				<div className="flex flex-col gap-1">
					<h1 className="text-2xl leading-tight font-extrabold tracking-[-0.015em]">{partner.nome}</h1>
					<p className="text-sm text-muted-foreground">
						Parceiro desde {formatPartnerDate(partner.dataAprovacao ?? partner.dataInsercao)} · código{" "}
						<b className="font-bold text-foreground">{partner.codigo}</b>
					</p>
				</div>
			</TopSheet>
			<PanelBody className="md:p-0">
				{pending ? (
					<div className="flex gap-3 rounded-[18px] bg-warning-surface px-4 py-3.5 text-warning-surface-foreground">
						<Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
						<div className="flex flex-1 flex-col gap-1.5">
							<p className="text-sm font-extrabold">Alteração em análise desde {formatPartnerDate(partner.dataSolicitacaoAlteracao)}</p>
							<ul className="text-[13px] leading-snug">
								{requestedChanges.map((change) => (
									<li key={change}>• {change}</li>
								))}
							</ul>
							<p className="text-xs">Enquanto isso, os PIX continuam indo para a chave atual.</p>
							<button
								type="button"
								onClick={() => cancelMutation.mutate()}
								disabled={cancelMutation.isPending}
								className="self-start text-[13px] font-bold underline-offset-4 hover:underline disabled:opacity-60"
							>
								Cancelar pedido
							</button>
						</div>
					</div>
				) : null}
				{refused ? (
					<div className="flex gap-3 rounded-[18px] bg-destructive-surface px-4 py-3.5 text-destructive-surface-foreground">
						<ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
						<div className="flex flex-1 flex-col gap-1">
							<p className="text-sm font-extrabold">Sua última alteração não foi aprovada</p>
							<p className="text-[13px] leading-snug">{request?.motivoRecusa}</p>
							<button
								type="button"
								onClick={() => cancelMutation.mutate()}
								disabled={cancelMutation.isPending}
								className="self-start text-[13px] font-bold underline-offset-4 hover:underline disabled:opacity-60"
							>
								Entendi
							</button>
						</div>
					</div>
				) : null}

				<PanelCard className="py-2">
					<PanelCardHeader title="Cadastro" />
					<Rows
						rows={[
							{ label: pessoaJuridica ? "CNPJ" : "CPF", value: maskPixKey(partner.cpfCnpj, pessoaJuridica ? "CNPJ" : "CPF") },
							{ label: "Email", value: partner.email },
							{ label: "Telefone", value: partner.telefone },
						]}
					/>
				</PanelCard>

				<PanelCard className="py-2">
					<PanelCardHeader title="Recebimento" />
					<Rows
						rows={[
							{ label: "Chave PIX", value: maskPixKey(partner.chavePix, partner.chavePixTipo) },
							{ label: "Tipo", value: partner.chavePixTipo ? PIX_TYPE_LABEL[partner.chavePixTipo] : "—" },
							{ label: "Titular confirmado", value: partner.dataConfirmacaoTitularPix ? formatPartnerDate(partner.dataConfirmacaoTitularPix) : "—" },
						]}
					/>
				</PanelCard>

				<button
					type="button"
					onClick={() => setEditing(true)}
					disabled={pending}
					className="flex h-12 items-center justify-center rounded-[18px] bg-primary text-[15px] font-extrabold text-primary-foreground transition-colors hover:bg-primary/90 disabled:bg-border disabled:text-muted-foreground"
				>
					{pending ? "Alteração em análise" : "Solicitar alteração"}
				</button>
				<p className="text-center text-xs text-muted-foreground">Trocas de chave PIX e de contato passam pelo financeiro antes de valer.</p>
				{/* No celular a barra de abas não tem o atalho do cabeçalho do desktop: o caminho de volta fica aqui. */}
				<MainAppLink href={mainAppHref} className="mt-3 self-center md:hidden" />
			</PanelBody>

			{editing ? (
				<ControlPlatformPartnerChangeRequest
					partner={{ email: partner.email, telefone: partner.telefone, chavePix: partner.chavePix, tipoPessoa: partner.tipoPessoa }}
					closeModal={() => setEditing(false)}
					callbacks={{ onSuccess: () => queryClient.invalidateQueries({ queryKey }) }}
				/>
			) : null}
		</div>
	);
}
