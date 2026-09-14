import type { TCampaignTriggerTypeEnum } from "@/schemas/enums";
import type { ComponentType } from "react";

import AniversarioClienteConfig from "./aniversario-cliente-config";
import CashbackAcumuladoConfig from "./cashback-acumulado-config";
import CashbackExpirandoConfig from "./cashback-expirando-config";
import EntradaSegmentacaoConfig from "./entrada-segmentacao-config";
import NovaCompraConfig from "./nova-compra-config";
import PermanenciaSegmentacaoConfig from "./permanencia-segmentacao-config";
import PiorDiaVendasConfig from "./pior-dia-vendas-config";
import PrimeiraCompraConfig from "./primeira-compra-config";
import PromocaoProdutosConfig from "./promocao-produtos-config";
import QuantidadeTotalComprasConfig from "./quantidade-total-compras-config";
import RecorrenteConfig from "./recorrente-config";
import UsoUnicoConfig from "./uso-unico-config";
import ValorTotalComprasConfig from "./valor-total-compras-config";

export const triggerInlineConfigByType: Record<TCampaignTriggerTypeEnum, ComponentType> = {
	"NOVA-COMPRA": NovaCompraConfig,
	"PRIMEIRA-COMPRA": PrimeiraCompraConfig,
	"CASHBACK-ACUMULADO": CashbackAcumuladoConfig,
	"CASHBACK-EXPIRANDO": CashbackExpirandoConfig,
	ANIVERSARIO_CLIENTE: AniversarioClienteConfig,
	"QUANTIDADE-TOTAL-COMPRAS": QuantidadeTotalComprasConfig,
	"VALOR-TOTAL-COMPRAS": ValorTotalComprasConfig,
	"PIOR-DIA-VENDAS": PiorDiaVendasConfig,
	RECORRENTE: RecorrenteConfig,
	"USO-UNICO": UsoUnicoConfig,
	"PROMOCAO-PRODUTOS": PromocaoProdutosConfig,
	"ENTRADA-SEGMENTAÇÃO": EntradaSegmentacaoConfig,
	"PERMANÊNCIA-SEGMENTAÇÃO": PermanenciaSegmentacaoConfig,
};
