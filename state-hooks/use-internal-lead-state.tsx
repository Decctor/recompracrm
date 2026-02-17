import type { TInternalLead } from "@/schemas/internal-leads";
import { useCallback, useState } from "react";

const getInitialState = (): TInternalLead => ({
	statusCRM: "NOVO",
	posicaoKanban: null,
	titulo: null,
	descricao: null,
	valor: null,
	probabilidade: null,
	origemLead: null,
	motivoPerda: null,

	organizacaoId: null,
	organizacaoNome: "",
	organizacaoCnpj: "",
	organizacaoLogoUrl: null,
	organizacaoTelefone: null,
	organizacaoEmail: null,
	organizacaoSite: null,

	contatoNome: "",
	contatoEmail: "",
	contatoTelefone: null,
	contatoCargo: null,
	contatoUsuarioId: null,

	responsavelId: null,
});

export function useInternalLeadState() {
	const [state, setState] = useState<TInternalLead>(getInitialState);

	const updateLead = useCallback((changes: Partial<TInternalLead>) => {
		setState((prev) => ({
			...prev,
			...changes,
		}));
	}, []);

	const updateOrganization = useCallback(
		(changes: Partial<
			Pick<
				TInternalLead,
				| "organizacaoId"
				| "organizacaoNome"
				| "organizacaoCnpj"
				| "organizacaoLogoUrl"
				| "organizacaoTelefone"
				| "organizacaoEmail"
				| "organizacaoSite"
			>
		>) => {
			setState((prev) => ({
				...prev,
				...changes,
			}));
		},
		[],
	);

	const updateContact = useCallback(
		(changes: Partial<
			Pick<TInternalLead, "contatoNome" | "contatoEmail" | "contatoTelefone" | "contatoCargo" | "contatoUsuarioId">
		>) => {
			setState((prev) => ({
				...prev,
				...changes,
			}));
		},
		[],
	);

	const updateOpportunity = useCallback(
		(changes: Partial<
			Pick<
				TInternalLead,
				| "statusCRM"
				| "posicaoKanban"
				| "titulo"
				| "descricao"
				| "valor"
				| "probabilidade"
				| "origemLead"
				| "motivoPerda"
				| "responsavelId"
			>
		>) => {
			setState((prev) => ({
				...prev,
				...changes,
			}));
		},
		[],
	);

	const resetState = useCallback(() => {
		setState(getInitialState());
	}, []);

	const redefineState = useCallback((state: TInternalLead) => {
		setState(state);
	}, []);

	return {
		state,
		updateLead,
		updateOrganization,
		updateContact,
		updateOpportunity,
		resetState,
		redefineState,
	};
}

export type TUseInternalLeadState = ReturnType<typeof useInternalLeadState>;
