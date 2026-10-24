import { Store } from "lucide-react";
import Image from "next/image";
import { LANDING_INTEGRATIONS } from "./integrations-data";
import { PhaseBadge, Container, Eyebrow, MockCard, SectionLead, SectionTitle, StepNumber } from "./primitives";
import { RedemptionFlow } from "./RedemptionFlow";
import { ScoringSwitch } from "./ScoringSwitch";

const BLING = LANDING_INTEGRATIONS.find((i) => i.slug === "bling");

const INTEGRATION_STEPS = [
	{ title: "A venda é registrada no seu sistema", text: "ERP, PDV, delivery ou loja online. O caixa segue igual.", withLogos: true },
	{ title: "O RecompraCRM importa em poucos minutos", text: "Venda, itens, vendedor e cliente entram na base, sem duplicar quem já existe." },
	{
		title: "O cashback é creditado pelas regras do programa",
		text: "Percentual, validade e limites que você configurou. Venda cancelada no ERP, cashback revertido.",
	},
	{ title: "O cliente fica sabendo", text: "Mensagem no WhatsApp com o valor ganho e a data de validade." },
];

const POI_STEPS = [
	{ title: "O cliente digita o telefone no tablet", text: "Se for a primeira vez, o cadastro é feito ali mesmo, em segundos." },
	{ title: "O atendente informa o valor da venda", text: "O mesmo valor registrado no caixa." },
	{ title: "A senha do operador confirma", text: "Cada pontuação fica vinculada a quem atendeu." },
	{ title: "O cashback é creditado na hora", text: "A tela mostra o valor gerado e o novo saldo do cliente." },
];

const IMPORTED_SALES = [
	{ client: "Maria Silva", meta: "Pedido 48213 · 14:02", value: "R$ 120,00", cashback: "+ R$ 6,00" },
	{ client: "João Pereira", meta: "Pedido 48212 · 13:47", value: "R$ 68,00", cashback: "+ R$ 3,40" },
	{ client: "Carla Mendes", meta: "Pedido 48210 · 13:15", value: "R$ 245,90", cashback: "+ R$ 12,30" },
	{ client: "Rafael Costa", meta: "Pedido 48207 · cancelado", value: "R$ 54,00", cashback: "revertido", reverted: true },
];

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3"];

/** Grupo de avatares redondos com os logos das integrações; o nome aparece no hover. */
function IntegrationAvatars() {
	return (
		<div className="flex shrink-0 items-center pl-2">
			{LANDING_INTEGRATIONS.map((integration) => (
				<span
					key={integration.slug}
					title={integration.name}
					className="relative -ml-2 flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white p-[5px] shadow-[0_0_0_1px_#e3e8ea] transition-transform duration-200 hover:z-10 hover:-translate-y-0.5"
				>
					<Image src={integration.logo} alt={integration.name} className="h-full w-full object-contain" sizes="34px" />
				</span>
			))}
		</div>
	);
}

function StepList({ steps, intro }: { steps: { title: string; text: string; withLogos?: boolean }[]; intro: string }) {
	return (
		<div>
			<p className="mb-5 text-[15px] leading-[1.6] text-[#5b6a70]">{intro}</p>
			<ol className="flex flex-col">
				{steps.map((step, i) => (
					<li key={step.title} className="grid grid-cols-[32px_1fr] gap-4 border-t border-[#eef1f2] py-4">
						<StepNumber>{i + 1}</StepNumber>
						<div className="flex flex-wrap items-center justify-between gap-4">
							<div className="min-w-0 flex-[1_1_200px]">
								<p className="text-[16px] font-semibold">{step.title}</p>
								<p className="mt-1 text-[14px] leading-[1.55] text-[#5b6a70]">{step.text}</p>
							</div>
							{step.withLogos ? <IntegrationAvatars /> : null}
						</div>
					</li>
				))}
			</ol>
		</div>
	);
}

