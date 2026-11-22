import type { TOnboardingReadiness } from "./readiness";
export function getOnboardingQuality(readiness: TOnboardingReadiness) {
 if (readiness.jornadas.length && !readiness.jornadas.some((journey) => journey.produto === "CRM")) {
  const pending = readiness.erp.pendenciasLancamento;
  const journey = readiness.jornadas.find((item) => item.produto === "ERP");
  const steps = [
   { id: "erp-channel", title: "Canal de venda", description: "Escolha o canal inicial.", completed: !!readiness.erp.canal, actionUrl: "/onboarding?produto=ERP&retomar=true&etapa=canal", actionLabel: "Escolher", applicable: true },
   { id: "erp-products", title: "Produtos utilizáveis", description: "Produtos com os dados necessários para vender.", completed: readiness.erp.produtosUtilizaveis > 0, actionUrl: "/dashboard/catalog/products", actionLabel: "Configurar", applicable: true },
   { id: "erp-launch", title: "Canal disponibilizado", description: "Resolva o checklist e comece a vender.", completed: !!journey?.dataConclusao && pending.length === 0 && (readiness.erp.canal !== "CATALOGO" || readiness.erp.lojaDigital.ativa), actionUrl: "/onboarding?produto=ERP&retomar=true&etapa=lancamento", actionLabel: "Revisar", applicable: true },
  ];
  const completedCount = steps.filter((step) => step.completed).length;
  return { steps, completedCount, totalApplicable: steps.length, percentComplete: Math.round(completedCount / steps.length * 100), allCompleted: completedCount === steps.length };
 }
 const steps = [
  { id: "source", title: "Entrada de vendas", description: "Conecte seu sistema ou habilite o registro no balcão.", completed: readiness.fonteDados.definida && readiness.fonteDados.integracoes.every((item) => item.status === "CONECTADO"), actionUrl: "/dashboard/settings?view=integration", actionLabel: "Configurar", applicable: true },
  { id: "history", title: "Histórico de vendas", description: "Aguarde a carga ou retome uma importação interrompida.", completed: !readiness.dados.coberturaParcial, actionUrl: "/dashboard/settings?view=integration", actionLabel: "Ver importação", applicable: readiness.fonteDados.integracoes.some((item) => item.tipo === "BLING") },
  { id: "cashback", title: "Programa de cashback", description: "Prepare as regras para a próxima compra.", completed: readiness.cashback.estado !== "NAO_CONFIGURADO", actionUrl: "/dashboard/growth/cashback", actionLabel: "Preparar", applicable: true },
  { id: "whatsapp", title: "Canal de envio", description: "Conecte seu número para enviar campanhas.", completed: readiness.whatsapp.numero === "CONECTADO", actionUrl: "/dashboard/settings?view=meta-oauth", actionLabel: "Conectar", applicable: readiness.campanhas.length > 0 || readiness.campanhasManuais.ativas > 0 },
  ...readiness.campanhas.map((campaign) => ({ id: campaign.id, title: campaign.titulo, description: campaign.estado === "HABILITADA" ? "Envios liberados, aguardando dependências." : "Prepare as dependências e libere os envios.", completed: campaign.estado === "ATIVA", actionUrl: "/dashboard/growth/campaigns", actionLabel: "Revisar", applicable: true })),
 ].filter((step) => step.applicable);
 const completedCount = steps.filter((step) => step.completed).length;
 return { steps, completedCount, totalApplicable: steps.length, percentComplete: steps.length ? Math.round(completedCount / steps.length * 100) : 100, allCompleted: completedCount === steps.length };
}
