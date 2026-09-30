import { PlatformPartnerOnboardingSchema, type TPlatformPartnerOnboarding } from "@/schemas/platform-partnerships";
import { useCallback, useMemo, useState } from "react";
import z from "zod";

const PlatformPartnerOnboardingStateSchema = z.object({
	partner: PlatformPartnerOnboardingSchema,
});
export type TPlatformPartnerOnboardingState = z.infer<typeof PlatformPartnerOnboardingStateSchema>;

export function usePlatformPartnerOnboardingState({ initialState }: { initialState?: Partial<TPlatformPartnerOnboardingState> }) {
	const start = useMemo<TPlatformPartnerOnboardingState>(
		() => ({
			partner: {
				nome: initialState?.partner?.nome ?? "",
				email: initialState?.partner?.email ?? "",
				telefone: initialState?.partner?.telefone ?? "",
				tipoPessoa: initialState?.partner?.tipoPessoa ?? "PESSOA_FISICA",
				cpfCnpj: initialState?.partner?.cpfCnpj ?? "",
				chavePix: initialState?.partner?.chavePix ?? "",
				chavePixTipo: initialState?.partner?.chavePixTipo ?? "CPF",
				titularPixConfirmado: initialState?.partner?.titularPixConfirmado ?? false,
				arquivos: initialState?.partner?.arquivos ?? {},
				aceiteTermos: initialState?.partner?.aceiteTermos ?? false,
			},
		}),
		[initialState],
	);

	const [state, setState] = useState<TPlatformPartnerOnboardingState>(start);

	const updatePartner = useCallback((partner: Partial<TPlatformPartnerOnboarding>) => {
		setState((prev) => ({
			...prev,
			partner: {
				...prev.partner,
				...partner,
			},
		}));
	}, []);

	const resetState = useCallback(() => setState(start), [start]);
	const redefineState = useCallback((newState: TPlatformPartnerOnboardingState) => setState(newState), []);

	return {
		state,
		updatePartner,
		resetState,
		redefineState,
	};
}

export type TUsePlatformPartnerOnboardingState = ReturnType<typeof usePlatformPartnerOnboardingState>;
