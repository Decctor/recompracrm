import { getOrganizationNicheByValue } from "@/config/onboarding";
import { OnboardingCampaignPresets, type TOnboardingCampaignPresetKey } from "@/config/onboarding-campaign-presets";
import type { TOnboardingReadiness } from "@/lib/onboarding/readiness";
import { OnboardingMainPainEnum } from "@/schemas/enums";
import type { TOnboardingAnswers } from "@/schemas/onboarding";
import { OrganizationSchema } from "@/schemas/organizations";
import { useCallback, useMemo, useState } from "react";
import { z } from "zod";

/**
 * Estado de FORMULÁRIO da jornada CRM: o que o usuário digita antes de cada etapa gravar. A
 * navegação (etapa atual, adiamentos) vive em `useInternalOnboardingNavigationState`, e o que já
 * está configurado vem da prontidão derivada (`useOnboardingReadiness`). Este hook não decide
 * nada sobre prontidão.
 */
const CashbackConfigSchema = z.object({
	ativo: z.boolean(),
	titulo: z.string(),
	terminologia: z.enum(["DINHEIRO", "PONTOS"]),
	modalidadeDescontosPermitida: z.boolean(),
	modalidadeRecompensasPermitida: z.boolean(),
	acumuloTipo: z.enum(["FIXO", "PERCENTUAL"]),
	acumuloValor: z.number(),
	acumuloRegraValorMinimo: z.number(),
	acumuloValorParceiro: z.number(),
	acumuloPermitirViaIntegracao: z.boolean(),
	acumuloPermitirViaPontoIntegracao: z.boolean(),
	expiracaoRegraValidadeValor: z.number(),
	resgateLimiteTipo: z.enum(["FIXO", "PERCENTUAL"]).nullable(),
	resgateLimiteValor: z.number().nullable(),
});
export type TOnboardingCashbackConfig = z.infer<typeof CashbackConfigSchema>;

const OrganizationOnboardingStateSchema = z.object({
	organization: OrganizationSchema.omit({ dataInsercao: true, autorId: true, configuracao: true, dataOnboardingConclusao: true }),
	organizationLogoHolder: z.object({
		file: z.instanceof(File).optional().nullable(),
		previewUrl: z.string().optional().nullable(),
	}),
	cashback: CashbackConfigSchema,
	selectedCampaignKeys: z.array(z.string()),
	// Liberar envios assim que as campanhas estiverem prontas (intenção, não ativação).
	enableSendingWhenReady: z.boolean(),
	dataSourceMode: z.enum(["INTEGRACAO", "POI", "DEPOIS"]).nullable(),
	indicadorCodigo: z.string().optional().nullable(),
	termsAccepted: z.boolean(),
	// Declaração de intenção (opcional) e a meta do teste que ela oferece.
	dorPrincipal: OnboardingMainPainEnum.nullable(),
	metaTesteAceita: z.boolean(),
});
export type TOrganizationOnboardingState = z.infer<typeof OrganizationOnboardingStateSchema>;

export const DEFAULT_ONBOARDING_CASHBACK_CONFIG: TOnboardingCashbackConfig = {
	ativo: false,
	titulo: "",
	terminologia: "DINHEIRO",
	modalidadeDescontosPermitida: true,
	modalidadeRecompensasPermitida: true,
	acumuloTipo: "PERCENTUAL",
	acumuloValor: 5,
	acumuloRegraValorMinimo: 0,
	acumuloValorParceiro: 0,
	acumuloPermitirViaIntegracao: false,
	acumuloPermitirViaPontoIntegracao: true,
	expiracaoRegraValidadeValor: 60,
	resgateLimiteTipo: "PERCENTUAL",
	resgateLimiteValor: 30,
};

/** Config de cashback pré-preenchida pelo preset do nicho (preserva a escolha `ativo`). */
export function buildCashbackConfigFromNiche(
	nicheValue: string | null | undefined,
	organizationName: string,
	ativo: boolean,
): TOnboardingCashbackConfig {
	const preset = nicheValue ? getOrganizationNicheByValue(nicheValue)?.cashbackProgramDefault : null;
	return {
		...DEFAULT_ONBOARDING_CASHBACK_CONFIG,
		...preset,
		ativo,
		titulo: organizationName ? `Programa de Cashback ${organizationName}` : "Nosso programa de fidelidade",
	};
}

/** Sobrepõe ao preset o que já está gravado, para a retomada mostrar o programa real. */
function applyExistingCashback(config: TOnboardingCashbackConfig, readiness: TOnboardingReadiness | null | undefined): TOnboardingCashbackConfig {
	const resumo = readiness?.cashback.resumo;
	if (!resumo) return config;
	return {
		...config,
		ativo: readiness?.cashback.estado === "ATIVO",
		acumuloTipo: resumo.acumuloTipo,
		acumuloValor: resumo.acumuloValor,
		expiracaoRegraValidadeValor: resumo.validadeDias,
		resgateLimiteTipo: resumo.limiteResgate?.tipo ?? null,
		resgateLimiteValor: resumo.limiteResgate?.valor ?? null,
	};
}

type TExistingOrganization = Partial<TOrganizationOnboardingState["organization"]> & { id?: string | null };

type TUseOrganizationOnboardingStateProps = {
	existingOrganization?: TExistingOrganization | null;
	readiness?: TOnboardingReadiness | null;
	/** Respostas já gravadas na jornada (retomada). */
	answers?: Pick<TOnboardingAnswers, "campanhasSelecionadas" | "campanhasComEnvioHabilitado" | "fonteDadosModo" | "dorPrincipal" | "metaTesteAceita"> | null;
};

