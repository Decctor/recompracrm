import type { TGenerateHintsOutput, TGetHintsOutput, TAIHint, TAIHintFeedbackType, TAIHintSubject } from "@/schemas/ai-hints";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect } from "react";

// ═══════════════════════════════════════════════════════════════
// FETCH FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function fetchHints(params: { assunto?: TAIHintSubject; status?: string; limite?: number }) {
	const searchParams = new URLSearchParams();
	if (params.assunto) searchParams.set("assunto", params.assunto);
	if (params.status) searchParams.set("status", params.status);
	if (params.limite) searchParams.set("limite", params.limite.toString());

	const { data } = await axios.get<TGetHintsOutput>(`/api/ai-hints?${searchParams.toString()}`);
	return data.data;
}

async function generateHints(params: { assunto: TAIHintSubject; contextoAdicional?: string }) {
	const { data } = await axios.post<TGenerateHintsOutput>("/api/ai-hints/generate", params);
	return data;
}

async function dismissHint(hintId: string) {
	const { data } = await axios.post(`/api/ai-hints/dismiss?id=${hintId}`);
	return data;
}

async function submitFeedback(params: { hintId: string; tipo: TAIHintFeedbackType; comentario?: string }) {
	const { data } = await axios.post(`/api/ai-hints/feedback?id=${params.hintId}`, {
		tipo: params.tipo,
		comentario: params.comentario,
	});
	return data;
}

// ═══════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════

interface UseAIHintsParams {
	assunto?: TAIHintSubject;
	enabled?: boolean;
	autoGenerate?: boolean;
}

export function useAIHints({ assunto, enabled = true, autoGenerate = true }: UseAIHintsParams = {}) {
	const queryClient = useQueryClient();

	const hintsQuery = useQuery({
		queryKey: ["ai-hints", assunto],
		queryFn: () => fetchHints({ assunto, status: "active" }),
		enabled,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});

	const generateMutation = useMutation({
		mutationFn: generateHints,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["ai-hints", assunto] });
			queryClient.invalidateQueries({ queryKey: ["ai-hints", undefined] });
		},
	});

	// Auto-generate hints if none exist and feature is enabled
	useEffect(() => {
		if (
			autoGenerate &&
			enabled &&
			assunto &&
			hintsQuery.data !== undefined &&
			hintsQuery.data.length === 0 &&
			!generateMutation.isPending &&
			!generateMutation.isSuccess
		) {
			generateMutation.mutate({ assunto });
		}
	}, [autoGenerate, enabled, assunto, hintsQuery.data, generateMutation.isPending, generateMutation.isSuccess]);

	return {
		hints: hintsQuery.data ?? [],
		isLoading: hintsQuery.isLoading,
		isGenerating: generateMutation.isPending,
		error: hintsQuery.error,
		refetch: hintsQuery.refetch,
		generate: (contextoAdicional?: string) => {
			if (assunto) {
				generateMutation.mutate({ assunto, contextoAdicional });
			}
		},
	};
}

export function useGenerateHints() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: generateHints,
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["ai-hints", variables.assunto] });
			queryClient.invalidateQueries({ queryKey: ["ai-hints", undefined] });
		},
	});
}

export function useDismissHint() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: dismissHint,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["ai-hints"] });
		},
	});
}

export function useHintFeedback() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: submitFeedback,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["ai-hints"] });
		},
	});
}

// ═══════════════════════════════════════════════════════════════
// ALL HINTS HOOK (for the bubble)
// ═══════════════════════════════════════════════════════════════

export function useAllActiveHints() {
	return useQuery({
		queryKey: ["ai-hints", undefined],
		queryFn: () => fetchHints({ status: "active", limite: 10 }),
		staleTime: 5 * 60 * 1000,
	});
}
