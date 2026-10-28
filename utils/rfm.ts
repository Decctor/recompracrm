export type TRFMConfig = {
	identificador: "CONFIG_RFM";
	frequencia: {
		5: {
			min: number;
			max: number;
		};
		4: {
			min: number;
			max: number;
		};
		3: {
			min: number;
			max: number;
		};
		2: {
			min: number;
			max: number;
		};
		1: {
			min: number;
			max: number;
		};
	};
	recencia: {
		5: {
			min: number;
			max: number;
		};
		4: {
			min: number;
			max: number;
		};
		3: {
			min: number;
			max: number;
		};
		2: {
			min: number;
			max: number;
		};
		1: {
			min: number;
			max: number;
		};
	};
	monetario: {
		5: {
			min: number;
			max: number;
		};
		4: {
			min: number;
			max: number;
		};
		3: {
			min: number;
			max: number;
		};
		2: {
			min: number;
			max: number;
		};
		1: {
			min: number;
			max: number;
		};
	};
};

export const NO_PURCHASES_RFM_LABEL = "SEM COMPRAS REGISTRADAS";

export const RFMLabels = [
	{
		text: "CAMPEÕES",
		backgroundCollor: "bg-orange-400",
		textCollor: "text-gray-950",
		borderCollor: "border-orange-800",
		combinations: [
			[5, 5, 5],
			[5, 5, 4],
			[5, 4, 5], // Alto valor, alta frequência
			[5, 4, 4],
			[4, 5, 5], // Combinações premium
		],
	},
	{
		text: "CLIENTES LEAIS",
		backgroundCollor: "bg-green-400",
		textCollor: "text-gray-950",
		borderCollor: "border-green-800",
		combinations: [
			[4, 4, 4],
			[4, 4, 3],
			[4, 3, 4], // Bom desempenho geral
			[5, 3, 3],
			[4, 5, 3], // Alto valor ou frequência
		],
	},
	{
		text: "POTENCIAIS CLIENTES LEAIS",
		backgroundCollor: "bg-[#5C4033]",
		textCollor: "text-white",
		borderCollor: "border-border",
		combinations: [
			[3, 4, 4],
			[3, 3, 5], // Crescimento em frequência
			[4, 3, 3],
			[3, 4, 3], // Potencial identificado
		],
	},
	{
		text: "CLIENTES RECENTES",
		backgroundCollor: "bg-teal-400",
		textCollor: "text-gray-950",
		borderCollor: "border-teal-800",
		combinations: [
			[3, 1, 5],
			[3, 2, 5], // Novos com alto valor
			[2, 1, 4],
			[2, 2, 4], // Começando bem
		],
	},
	{
		text: "PROMISSORES",
		backgroundCollor: "bg-pink-400",
		textCollor: "text-gray-950",
		borderCollor: "border-pink-800",
		combinations: [
			[4, 2, 3],
			[3, 2, 4], // Valor crescente
			[3, 3, 3],
			[4, 2, 2], // Desenvolvimento constante
		],
	},
	{
		text: "PRECISAM DE ATENÇÃO",
		backgroundCollor: "bg-indigo-400",
		textCollor: "text-white",
		borderCollor: "border-indigo-800",
		combinations: [
			[3, 3, 2],
			[3, 2, 3], // Performance mediana
			[2, 3, 3],
			[4, 2, 1], // Valor caindo
		],
	},
	{
		text: "PRESTES A DORMIR",
		backgroundCollor: "bg-yellow-600",
		textCollor: "text-white",
		borderCollor: "border-yellow-600",
		combinations: [
			[2, 2, 2],
			[3, 1, 2], // Engajamento baixo
			[2, 2, 1],
			[2, 1, 2], // Risco de perda
		],
	},
	{
		text: "EM RISCO",
		backgroundCollor: "bg-yellow-400",
		textCollor: "text-gray-950",
		borderCollor: "border-yellow-800",
		combinations: [
			[4, 1, 1],
			[3, 1, 1], // Alto valor histórico, sem engajamento
			[5, 1, 1],
			[4, 2, 1], // Urgente recuperação
		],
	},
	{
		text: "NÃO PODE PERDÊ-LOS",
		backgroundCollor: "bg-blue-400",
		textCollor: "text-white",
		borderCollor: "border-blue-800",
		combinations: [
			[5, 2, 2],
			[5, 2, 1], // Alto valor, baixo engajamento
			[5, 1, 2],
			[4, 1, 2], // Prioridade de recuperação
		],
	},
	{
		text: "HIBERNANDO",
		backgroundCollor: "bg-purple-400",
		textCollor: "text-white",
		borderCollor: "border-purple-800",
		combinations: [
			[2, 1, 1],
			[1, 2, 2], // Baixo desempenho geral
			[2, 2, 1],
			[1, 2, 1], // Quase perdidos
		],
	},
	{
		text: "PERDIDOS",
		backgroundCollor: "bg-red-500",
		textCollor: "text-white",
		borderCollor: "border-red-800",
		combinations: [
			[1, 1, 1],
			[1, 1, 2], // Sem engajamento
			[1, 2, 1],
			[2, 1, 1], // Última tentativa
		],
	},
	{ text: NO_PURCHASES_RFM_LABEL, backgroundCollor: "bg-slate-500", textCollor: "text-white", borderCollor: "border-slate-700", combinations: [] },
];

export type TRFMLabelConfig = (typeof RFMLabels)[number];

export const getRFMConfigByLabel = (label: string | null | undefined): TRFMLabelConfig => {
	return (
		RFMLabels.find((item) => item.text === label) ?? {
			text: "NÃO DEFINIDO",
			backgroundCollor: "bg-slate-500",
			textCollor: "text-white",
			borderCollor: "border-slate-700",
			combinations: [],
		}
	);
};

export const getRFMLabel = ({
	monetary,
	frequency,
	recency,
	hasConfirmedPurchase = true,
}: {
	monetary: number;
	frequency: number;
	recency: number;
	hasConfirmedPurchase?: boolean;
}) => {
	if (!hasConfirmedPurchase) return NO_PURCHASES_RFM_LABEL;
	const valueScore = Math.round((frequency + monetary) / 2);

	if (recency >= 4 && frequency >= 4 && monetary >= 4) return "CAMPEÕES";
	if (recency >= 4 && valueScore >= 4) return "CLIENTES LEAIS";
	if (recency >= 4 && frequency <= 2) return "CLIENTES RECENTES";
	if (recency >= 4) return "PROMISSORES";

	if (recency === 3 && valueScore >= 4) return "POTENCIAIS CLIENTES LEAIS";
	if (recency === 3 && valueScore >= 3) return "PRECISAM DE ATENÇÃO";
	if (recency === 3) return "PRESTES A DORMIR";

	if (recency === 2 && valueScore >= 4) return "NÃO PODE PERDÊ-LOS";
	if (recency === 2 && valueScore >= 3) return "EM RISCO";
	if (recency === 2) return "HIBERNANDO";

	if (monetary >= 5) return "NÃO PODE PERDÊ-LOS";
	if (valueScore >= 4) return "NÃO PODE PERDÊ-LOS";
	if (valueScore >= 2) return "HIBERNANDO";

	return "PERDIDOS";
};
