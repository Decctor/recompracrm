import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Peças comuns dos recortes de produto das páginas de funcionalidade. Os recortes são estáticos e
// usam dados de exemplo fixos (Gelateria Aurora, Maria Silva…): reproduzem as telas do app, não as
// carregam.

/** Largura de desenho de todos os recortes; o `ScaledMock` reduz a partir dela. */
export const MOCK_WIDTH = 488;

export const MUTED = "text-[#687a80]";

/** Moldura branca com sombra longa — o "card" do app sobre o palco cinza-azulado. */
export function MockCard({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<div
			className={cn("flex flex-col rounded-2xl border border-[rgba(14,18,20,0.08)] bg-white shadow-[0_30px_70px_-30px_rgba(16,24,40,0.35)]", className)}
		>
			{children}
		</div>
	);
}

/** Moldura de aparelho das telas do Ponto de Interação. */
export function PhoneFrame({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<div className="rounded-[30px] border-[10px] border-[#0e1214] bg-[#0e1214] shadow-[0_40px_80px_-40px_rgba(16,24,40,0.6)]">
			<div className={cn("rounded-[20px] bg-white", className)}>{children}</div>
		</div>
	);
}

/** Variação percentual com fundo verde (melhora) ou vermelho (piora). */
export function DeltaChip({ good = true, children }: { good?: boolean; children: ReactNode }) {
	return (
		<span
			className={cn(
				"rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
				good ? "bg-[rgba(34,197,94,0.1)] text-[#15803d]" : "bg-[rgba(239,68,68,0.1)] text-[#b91c1c]",
			)}
		>
			{children}
		</span>
	);
}

export type TStatUnit = {
	title: string;
	icon: LucideIcon;
	value: string;
	prev: string;
	delta: string;
	good?: boolean;
	share?: string;
};

/** Cartão de indicador do app (título, valor, variação e período anterior). */
export function StatUnit({ title, icon: Icon, value, prev, delta, good = true, share }: TStatUnit) {
	return (
		<div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-[#e3e8ea] bg-white px-3 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
			<div className="flex items-center justify-between gap-2">
				<span className="truncate text-[11px] font-medium tracking-[-0.01em] uppercase">{title}</span>
				<Icon className="size-4 flex-none" aria-hidden />
			</div>
			<div className="flex flex-wrap items-baseline justify-between gap-1.5">
				<span className="text-[19px] font-bold tracking-[-0.02em]">{value}</span>
				<DeltaChip good={good}>{delta}</DeltaChip>
			</div>
			<span className={cn("text-[10.4px]", MUTED)}>Anterior: {prev}</span>
			{share ? (
				<span className="flex gap-1 text-[11px]">
					<span className={cn("font-medium", MUTED)}>REPRESENTATIVIDADE:</span>
					<span className="font-bold">{share}</span>
				</span>
			) : null}
		</div>
	);
}

/** Título de bloco do app: ícone + rótulo em caixa alta. */
export function BlockTitle({ icon: Icon, className, children }: { icon: LucideIcon; className?: string; children: ReactNode }) {
	return (
		<span className={cn("flex items-center gap-2 text-[12px] font-medium tracking-[-0.01em]", className)}>
			<Icon className="size-4 flex-none" aria-hidden />
			{children}
		</span>
	);
}

// Segmentos RFM na ordem e nas cores do app (`utils/rfm.ts`), com as contagens de exemplo.
export type TRfmSegment = {
	label: string;
	color: string;
	foreground: string;
	count: number;
};

export const RFM_SEGMENTS: TRfmSegment[] = [
	{ label: "CAMPEÕES", color: "#fb923c", foreground: "#0e1214", count: 214 },
	{ label: "CLIENTES LEAIS", color: "#4ade80", foreground: "#0e1214", count: 386 },
	{ label: "POTENCIAIS CLIENTES LEAIS", color: "#5C4033", foreground: "#fff", count: 241 },
	{ label: "CLIENTES RECENTES", color: "#2dd4bf", foreground: "#0e1214", count: 178 },
	{ label: "PROMISSORES", color: "#f472b6", foreground: "#0e1214", count: 203 },
	{ label: "PRECISAM DE ATENÇÃO", color: "#818cf8", foreground: "#fff", count: 167 },
	{ label: "PRESTES A DORMIR", color: "#ca8a04", foreground: "#fff", count: 192 },
	{ label: "EM RISCO", color: "#facc15", foreground: "#0e1214", count: 142 },
	{ label: "NÃO PODE PERDÊ-LOS", color: "#60a5fa", foreground: "#fff", count: 88 },
	{ label: "HIBERNANDO", color: "#c084fc", foreground: "#fff", count: 259 },
	{ label: "PERDIDOS", color: "#ef4444", foreground: "#fff", count: 348 },
];

export function getRfmSegment(label: string) {
	const segment = RFM_SEGMENTS.find((s) => s.label === label);
	if (!segment) throw new Error(`Segmento RFM desconhecido: ${label}`);
	return segment;
}

/** Etiqueta colorida de segmento RFM. */
export function RfmChip({ label }: { label: string }) {
	const segment = getRfmSegment(label);
	return (
		<span
			className="inline-flex items-center truncate rounded-full border px-[9px] py-[3px] text-[10px] font-extrabold tracking-[0.02em] whitespace-nowrap"
			style={{ background: segment.color, color: segment.foreground, borderColor: segment.color }}
		>
			{label}
		</span>
	);
}

export function formatCount(value: number) {
	return value.toLocaleString("pt-BR");
}
