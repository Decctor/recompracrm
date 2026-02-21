import type { TNewCampaignEntity, TNewCampaignSegmentationEntity, TNewCashbackProgramEntity } from "@/services/drizzle/schema";
import {
	Baby,
	Beef,
	CakeSlice,
	Dumbbell,
	Footprints,
	Gem,
	Glasses,
	Hammer,
	HelpCircle,
	PawPrint,
	PenTool,
	Pill,
	Shirt,
	ShoppingCart,
	Smartphone,
	Sofa,
	SprayCan,
	Store,
	Utensils,
	WandSparkles,
	Wrench,
	Zap,
} from "lucide-react";
import { FaGoogle, FaInstagram, FaLinkedin, FaUserGroup, FaWandSparkles, FaYoutube } from "react-icons/fa6";

export const RecompraCRMDefaultWhatsappTemplates = {
	recompracrm_primeira_compra: {
		id: "75f3be7d-6b93-43ec-b2dc-e3ecb461945f",
		nome: "recompracrm_primeira_compra",
		descricao: "Nosso template para você utilizar na primeira compra do cliente e instigá-lo a voltar.",
	},
	recompracrm_segunda_compra: {
		id: "42b6045f-f835-4bca-bb98-7cebd9fe04ad",
		nome: "recompracrm_segunda_compra",
		descricao: "Nosso template para segundas compras, oferencendo cashback para efetivar a fidelização do seu cliente.",
	},
	recompracrm_presente_aniversario: {
		id: "5e382952-e4f4-4547-a57b-3d4b54321b88",
		nome: "recompracrm_presente_aniversario",
		descricao: "Nosso template para presentes de aniversário, oferecendo cashback como presente.",
	},
	recompracrm_recuperacao_clientes: {
		id: "5be90aa1-a492-4cce-a937-7d93d9c0d4ee",
		nome: "recompracrm_recuperacao_clientes",
		descricao: "Nosso template para recuperar clientes inativos, oferecendo cashback como recompensa.",
	},
};

