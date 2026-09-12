import type { TGetClientsOutputById, TUpdateClientInput } from "@/app/api/clients/route";
import type { TClientState } from "@/state-hooks/use-client-state";
import type { TClientTagIconEnum } from "@/schemas/enums";

/**
 * Cadastro do cliente editado no lugar, seção por seção.
 *
 * O PUT de `/api/clients` reescreve a linha inteira do cliente, então uma seção não pode enviar o
 * próprio rascunho e mais nada: o que ela não edita viajaria com o valor que ela leu na hidratação.
 * Duas seções sujas ao mesmo tempo — o usuário corrige o telefone, corrige o nome, aplica as duas —
 * e a segunda devolveria o nome antigo.
 *
 * Por isso o payload é montado sempre a partir do cliente do servidor, e só os campos da seção
 * vêm do rascunho. As listas filhas seguem a mesma regra: `handleSimpleChildRowsProcessing` só
 * mexe no que recebe, então uma seção que não edita endereços manda `[]` e os endereços ficam
 * intactos.
 */

export type TClientRegistrySection = "identification" | "contact" | "addresses" | "fiscal" | "relationship";

/** O cliente já resolvido — `byId` é opcional na rota multimodo, mas a página só renderiza com ele. */
export type TClientRegistryClient = NonNullable<TGetClientsOutputById>;

/** Campos do cliente que cada seção é dona de escrever. */
const CLIENT_SECTION_FIELDS = {
	identification: ["nome", "cpfCnpj", "dataNascimento", "dataFundacao", "profissao", "ondeTrabalha", "estadoCivil", "deficiencia"],
	contact: ["telefone", "email", "websiteUrl", "instagram", "linkedin", "twitter"],
	// O endereço principal do cliente é derivado da primeira localização ativa
	// (`syncClientMainLocation`), não digitado — a seção escreve os dois lados juntos.
	addresses: [
		"localizacaoCep",
		"localizacaoEstado",
		"localizacaoCidade",
		"localizacaoBairro",
		"localizacaoLogradouro",
		"localizacaoNumero",
		"localizacaoComplemento",
	],
	fiscal: ["inscricaoEstadual", "indicadorInscricaoEstadual", "suframa"],
	relationship: ["canalAquisicao", "anotacoes"],
} as const satisfies Record<TClientRegistrySection, readonly (keyof TClientState["client"])[]>;

export function mapClientToState(client: TClientRegistryClient): TClientState {
	// As listas filhas viajam em `clientLocations`/`clientTags`; deixá-las dentro de `client` faria
	// o payload carregar as duas árvores de novo só para o zod descartá-las.
	const { localizacoes, tagReferencias, ...clientRow } = client;

	return {
		client: {
			...clientRow,
			// Cliente antigo pode não ter indicador de IE; o formulário exige um valor.
			indicadorInscricaoEstadual: clientRow.indicadorInscricaoEstadual ?? "NAO_CONTRIBUINTE",
		},
		clientLocations: localizacoes,
		clientTags: tagReferencias.map((reference) => ({
			id: reference.id,
			clienteTagId: reference.clienteTagId,
			tag: {
				titulo: reference.tag.titulo,
				icone: reference.tag.icone as TClientTagIconEnum,
				cor: reference.tag.cor,
				corForeground: reference.tag.corForeground,
			},
		})),
	};
}

type BuildClientSectionUpdateInputParams = {
	client: TClientRegistryClient;
	draft: TClientState;
	section: TClientRegistrySection;
};

export function buildClientSectionUpdateInput({ client, draft, section }: BuildClientSectionUpdateInputParams): TUpdateClientInput {
	const serverState = mapClientToState(client);
	const ownedFields = CLIENT_SECTION_FIELDS[section];

	const clientPayload: TClientState["client"] = { ...serverState.client };
	for (const field of ownedFields) {
		Object.assign(clientPayload, { [field]: draft.client[field] });
	}

	const locations = section === "addresses" ? draft.clientLocations : [];
	const tags = section === "relationship" ? draft.clientTags : [];

	return {
		clientId: client.id,
		client: clientPayload,
		clientLocations: locations.map((location) => ({
			id: location.id ?? undefined,
			deletar: location.deletar ?? false,
			titulo: location.titulo,
			localizacaoCep: location.localizacaoCep,
			localizacaoEstado: location.localizacaoEstado,
			localizacaoCidade: location.localizacaoCidade,
			localizacaoBairro: location.localizacaoBairro,
			localizacaoLogradouro: location.localizacaoLogradouro,
			localizacaoNumero: location.localizacaoNumero,
			localizacaoComplemento: location.localizacaoComplemento,
			localizacaoLatitude: location.localizacaoLatitude,
			localizacaoLongitude: location.localizacaoLongitude,
		})),
		clientTags: tags.map((tagReference) => ({
			id: tagReference.id ?? undefined,
			deletar: tagReference.deletar ?? false,
			clienteTagId: tagReference.clienteTagId,
		})),
	};
}

