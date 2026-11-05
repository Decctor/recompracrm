import type { TOrganizationMemberPermissions } from "@/schemas/organizations";

/**
 * Permissões de caixa e de configuração da operação de vendas, com a semântica de ausência resolvida.
 * As chaves `vendas.operarCaixa`, `vendas.movimentarCaixa`, `vendas.conferirCaixa` e `vendas.configurar`
 * são opcionais no JSONB; quando faltam, cada uma cai para a permissão que a governava antes:
 * - operar/movimentar caixa → `vendas.criar` (quem vende abre o caixa e faz sangria/suprimento);
 * - conferir caixa → `vendas.editar` (avalizar a diferença é ato de gestão de vendas confirmadas);
 * - configurar → `empresa.editar` (canais, estações de preparo, comandas e loja eram configuração da empresa).
 *   Dispositivos (agente de impressão, impressoras) e regras de impressão seguem em `empresa.editar`:
 *   o vínculo do agente emite credencial de dispositivo, e a tela os trata juntos.
 * Não leia essas chaves diretamente fora deste arquivo.
 */
export type TSalesOperationPermissions = {
	operarCaixa: boolean;
	movimentarCaixa: boolean;
	conferirCaixa: boolean;
	configurar: boolean;
};

export function resolveSalesOperationPermissions(permissoes: TOrganizationMemberPermissions | null | undefined): TSalesOperationPermissions {
	if (!permissoes) return { operarCaixa: false, movimentarCaixa: false, conferirCaixa: false, configurar: false };
	const vendas = permissoes.vendas;
	return {
		operarCaixa: vendas.operarCaixa ?? vendas.criar ?? false,
		movimentarCaixa: vendas.movimentarCaixa ?? vendas.criar ?? false,
		conferirCaixa: vendas.conferirCaixa ?? vendas.editar ?? false,
		configurar: vendas.configurar ?? permissoes.empresa.editar ?? false,
	};
}

/** Abrir e fechar a própria sessão de caixa. */
export function canOperateCashRegister(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveSalesOperationPermissions(permissoes).operarCaixa;
}

/** Registrar sangria e suprimento na sessão de caixa. */
export function canMoveCashRegister(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveSalesOperationPermissions(permissoes).movimentarCaixa;
}

/** Conferir uma sessão fechada (revisar/aprovar a diferença de caixa). Página e rota leem daqui. */
export function canReviewSalesSession(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveSalesOperationPermissions(permissoes).conferirCaixa;
}

/** Configurar a operação de vendas: canais, estações de preparo, comandas (cartões, pontos e regras) e loja online. */
export function canConfigureSales(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveSalesOperationPermissions(permissoes).configurar;
}
