import { cn } from "@/lib/utils";
import {
	ArrowRight,
	BadgeDollarSign,
	Building2,
	Check,
	Ellipsis,
	FileUp,
	Link2Off,
	ListChecks,
	ListTodo,
	type LucideIcon,
	Plus,
	Ruler,
	ScanSearch,
	ShoppingCart,
	Truck,
	Wallet,
} from "lucide-react";

// Etapa "Itens" do construtor de compras (app/dashboard/purchases/_module/builder), desenhada a
// 1120px: o stepper (builder-stepper.tsx), o título da etapa (StageShell.Title) e a tabela de revisão
// das linhas da nota (stage-items.tsx), com as pílulas de ISSUE_META e os rótulos de MATCH_LABELS.

const STEPS: { label: string; icon: LucideIcon; state: "done" | "active" | "todo" }[] = [
	{ label: "Origem", icon: FileUp, state: "done" },
	{ label: "Fornecedor & pedido", icon: Building2, state: "done" },
	{ label: "Itens", icon: ShoppingCart, state: "active" },
	{ label: "Financeiro", icon: Wallet, state: "todo" },
	{ label: "Entrega & transporte", icon: Truck, state: "todo" },
	{ label: "Revisão", icon: ListChecks, state: "todo" },
];

const TONE = {
	ok: "bg-[rgba(34,197,94,0.1)] text-[#15803d]",
	warn: "bg-[rgba(245,158,11,0.1)] text-[#92400e]",
	info: "bg-[rgba(59,130,246,0.1)] text-[#1e40af]",
	bad: "bg-[rgba(229,37,42,0.1)] text-[#e5252a]",
} as const;

type TLine = {
	pill: { label: string; tone: keyof typeof TONE; icon: LucideIcon };
	description: string;
	note: string;
	product: string | null;
	initials?: string;
	meta: string;
	total: string;
	fix?: string;
};

// Nota hipotética da Laticínios Serra Azul: 10 + 4 caixas, 6 + 3 unidades e 2 caixas = R$ 1.677,00.
const LINES: TLine[] = [
	{
		pill: { label: "Pronto", tone: "ok", icon: Check },
		description: "LEITE INTEGRAL UHT 1L CX C/12",
		note: "Cód. 10422 · 10 CX × R$ 58,80",
		product: "Leite integral 1L",
		initials: "LI",
		meta: "120 UN × R$ 4,90 · Vínculo lembrado",
		total: "R$ 588,00",
	},
	{
		pill: { label: "Confirmar vínculo", tone: "info", icon: ScanSearch },
		description: "CREME DE LEITE 1L CX C/6",
		note: "Cód. 10518 · 4 CX × R$ 95,40",
		product: "Creme de leite 1L",
		initials: "CL",
		meta: "Sugestão · 24 UN × R$ 15,90",
		total: "R$ 381,60",
		fix: "Confirmar",
	},
	{
		pill: { label: "Pronto", tone: "ok", icon: Check },
		description: "ACUCAR REFINADO 5KG",
		note: "Cód. 20077 · 6 UN × R$ 22,90",
		product: "Açúcar refinado 5kg",
		initials: "AR",
		meta: "6 UN · Mesmo código",
		total: "R$ 137,40",
	},
	{
		pill: { label: "Sem produto", tone: "bad", icon: Link2Off },
		description: "CHOCOLATE PO 50% CACAU 1KG",
		note: "Cód. 31150 · 3 UN × R$ 64,00",
		product: null,
		meta: "Crie ou vincule para incluir",
		total: "R$ 192,00",
		fix: "Vincular",
	},
	{
		pill: { label: "Converter unidade", tone: "warn", icon: Ruler },
		description: "LEITE CONDENSADO 395G CX C/27",
		note: "Cód. 10630 · 2 CX × R$ 189,00",
		product: "Leite condensado 395g",
		initials: "LC",
		meta: "2 CX → ? UN",
		total: "R$ 378,00",
		fix: "Informar fator",
	},
];

const FILTERS = [
	{ label: "Todos", count: 5, dot: "bg-[#687a80]", active: true },
	{ label: "Pendentes", count: 3, dot: "bg-[#24549c]" },
	{ label: "Prontos", count: 2, dot: "bg-[#16a34a]" },
	{ label: "Não incluídos", count: 0, dot: "bg-[rgba(104,122,128,0.4)]" },
];

const GRID = "grid grid-cols-[136px_minmax(0,1.2fr)_minmax(0,1fr)_96px_164px] items-center gap-2";

