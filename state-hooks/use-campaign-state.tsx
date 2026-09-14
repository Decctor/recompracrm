import type {
	TCampaignFilterCondition,
	TCampaignFilterLogicOperatorEnum,
	TCampaignFilterTreeNode,
	TCampaignFiltersTree,
	TCampaignPromotionProduct,
	TCampaignState,
} from "@/schemas/campaigns";
import { RFMLabels } from "@/utils/rfm";
import { useCallback, useState } from "react";

// Always keep a root GRUPO in state for ergonomics. Empty trees are translated to
// `null` at submit time (see campaign submit surfaces).
function createEmptyFiltersTree(): TCampaignFiltersTree {
	return { tipo: "GRUPO", operador: "AND", itens: [] };
}

/**
 * A path is a list of item indices from the root. An empty path refers to the root itself.
 * - [] → root
 * - [0] → root.itens[0]
 * - [0, 2] → root.itens[0].itens[2] (only valid if root.itens[0] is a GRUPO)
 */
export type TFilterTreePath = number[];

// Replace the node at `path` by applying the updater. The updater receives the current node and
// returns a replacement (or null to remove it). Returns a cloned tree.
function mapAtPath(
	root: TCampaignFiltersTree,
	path: TFilterTreePath,
	updater: (node: TCampaignFiltersTree | TCampaignFilterTreeNode) => TCampaignFiltersTree | TCampaignFilterTreeNode | null,
): TCampaignFiltersTree {
	if (path.length === 0) {
		const updated = updater(root);
		if (!updated || updated.tipo !== "GRUPO") {
			// Root must stay a GRUPO — ignore invalid replacements and keep prior root.
			return root;
		}
		return updated as TCampaignFiltersTree;
	}

	const [head, ...rest] = path;
	if (root.itens[head] === undefined) return root;

	if (rest.length === 0) {
		const nextItens = [...root.itens];
		const replaced = updater(root.itens[head]);
		if (replaced === null) {
			nextItens.splice(head, 1);
		} else {
			nextItens[head] = replaced as TCampaignFilterTreeNode;
		}
		return { ...root, itens: nextItens };
	}

	const child = root.itens[head];
	if (child.tipo !== "GRUPO") return root;
	const newChild = mapAtPath(child as TCampaignFiltersTree, rest, updater);
	const nextItens = [...root.itens];
	nextItens[head] = newChild as TCampaignFilterTreeNode;
	return { ...root, itens: nextItens };
}

