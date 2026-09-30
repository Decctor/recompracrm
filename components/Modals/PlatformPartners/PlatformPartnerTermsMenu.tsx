"use client";

import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import {
	PLATFORM_PARTNER_COOKIE_MAX_AGE_SECONDS,
	PLATFORM_PARTNER_MONTHLY_SUBSEQUENT_INVOICE_BPS,
	PLATFORM_PARTNER_PAYOUT_DAY,
	PLATFORM_PARTNER_YEARLY_INVOICE_BPS,
} from "@/lib/platform-partnerships/constants";

const pct = (bps: number) => `${bps / 100}%`;
const ATTRIBUTION_DAYS = Math.round(PLATFORM_PARTNER_COOKIE_MAX_AGE_SECONDS / 86400);

// Resumo operacional das regras em vigor, montado das mesmas constantes que calculam a comissão.
// Texto jurídico definitivo: substituir aqui quando o documento oficial existir.
const SECTIONS = [
	{
		title: "1. Adesão",
		text:
			"O cadastro é analisado pelo financeiro do RecompraCRM. O parceiro só passa a receber comissões depois da aprovação. Os dados e o documento enviados precisam ser verdadeiros e do próprio parceiro.",
	},
	{
		title: "2. Atribuição da indicação",
		text: `A loja fica vinculada ao parceiro quando se cadastra pelo link de indicação, em até ${ATTRIBUTION_DAYS} dias depois do clique (último clique vale), ou quando informa o código do parceiro no cadastro. O código informado tem prioridade sobre o link.`,
	},
	{
		title: "3. Base da comissão",
		text:
			"A comissão é calculada sobre o valor bruto do plano do RecompraCRM efetivamente pago pela loja, sem serviços de consultoria. Faturas não pagas, estornadas ou canceladas não geram comissão.",
	},
	{
		title: "4. Percentuais",
		text: `Planos mensais: 100% da 1ª mensalidade, 100% da 3ª mensalidade e ${pct(PLATFORM_PARTNER_MONTHLY_SUBSEQUENT_INVOICE_BPS)} das demais, enquanto a loja mantiver a assinatura. Planos anuais: ${pct(PLATFORM_PARTNER_YEARLY_INVOICE_BPS)} de cada fatura anual.`,
	},
	{
		title: "5. Pagamento",
		text: `A comissão fica disponível 30 dias depois do pagamento da fatura. O PIX é feito todo dia ${PLATFORM_PARTNER_PAYOUT_DAY} com as comissões aprovadas que ficaram disponíveis até o fim do mês anterior, na chave PIX cadastrada, que precisa estar no nome (CPF ou CNPJ) do parceiro. O comprovante fica no painel.`,
	},
	{
		title: "6. Ajustes e cancelamentos",
		text:
			"Reembolsos, contestações ou fraude podem gerar ajuste ou cancelamento de comissões. O RecompraCRM pode suspender o parceiro em caso de uso indevido do programa, como autoindicação ou divulgação enganosa.",
	},
];

export function PlatformPartnerTermsMenu({ closeMenu }: { closeMenu: () => void }) {
	return (
		<ResponsiveMenu
			mode="read-only"
			menuTitle="TERMOS DO PROGRAMA DE PARCERIAS"
			menuDescription="Regras de indicação, comissão e pagamento."
			menuCancelButtonText="FECHAR"
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeMenu}
			dialogVariant="md"
			drawerVariant="lg"
		>
			<div className="flex flex-col gap-4">
				{SECTIONS.map((section) => (
					<section key={section.title} className="flex flex-col gap-1">
						<h3 className="text-sm font-extrabold">{section.title}</h3>
						<p className="text-sm leading-relaxed text-muted-foreground">{section.text}</p>
					</section>
				))}
			</div>
		</ResponsiveMenu>
	);
}
