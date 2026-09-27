"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { SALES_CHANNEL_LABELS, SalesChannelMark } from "@/components/SalesChannels/SalesChannelMark";
import { Switch } from "@/components/ui/switch";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { updateSalesChannel } from "@/lib/mutations/sales-channels";
import { useSalesChannels } from "@/lib/queries/sales-channels";
import type { TSalesChannelEntity } from "@/services/drizzle/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type SettingsSalesChannelsProps = {
	membership: NonNullable<TAuthUserSession["membership"]>;
};

/** Identidade do canal no registro — a mesma tupla do unq_sales_channels_identity, sem a org. */
function channelIdentityKey(channel: { canal: string; integracaoId?: string | null; refExterno?: string | null }) {
	return `${channel.canal}:${channel.integracaoId ?? ""}:${channel.refExterno ?? ""}`;
}

/**
 * As regras de operação de cada canal de venda. A tela é por canal, e não por produto, porque o
 * que muda aqui é como o canal atende — o cadastro do produto continua um só, atravessando todos.
 *
 * Sem barra de aplicar: cada linha é uma decisão independente e idempotente (PUT pela identidade
 * do canal), então segurar o toggle atrás de um "salvar" só adiciona um passo entre a intenção e
 * o efeito. O erro reverte o cache para o valor anterior.
 */
export default function SettingsSalesChannels({ membership }: SettingsSalesChannelsProps) {
	// A capability do plano, não a permissão do usuário: sem ERP o registro de canais não existe
	// para a org, e a rota responderia 403 (requireERPSession).
	const hasErpAccess = membership.organizacao.configuracao.recursos.erp.acesso;
	const { data: channels, isLoading, isError, error, queryKey } = useSalesChannels({ enabled: hasErpAccess });
	const queryClient = useQueryClient();
	const canEdit = membership.permissoes.empresa.editar;

	const { mutate, isPending, variables } = useMutation({
		mutationKey: ["update-sales-channel"],
		mutationFn: updateSalesChannel,
		// O valor novo entra no cache já no clique e SÓ sai de lá se o servidor recusar. Derivar do
		// `isPending` fazia o switch voltar ao valor antigo durante o refetch que o invalidate dispara.
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey });
			const previous = queryClient.getQueryData<TSalesChannelEntity[]>(queryKey);
			queryClient.setQueryData<TSalesChannelEntity[]>(queryKey, (current) =>
				current?.map((channel) =>
					channelIdentityKey(channel) === channelIdentityKey(input) && input.exigirAdicionaisMinimos !== undefined
						? { ...channel, exigirAdicionaisMinimos: input.exigirAdicionaisMinimos }
						: channel,
				),
			);
			return { previous };
		},
		onSuccess: (data) => toast.success(data.message),
		onError: (err, _input, context) => {
			if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
			toast.error(getErrorMessage(err));
		},
		// Sucesso ou erro, a lista volta do servidor: o toggle nunca fica mostrando um estado que
		// o banco não confirmou.
		onSettled: () => queryClient.invalidateQueries({ queryKey }),
	});

	if (!hasErpAccess) {
		return (
			<p className="text-muted-foreground text-sm">Os canais de venda fazem parte do módulo de ERP, que não está habilitado para a sua organização.</p>
		);
	}
	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!channels) return null;

	function toggleAddOnMinimums(channel: TSalesChannelEntity, exigir: boolean) {
		// Só o campo que está mudando: o PUT é uma atualização parcial, então o `catalogoModo` que
		// a matriz de canais escreve por fora (PUT /api/sales-channels/matrix) não corre risco de
		// voltar atrás por eco.
		mutate({
			canal: channel.canal,
			integracaoId: channel.integracaoId,
			refExterno: channel.refExterno,
			exigirAdicionaisMinimos: exigir,
		});
	}

	return (
		<div className="flex w-full flex-col gap-3">
			{channels.map((channel) => {
				// A projeção dos mínimos (channelAddOnReferences) alcança os catálogos internos; o iFood
				// publica o cadastro e cobra as regras da própria plataforma, então aqui não há o que ligar.
				const enforcesAddOnMinimums = channel.canal !== "IFOOD";
				const isChannelPending = isPending && !!variables && channelIdentityKey(variables) === channelIdentityKey(channel);

				return (
					<div key={channel.id} className="border-border bg-card rounded-xl border shadow-xs">
						<div className="border-border flex items-center gap-2 border-b px-4 py-3">
							<SalesChannelMark canal={channel.canal} />
							<span className="text-sm font-medium tracking-tight">{SALES_CHANNEL_LABELS[channel.canal] ?? channel.canal}</span>
							{/* Uma org pode ter mais de uma loja no mesmo canal (um canal por merchant): sem a
							    referência externa, duas linhas de iFood ficariam indistinguíveis. */}
							{channel.refExterno ? (
								<span className="text-muted-foreground truncate font-mono text-xs" title={channel.refExterno}>
									{channel.refExterno}
								</span>
							) : null}
						</div>
						<div className="flex items-center justify-between gap-4 px-4 py-3">
							<div className="flex flex-col gap-0.5">
								<span className="text-sm font-medium tracking-tight">EXIGIR ADICIONAIS OBRIGATÓRIOS</span>
								<span className="text-muted-foreground text-xs">
									{!enforcesAddOnMinimums
										? "O iFood publica os grupos como estão no cadastro do produto e cobra as regras da própria plataforma — a exigência não é configurável por aqui."
										: channel.exigirAdicionaisMinimos
											? "Os grupos de adicionais marcados como obrigatórios precisam ser preenchidos para o item entrar no pedido."
											: "Os grupos de adicionais obrigatórios ficam opcionais neste canal — o item entra no pedido mesmo sem escolha, e o que não for escolhido não é lançado nem baixado do estoque."}
								</span>
							</div>
							{enforcesAddOnMinimums ? (
								<Switch
									checked={channel.exigirAdicionaisMinimos}
									disabled={!canEdit || isChannelPending}
									onCheckedChange={(value) => canEdit && toggleAddOnMinimums(channel, value)}
								/>
							) : null}
						</div>
					</div>
				);
			})}
		</div>
	);
}
