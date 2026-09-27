import { z } from "zod";

// Os tipos das entidades vêm do $inferSelect em services/drizzle/schema/catalog-links.ts
// (convenção do repo). Aqui ficam os validadores de runtime e os tipos dos blocos jsonb.

/**
 * Quais campos o vínculo mantém em sincronia. O caso canônico do preço mudou com a primitiva de
 * canais: `preco: true` empurra o PREÇO RESOLVIDO DO CANAL iFood (o override do produto/variante
 * naquele merchant), não o preço base. `preco: false` continua existindo para quem gerencia o
 * preço direto no Portal — a reconciliação só registra o valor remoto, sem sobrescrever.
 */
export const CatalogLinkSyncPolicySchema = z.object({
	nome: z.boolean({ invalid_type_error: "Tipo não válido para sincronização de nome." }).default(true),
	descricao: z.boolean({ invalid_type_error: "Tipo não válido para sincronização de descrição." }).default(true),
	imagem: z.boolean({ invalid_type_error: "Tipo não válido para sincronização de imagem." }).default(true),
	preco: z.boolean({ invalid_type_error: "Tipo não válido para sincronização de preço." }).default(true),
	disponibilidade: z.boolean({ invalid_type_error: "Tipo não válido para sincronização de disponibilidade." }).default(true),
	/**
	 * Vínculo de ITEM: se a associação item → grupos de complementos (quais grupos, min/max, ordem) é
	 * empurrada. Grupos e opções têm vínculo próprio (tipo ADD_ON / ADD_ON_OPCAO) com as políticas de
	 * nome/preço/disponibilidade. Linhas gravadas antes deste campo leem como `true`.
	 */
	complementos: z.boolean({ invalid_type_error: "Tipo não válido para sincronização de complementos." }).default(true),
	/**
	 * Vínculo de GRUPO: se opções internas sem par NESTE optionGroup são criadas nele no push. Desligado
	 * quando o optionGroup é uma cópia que carrega só parte das opções do grupo interno (catálogo com
	 * um grupo por item, ex.: "gelato no açaí" com 35 dos 67 sabores) — ligado, o push o completaria.
	 * Linhas gravadas antes deste campo leem como `true`.
	 */
	criarOpcoes: z.boolean({ invalid_type_error: "Tipo não válido para criação de opções." }).default(true),
});
export type TCatalogLinkSyncPolicy = z.infer<typeof CatalogLinkSyncPolicySchema>;

export const DEFAULT_CATALOG_LINK_SYNC_POLICY: TCatalogLinkSyncPolicy = {
	nome: true,
	descricao: true,
	imagem: true,
	preco: true,
	disponibilidade: true,
	complementos: true,
	criarOpcoes: true,
};

/** Leitura tolerante: vínculos anteriores ao campo não têm `complementos` no jsonb. */
export function syncsComplementos(policy: Partial<TCatalogLinkSyncPolicy> | null | undefined) {
	return policy?.complementos ?? true;
}

/** Leitura tolerante: vínculos anteriores ao campo não têm `criarOpcoes` no jsonb. */
export function createsMissingOptions(policy: Partial<TCatalogLinkSyncPolicy> | null | undefined) {
	return policy?.criarOpcoes ?? true;
}

/** Um grupo associado ao item, como foi enviado no último push — a chave é o id REMOTO do grupo. */
export const CatalogLinkOptionGroupAssociationSchema = z.object({
	externoOptionGroupId: z.string(),
	min: z.number(),
	max: z.number(),
	indice: z.number(),
});
export type TCatalogLinkOptionGroupAssociation = z.infer<typeof CatalogLinkOptionGroupAssociationSchema>;

/** Valores enviados no último push OK — comparados no push seguinte para evitar chamadas inúteis. */
export const CatalogLinkSnapshotSchema = z.object({
	nome: z.string().optional().nullable(),
	descricao: z.string().optional().nullable(),
	imagemUrl: z.string().optional().nullable(),
	preco: z.number().optional().nullable(),
	disponivel: z.boolean().optional().nullable(),
	/** Só no vínculo de ITEM: a associação com os grupos no último push. */
	gruposComplementos: z.array(CatalogLinkOptionGroupAssociationSchema).optional().nullable(),
});
export type TCatalogLinkSnapshot = z.infer<typeof CatalogLinkSnapshotSchema>;

/** Uma diferença observada entre o estado desejado (interno) e o remoto, na reconciliação. */
export const CatalogLinkDivergenceSchema = z.object({
	campo: z.enum(["nome", "descricao", "imagem", "preco", "disponibilidade", "complementos"]),
	valorInterno: z.union([z.string(), z.number(), z.boolean()]).optional().nullable(),
	valorExterno: z.union([z.string(), z.number(), z.boolean()]).optional().nullable(),
	/** Falso quando o campo não é sincronizado: informativo, sem ação de push. */
	sincronizado: z.boolean(),
});
export type TCatalogLinkDivergence = z.infer<typeof CatalogLinkDivergenceSchema>;