function IntegrationPanel() {
	return (
		<>
			<StepList
				intro="Para lojas que já registram vendas em um ERP, PDV, delivery ou loja online. Ninguém digita nada a mais no caixa."
				steps={INTEGRATION_STEPS}
			/>
			<MockCard>
				<div className="flex items-center justify-between border-b border-[#e3e8ea] bg-[#fafafa] px-[18px] py-3.5">
					<div className="flex items-center gap-2.5">
						<span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#e3e8ea] bg-white p-1">
							{BLING ? <Image src={BLING.logo} alt="" className="h-full w-full object-contain" sizes="28px" /> : null}
						</span>
						<div>
							<p className="text-[13px] font-semibold">Integração Bling</p>
							<p className="mt-px text-[11px] text-[#687a80]">Última sincronização há 3 min</p>
						</div>
					</div>
					<span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#15803d]">
						<span className="h-1.5 w-1.5 rounded-[3px] bg-[#16a34a]" />
						Conectada
					</span>
				</div>
				<div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] border-b border-[#eef1f2] px-[18px] py-2.5 text-[11px] font-semibold tracking-[0.04em] text-[#8a979c] uppercase">
					<span>Venda importada</span>
					<span className="text-right">Valor</span>
					<span className="text-right">Cashback</span>
				</div>
				{IMPORTED_SALES.map((sale) => (
					<div
						key={sale.meta}
						className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] items-center border-b border-[#eef1f2] px-[18px] py-[11px] text-[13px]"
					>
						<div className="min-w-0">
							<p className="truncate font-semibold">{sale.client}</p>
							<p className="mt-0.5 text-[11px] text-[#8a979c]">{sale.meta}</p>
						</div>
						<span className="text-right text-[#2b3538]">{sale.value}</span>
						<span className={sale.reverted ? "text-right font-semibold text-[#8a979c]" : "text-right font-semibold text-[#15803d]"}>{sale.cashback}</span>
					</div>
				))}
				<p className="px-[18px] py-3 text-[12px] text-[#687a80]">Cancelamentos no ERP revertem o cashback automaticamente.</p>
			</MockCard>
		</>
	);
}

function TabletLabel({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-[9px] font-bold tracking-[0.1em] text-[#687a80] uppercase">{label}</p>
			<p className="mt-0.5 text-[12px] font-bold">{value}</p>
		</div>
	);
}

function PoiPanel() {
	const key = "flex h-[30px] items-center justify-center rounded-lg text-[14px] font-bold";
	return (
		<>
			<StepList
				intro="Para lojas sem integração, ou que preferem registrar a pontuação no balcão. O Ponto de Interação roda em qualquer tablet ou celular, sem app."
				steps={POI_STEPS}
			/>
			<div className="flex flex-col items-center gap-2.5">
				<div className="w-full max-w-[480px] rounded-[20px] border-8 border-[#262626] bg-[#262626]">
					<div className="flex gap-3 overflow-hidden rounded-xl bg-white p-3.5">
						<div className="flex w-[42%] flex-col overflow-hidden rounded-[10px] border border-[#e3e8ea]">
							<div className="flex items-center gap-2 bg-[#24549c] p-3 text-white">
								<span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-white text-[#24549c]">
									<Store className="h-4 w-4" aria-hidden />
								</span>
								<span className="text-[13px] font-bold">Sua loja</span>
							</div>
							<div className="flex flex-col gap-3 p-3">
								<TabletLabel label="Acúmulo" value="5% em cada compra" />
								<TabletLabel label="Validade" value="30 dias" />
								<TabletLabel label="Recompensas" value="Troque por prêmios" />
							</div>
						</div>
						<div className="flex min-w-0 flex-1 flex-col gap-2">
							<div className="rounded-[10px] border border-[#e3e8ea] p-2 text-center">
								<p className="text-[9px] font-bold tracking-[0.1em] text-[#687a80] uppercase">Número de telefone</p>
								<p className="mt-0.5 text-[13px] font-bold whitespace-nowrap sm:text-[18px] sm:tracking-[0.03em]">(34) 98888-7777</p>
							</div>
							<div className="grid grid-cols-3 gap-1.5">
								{KEYS.map((k) => (
									<span key={k} className={`${key} bg-[#24549c] text-white`}>
										{k}
									</span>
								))}
								<span className={`${key} col-span-2 bg-[#24549c] text-white`}>0</span>
								<span className={`${key} bg-[#e3e8ea] text-[12px] text-[#2b3538]`}>Apagar</span>
							</div>
						</div>
					</div>
				</div>
				<span className="text-[11px] font-semibold tracking-[0.08em] text-[#8a979c] uppercase">Ponto de Interação · tablet no balcão</span>
			</div>
		</>
	);
}

export function LandingCashback() {
	return (
		<section id="cashback" className="bg-white py-24 sm:py-[136px]">
			<Container>
				<div className="mb-14 max-w-[720px]">
					<Eyebrow>02 · Como funciona o cashback</Eyebrow>
					<SectionTitle>Duas formas de pontuar. Uma forma segura de resgatar.</SectionTitle>
					<SectionLead>
						O cashback é creditado a partir da venda, venha ela de uma integração ou do Ponto de Interação no balcão. O resgate acontece sempre no Ponto de
						Interação, com confirmação do atendente.
					</SectionLead>
				</div>

				<ScoringSwitch panels={{ integracao: <IntegrationPanel />, poi: <PoiPanel /> }} />

				<div className="mt-14 mb-6 flex flex-wrap items-center gap-3">
					<PhaseBadge>2</PhaseBadge>
					<h3 className="text-[24px] font-semibold tracking-[-0.02em]">Resgatar</h3>
					<span className="text-[14px] text-[#687a80]">sempre no Ponto de Interação</span>
				</div>

				<RedemptionFlow />
			</Container>
		</section>
	);
}