export function useCampaignState() {
	const initialState: TCampaignState = {
		campaign: {
			ativo: true,
			titulo: "",
			descricao: "",
			gatilhoTipo: "NOVA-COMPRA",
			gatilhoCashbackExpirandoAntecedenciaValor: null,
			gatilhoCashbackExpirandoAntecedenciaMedida: null,
			gatilhoCashbackExpirandoValorMinimo: null,
			recorrenciaTipo: null,
			recorrenciaIntervalo: 1,
			recorrenciaDiasSemana: null,
			recorrenciaDiasMes: null,
			gatilhoUsoUnicoDataReferencia: null,
			gatilhoPromocaoDataReferencia: null,
			gatilhoPromocaoProdutos: null,
			execucaoAgendadaMedida: "DIAS",
			execucaoAgendadaValor: 0,
			execucaoAgendadaDirecao: "DEPOIS",
			execucaoAgendadaBloco: "06:00",
			whatsappTemplateId: "",
			whatsappConexaoTelefoneId: null,
			permitirRecorrencia: true,
			frequenciaIntervaloValor: 0,
			frequenciaIntervaloMedida: "DIAS",
			atribuicaoModelo: "LAST_TOUCH",
			atribuicaoJanelaDias: 7,
			cashbackGeracaoAtivo: false,
			cashbackGeracaoTipo: null,
			cashbackGeracaoValor: null,
			cashbackGeracaoExpiracaoMedida: null,
			cashbackGeracaoExpiracaoValor: null,
			cupomGeracaoAtivo: false,
			cupomGeracaoCupomId: null,
			cupomGeracaoExpiracaoMedida: null,
			cupomGeracaoExpiracaoValor: null,
		},
		segmentations: RFMLabels.map((label) => ({
			segmentacao: label.text,
		})),
		filtros: createEmptyFiltersTree(),
	};

	const [state, setState] = useState<TCampaignState>(initialState);

	const updateCampaign = useCallback((campaign: Partial<TCampaignState["campaign"]>) => {
		setState((prev) => ({
			...prev,
			campaign: { ...prev.campaign, ...campaign },
		}));
	}, []);
	const addSegmentation = useCallback((segmentation: TCampaignState["segmentations"][number]) => {
		setState((prev) => ({
			...prev,
			segmentations: [...prev.segmentations, segmentation],
		}));
	}, []);
	const updateSegmentation = useCallback((segmentation: TCampaignState["segmentations"][number]) => {
		setState((prev) => ({
			...prev,
			segmentations: prev.segmentations.map((s) => (s.id === segmentation.id ? { ...s, ...segmentation } : s)),
		}));
	}, []);
	const deleteSegmentation = useCallback(
		(index: number) => {
			const isExistingSegmentation = state.segmentations.find((s, sIndex) => sIndex === index && !!s.id);
			setState((prev) => ({
				...prev,
				segmentations: isExistingSegmentation
					? prev.segmentations.map((p) => (p.id === isExistingSegmentation.id ? { ...p, deletar: true } : p)) // flagging for deletion
					: prev.segmentations.filter((_, sIndex) => sIndex !== index),
			}));
		},
		[state.segmentations],
	);

	// ------- Promotion products helpers (gatilho "PROMOCAO-PRODUTOS") -------
	// A lista é um jsonb substituído por inteiro: sem `deletar`, remover é filtrar o array.
	// A ordem importa — é a prioridade de fallback quando o cliente não tem afinidade.

	const addPromotionProduct = useCallback((promotionProduct: TCampaignPromotionProduct) => {
		setState((prev) => ({
			...prev,
			campaign: {
				...prev.campaign,
				gatilhoPromocaoProdutos: [...(prev.campaign.gatilhoPromocaoProdutos ?? []), promotionProduct],
			},
		}));
	}, []);

	const updatePromotionProduct = useCallback((index: number, promotionProduct: Partial<TCampaignPromotionProduct>) => {
		setState((prev) => ({
			...prev,
			campaign: {
				...prev.campaign,
				gatilhoPromocaoProdutos: (prev.campaign.gatilhoPromocaoProdutos ?? []).map((item, itemIndex) =>
					itemIndex === index ? { ...item, ...promotionProduct } : item,
				),
			},
		}));
	}, []);

	const removePromotionProduct = useCallback((index: number) => {
		setState((prev) => ({
			...prev,
			campaign: {
				...prev.campaign,
				gatilhoPromocaoProdutos: (prev.campaign.gatilhoPromocaoProdutos ?? []).filter((_, itemIndex) => itemIndex !== index),
			},
		}));
	}, []);

	// ------- Filters tree helpers -------

	const updateFiltersRoot = useCallback((partial: Partial<Pick<TCampaignFiltersTree, "operador">>) => {
		setState((prev) => ({
			...prev,
			filtros: { ...prev.filtros, ...partial },
		}));
	}, []);

	const addFilterCondition = useCallback((path: TFilterTreePath, condicao: TCampaignFilterCondition) => {
		setState((prev) => ({
			...prev,
			filtros: mapAtPath(prev.filtros, path, (node) => {
				if (!node || node.tipo !== "GRUPO") return node;
				return { ...node, itens: [...node.itens, { tipo: "CONDICAO", condicao }] };
			}),
		}));
	}, []);

	const updateFilterCondition = useCallback((path: TFilterTreePath, condicao: TCampaignFilterCondition) => {
		if (path.length === 0) return; // root is always a GRUPO
		setState((prev) => ({
			...prev,
			filtros: mapAtPath(prev.filtros, path, (node) => {
				if (!node || node.tipo !== "CONDICAO") return node;
				return { tipo: "CONDICAO", condicao };
			}),
		}));
	}, []);

	const addFilterGroup = useCallback((path: TFilterTreePath, operador: TCampaignFilterLogicOperatorEnum) => {
		setState((prev) => ({
			...prev,
			filtros: mapAtPath(prev.filtros, path, (node) => {
				if (!node || node.tipo !== "GRUPO") return node;
				const newGroup: TCampaignFilterTreeNode = { tipo: "GRUPO", operador, itens: [] };
				return { ...node, itens: [...node.itens, newGroup] };
			}),
		}));
	}, []);

	const updateFilterGroupOperator = useCallback((path: TFilterTreePath, operador: TCampaignFilterLogicOperatorEnum) => {
		setState((prev) => ({
			...prev,
			filtros: mapAtPath(prev.filtros, path, (node) => {
				if (!node || node.tipo !== "GRUPO") return node;
				return { ...node, operador };
			}),
		}));
	}, []);

	const removeFilterNode = useCallback((path: TFilterTreePath) => {
		if (path.length === 0) return; // never remove the root
		setState((prev) => ({
			...prev,
			filtros: mapAtPath(prev.filtros, path, () => null),
		}));
	}, []);

	const resetFilters = useCallback(() => {
		setState((prev) => ({ ...prev, filtros: createEmptyFiltersTree() }));
	}, []);

	const resetState = useCallback(() => {
		setState(initialState);
	}, []);
	const redefineState = useCallback((state: TCampaignState) => {
		setState({
			...state,
			filtros: state.filtros ?? createEmptyFiltersTree(),
		});
	}, []);
	return {
		state,
		updateCampaign,
		addSegmentation,
		updateSegmentation,
		deleteSegmentation,
		addPromotionProduct,
		updatePromotionProduct,
		removePromotionProduct,
		updateFiltersRoot,
		addFilterCondition,
		updateFilterCondition,
		addFilterGroup,
		updateFilterGroupOperator,
		removeFilterNode,
		resetFilters,
		resetState,
		redefineState,
	};
}
export type TUseCampaignState = ReturnType<typeof useCampaignState>;
