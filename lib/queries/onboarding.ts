import type { TGetOnboardingOutput } from "@/app/api/organizations/onboarding/route";
import type { TGetOnboardingReadinessOutput } from "@/app/api/organizations/onboarding/readiness/route";
import type { TGetOnboardingActivationOutput } from "@/app/api/organizations/onboarding/activation/route";
import type { TGetOnboardingQualityOutput } from "@/app/api/organizations/onboarding-quality/route";
import type { TOnboardingReadiness } from "@/lib/onboarding/readiness";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

async function fetchOnboardingQuality() {
	const { data } = await axios.get<TGetOnboardingQualityOutput>("/api/organizations/onboarding-quality");
	return data.data;
}

export function useOnboardingQuality() {
	return {
		...useQuery({
			queryKey: ["onboarding-quality"],
			queryFn: fetchOnboardingQuality,
			staleTime: 1000 * 60 * 5, // 5 minutes
		}),
		queryKey: ["onboarding-quality"],
	};
}

export const ONBOARDING_READINESS_QUERY_KEY = ["onboarding-readiness"] as const;

async function fetchOnboardingReadiness() {
	const { data } = await axios.get<TGetOnboardingReadinessOutput>("/api/organizations/onboarding/readiness");
	return data.data;
}

/**
 * Prontidão derivada das tabelas reais. O servidor de /onboarding passa `initialData` para a
 * primeira renderização não piscar; depois cada mutação invalida a chave.
 */
export function useOnboardingReadiness({
	enabled = true,
	initialData,
	refetchIntervalMs,
}: {
	enabled?: boolean;
	initialData?: TOnboardingReadiness | null;
	/** Cadência de polling (ex.: enquanto uma carga histórica anda). Sem valor = sem polling. */
	refetchIntervalMs?: number | false;
} = {}) {
	return {
		...useQuery({
			queryKey: ONBOARDING_READINESS_QUERY_KEY,
			queryFn: fetchOnboardingReadiness,
			enabled,
			initialData: initialData ?? undefined,
			staleTime: 1000 * 15,
			refetchInterval: refetchIntervalMs ?? ((query) => query.state.data?.fonteDados.integracoes.some((integration) => integration.cargaHistorica && ["AGUARDANDO", "EM_ANDAMENTO", "PAUSADO_LIMITE"].includes(integration.cargaHistorica.estado)) ? 10000 : 60000),
		}),
		queryKey: ONBOARDING_READINESS_QUERY_KEY,
	};
}

export const ONBOARDING_ACTIVATION_QUERY_KEY = ["onboarding-activation"] as const;

async function fetchOnboardingActivation() {
	const { data } = await axios.get<TGetOnboardingActivationOutput>("/api/organizations/onboarding/activation");
	return data.data;
}

/**
 * Ativação por segmento (lib/onboarding/activation.ts): escada de marcos, próxima ação e se a
 * superfície do hub aparece. Some sozinha depois da ativação; volta numa regressão.
 */
export function useOnboardingActivation({ enabled = true }: { enabled?: boolean } = {}) {
	return {
		...useQuery({
			queryKey: ONBOARDING_ACTIVATION_QUERY_KEY,
			queryFn: fetchOnboardingActivation,
			enabled,
			staleTime: 1000 * 60,
		}),
		queryKey: ONBOARDING_ACTIVATION_QUERY_KEY,
	};
}

export const ONBOARDING_JOURNEYS_QUERY_KEY = ["onboarding-journeys"] as const;

async function fetchOnboarding() {
	const { data } = await axios.get<TGetOnboardingOutput>("/api/organizations/onboarding");
	return data.data;
}

export function useOnboardingJourneys({ enabled = true }: { enabled?: boolean } = {}) {
	return {
		...useQuery({ queryKey: ONBOARDING_JOURNEYS_QUERY_KEY, queryFn: fetchOnboarding, enabled, staleTime: 1000 * 30 }),
		queryKey: ONBOARDING_JOURNEYS_QUERY_KEY,
	};
}
