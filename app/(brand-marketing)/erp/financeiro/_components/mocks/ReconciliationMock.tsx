import { cn } from "@/lib/utils";
import {
	ArrowDown,
	ArrowUp,
	Banknote,
	Check,
	CheckCircle2,
	ChevronDown,
	Clock,
	EyeOff,
	Link2,
	ListFilter,
	type LucideIcon,
	Pencil,
	RefreshCcw,
	Sparkles,
	Upload,
	X,
	Zap,
} from "lucide-react";

// Conciliação bancária (app/dashboard/finance/reconciliation), desenhada a 1000px: seletor da conta,
// REPROCESSAR SUGESTÕES / IMPORTAR EXTRATO, os três StatusCountCard e o StatementLineCard com as
// sugestões (AUTOMÁTICO, HEURÍSTICO, IA) para confirmar ou rejeitar. Nada é conciliado sem a pessoa
// confirmar. Extrato hipotético de uma gelateria.

const MATCH = {
	AUTOMATICO: { label: "AUTOMÁTICO", className: "bg-[#dcfce7] text-[#15803d]", icon: Zap },
	HEURISTICO: { label: "HEURÍSTICO", className: "bg-[#dbeafe] text-[#1d4ed8]", icon: ListFilter },
	IA: { label: "IA", className: "bg-[#f3e8ff] text-[#7e22ce]", icon: Sparkles },
} as const;

type TLine = {
	type: "ENTRADA" | "SAIDA";
	description: string;
	value: string;
	date: string;
	matches: { title: string; kind: keyof typeof MATCH; confidence?: number; value: string; when: string }[];
};

const LINES: TLine[] = [
	{
		type: "ENTRADA",
		description: "PIX RECEBIDO JULIANA PRADO",
		value: "+R$ 71,80",
		date: "04/11/2026",
		matches: [{ title: "Venda #1048 · Pix", kind: "AUTOMATICO", value: "R$ 71,80", when: "PREVISÃO: 04/11/2026 (será efetivada ao confirmar)" }],
	},
	{
		type: "SAIDA",
		description: "PAG BOLETO LATICINIOS SERRA AZUL",
		value: "-R$ 1.677,00",
		date: "03/11/2026",
		matches: [
			{
				title: "Compra NF 45877 · Laticínios Serra Azul (parcela 1/1)",
				kind: "HEURISTICO",
				value: "R$ 1.677,00",
				when: "PREVISÃO: 05/11/2026 (será efetivada ao confirmar)",
			},
		],
	},
	{
		type: "SAIDA",
		description: "DEB AUT ENERGIA CEMIG",
		value: "-R$ 842,37",
		date: "03/11/2026",
		matches: [
			{
				title: "Energia elétrica · outubro",
				kind: "IA",
				confidence: 0.86,
				value: "R$ 842,37",
				when: "PREVISÃO: 10/11/2026 (será efetivada ao confirmar)",
			},
		],
	},
	{
		type: "SAIDA",
		description: "TARIFA PACOTE SERVICOS",
		value: "-R$ 39,90",
		date: "01/11/2026",
		matches: [],
	},
];

const TYPE = {
	ENTRADA: { label: "ENTRADA", icon: ArrowUp, chip: "bg-[#bbf7d0] text-[#16a34a]", text: "text-[#16a34a]" },
	SAIDA: { label: "SAÍDA", icon: ArrowDown, chip: "bg-[#fecaca] text-[#dc2626]", text: "text-[#dc2626]" },
} as const;

function CountCard({ label, count, icon: Icon, tone }: { label: string; count: number; icon: LucideIcon; tone: string }) {
	return (
		<div className="flex items-center justify-between gap-2 rounded-xl border border-[#e3e8ea] bg-white px-3 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
			<div className="flex items-center gap-2">
				<Icon className={cn("size-4", tone)} />
				<span className="text-[12px] font-medium tracking-tight text-[#687a80]">{label}</span>
			</div>
			<span className="text-[18px] font-bold">{count}</span>
		</div>
	);
}