export function PurchaseItemsMock() {
	return (
		<div className="flex flex-col gap-5 rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white p-6 text-[#0e1214] shadow-[0_40px_90px_-40px_rgba(16,24,40,0.45)]">
			<ol className="flex items-center gap-1">
				{STEPS.map((step, index) => (
					<li key={step.label} className="flex min-w-0 flex-1 items-center">
						<span className={cn("flex w-full items-center gap-2 rounded-md px-2 py-2", step.state === "active" && "bg-[rgba(36,84,156,0.1)]")}>
							<span
								className={cn(
									"flex size-7 flex-none items-center justify-center rounded-full border text-[12px] font-semibold",
									step.state === "active" && "border-[#24549c] bg-[#24549c] text-white",
									step.state === "done" && "border-[#24549c] bg-[rgba(36,84,156,0.2)] text-[#24549c]",
									step.state === "todo" && "border-[rgba(36,84,156,0.25)] text-[rgba(36,84,156,0.8)]",
								)}
							>
								{step.state === "done" ? <Check className="size-3.5" /> : <step.icon className="size-3.5" />}
							</span>
							<span className="flex min-w-0 flex-col">
								<span className="truncate text-[10px] font-semibold uppercase tracking-wide text-[#687a80]">Etapa {index + 1}</span>
								<span className={cn("truncate text-[12px] font-medium", step.state === "active" ? "text-[#0e1214]" : "text-[rgba(14,18,20,0.7)]")}>
									{step.label}
								</span>
							</span>
						</span>
						{index < STEPS.length - 1 ? <span className="h-px w-3 flex-none bg-[rgba(36,84,156,0.15)]" /> : null}
					</li>
				))}
			</ol>

			<header className="flex items-start gap-3 border-b border-[#e3e8ea] pb-3">
				<span className="flex size-9 items-center justify-center rounded-lg bg-[rgba(36,84,156,0.1)] text-[#24549c]">
					<ShoppingCart className="size-4" />
				</span>
				<div>
					<p className="text-[14px] font-semibold tracking-tight">Itens</p>
					<p className="text-[12px] text-[#687a80]">O que entra no seu estoque e por quanto.</p>
				</div>
			</header>

			<div className="flex items-center gap-3 rounded-xl border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.05)] px-3.5 py-3 text-[#92400e]">
				<ListTodo className="size-[18px] flex-none" />
				<div className="flex flex-1 flex-col gap-0.5">
					<p className="text-[13px] font-semibold">3 itens precisam de você antes de continuar</p>
					<p className="text-[12px]">Os outros itens já foram vinculados ao seu catálogo e estão prontos.</p>
				</div>
				<span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#24549c] px-4 text-[13px] font-medium text-white">
					RESOLVER UMA A UMA
					<ArrowRight className="size-3.5" />
				</span>
			</div>

			<div className="flex items-center justify-between gap-2">
				<div className="flex gap-1.5">
					{FILTERS.map((filter) => (
						<span
							key={filter.label}
							className={cn(
								"flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium",
								filter.active ? "border-[#0e1214] bg-[#0e1214] text-white" : "border-[#e3e8ea] bg-white",
							)}
						>
							<span className={cn("size-1.5 rounded-full", filter.dot)} />
							{filter.label}
							<span className="font-bold">{filter.count}</span>
						</span>
					))}
				</div>
				<span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#e3e8ea] px-2.5 text-[12px] font-medium">
					<Plus className="size-3.5" />
					ADICIONAR ITEM
				</span>
			</div>

			<div className="flex flex-col overflow-hidden rounded-md border border-[#e3e8ea]">
				<div
					className={cn(
						GRID,
						"min-h-9 border-b border-[#e3e8ea] bg-[rgba(242,244,244,0.6)] px-3 py-1.5 text-[10.9px] font-medium uppercase text-[#687a80]",
					)}
				>
					<span>Situação</span>
					<span>Na nota</span>
					<span>No seu estoque</span>
					<span className="text-right">Total</span>
					<span />
				</div>
				{LINES.map((line) => {
					const pending = !!line.fix;
					return (
						<div
							key={line.description}
							className={cn(GRID, "min-h-14 border-t border-[#e3e8ea] px-3 py-2 first-of-type:border-t-0", pending && "bg-[rgba(36,84,156,0.04)]")}
						>
							<span className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11.2px] font-semibold", TONE[line.pill.tone])}>
								<line.pill.icon className="size-3" />
								{line.pill.label}
							</span>
							<div className="flex min-w-0 flex-col gap-px">
								<span className="text-[12px] font-medium leading-snug">{line.description}</span>
								<span className="text-[11.2px] text-[#687a80]">{line.note}</span>
							</div>
							<div className="flex min-w-0 items-center gap-2">
								<span
									className={cn(
										"flex size-6 flex-none items-center justify-center rounded-lg border bg-[#f2f4f4] text-[9.6px] font-semibold text-[#687a80]",
										line.product ? "border-solid border-[#e3e8ea]" : "border-dashed border-[#e3e8ea]",
									)}
								>
									{line.initials ?? null}
								</span>
								<div className="flex min-w-0 flex-col gap-px">
									<span className={cn("text-[12px] font-medium leading-snug", !line.product && "text-[#e5252a]")}>
										{line.product ?? "Nenhum produto vinculado"}
									</span>
									<span className="text-[11.2px] text-[#687a80]">{line.meta}</span>
								</div>
							</div>
							<span className="text-right font-mono text-[12px] font-medium">{line.total}</span>
							<div className="flex justify-end gap-1">
								{line.fix ? (
									<span className="inline-flex h-7 items-center gap-1 rounded-full border border-[#e3e8ea] px-2.5 text-[12px] font-medium">
										{line.fix}
										<ArrowRight className="size-3" />
									</span>
								) : null}
								<span className="flex size-7 items-center justify-center text-[#687a80]">
									<Ellipsis className="size-3.5" />
								</span>
							</div>
						</div>
					);
				})}
				<div className="flex items-center justify-between gap-2 border-t border-[#e3e8ea] px-3 py-2.5">
					<span className="text-[12px] text-[#687a80]">5 de 5 linhas incluídas</span>
					<span className="flex items-center gap-1 rounded-full border border-[#e3e8ea] bg-[rgba(242,244,244,0.5)] px-2.5 py-1 text-[12px] font-medium text-[rgba(14,18,20,0.8)]">
						<BadgeDollarSign className="size-[15px]" />
						Total da nota: R$ 1.677,00
					</span>
				</div>
			</div>
		</div>
	);
}
