import type { TOrganizationMemberPermissions } from "@/schemas/organizations";

/**
 * Dados sensíveis com a semântica de ausência resolvida. Antes de `dadosSensiveis`, custo e margem
 * só eram escondidos nos resultados de vendas, por `resultados.visualizarSensiveis` — a ausência
 * herda essa escolha. Não leia `permissoes.dadosSensiveis` nem `resultados.visualizarSensiveis`
 * diretamente fora deste arquivo.
 *
 * `exportarClientes` governa a saída da base de clientes para arquivo (telefone, e-mail, documento).
 *
 * `visualizarCustos` governa custo de produto (unitário e médio), margem, lucro, CMV e valor de
 * estoque em qualquer tela. Quem não tem a permissão recebe esses campos como `null` do servidor, e
 * as escritas que carregam custo (cadastro de produto, entrada de estoque) mantêm o valor atual em
 * vez de aceitar o que chega — o formulário dessa pessoa nunca viu o custo para devolvê-lo.
 */
export type TSensitiveDataPermissions = {
	visualizarCustos: boolean;
	exportarClientes: boolean;
};

export function resolveSensitiveDataPermissions(permissoes: TOrganizationMemberPermissions | null | undefined): TSensitiveDataPermissions {
	if (!permissoes) return { visualizarCustos: false, exportarClientes: false };
	return {
		visualizarCustos: permissoes.dadosSensiveis?.visualizarCustos ?? permissoes.resultados.visualizarSensiveis,
		// Chegou depois de `visualizarCustos`: o objeto pode existir sem ela. Antes, exportar era livre para
		// qualquer membro; a ausência fica com quem administra a empresa.
		exportarClientes: permissoes.dadosSensiveis?.exportarClientes ?? permissoes.empresa.editar,
	};
}

export function canViewCosts(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveSensitiveDataPermissions(permissoes).visualizarCustos;
}

/** Exportar a base de clientes (contatos e documentos) para arquivo. */
export function canExportClients(permissoes: TOrganizationMemberPermissions | null | undefined): boolean {
	return resolveSensitiveDataPermissions(permissoes).exportarClientes;
}

/**
 * Campo de custo numa resposta: o valor para quem vê custo, `null` para quem não vê. O tipo de saída
 * passa a admitir `null`, então a tela é obrigada a tratar a ausência (esconder a coluna/bloco —
 * nunca exibir 0, que seria uma afirmação falsa).
 */
export function maskCost<T>(value: T, canView: boolean): T | null {
	return canView ? value : null;
}

/**
 * Custo vindo de um formulário de escrita. Quem não vê custo recebeu `null` no lugar dele, então
 * devolvê-lo apagaria o custo cadastrado: `undefined` faz o `.set()` do Drizzle manter o valor atual.
 */
export function acceptIncomingCost<T>(value: T, canView: boolean): T | undefined {
	return canView ? value : undefined;
}