type TRecompraCRMDefaultCampaign = {
	campaign: {
		titulo: TNewCampaignEntity["titulo"];
		descricao: TNewCampaignEntity["descricao"];
		gatilhoTipo: TNewCampaignEntity["gatilhoTipo"];
		gatilhoTempoPermanenciaMedida: TNewCampaignEntity["gatilhoTempoPermanenciaMedida"];
		gatilhoTempoPermanenciaValor: TNewCampaignEntity["gatilhoTempoPermanenciaValor"];
		gatilhoNovoCashbackAcumuladoValorMinimo: TNewCampaignEntity["gatilhoNovoCashbackAcumuladoValorMinimo"];
		gatilhoTotalCashbackAcumuladoValorMinimo: TNewCampaignEntity["gatilhoTotalCashbackAcumuladoValorMinimo"];
		gatilhoQuantidadeTotalCompras: TNewCampaignEntity["gatilhoQuantidadeTotalCompras"];
		gatilhoValorTotalCompras: TNewCampaignEntity["gatilhoValorTotalCompras"];
		execucaoAgendadaMedida: TNewCampaignEntity["execucaoAgendadaMedida"];
		execucaoAgendadaValor: TNewCampaignEntity["execucaoAgendadaValor"];
		execucaoAgendadaBloco: TNewCampaignEntity["execucaoAgendadaBloco"];
		permitirRecorrencia: TNewCampaignEntity["permitirRecorrencia"];
		frequenciaIntervaloValor: TNewCampaignEntity["frequenciaIntervaloValor"];
		frequenciaIntervaloMedida: TNewCampaignEntity["frequenciaIntervaloMedida"];
		atribuicaoModelo: TNewCampaignEntity["atribuicaoModelo"];
		atribuicaoJanelaDias: TNewCampaignEntity["atribuicaoJanelaDias"];
		cashbackGeracaoAtivo: TNewCampaignEntity["cashbackGeracaoAtivo"];
		cashbackGeracaoTipo: TNewCampaignEntity["cashbackGeracaoTipo"];
		cashbackGeracaoValor: TNewCampaignEntity["cashbackGeracaoValor"];
		cashbackGeracaoExpiracaoMedida: TNewCampaignEntity["cashbackGeracaoExpiracaoMedida"];
		cashbackGeracaoExpiracaoValor: TNewCampaignEntity["cashbackGeracaoExpiracaoValor"];
		recorrenciaTipo: TNewCampaignEntity["recorrenciaTipo"];
		recorrenciaIntervalo: TNewCampaignEntity["recorrenciaIntervalo"];
		recorrenciaDiasSemana: TNewCampaignEntity["recorrenciaDiasSemana"];
		recorrenciaDiasMes: TNewCampaignEntity["recorrenciaDiasMes"];
		whatsappConexaoTelefoneId: TNewCampaignEntity["whatsappConexaoTelefoneId"];
		whatsappTemplateId: TNewCampaignEntity["whatsappTemplateId"];
	};
	campaignSegmentations: Omit<TNewCampaignSegmentationEntity, "campanhaId" | "organizacaoId">[];
};
export const RecompraCRMDefaultCampaigns: TRecompraCRMDefaultCampaign[] = [
	{
		campaign: {
			titulo: "Campanha Primeira Compra (RecompraCRM)",
			descricao: "Campanha sugerida para clientes que fizeram sua primeira compra.",
			gatilhoTipo: "PRIMEIRA-COMPRA",
			gatilhoValorTotalCompras: null,
			gatilhoQuantidadeTotalCompras: null,
			gatilhoNovoCashbackAcumuladoValorMinimo: null,
			gatilhoTotalCashbackAcumuladoValorMinimo: null,
			gatilhoTempoPermanenciaMedida: null,
			gatilhoTempoPermanenciaValor: null,
			recorrenciaTipo: null,
			recorrenciaIntervalo: null,
			recorrenciaDiasSemana: null,
			recorrenciaDiasMes: null,
			execucaoAgendadaMedida: "DIAS",
			execucaoAgendadaValor: 1,
			execucaoAgendadaBloco: "06:00",
			permitirRecorrencia: false,
			frequenciaIntervaloValor: 0,
			frequenciaIntervaloMedida: "DIAS",
			atribuicaoModelo: "LAST_TOUCH",
			atribuicaoJanelaDias: 14,
			cashbackGeracaoAtivo: true,
			cashbackGeracaoTipo: "FIXO",
			cashbackGeracaoValor: 15,
			cashbackGeracaoExpiracaoMedida: "DIAS",
			cashbackGeracaoExpiracaoValor: 10,
			whatsappTemplateId: RecompraCRMDefaultWhatsappTemplates.recompracrm_primeira_compra.id,
			whatsappConexaoTelefoneId: null,
		},
		campaignSegmentations: [
			{
				segmentacao: "CAMPEÕES",
			},
			{
				segmentacao: "CLIENTES LEAIS",
			},
			{
				segmentacao: "POTENCIAIS CLIENTES LEAIS",
			},
			{
				segmentacao: "CLIENTES RECENTES",
			},
			{
				segmentacao: "PROMISSORES",
			},
			{
				segmentacao: "PRECISAM DE ATENÇÃO",
			},
			{
				segmentacao: "PRESTES A DORMIR",
			},
			{
				segmentacao: "EM RISCO",
			},
			{
				segmentacao: "NÃO PODE PERDÊ-LOS",
			},
			{
				segmentacao: "HIBERNANDO",
			},
			{
				segmentacao: "PERDIDOS",
			},
		],
	},
	{
		campaign: {
			titulo: "Campanha Segunda Compra (RecompraCRM)",
			descricao: "Campanha sugerida para clientes que fizeram sua segunda compra.",
			gatilhoTipo: "QUANTIDADE-TOTAL-COMPRAS",
			gatilhoValorTotalCompras: null,
			gatilhoQuantidadeTotalCompras: 2,
			gatilhoNovoCashbackAcumuladoValorMinimo: null,
			gatilhoTotalCashbackAcumuladoValorMinimo: null,
			gatilhoTempoPermanenciaMedida: null,
			gatilhoTempoPermanenciaValor: null,
			recorrenciaTipo: null,
			recorrenciaIntervalo: null,
			recorrenciaDiasSemana: null,
			recorrenciaDiasMes: null,
			execucaoAgendadaMedida: "DIAS",
			execucaoAgendadaValor: 1,
			execucaoAgendadaBloco: "06:00",
			permitirRecorrencia: false,
			frequenciaIntervaloValor: 0,
			frequenciaIntervaloMedida: "DIAS",
			atribuicaoModelo: "LAST_TOUCH",
			atribuicaoJanelaDias: 14,
			cashbackGeracaoAtivo: true,
			cashbackGeracaoTipo: "FIXO",
			cashbackGeracaoValor: 15,
			cashbackGeracaoExpiracaoMedida: "DIAS",
			cashbackGeracaoExpiracaoValor: 10,
			whatsappTemplateId: RecompraCRMDefaultWhatsappTemplates.recompracrm_segunda_compra.id,
			whatsappConexaoTelefoneId: null,
		},
		campaignSegmentations: [
			{
				segmentacao: "CAMPEÕES",
			},
			{
				segmentacao: "CLIENTES LEAIS",
			},
			{
				segmentacao: "POTENCIAIS CLIENTES LEAIS",
			},
			{
				segmentacao: "CLIENTES RECENTES",
			},
			{
				segmentacao: "PROMISSORES",
			},
			{
				segmentacao: "PRECISAM DE ATENÇÃO",
			},
			{
				segmentacao: "PRESTES A DORMIR",
			},
			{
				segmentacao: "EM RISCO",
			},
			{
				segmentacao: "NÃO PODE PERDÊ-LOS",
			},
			{
				segmentacao: "HIBERNANDO",
			},
			{
				segmentacao: "PERDIDOS",
			},
		],
	},
	{
		campaign: {
			titulo: "Campanha Presente de Aniversário (RecompraCRM)",
			descricao: "Campanha sugerida para conexão com clientes.",
			gatilhoTipo: "ANIVERSARIO_CLIENTE",
			gatilhoValorTotalCompras: null,
			gatilhoQuantidadeTotalCompras: null,
			gatilhoNovoCashbackAcumuladoValorMinimo: null,
			gatilhoTotalCashbackAcumuladoValorMinimo: null,
			gatilhoTempoPermanenciaMedida: null,
			gatilhoTempoPermanenciaValor: null,
			recorrenciaTipo: null,
			recorrenciaIntervalo: null,
			recorrenciaDiasSemana: null,
			recorrenciaDiasMes: null,
			execucaoAgendadaMedida: "DIAS",
			execucaoAgendadaValor: 0,
			execucaoAgendadaBloco: "09:00",
			permitirRecorrencia: false,
			frequenciaIntervaloValor: 0,
			frequenciaIntervaloMedida: "DIAS",
			atribuicaoModelo: "LAST_TOUCH",
			atribuicaoJanelaDias: 14,
			cashbackGeracaoAtivo: true,
			cashbackGeracaoTipo: "FIXO",
			cashbackGeracaoValor: 15,
			cashbackGeracaoExpiracaoMedida: "DIAS",
			cashbackGeracaoExpiracaoValor: 10,
			whatsappTemplateId: RecompraCRMDefaultWhatsappTemplates.recompracrm_presente_aniversario.id,
			whatsappConexaoTelefoneId: null,
		},
		campaignSegmentations: [
			{
				segmentacao: "CAMPEÕES",
			},
			{
				segmentacao: "CLIENTES LEAIS",
			},
			{
				segmentacao: "POTENCIAIS CLIENTES LEAIS",
			},
			{
				segmentacao: "CLIENTES RECENTES",
			},
			{
				segmentacao: "PROMISSORES",
			},
			{
				segmentacao: "PRECISAM DE ATENÇÃO",
			},
			{
				segmentacao: "PRESTES A DORMIR",
			},
			{
				segmentacao: "EM RISCO",
			},
			{
				segmentacao: "NÃO PODE PERDÊ-LOS",
			},
			{
				segmentacao: "HIBERNANDO",
			},
			{
				segmentacao: "PERDIDOS",
			},
		],
	},
	{
		campaign: {
			titulo: "Campanha Recuperação de Clientes (RecompraCRM)",
			descricao: "Campanha sugerida para recuperar clientes inativos.",
			gatilhoTipo: "ENTRADA-SEGMENTAÇÃO",
			gatilhoValorTotalCompras: null,
			gatilhoQuantidadeTotalCompras: null,
			gatilhoNovoCashbackAcumuladoValorMinimo: null,
			gatilhoTotalCashbackAcumuladoValorMinimo: null,
			gatilhoTempoPermanenciaMedida: null,
			gatilhoTempoPermanenciaValor: null,
			recorrenciaTipo: null,
			recorrenciaIntervalo: null,
			recorrenciaDiasSemana: null,
			recorrenciaDiasMes: null,
			execucaoAgendadaMedida: "DIAS",
			execucaoAgendadaValor: 0,
			execucaoAgendadaBloco: "09:00",
			permitirRecorrencia: false,
			frequenciaIntervaloValor: 0,
			frequenciaIntervaloMedida: "DIAS",
			atribuicaoModelo: "LAST_TOUCH",
			atribuicaoJanelaDias: 14,
			cashbackGeracaoAtivo: true,
			cashbackGeracaoTipo: "FIXO",
			cashbackGeracaoValor: 15,
			cashbackGeracaoExpiracaoMedida: "DIAS",
			cashbackGeracaoExpiracaoValor: 10,
			whatsappTemplateId: RecompraCRMDefaultWhatsappTemplates.recompracrm_recuperacao_clientes.id,
			whatsappConexaoTelefoneId: null,
		},
		campaignSegmentations: [
			{
				segmentacao: "PRECISAM DE ATENÇÃO",
			},
			{
				segmentacao: "PRESTES A DORMIR",
			},
			{
				segmentacao: "EM RISCO",
			},
		],
	},
];
type TOrganizationNicheOption = {
	id: string;
	label: string;
	value: string;
	renderIcon: (className?: string) => React.ReactNode;
	cashbackProgramDefault: Partial<TNewCashbackProgramEntity>;
};

