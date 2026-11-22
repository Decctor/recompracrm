"use client";

import { resolveHubEmptyHints } from "@/lib/onboarding/hub-hints";
import { useOnboardingActivation } from "@/lib/queries/onboarding";
import { useMemo } from "react";

/**
 * Dicas dos estados vazios do hub (lib/onboarding/hub-hints.ts). Lê a mesma consulta da ativação, que
 * o React Query deduplica: o bloco de primeiros passos e os vazios não chamam o endpoint duas vezes.
 * Desligada (quem não edita a empresa), os vazios ficam com o texto de sempre.
 */
export function useHubEmptyHints({ enabled }: { enabled: boolean }) {
	const { data } = useOnboardingActivation({ enabled });
	return useMemo(() => resolveHubEmptyHints(enabled ? data : null), [enabled, data]);
}
