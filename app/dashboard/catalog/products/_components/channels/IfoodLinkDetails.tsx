"use client";

import { LoadingButton } from "@/components/loading-button";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { deleteCatalogLink, resolveCatalogLinkDivergence, updateCatalogLinkPolicy } from "@/lib/mutations/catalog-links";
import type { TSalesChannelMatrixLink } from "@/lib/queries/sales-channels";
import { cn } from "@/lib/utils";
import type { TCatalogLinkSyncPolicy } from "@/schemas/catalog-links";
import type { TCatalogLinkStatusEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type IfoodLinkDetailsProps = {
	merchantId: string;
	merchantLabel: string;
	nodeLabel: string;
	link: TSalesChannelMatrixLink;
	closeModal: () => void;
};

const STATUS_LABEL: Record<TCatalogLinkStatusEnum, string> = {
	PENDENTE: "Pendente de sincronização",
	SINCRONIZADO: "Sincronizado",
	DIVERGENTE: "Divergente do iFood",
	ERRO: "Erro na última sincronização",
	DESVINCULADO: "Desvinculado",
};

const POLICY_FIELDS: { key: keyof TCatalogLinkSyncPolicy; label: string; hint: string }[] = [
	{ key: "nome", label: "Nome", hint: "Empurra o nome do cadastro para o item." },
	{ key: "descricao", label: "Descrição", hint: "Empurra a descrição do cadastro." },
	{ key: "imagem", label: "Imagem", hint: "Sobe a imagem de capa ao publicar." },
	{ key: "preco", label: "Preço", hint: "Empurra o preço resolvido deste canal (override ou base). Desligue para gerir o preço só no iFood." },
	{ key: "disponibilidade", label: "Disponibilidade", hint: "Empurra disponível/indisponível conforme a matriz." },
];

function formatValue(campo: string, value: string | number | boolean | null | undefined) {
	if (value == null) return "—";
	if (typeof value === "boolean") return value ? "disponível" : "indisponível";
	if (campo === "preco" && typeof value === "number") return formatToMoney(value);
	return String(value);
}

/**
 * O vínculo de um nó com um item do iFood: estado, política por campo, divergências e as ações
 * de resolver ou desfazer. Cada ação grava na hora (não entra no rascunho da matriz): são
 * operações contra o iFood, com efeito próprio e mensagem própria.
 */
export default function IfoodLinkDetails({ merchantId, merchantLabel, nodeLabel, link, closeModal }: IfoodLinkDetailsProps) {
	const queryClient = useQueryClient();
	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["sales-channel-matrix"] });
		queryClient.invalidateQueries({ queryKey: ["catalog-links", merchantId] });
		queryClient.invalidateQueries({ queryKey: ["catalog-link-suggestions", merchantId] });
	};

	const policyMutation = useMutation({
		mutationKey: ["update-catalog-link-policy", link.id],
		mutationFn: (sincronizar: Partial<TCatalogLinkSyncPolicy>) => updateCatalogLinkPolicy({ linkId: link.id, sincronizar }),
		onSuccess: (data) => toast.success(data.message),
		onError: (error) => toast.error(getErrorMessage(error)),
		onSettled: invalidate,
	});

	const resolveMutation = useMutation({
		mutationKey: ["resolve-catalog-link-divergence", link.id],
		mutationFn: (acao: "APLICAR_NOSSO" | "ADOTAR_IFOOD") => resolveCatalogLinkDivergence({ linkId: link.id, acao }),
		onSuccess: (data) => {
			toast.success(data.message);
			closeModal();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
		onSettled: invalidate,
	});

	const unlinkMutation = useMutation({
		mutationKey: ["delete-catalog-link", link.id],
		mutationFn: () => deleteCatalogLink({ linkId: link.id }),
		onSuccess: (data) => {
			toast.success(data.message);
			closeModal();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
		onSettled: invalidate,
	});

	const anyPending = policyMutation.isPending || resolveMutation.isPending || unlinkMutation.isPending;
	const divergencias = link.divergencias ?? [];
	const hasPriceDivergence = divergencias.some((divergencia) => divergencia.campo === "preco");

	return (
		<ResponsiveMenu
			mode="read-only"
			menuTitle="VÍNCULO COM O IFOOD"
			menuDescription={`${nodeLabel} em ${merchantLabel}.`}
			menuCancelButtonText="FECHAR"
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="md"
			drawerVariant="lg"
		>
			<div className="flex w-full flex-col gap-4 px-1 py-2">
				<div className="flex flex-col gap-1 rounded-xl border border-border p-3">
					<span
						className={cn(
							"text-sm font-semibold",
							link.status === "SINCRONIZADO" && "text-emerald-600",
							link.status === "DIVERGENTE" && "text-amber-600",
							link.status === "ERRO" && "text-red-600",
						)}
					>
						{STATUS_LABEL[link.status]}
					</span>
					<span className="text-xs text-muted-foreground">
						{link.dataUltimaSincronizacao
							? `Última sincronização em ${new Date(link.dataUltimaSincronizacao).toLocaleString("pt-BR")}.`
							: "Ainda não sincronizado com o iFood."}
					</span>
					{link.status === "ERRO" && link.ultimoErro ? <span className="text-xs text-red-600">{link.ultimoErro}</span> : null}
				</div>

				{divergencias.length > 0 ? (
					<div className="flex flex-col gap-2">
						<span className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">Divergências</span>
						<div className="flex flex-col rounded-xl border border-border">
							{divergencias.map((divergencia) => (
								<div
									key={divergencia.campo}
									className="grid grid-cols-[6rem_1fr_1fr] items-center gap-2 border-b border-border px-3 py-2 text-xs last:border-b-0"
								>
									<span className="font-medium capitalize">
										{divergencia.campo}
										{!divergencia.sincronizado ? <span className="block text-[0.6rem] font-normal text-muted-foreground">não sincronizado</span> : null}
									</span>
									<span className="min-w-0 truncate">
										<span className="text-[0.6rem] uppercase text-muted-foreground">aqui </span>
										{formatValue(divergencia.campo, divergencia.valorInterno)}
									</span>
									<span className="min-w-0 truncate">
										<span className="text-[0.6rem] uppercase text-muted-foreground">iFood </span>
										{formatValue(divergencia.campo, divergencia.valorExterno)}
									</span>
								</div>
							))}
						</div>
						<div className="flex flex-wrap gap-2">
							<LoadingButton
								type="button"
								size="sm"
								loading={resolveMutation.isPending}
								disabled={anyPending}
								onClick={() => resolveMutation.mutate("APLICAR_NOSSO")}
							>
								REENVIAR O NOSSO
							</LoadingButton>
							{hasPriceDivergence ? (
								<LoadingButton
									type="button"
									size="sm"
									variant="outline"
									loading={resolveMutation.isPending}
									disabled={anyPending}
									onClick={() => resolveMutation.mutate("ADOTAR_IFOOD")}
								>
									ADOTAR PREÇO DO IFOOD
								</LoadingButton>
							) : null}
						</div>
						<p className="text-xs text-muted-foreground">
							Reenviar aplica o cadastro daqui no iFood. Adotar grava o preço do iFood como preço deste canal, sem tocar no preço base.
						</p>
					</div>
				) : null}

				<div className="flex flex-col gap-2">
					<span className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">O que sincroniza</span>
					<div className="flex flex-col rounded-xl border border-border">
						{POLICY_FIELDS.map((field) => (
							<label key={field.key} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0">
								<span className="flex min-w-0 flex-col">
									<span className="text-sm font-medium">{field.label}</span>
									<span className="text-[0.65rem] text-muted-foreground">{field.hint}</span>
								</span>
								<Switch
									checked={link.sincronizar[field.key]}
									disabled={anyPending}
									onCheckedChange={(checked) => policyMutation.mutate({ [field.key]: checked })}
								/>
							</label>
						))}
					</div>
				</div>

				<div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 p-3">
					<span className="text-xs text-muted-foreground">Desvincular para de sincronizar. O item continua no iFood, sem ser apagado.</span>
					<LoadingButton
						type="button"
						size="sm"
						variant="destructive"
						loading={unlinkMutation.isPending}
						disabled={anyPending}
						onClick={() => unlinkMutation.mutate()}
					>
						DESVINCULAR
					</LoadingButton>
				</div>
			</div>
		</ResponsiveMenu>
	);
}