/**
 * CASHBACK DEFAULTS — RATIONALE
 * ────────────────────────────────────────────────────────────────
 * For each niche we researched the typical GROSS MARGIN practiced
 * in Brazilian retail and then applied two rules of thumb:
 *
 *   acumuloValor  ≈ 15-25 % of gross margin (attractive yet safe)
 *   resgateLimiteValor ≈ ≤ gross margin (so the business never
 *                        "pays" more than its margin on a sale)
 *
 * expiracaoRegraValidadeValor is tuned to the purchase cycle:
 *   - high-frequency categories (food, pet, pharmacy) → 30-45 days
 *   - medium-frequency (fashion, beauty, home) → 60-90 days
 *   - low-frequency (construction, auto parts, electronics,
 *     jewelry, eyewear, furniture) → 90-120 days
 *
 * All values are conservative starting points the merchant can
 * adjust later. The goal is a "works out of the box" experience.
 * ────────────────────────────────────────────────────────────────
 */

export const OrganizationNicheOptions: TOrganizationNicheOption[] = [
	// ═══════════════════════════════════════════════════════════════
	// ALIMENTAÇÃO — Gross margin ~25-35 %
	// Food retail is high-volume, low-margin per unit.
	// Cashback needs to be modest but with short expiry to drive
	// frequent returns (weekly/bi-weekly purchase cycle).
	// ═══════════════════════════════════════════════════════════════
	{
		id: "alimentacao",
		label: "Alimentação",
		value: "Alimentação",
		renderIcon: (className?: string) => <Utensils className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 5, // ~15-20% of ~30% gross margin
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 30, // short cycle — food is bought weekly
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 30, // capped at gross margin
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// SUPERMERCADO / MERCEARIA — Gross margin ~25-30 %
	// Similar to food but even tighter margins on staples.
	// High transaction frequency compensates low cashback %.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "supermercado",
		label: "Supermercado / Mercearia",
		value: "Supermercado / Mercearia",
		renderIcon: (className?: string) => <ShoppingCart className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 3, // tight margins, volume game
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 30,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 25,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// MODA (Roupas & Calçados) — Gross margin ~40-60 %
	// Fashion enjoys high markups. Generous cashback is viable
	// and expected by consumers. Medium purchase cycle.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "moda",
		label: "Moda",
		value: "Moda",
		renderIcon: (className?: string) => <Shirt className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 10, // ~20% of ~50% gross margin
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 60, // seasonal purchase cycle
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 50,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// CALÇADOS — Gross margin ~35-50 %
	// Slightly lower than apparel but still comfortable margins.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "calcados",
		label: "Calçados",
		value: "Calçados",
		renderIcon: (className?: string) => <Footprints className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 8,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 60,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 40,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// PERFUMARIA & COSMÉTICOS — Gross margin ~50-70 %
	// Very high markups, especially on branded cosmetics.
	// Cashback can be generous to drive loyalty.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "perfumaria",
		label: "Perfumaria & Cosméticos",
		value: "Perfumaria & Cosméticos",
		renderIcon: (className?: string) => <SprayCan className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 12, // ~20% of ~60% gross margin
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 60,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 50,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// FARMÁCIA — Gross margin ~30 %
	// Regulated pricing on many items. Margins on OTC and beauty
	// products are higher, but medicines are constrained.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "farmacia",
		label: "Farmácia",
		value: "Farmácia",
		renderIcon: (className?: string) => <Pill className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 5, // ~17% of ~30% gross margin
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 45, // monthly medicine cycle
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 25,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// PET SHOP — Gross margin ~35-55 % (products), ~60-80 % (services)
	// Blended margin around 40-50%. High repeat purchase.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "petshop",
		label: "Pet Shop",
		value: "Pet Shop",
		renderIcon: (className?: string) => <PawPrint className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 8, // ~20% of ~40% blended margin
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 45, // monthly grooming/food cycle
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 40,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// CONSTRUÇÃO & MAT. DE CONSTRUÇÃO — Gross margin ~30-40 %
	// High ticket, low frequency. Longer expiry needed.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "construcao",
		label: "Construção",
		value: "Construção",
		renderIcon: (className?: string) => <Hammer className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 5, // ~15% of ~35% gross margin
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 90, // projects take months
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 30,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// AUTOPEÇAS — Gross margin ~30-40 %
	// Need-based purchases, medium frequency.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "autopecas",
		label: "Autopeças",
		value: "Autopeças",
		renderIcon: (className?: string) => <Wrench className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 5,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 90,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 30,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// ELETRÔNICOS & ELETRODOMÉSTICOS — Gross margin ~20-35 %
	// Competitive pricing squeezes margins. Low frequency.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "eletronicos",
		label: "Eletrônicos & Eletrodomésticos",
		value: "Eletrônicos & Eletrodomésticos",
		renderIcon: (className?: string) => <Smartphone className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 3, // thin margins, high ticket
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 90,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 20,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// ÓTICA — Gross margin ~60-80 %
	// Lenses and frames have enormous markups. Very high margins.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "otica",
		label: "Ótica",
		value: "Ótica",
		renderIcon: (className?: string) => <Glasses className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 12, // ~17% of ~70% gross margin
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 120, // annual/bi-annual purchase
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 50,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// JOALHERIA & ACESSÓRIOS — Gross margin ~50-70 %
	// Luxury/semi-luxury. High ticket, very low frequency.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "joalheria",
		label: "Joalheria & Acessórios",
		value: "Joalheria & Acessórios",
		renderIcon: (className?: string) => <Gem className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 10,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 120, // gift/occasion-driven
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 50,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// PAPELARIA & PRESENTES — Gross margin ~40-60 %
	// Good markups on stationery, gifts, craft supplies.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "papelaria",
		label: "Papelaria & Presentes",
		value: "Papelaria & Presentes",
		renderIcon: (className?: string) => <PenTool className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 8,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 60,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 40,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// CASA & DECORAÇÃO (Móveis, Utilidades Domésticas) — Gross margin ~40-55 %
	// Medium-high markups, but low purchase frequency.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "casa-decoracao",
		label: "Casa & Decoração",
		value: "Casa & Decoração",
		renderIcon: (className?: string) => <Sofa className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 8,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 90,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 40,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// ESPORTES & LAZER — Gross margin ~35-50 %
	// Good markups on sporting goods and apparel.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "esportes",
		label: "Esportes & Lazer",
		value: "Esportes & Lazer",
		renderIcon: (className?: string) => <Dumbbell className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 7,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 60,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 40,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// BRINQUEDOS & INFANTIL — Gross margin ~40-60 %
	// Seasonal peaks (children's day, Christmas). Good margins.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "brinquedos",
		label: "Brinquedos & Infantil",
		value: "Brinquedos & Infantil",
		renderIcon: (className?: string) => <Baby className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 8,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 60,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 45,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// PADARIA & CONFEITARIA — Gross margin ~50-70 %
	// High margin on baked goods (low input cost), very high frequency.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "padaria",
		label: "Padaria & Confeitaria",
		value: "Padaria & Confeitaria",
		renderIcon: (className?: string) => <CakeSlice className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 8,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 30, // daily/weekly visits
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 40,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// AÇOUGUE & PEIXARIA — Gross margin ~30-45 %
	// Perishable goods, moderate margins, high frequency.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "acougue",
		label: "Açougue & Peixaria",
		value: "Açougue & Peixaria",
		renderIcon: (className?: string) => <Beef className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 5,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 30,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 30,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// MATERIAIS ELÉTRICOS & HIDRÁULICOS — Gross margin ~30-45 %
	// B2B-leaning, project-based purchases.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "materiais-eletricos",
		label: "Materiais Elétricos & Hidráulicos",
		value: "Materiais Elétricos & Hidráulicos",
		renderIcon: (className?: string) => <Zap className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 5,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 90,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 30,
		},
	},

	// ═══════════════════════════════════════════════════════════════
	// CATCH-ALL — Gross margin ~30 % (safe midpoint)
	// For niches not specifically listed.
	// ═══════════════════════════════════════════════════════════════
	{
		id: "outros",
		label: "Outro",
		value: "Outro",
		renderIcon: (className?: string) => <Store className={className} />,
		cashbackProgramDefault: {
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloTipo: "PERCENTUAL",
			acumuloValor: 5,
			acumuloPermitirViaIntegracao: false,
			acumuloPermitirViaPontoIntegracao: true,
			expiracaoRegraValidadeValor: 60,
			resgateLimiteTipo: "PERCENTUAL",
			resgateLimiteValor: 30,
		},
	},
];
export function getOrganizationNicheByValue(value: string): TOrganizationNicheOption | undefined {
	return OrganizationNicheOptions.find((niche) => niche.value === value);
}
export const OrganizationOriginOptions = [
	{
		id: "instagram",
		label: "Instagram",
		value: "Instagram",
		renderIcon: (className?: string) => <FaInstagram className={className} />,
	},
	{
		id: "linkedin",
		label: "Linkedin",
		value: "Linkedin",
		renderIcon: (className?: string) => <FaLinkedin className={className} />,
	},
	{
		id: "youtube",
		label: "YouTube",
		value: "YouTube",
		renderIcon: (className?: string) => <FaYoutube className={className} />,
	},
	{
		id: "google",
		label: "Google",
		value: "Google",
		renderIcon: (className?: string) => <FaGoogle className={className} />,
	},
	{
		id: "indicacao",
		label: "Indicação",
		value: "Indicação",
		renderIcon: (className?: string) => <FaUserGroup className={className} />,
	},
	{
		id: "outro",
		label: "Outro",
		value: "Outro",
		renderIcon: (className?: string) => <HelpCircle className={className} />,
	},
];