export function useOrganizationOnboardingState({ existingOrganization, readiness, answers }: TUseOrganizationOnboardingStateProps) {
	const start: TOrganizationOnboardingState = useMemo(() => {
		const org = existingOrganization;
		const hasSavedCampaigns = (answers?.campanhasSelecionadas.length ?? 0) > 0 || (readiness?.campanhas.length ?? 0) > 0;
		return {
			organization: {
				nome: org?.nome ?? "",
				cnpj: org?.cnpj ?? "",
				slug: org?.slug ?? "",
				atuacaoCanais: org?.atuacaoCanais ?? "",
				atuacaoNicho: org?.atuacaoNicho ?? "",
				origemLead: org?.origemLead ?? "",
				plataformasUtilizadas: org?.plataformasUtilizadas ?? "",
				tamanhoBaseClientes: org?.tamanhoBaseClientes ?? 0,
				assinaturaPlano: null,
				dadosViaERP: false,
				dadosViaPDI: org?.dadosViaPDI ?? false,
				dadosViaIntegracoes: false,
				origemDadosPadrao: "RECEPTOR",
				fiscalEmissaoAutomatica: false,
				fiscalProvedor: null,
				fiscalConfiguracao: null,
				telefone: org?.telefone ?? null,
				email: org?.email ?? null,
				localizacaoCep: null,
				localizacaoEstado: null,
				localizacaoCidade: null,
				localizacaoBairro: null,
				localizacaoLogradouro: null,
				localizacaoNumero: null,
				localizacaoComplemento: null,
				periodoTesteInicio: null,
				periodoTesteFim: null,
				consultoriaAtiva: false,
				baselineInicio: null,
				corPrimaria: null,
				corPrimariaForeground: null,
				corSecundaria: null,
				corSecundariaForeground: null,
				integracaoTipo: null,
				integracaoConfiguracao: null,
				integracaoDataUltimaSincronizacao: null,
				logoUrl: org?.logoUrl ?? null,
				poiQrCodeKioskDataUrl: null,
				poiQrCodeMobileDataUrl: null,
				poiConfirmacaoValorObrigatoria: false,
			},
			organizationLogoHolder: { file: null, previewUrl: null },
			cashback: applyExistingCashback(buildCashbackConfigFromNiche(org?.atuacaoNicho, org?.nome ?? "", false), readiness),
			selectedCampaignKeys: hasSavedCampaigns
				? readiness && readiness.campanhas.length > 0
					? readiness.campanhas.map((campaign) => campaign.chave)
					: (answers?.campanhasSelecionadas ?? [])
				: OnboardingCampaignPresets.filter((preset) => preset.defaultSelected).map((preset) => preset.key),
			enableSendingWhenReady: (answers?.campanhasComEnvioHabilitado.length ?? 0) > 0,
			dataSourceMode: answers?.fonteDadosModo ?? null,
			indicadorCodigo: null,
			termsAccepted: false,
			dorPrincipal: answers?.dorPrincipal ?? null,
			// Meta do teste ligada por padrão quando há resposta: aceitar é o caminho de menor esforço.
			metaTesteAceita: answers ? answers.metaTesteAceita : true,
		};
	}, [existingOrganization, readiness, answers]);

	const [state, setState] = useState<TOrganizationOnboardingState>(start);

	const updateOrganization = useCallback((organization: Partial<TOrganizationOnboardingState["organization"]>) => {
		setState((prev) => ({ ...prev, organization: { ...prev.organization, ...organization } }));
	}, []);

	const updateOrganizationLogoHolder = useCallback((organizationLogoHolder: Partial<TOrganizationOnboardingState["organizationLogoHolder"]>) => {
		setState((prev) => ({ ...prev, organizationLogoHolder: { ...prev.organizationLogoHolder, ...organizationLogoHolder } }));
	}, []);

	const updateOnboarding = useCallback((changes: Partial<TOrganizationOnboardingState>) => {
		setState((prev) => ({ ...prev, ...changes }));
	}, []);

	const updateCashback = useCallback((cashback: Partial<TOnboardingCashbackConfig>) => {
		setState((prev) => ({ ...prev, cashback: { ...prev.cashback, ...cashback } }));
	}, []);

	const applyCashbackPresetFromNiche = useCallback(() => {
		setState((prev) => ({
			...prev,
			cashback: buildCashbackConfigFromNiche(prev.organization.atuacaoNicho, prev.organization.nome, prev.cashback.ativo),
		}));
	}, []);

	const toggleCampaign = useCallback((key: TOnboardingCampaignPresetKey) => {
		setState((prev) => ({
			...prev,
			selectedCampaignKeys: prev.selectedCampaignKeys.includes(key)
				? prev.selectedCampaignKeys.filter((item) => item !== key)
				: [...prev.selectedCampaignKeys, key],
		}));
	}, []);

	const setDataSourceMode = useCallback((dataSourceMode: TOrganizationOnboardingState["dataSourceMode"]) => {
		setState((prev) => ({ ...prev, dataSourceMode }));
	}, []);

	const resetState = useCallback(() => setState(start), [start]);

	return {
		state,
		updateOrganization,
		updateOrganizationLogoHolder,
		updateOnboarding,
		updateCashback,
		applyCashbackPresetFromNiche,
		toggleCampaign,
		setDataSourceMode,
		resetState,
	};
}

export type TUseOrganizationOnboardingState = ReturnType<typeof useOrganizationOnboardingState>;
