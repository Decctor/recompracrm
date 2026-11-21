/**
 * Mapeamento do ciclo de vida de uma organização para os quadros do Syncroniza Control.
 *
 * Puro e sem I/O: decide **o que** enviar; quem envia é `lib/control/sync.ts`. A divisão segue a
 * análise de ativação (docs/onboarding/revenue-centric-activation-analysis.md §9): o RecompraCRM
 * calcula o estado, o Control decide a conversa.
 *
 * Regras do quadro de sucesso do cliente:
 * - **Só avança.** O cartão vai para o marco mais adiantado já alcançado e nunca volta: uma
 *   regressão (número desconectado, integração expirada) é campo e alerta, não mudança de estágio.
 * - **Estágios manuais são do time.** Um cartão num estágio que não é marco daqui (NPS,
 *   acompanhamento, ou qualquer um que o time criar) não é movido.
 */

export const CONTROL_REFERENCE_PREFIX = "recompracrm:org_";

export function controlOrganizationReference(organizationId: string) {
	return `${CONTROL_REFERENCE_PREFIX}${organizationId}`;
}

export const CONTROL_COMMERCIAL_BOARD_NAME = "Funil Comercial RecompraCRM";
export const CONTROL_COMMERCIAL_TRIAL_STAGE_NAME = "Teste grátis";
export const CONTROL_SUCCESS_BOARD_NAME = "SUCESSO DO CLIENTE";

