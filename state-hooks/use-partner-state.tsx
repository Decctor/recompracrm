import type { TPartnerState } from "@/schemas/partners";
import { useCallback, useState } from "react";

const getInitialState = (): TPartnerState => ({
	partner: {
		clienteId: "",
		identificador: "",
		codigoAfiliacao: "",
		nome: "",
		avatarUrl: "",
		cpfCnpj: "",
		telefone: "",
		telefoneBase: "",
		email: "",
		localizacaoCep: "",
		localizacaoEstado: "",
		localizacaoCidade: "",
		localizacaoBairro: "",
		localizacaoLogradouro: "",
		localizacaoNumero: "",
		localizacaoComplemento: "",
		dataInsercao: new Date(),
	},
	avatarHolder: {
		file: null,
		previewUrl: null,
	},
});

export function usePartnerState() {
	const [state, setState] = useState<TPartnerState>(getInitialState());

	const updatePartner = useCallback((changes: Partial<TPartnerState["partner"]>) => {
		setState((prev) => ({
			...prev,
			partner: {
				...prev.partner,
				...changes,
			},
		}));
	}, []);

	const updateAvatarHolder = useCallback((changes: Partial<TPartnerState["avatarHolder"]>) => {
		setState((prev) => ({
			...prev,
			avatarHolder: {
				...prev.avatarHolder,
				...changes,
			},
		}));
	}, []);

	const resetState = useCallback(() => {
		setState(getInitialState());
	}, []);

	const redefineState = useCallback((state: TPartnerState) => {
		setState(state);
	}, []);

	return {
		state,
		updatePartner,
		updateAvatarHolder,
		resetState,
		redefineState,
	};
}

export type TUsePartnerState = ReturnType<typeof usePartnerState>;