export function validateClientSectionState(section: TClientRegistrySection, draft: TClientState): string | null {
	if (section === "identification" && !draft.client.nome.trim()) return "Nome do cliente não informado.";
	if (section === "addresses") {
		const untitled = draft.clientLocations.some((location) => !location.deletar && !location.titulo.trim());
		if (untitled) return "Todo endereço precisa de um título.";
	}
	return null;
}

/**
 * Completude do cadastro — o que a barra do cabeçalho mede.
 *
 * A lista é a de preenchimento prioritário do produto: contato, documento, endereço e datas. Cada
 * item pesa igual; um endereço conta uma vez, por mais campos que tenha, senão o cliente com dois
 * endereços completos e sem e-mail apareceria "mais completo" que quem tem tudo menos o segundo
 * endereço.
 *
 * `dataNascimento` e `dataFundacao` são o mesmo item: pessoa física tem nascimento, jurídica tem
 * fundação, e cobrar as duas condenaria todo cadastro a ficar incompleto.
 */
export type TClientRegistryCompleteness = {
	percentual: number;
	preenchidos: number;
	total: number;
	faltantes: string[];
	camposFaltantes: Set<TClientEssentialField>;
};

export type TClientEssentialField = "nome" | "telefone" | "email" | "cpfCnpj" | "datas" | "endereco";

function hasText(value: string | null | undefined) {
	return !!value && value.trim().length > 0;
}

function isCompleteLocation(location: TClientState["clientLocations"][number]) {
	return (
		hasText(location.localizacaoCep) &&
		hasText(location.localizacaoEstado) &&
		hasText(location.localizacaoCidade) &&
		hasText(location.localizacaoLogradouro) &&
		hasText(location.localizacaoNumero)
	);
}

export function getClientRegistryCompleteness(state: TClientState): TClientRegistryCompleteness {
	const activeLocations = state.clientLocations.filter((location) => !location.deletar);
	const checks: { campo: TClientEssentialField; rotulo: string; preenchido: boolean }[] = [
		{ campo: "nome", rotulo: "nome", preenchido: hasText(state.client.nome) },
		{ campo: "telefone", rotulo: "telefone", preenchido: hasText(state.client.telefone) },
		{ campo: "email", rotulo: "e-mail", preenchido: hasText(state.client.email) },
		{ campo: "cpfCnpj", rotulo: "CPF/CNPJ", preenchido: hasText(state.client.cpfCnpj) },
		{ campo: "datas", rotulo: "data de nascimento", preenchido: !!state.client.dataNascimento || !!state.client.dataFundacao },
		{ campo: "endereco", rotulo: "endereço completo", preenchido: activeLocations.some(isCompleteLocation) },
	];

	const preenchidos = checks.filter((check) => check.preenchido).length;
	const pendentes = checks.filter((check) => !check.preenchido);

	return {
		percentual: Math.round((preenchidos / checks.length) * 100),
		preenchidos,
		total: checks.length,
		faltantes: pendentes.map((check) => check.rotulo),
		camposFaltantes: new Set(pendentes.map((check) => check.campo)),
	};
}

/** "faltam CPF/CNPJ, e-mail e endereço completo" — a lista que acompanha a barra. */
export function formatMissingEssentialFields(faltantes: string[]) {
	if (faltantes.length === 0) return "cadastro completo";
	if (faltantes.length === 1) return `falta ${faltantes[0]}`;
	const head = faltantes.slice(0, -1).join(", ");
	return `faltam ${head} e ${faltantes[faltantes.length - 1]}`;
}