export function ReconciliationMock() {
	return (
		<div className="flex flex-col gap-3 rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white p-5 text-[#0e1214] shadow-[0_40px_90px_-40px_rgba(16,24,40,0.45)]">
			<div className="flex items-end justify-between gap-2">
				<div className="flex w-full max-w-md flex-col gap-1">
					<span className="text-[12px] font-medium tracking-tight text-[rgba(14,18,20,0.8)]">CONTA FINANCEIRA</span>
					<span className="flex h-9 items-center justify-between rounded-md border border-[#e3e8ea] px-3 text-[14px]">
						Conta Bancária Principal
						<ChevronDown className="size-4 text-[#687a80]" />
					</span>
				</div>
				<div className="flex flex-none items-center gap-2">
					<span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#e3e8ea] px-3 text-[13px] font-medium">
						<RefreshCcw className="size-4" />
						REPROCESSAR SUGESTÕES
					</span>
					<span className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#171717] px-3 text-[13px] font-medium text-[#fafafa]">
						<Upload className="size-4" />
						IMPORTAR EXTRATO
					</span>
				</div>
			</div>
			<div className="grid grid-cols-3 gap-2">
				<CountCard label="PENDENTES" count={4} icon={Clock} tone="text-[#2563eb]" />
				<CountCard label="CONCILIADAS" count={126} icon={CheckCircle2} tone="text-[#16a34a]" />
				<CountCard label="IGNORADAS" count={3} icon={EyeOff} tone="text-[#6b7280]" />
			</div>
			<div className="flex h-9 items-center rounded-xl border border-[#e3e8ea] px-3 text-[14px] text-[#8a979c]">Pesquisar linha do extrato...</div>
			{LINES.map((line) => {
				const type = TYPE[line.type];
				return (
					<div
						key={line.description}
						className="flex flex-col gap-2 rounded-xl border border-[#e3e8ea] bg-white px-3 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
					>
						<div className="flex items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<span className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10.4px]", type.chip)}>
									<type.icon className="size-4" />
									{type.label}
								</span>
								<p className="text-[14px] font-bold tracking-tight">{line.description}</p>
							</div>
							<div className="flex items-center gap-1.5">
								<span className="flex items-center gap-1.5 rounded-xl bg-[#dbeafe] px-3 py-1.5 text-[10.4px] text-[#1d4ed8]">
									<Clock className="size-3" />
									PENDENTE
								</span>
								<span className={cn("text-[14px] font-semibold", type.text)}>{line.value}</span>
							</div>
						</div>
						<span className="text-[12px] font-medium uppercase tracking-tight text-[#687a80]">{line.date}</span>
						{line.matches.map((match) => {
							const badge = MATCH[match.kind];
							return (
								<div
									key={match.title}
									className="flex flex-col gap-1.5 rounded-lg border border-dashed border-[rgba(23,23,23,0.25)] bg-[rgba(23,23,23,0.05)] px-3 py-2"
								>
									<div className="flex items-center justify-between gap-2">
										<div className="flex min-w-0 items-center gap-2">
											<Banknote className="size-4 flex-none" />
											<p className="truncate text-[12px] font-semibold tracking-tight">{match.title}</p>
											<span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.6px] font-medium", badge.className)}>
												<badge.icon className="size-3" />
												{badge.label}
												{match.confidence ? ` · ${Math.round(match.confidence * 100)}%` : null}
											</span>
										</div>
										<span className={cn("text-[12px] font-semibold", type.text)}>{match.value}</span>
									</div>
									<div className="flex items-center justify-between gap-1.5">
										<span className="text-[10.4px] font-medium uppercase text-[#687a80]">{match.when}</span>
										<div className="flex items-center gap-1.5">
											<span className="inline-flex h-8 items-center gap-1.5 px-2 text-[12px] font-medium text-[#e5252a]">
												<X className="size-4" />
												REJEITAR
											</span>
											<span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#171717] px-3 text-[12px] font-medium text-[#fafafa]">
												<Check className="size-4" />
												CONFIRMAR
											</span>
										</div>
									</div>
								</div>
							);
						})}
						<div className="flex justify-end gap-1.5">
							<span className="inline-flex h-8 items-center gap-1.5 px-2 text-[12px] font-medium">
								{line.matches.length > 0 ? <Pencil className="size-4" /> : <Link2 className="size-4" />}
								{line.matches.length > 0 ? "RESOLVER MANUALMENTE" : "CONCILIAR MANUALMENTE / CRIAR LANÇAMENTO"}
							</span>
							<span className="inline-flex h-8 items-center gap-1.5 px-2 text-[12px] font-medium text-[#687a80]">
								<EyeOff className="size-4" />
								IGNORAR
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}
