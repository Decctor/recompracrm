import type { TOrganizationMemberPermissions } from "@/schemas/organizations";

/**
 * Permissões da base de clientes com a semântica de ausência resolvida. Antes da chave `clientes`,
 * todo membro via, cadastrava e editava clientes; isso segue liberado. Gerenciar a base — importar,
 * mesclar duplicados, excluir, editar em massa, tags, campos personalizados, segmentações e
 * carteiras — cai em `empresa.editar`. Não leia `permissoes.clientes` diretamente fora deste arquivo.
 *
 * Cadastrar cliente dentro de uma venda, do PDV, do ponto de interação ou de um atendimento não passa
 * por aqui: esses fluxos são governados pela permissão deles (`vendas.criar`, senha do operador,
 * `atendimentos.*`). A busca de clientes usada por esses fluxos também não depende de `visualizar`
 * (ver `canLookupClients`).
 */
export type TClientPermissions = {
	visualizar: boolean;
	criar: boolean;
	editar: boolean;
	gerenciarBase: boolean;
};

export function resolveClientPermissions(permissoes: TOrganizationMemberPermissions | null | undefined): TClientPermissions {
	if (!permissoes) return { visualizar: false, criar: false, editar: false, gerenciarBase: false };
	const clientes = permissoes.clientes;
	return {
		visualizar: clientes?.visualizar ?? true,
		criar: clientes?.criar ?? true,
		editar: clientes?.editar ?? true,
		gerenciarBase: clientes?.gerenciarBase ?? permissoes.empresa.editar,
	};
}

export function canViewClients(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveClientPermissions(permissoes).visualizar;
}

export function canCreateClients(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveClientPermissions(permissoes).criar;
}

export function canEditClients(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveClientPermissions(permissoes).editar;
}

export function canManageClientBase(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveClientPermissions(permissoes).gerenciarBase;
}

/**
 * Localizar um cliente para operar (buscar por nome/telefone, ler o contexto dele) é parte da venda e
 * do atendimento: quem vende ou atende acha o cliente mesmo sem acesso ao módulo de clientes.
 */
export function canLookupClients(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	if (!permissoes) return false;
	return canViewClients(permissoes) || permissoes.vendas.criar || permissoes.atendimentos.visualizar;
}

/**
 * `POST /api/clients` atende o módulo de clientes e o cadastro rápido dentro da venda (PDV, contas de
 * atendimento). A rota não distingue a origem, então aceita quem cadastra pelo módulo ou quem vende.
 */
export function canRegisterClients(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	if (!permissoes) return false;
	return canCreateClients(permissoes) || permissoes.vendas.criar;
}

/**
 * `PUT /api/clients` atende o cadastro do cliente e o ajuste do cliente vinculado na venda (CPF para a
 * nota, endereço de entrega). Mesma regra do cadastro: quem edita pelo módulo ou quem vende.
 */
export function canUpdateClientRecords(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	if (!permissoes) return false;
	return canEditClients(permissoes) || permissoes.vendas.criar;
}