export type TControlLifecycleSnapshot = {
	organizacaoCriadaEm: Date;
	onboardingConcluidoEm: Date | null;
	cashbackConfigurado: boolean;
	campanhasPreparadas: number;
	fonteDadosDefinida: boolean;
	whatsappOficialConectado: boolean;
	primeiraVendaEm: Date | null;
	primeiroEnvioCampanhaEm: Date | null;
	primeiroResgateEm: Date | null;
	enviosCampanhaUltimos14Dias: number;
	now: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export type TControlMilestone = {
	chave: string;
	/** Nome do estágio no quadro "SUCESSO DO CLIENTE", comparado sem diferenciar caixa e espaços. */
	estagio: string;
	/** Nome do evento enviado ao Control (gatilho "Evento de sistema integrado"). */
	evento: string;
	/** Título da interação na linha do tempo do cliente. */
	titulo: string;
	alcancado: (snapshot: TControlLifecycleSnapshot) => boolean;
	quando: (snapshot: TControlLifecycleSnapshot) => Date | null;
};

/** Na ordem do quadro. A posição é o que decide "mais adiantado". */
export const CONTROL_SUCCESS_MILESTONES: TControlMilestone[] = [
	{
		chave: "boas_vindas",
		estagio: "Boas vindas",
		evento: "organizacao_criada",
		titulo: "Criou a organização no RecompraCRM",
		alcancado: () => true,
		quando: (s) => s.organizacaoCriadaEm,
	},
	{
		chave: "onboarding_concluido",
		estagio: "Onboarding: Apresentação da plataforma",
		evento: "onboarding_concluido",
		titulo: "Concluiu o onboarding",
		alcancado: (s) => s.onboardingConcluidoEm !== null,
		quando: (s) => s.onboardingConcluidoEm,
	},
	{
		chave: "configuracao_concluida",
		estagio: "Onboarding: Configuração RFM, logomarcas e campanhas",
		evento: "cashback_e_campanhas_preparados",
		titulo: "Preparou o cashback e as campanhas",
		alcancado: (s) => s.cashbackConfigurado && s.campanhasPreparadas > 0,
		quando: () => null,
	},
	{
		chave: "fonte_dados_definida",
		estagio: "Onboarding: Integração ERP ou Tablet/QRcode/PDV",
		evento: "fonte_de_vendas_definida",
		titulo: "Definiu de onde vêm as vendas",
		alcancado: (s) => s.fonteDadosDefinida,
		quando: () => null,
	},
	{
		chave: "whatsapp_conectado",
		estagio: "WhatsApp oficial conectado",
		evento: "whatsapp_oficial_conectado",
		titulo: "Conectou o WhatsApp oficial",
		alcancado: (s) => s.whatsappOficialConectado,
		quando: () => null,
	},
	{
		chave: "primeira_venda",
		estagio: "Primeira venda",
		evento: "primeira_venda",
		titulo: "Registrou a primeira venda",
		alcancado: (s) => s.primeiraVendaEm !== null,
		quando: (s) => s.primeiraVendaEm,
	},
	{
		// O marco de ativação: é o comportamento que separa quem fica de quem some (análise §2).
		chave: "primeira_campanha",
		estagio: "Primeira Campanha realizada",
		evento: "primeira_campanha_enviada",
		titulo: "Primeira mensagem de campanha entregue",
		alcancado: (s) => s.primeiroEnvioCampanhaEm !== null,
		quando: (s) => s.primeiroEnvioCampanhaEm,
	},
	{
		chave: "primeiro_resgate",
		estagio: "Primeiro Cashback/giftback resgatado",
		evento: "primeiro_resgate_cashback",
		titulo: "Primeiro cliente resgatou cashback",
		alcancado: (s) => s.primeiroResgateEm !== null,
		quando: (s) => s.primeiroResgateEm,
	},
	{
		chave: "primeiro_mes",
		estagio: "Primeiro mês de Uso",
		evento: "primeiro_mes_de_uso",
		titulo: "Completou um mês com campanhas enviando",
		alcancado: (s) => s.now.getTime() - s.organizacaoCriadaEm.getTime() >= 30 * DAY_MS && s.enviosCampanhaUltimos14Dias > 0,
		quando: () => null,
	},
];

export function normalizeStageName(name: string) {
	return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function milestoneIndexByStage(stageName: string | null | undefined) {
	if (!stageName) return -1;
	const normalized = normalizeStageName(stageName);
	return CONTROL_SUCCESS_MILESTONES.findIndex((milestone) => normalizeStageName(milestone.estagio) === normalized);
}

export type TControlLifecyclePlan = {
	/** Marcos alcançados ainda não entregues — cada um vira evento e interação, uma única vez. */
	novosMarcos: TControlMilestone[];
	/** Estágio-alvo no quadro de sucesso: o marco mais adiantado alcançado que existe no quadro. */
	estagioAlvo: string | null;
};

export function planControlLifecycleSync({
	snapshot,
	marcosEnviados,
	estagiosDoQuadro,
}: {
	snapshot: TControlLifecycleSnapshot;
	marcosEnviados: readonly string[];
	/** Nomes dos estágios que existem hoje no quadro de sucesso. Um marco sem estágio lá não move o cartão. */
	estagiosDoQuadro: readonly string[];
}): TControlLifecyclePlan {
	const sent = new Set(marcosEnviados);
	const available = new Set(estagiosDoQuadro.map(normalizeStageName));
	const reached = CONTROL_SUCCESS_MILESTONES.filter((milestone) => milestone.alcancado(snapshot));
	const target = [...reached].reverse().find((milestone) => available.has(normalizeStageName(milestone.estagio)));
	return {
		novosMarcos: reached.filter((milestone) => !sent.has(milestone.chave)),
		estagioAlvo: target?.estagio ?? null,
	};
}

/**
 * Mover para `estagioAlvo` a partir de `estagioAtual` (null = fora do quadro)? Só para frente, e
 * nunca a partir de um estágio que não é marco daqui.
 */
export function shouldMoveSuccessStage({ estagioAtual, estagioAlvo }: { estagioAtual: string | null; estagioAlvo: string | null }) {
	if (!estagioAlvo) return false;
	const targetIndex = milestoneIndexByStage(estagioAlvo);
	if (targetIndex < 0) return false;
	if (estagioAtual === null) return true;
	const currentIndex = milestoneIndexByStage(estagioAtual);
	if (currentIndex < 0) return false;
	return targetIndex > currentIndex;
}

const SILENT_BACKFILL_MIN_AGE_MS = 2 * DAY_MS;

/**
 * Primeira sincronização de uma organização que já existia: os marcos alcançados no passado são só
 * registrados como entregues, sem evento — um workflow de parabéns dispararia com meses de atraso.
 *
 * "Primeira" é nenhum marco registrado ainda, não "sem linha de estado": uma primeira tentativa que
 * falhou deixa uma linha só com o erro, e a retentativa tem de continuar silenciosa.
 */
export function shouldBackfillSilently({
	marcosEnviados,
	organizacaoCriadaEm,
	now,
}: {
	marcosEnviados: readonly string[];
	organizacaoCriadaEm: Date;
	now: Date;
}) {
	const milestoneKeys = new Set(CONTROL_SUCCESS_MILESTONES.map((milestone) => milestone.chave));
	if (marcosEnviados.some((key) => milestoneKeys.has(key))) return false;
	return now.getTime() - organizacaoCriadaEm.getTime() > SILENT_BACKFILL_MIN_AGE_MS;
}

export type TControlCustomFieldValues = Record<string, string | number | boolean | null>;

/**
 * Campos personalizados da oportunidade no Control. Só vão os que existem lá (`chavesDisponiveis`):
 * uma chave desconhecida faz o Control recusar o PATCH inteiro. Para ligar um campo, basta criá-lo no
 * Control com a chave daqui.
 */
export function buildControlCustomFields({
	valores,
	chavesDisponiveis,
}: {
	valores: TControlCustomFieldValues;
	chavesDisponiveis: readonly string[];
}): TControlCustomFieldValues {
	const available = new Set(chavesDisponiveis);
	// Texto vazio também fica de fora: o Control recusa um campo TEXTO vazio, e a recusa derruba o PATCH inteiro.
	return Object.fromEntries(
		Object.entries(valores).filter(
			([key, value]) => available.has(key) && value !== null && value !== undefined && !(typeof value === "string" && value.trim() === ""),
		),
	);
}

// ------------------------------------------------------------------ aviso de fim do teste

/** Status do Stripe em que a organização já paga: o aviso de fim do teste não faz sentido. */
const PAYING_STRIPE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid"]);
const TRIAL_ENDING_NOTICE_DAYS = 3;

/**
 * Aviso de serviço "seu teste termina em 3 dias", enviado como evento (`teste_terminando`) para o
 * workflow do Control. Não é marco: não move o cartão. Vai uma vez por data de fim de teste — se o
 * teste for estendido, a nova data gera um novo aviso.
 *
 * Devolve a chave do aviso (`teste_terminando:<yyyy-mm-dd>`) quando ele é devido agora, ou null.
 */
export function resolveTrialEndingNotice({
	periodoTesteFim,
	stripeSubscriptionStatus,
	now,
}: {
	periodoTesteFim: Date | null;
	stripeSubscriptionStatus: string | null;
	now: Date;
}): { chave: string; evento: "teste_terminando"; fimDoTeste: string } | null {
	if (!periodoTesteFim) return null;
	if (stripeSubscriptionStatus && PAYING_STRIPE_STATUSES.has(stripeSubscriptionStatus)) return null;
	const remainingMs = periodoTesteFim.getTime() - now.getTime();
	if (remainingMs <= 0 || remainingMs > TRIAL_ENDING_NOTICE_DAYS * DAY_MS) return null;
	const fimDoTeste = periodoTesteFim.toISOString().slice(0, 10);
	return { chave: `teste_terminando:${fimDoTeste}`, evento: "teste_terminando", fimDoTeste };
}
