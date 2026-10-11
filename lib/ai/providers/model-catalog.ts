import type { TAiAgentModelProfileEnum } from "@/schemas/enums";

/**
 * Catálogo de modelos oferecidos na configuração do agente.
 *
 * É uma lista **curada**, não o inventário do AI Gateway (300+ modelos, a maioria de imagem,
 * vídeo, embedding ou sem suporte a ferramentas). O agente exige duas capacidades que o
 * catálogo garante: chamada de ferramentas (`tool-use`) e saída estruturada — sem as duas o
 * turno falha em `executeAgentTurn`, não degrada.
 *
 * Os preços são por 1 milhão de tokens em USD, conferidos no AI Gateway em 2026-10-09. Servem
 * de referência na UI e de fallback quando a consulta de preços ao Gateway falha; a cobrança
 * real é sempre a do Gateway. São os valores **base**: alguns modelos têm preço por região
 * (o `deepseek-v4-pro` chega a 4x em `us`), e o Gateway não expõe a tabela regional na
 * consulta de metadados — quando a diferença é grande, a descrição do modelo avisa.
 * `fornecedorSlug` é o slug de logo do models.dev, consumido por `ModelSelectorLogo`.
 */
export type TAiAgentModelCatalogEntry = {
	id: string;
	nome: string;
	fornecedor: string;
	fornecedorSlug: string;
	perfil: TAiAgentModelProfileEnum;
	descricao: string;
	/** Destaque na UI: melhor relação custo/qualidade testada para atendimento. */
	recomendado?: boolean;
	precoEntrada: number;
	precoSaida: number;
	janelaContexto: number;
};

/**
 * Ordem dentro de cada perfil é intencional: o primeiro item é o que a equipe recomenda para
 * aquele patamar de custo.
 */
export const AI_AGENT_MODEL_CATALOG: TAiAgentModelCatalogEntry[] = [
	{
		id: "openai/gpt-6-luna",
		nome: "GPT-6 Luna",
		fornecedor: "OpenAI",
		fornecedorSlug: "openai",
		perfil: "ECONOMICO",
		descricao: "Opção padrão e econômica para atendimento. Preço base para até 272 mil tokens de entrada.",
		recomendado: true,
		precoEntrada: 0.1,
		precoSaida: 0.5,
		janelaContexto: 1_050_000,
	},
	{
		id: "anthropic/claude-haiku-5.5",
		nome: "Claude Haiku 5.5",
		fornecedor: "Anthropic",
		fornecedorSlug: "anthropic",
		perfil: "ECONOMICO",
		descricao: "Alternativa econômica da Anthropic. Preço base para até 100 mil tokens de entrada; acima disso, custa 5x mais.",
		precoEntrada: 0.1,
		precoSaida: 0.5,
		janelaContexto: 1_000_000,
	},
	{
		id: "alibaba/qwen3.8-flash",
		nome: "Qwen 3.8 Flash",
		fornecedor: "Alibaba",
		fornecedorSlug: "alibaba",
		perfil: "ECONOMICO",
		descricao: "Alternativa econômica da Alibaba, com contexto amplo para conversas longas.",
		precoEntrada: 0.15,
		precoSaida: 0.47,
		janelaContexto: 991_000,
	},
	{
		id: "zai/glm-5.3-flash",
		nome: "GLM 5.3 Flash",
		fornecedor: "Z.ai",
		fornecedorSlug: "zai",
		perfil: "ECONOMICO",
		descricao: "Alternativa econômica da Z.ai, com contexto amplo para conversas longas.",
		precoEntrada: 0.15,
		precoSaida: 0.5,
		janelaContexto: 1_000_000,
	},
];

