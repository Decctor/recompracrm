import { FrontsSwitcher } from "./FrontsSwitcher";
import { CheckList, Container, Eyebrow, MockCard, MockLabel, SectionLead, SectionTitle } from "./primitives";

const FIDELITY_BULLETS = [
	"Percentual ou valor fixo por compra, com validade definida por você",
	"Resgate como desconto direto, com teto por compra, ou troca por prêmios",
	"Aviso automático no WhatsApp quando o saldo está perto de vencer",
	"Funciona com vendas de integração ou do Ponto de Interação",
	"Painel com saldo emitido, resgatado e expirado",
];

const FIDELITY_MOVES = [
	{ label: "Compra · 12/10 · R$ 120,00", value: "+ R$ 6,00", credit: true },
	{ label: "Resgate no balcão · 28/09", value: "− R$ 20,00", credit: false },
	{ label: "Compra · 21/09 · R$ 340,00", value: "+ R$ 17,00", credit: true },
];

const RECOVERY_BULLETS = [
	"Base classificada automaticamente: campeões, leais, em risco, perdidos",
	"Gatilhos por entrada em segmento, inatividade, primeira compra e aniversário",
	"Envio pelo WhatsApp oficial da loja, com nome e histórico do cliente",
	"Cashback de presente como incentivo, se você quiser",
	"Funil por campanha: enviadas, lidas, convertidas e receita atribuída",
];

const RFM_ROWS = [
	{ name: "Campeões", count: "312", width: "46%", color: "#24549c" },
	{ name: "Clientes leais", count: "540", width: "80%", color: "#24549c" },
	{ name: "Em risco", count: "128", width: "19%", color: "#e3b042" },
	{ name: "Perdidos", count: "206", width: "31%", color: "#8a979c" },
];

const FUNNEL = [
	{ label: "Enviadas", value: "128" },
	{ label: "Lidas", value: "97" },
	{ label: "Voltaram", value: "23" },
	{ label: "Receita", value: "R$ 4,1 mil" },
];

function PanelText({ title, text, bullets }: { title: string; text: string; bullets: string[] }) {
	return (
		<div>
			<h3 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.025em]">{title}</h3>
			<p className="mt-3 text-[15px] leading-[1.6] text-[#5b6a70]">{text}</p>
			<CheckList items={bullets} />
		</div>
	);
}

function FidelityPanel() {
	return (
		<>
			<PanelText
				title="O cliente acumula ao comprar e resgata na próxima visita."
				text="Você define as regras do programa. O RecompraCRM credita, controla validade e lembra o cliente do saldo no momento certo."
				bullets={FIDELITY_BULLETS}
			/>
			<MockCard>
				<div className="flex items-center justify-between border-b border-[#e3e8ea] px-5 py-4">
					<div>
						<p className="text-[15px] font-semibold">Maria Silva</p>
						<p className="mt-0.5 text-[12px] text-[#687a80]">(34) 98888-7777 · Cliente leal</p>
					</div>
					<span className="rounded-md bg-[rgba(36,84,156,0.08)] px-2 py-[3px] text-[11px] font-semibold text-[#24549c]">14 compras</span>
				</div>
				<div className="grid grid-cols-2 gap-3 p-5">
					<div className="rounded-[10px] border border-[#eef1f2] p-3.5">
						<MockLabel>Saldo disponível</MockLabel>
						<p className="mt-1.5 text-[24px] font-bold text-[#7a5117]">R$ 42,00</p>
					</div>
					<div className="rounded-[10px] border border-[#eef1f2] p-3.5">
						<MockLabel>Expira em</MockLabel>
						<p className="mt-1.5 text-[24px] font-bold">12 dias</p>
					</div>
				</div>
				<div className="px-5 pb-5">
					<MockLabel className="mb-2">Movimentações</MockLabel>
					{FIDELITY_MOVES.map((move) => (
						<div key={move.label} className="flex justify-between gap-3 border-t border-[#eef1f2] py-[9px] text-[13px]">
							<span className="text-[#2b3538]">{move.label}</span>
							<span className={move.credit ? "font-semibold text-[#15803d]" : "font-semibold text-[#2b3538]"}>{move.value}</span>
						</div>
					))}
				</div>
			</MockCard>
		</>
	);
}

function RecoveryPanel() {
	return (
		<>
			<PanelText
				title="O sistema avisa quem está sumindo e dispara a campanha certa."
				text="Basta ter as vendas no RecompraCRM, importadas do seu ERP ou registradas no Ponto de Interação. Se houver cashback, ele pode entrar como incentivo. Se não houver, a campanha funciona do mesmo jeito."
				bullets={RECOVERY_BULLETS}
			/>
			<MockCard>
				<div className="border-b border-[#e3e8ea] px-5 py-4">
					<p className="text-[15px] font-semibold">Matriz RFM</p>
					<p className="mt-0.5 text-[12px] text-[#687a80]">Base classificada pelos últimos 12 meses de compra</p>
				</div>
				<div className="px-5 pt-2 pb-1">
					{RFM_ROWS.map((row) => (
						<div
							key={row.name}
							className="grid grid-cols-[minmax(0,1fr)_56px_minmax(0,1.2fr)] items-center gap-3 border-b border-[#eef1f2] py-2.5 text-[13px]"
						>
							<span className="font-semibold">{row.name}</span>
							<span className="text-right text-[#5b6a70]">{row.count}</span>
							<span className="h-1.5 overflow-hidden rounded-[3px] bg-[#eef1f2]">
								<span className="block h-full rounded-[3px]" style={{ width: row.width, background: row.color }} />
							</span>
						</div>
					))}
				</div>
				<div className="mx-5 mt-3 mb-5 rounded-[10px] border border-[#e3e8ea] p-3.5">
					<div className="flex items-center justify-between gap-3">
						<p className="text-[13px] font-semibold">Campanha · Entrada em &quot;Em risco&quot;</p>
						<span className="rounded-md bg-[rgba(22,163,74,0.1)] px-2 py-[3px] text-[11px] font-semibold text-[#15803d]">Ativa</span>
					</div>
					<div className="mt-3 grid grid-cols-4 gap-2">
						{FUNNEL.map((step) => (
							<div key={step.label}>
								<p className="text-[11px] text-[#687a80]">{step.label}</p>
								<p className="mt-0.5 text-[17px] font-bold">{step.value}</p>
							</div>
						))}
					</div>
				</div>
			</MockCard>
		</>
	);
}

export function LandingTwoFronts() {
	return (
		<section id="frentes" className="bg-white py-24 sm:py-[136px]">
			<Container>
				<div className="mb-12 max-w-[720px]">
					<Eyebrow>01 · Duas frentes</Eyebrow>
					<SectionTitle>Um CRM para manter o cliente que compra e trazer de volta o que parou.</SectionTitle>
					<SectionLead>
						As duas frentes usam a mesma base de vendas, mas são independentes. A fidelização se apoia no programa de cashback. A recuperação funciona mesmo
						que sua loja não tenha cashback nenhum.
					</SectionLead>
				</div>
				<FrontsSwitcher panels={{ fidelizacao: <FidelityPanel />, recuperacao: <RecoveryPanel /> }} />
			</Container>
		</section>
	);
}
