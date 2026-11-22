import { appRoutes } from "@/lib/navigation/routes";
import type { TOnboardingAnswers } from "@/schemas/onboarding";

export const ERP_CHANNELS = [
 { value: "BALCAO", titulo: "Balcão", descricao: "Venda presencial, com o operador conduzindo a compra." },
 { value: "CATALOGO", titulo: "Catálogo digital", descricao: "O cliente escolhe os produtos e envia o pedido." },
 { value: "MESAS", titulo: "Mesas e comandas", descricao: "Pedidos organizados por mesa e conta de atendimento." },
] as const;
export type TErpChannel = NonNullable<TOnboardingAnswers["erpCanalInicial"]>;
export function getRequiredProductFieldsForChannel(channel: TErpChannel) {
 return channel === "BALCAO" ? ["nome", "precoVenda", "vendavel"] : ["nome", "precoVenda", "vendavel", "grupo"];
}
export function getLaunchChecklist(channel: TErpChannel | null, readiness: { acesso: boolean; produtosUtilizaveis: number; lojaDigital: { existe: boolean; ativa: boolean; configurada: boolean }; pontosAtendimento: number; simulacaoConcluida: boolean }) {
 const checks = [
  { chave: "acesso", rotulo: "Acesso ao ERP", concluida: readiness.acesso, href: "/dashboard/settings?view=subscription" },
  { chave: "canal", rotulo: "Canal escolhido", concluida: !!channel, href: "/onboarding?produto=ERP" },
  { chave: "produtos", rotulo: "Produtos com nome e preço disponíveis no canal", concluida: readiness.produtosUtilizaveis > 0, href: "/dashboard/catalog/products" },
 ];
 if (channel === "CATALOGO") checks.push({ chave: "loja", rotulo: "Loja com atendimento e pagamento configurados", concluida: readiness.lojaDigital.existe && readiness.lojaDigital.configurada, href: "/dashboard/catalog/store" });
 if (channel === "MESAS") checks.push({ chave: "mesas", rotulo: "Ao menos um ponto de atendimento ativo", concluida: readiness.pontosAtendimento > 0, href: appRoutes.sales.serviceAccounts() });
 return checks;
}