/** Mantém estimativas de custo de agentes e runs antigos, sem oferecer estes modelos na UI. */
const LEGACY_AI_AGENT_MODEL_CATALOG: TAiAgentModelCatalogEntry[] = [
	// --- ECONOMICO: atendimento de alto volume, respostas diretas ---
	{
		id: "deepseek/deepseek-v4-flash",
		nome: "DeepSeek V4 Flash",
		fornecedor: "DeepSeek",
		fornecedorSlug: "deepseek",
		perfil: "ECONOMICO",
		// Perdeu o selo em julho/2026: nos testes de atendimento ele preenchia filtros de
		// ferramenta com valores inventados e encerrava turnos prometendo ações sem executá-las.
		descricao: "Rápido, barato e bom em português, mas descuidado com filtros de ferramentas. Evite quando o agente cria orçamentos.",
		precoEntrada: 0.14,
		precoSaida: 0.28,
		janelaContexto: 1_000_000,
	},
	{
		id: "alibaba/qwen3.7-flash",
		nome: "Qwen 3.7 Flash",
		fornecedor: "Alibaba",
		fornecedorSlug: "alibaba",
		perfil: "ECONOMICO",
		descricao: "O mais barato do catálogo. Boa opção para volumes altos, com respostas mais literais.",
		precoEntrada: 0.03,
		precoSaida: 0.13,
		janelaContexto: 991_000,
	},
	{
		id: "zai/glm-4.7-flash",
		nome: "GLM 4.7 Flash",
		fornecedor: "Z.ai",
		fornecedorSlug: "zai",
		perfil: "ECONOMICO",
		descricao: "Barato e consistente em conversas curtas de atendimento.",
		precoEntrada: 0.07,
		precoSaida: 0.4,
		janelaContexto: 200_000,
	},
	{
		id: "openai/gpt-5-nano",
		nome: "GPT-5 nano",
		fornecedor: "OpenAI",
		fornecedorSlug: "openai",
		perfil: "ECONOMICO",
		descricao: "Entrada muito barata da OpenAI. Segue instruções bem, mas erra mais em conversas longas.",
		precoEntrada: 0.05,
		precoSaida: 0.4,
		janelaContexto: 400_000,
	},
	{
		id: "google/gemini-2.5-flash-lite",
		nome: "Gemini 2.5 Flash Lite",
		fornecedor: "Google",
		fornecedorSlug: "google",
		perfil: "ECONOMICO",
		descricao: "Alternativa econômica do Google, com contexto amplo para históricos longos.",
		precoEntrada: 0.1,
		precoSaida: 0.4,
		janelaContexto: 1_048_576,
	},

	// --- EQUILIBRADO: o meio do caminho para atendimento com orçamentos ---
	{
		id: "deepseek/deepseek-v4-pro",
		nome: "DeepSeek V4 Pro",
		fornecedor: "DeepSeek",
		fornecedorSlug: "deepseek",
		perfil: "EQUILIBRADO",
		descricao:
			"O melhor equilíbrio testado para vender pelo WhatsApp: cuidadoso com ferramentas e barato. Atenção: o preço varia com a região de execução e pode ser até 4x o valor exibido.",
		recomendado: true,
		precoEntrada: 0.66,
		precoSaida: 1.98,
		janelaContexto: 1_000_000,
	},
	{
		id: "openai/gpt-5-mini",
		nome: "GPT-5 mini",
		fornecedor: "OpenAI",
		fornecedorSlug: "openai",
		perfil: "EQUILIBRADO",
		descricao: "Uso de ferramentas e saída estruturada muito confiáveis. É também o modelo de resgate quando outro falha o formato.",
		precoEntrada: 0.25,
		precoSaida: 2,
		janelaContexto: 400_000,
	},
	{
		id: "xai/grok-4.1-fast-non-reasoning",
		nome: "Grok 4.1 Fast",
		fornecedor: "xAI",
		fornecedorSlug: "xai",
		perfil: "EQUILIBRADO",
		descricao: "Respostas rápidas sem etapa de raciocínio, com contexto de 1 milhão de tokens.",
		precoEntrada: 0.2,
		precoSaida: 0.5,
		janelaContexto: 1_000_000,
	},
	{
		id: "google/gemini-3.1-flash-lite",
		nome: "Gemini 3.1 Flash Lite",
		fornecedor: "Google",
		fornecedorSlug: "google",
		perfil: "EQUILIBRADO",
		descricao: "Geração mais recente do Flash Lite, melhor em seguir políticas de atendimento.",
		precoEntrada: 0.25,
		precoSaida: 1.5,
		janelaContexto: 1_000_000,
	},

	// --- AVANCADO: conversas difíceis, negociação, políticas complexas ---
	{
		id: "google/gemini-3-flash",
		nome: "Gemini 3 Flash",
		fornecedor: "Google",
		fornecedorSlug: "google",
		perfil: "AVANCADO",
		descricao: "Forte em raciocínio e em conversas longas, com entrada ainda barata.",
		recomendado: true,
		precoEntrada: 0.5,
		precoSaida: 3,
		janelaContexto: 1_000_000,
	},
	{
		id: "anthropic/claude-haiku-4.5",
		nome: "Claude Haiku 4.5",
		fornecedor: "Anthropic",
		fornecedorSlug: "anthropic",
		perfil: "AVANCADO",
		descricao: "Tom natural em português e muito disciplinado com as regras do prompt.",
		precoEntrada: 1,
		precoSaida: 5,
		janelaContexto: 200_000,
	},
	{
		id: "openai/gpt-5",
		nome: "GPT-5",
		fornecedor: "OpenAI",
		fornecedorSlug: "openai",
		perfil: "AVANCADO",
		descricao: "Modelo padrão do agente. Muito capaz, porém o mais caro por conversa deste grupo.",
		precoEntrada: 1.25,
		precoSaida: 10,
		janelaContexto: 400_000,
	},
	{
		id: "anthropic/claude-sonnet-5",
		nome: "Claude Sonnet 5",
		fornecedor: "Anthropic",
		fornecedorSlug: "anthropic",
		perfil: "AVANCADO",
		descricao: "O mais capaz do catálogo para negociação e casos ambíguos. Use quando qualidade importa mais que custo.",
		precoEntrada: 2,
		precoSaida: 10,
		janelaContexto: 1_000_000,
	},
];

export const AI_AGENT_MODEL_PROFILE_LABELS: Record<TAiAgentModelProfileEnum, string> = {
	ECONOMICO: "ECONÔMICOS",
	EQUILIBRADO: "EQUILIBRADOS",
	AVANCADO: "AVANÇADOS",
};

/** Ordem de exibição dos grupos: do mais barato ao mais capaz. */
export const AI_AGENT_MODEL_PROFILE_ORDER: TAiAgentModelProfileEnum[] = ["ECONOMICO", "EQUILIBRADO", "AVANCADO"];

export function findAiAgentModelInCatalog(id: string): TAiAgentModelCatalogEntry | null {
	return AI_AGENT_MODEL_CATALOG.find((entry) => entry.id === id) ?? LEGACY_AI_AGENT_MODEL_CATALOG.find((entry) => entry.id === id) ?? null;
}
