import { cn } from "@/lib/utils";
import { BookText, CircleCheck, Clock, EllipsisVertical, Globe, type LucideIcon, TriangleAlert } from "lucide-react";
import { MOCK_CARD, MOCK_WINDOW, MockHeader, MockSegmented } from "./mock-parts";

// Lista de documentos fiscais (fiscal-document-card + fiscal-document-status-badge), desenhada a 720px.

type TStatus = "AUTORIZADO" | "REJEITADO" | "EM PROCESSAMENTO";

const STATUS_BADGE: Record<TStatus, { className: string; icon: LucideIcon }> = {
	AUTORIZADO: { className: "bg-[#22c55e]", icon: CircleCheck },
	REJEITADO: { className: "bg-[#f43f5e]", icon: TriangleAlert },
	"EM PROCESSAMENTO": { className: "bg-[#f59e0b]", icon: Clock },
};

const DOCUMENTS: { title: string; sub: string; status: TStatus; homolog?: boolean; problem?: string; cta?: string }[] = [
	{ title: "NFC-e · Série 1 · Nº 1284", sub: "R$ 91,90 · 24/10/2026 · Maria Silva", status: "AUTORIZADO" },
	{ title: "NF-e · Série 1 · Nº 312", sub: "R$ 1.480,00 · 24/10/2026 · Buffet Sabor & Arte", status: "AUTORIZADO" },
	{
		title: "NFC-e · Série 1 · Sem número",
		sub: "R$ 54,90 · 24/10/2026 · Rafael Costa",
		status: "REJEITADO",
		problem: "NCM inválido · Pote 1L Pistache",
		cta: "CORRIGIR PRODUTO",
	},
	{ title: "NFC-e · Série 9 · Nº 18", sub: "R$ 18,00 · 23/10/2026", status: "AUTORIZADO", homolog: true },
];

export function FiscalDocumentsMock() {
	return (
		<div className={cn("flex flex-col gap-3.5", MOCK_WINDOW)}>
			<MockHeader icon={BookText} title="Fiscal" description="Documentos fiscais, pendências e configuração de emissão." />
			<MockSegmented
				className="self-start"
				active="Documentos"
				items={[{ label: "Documentos" }, { label: "Pendências", badge: "1" }, { label: "Configuração" }]}
			/>
			{DOCUMENTS.map((doc) => {
				const badge = STATUS_BADGE[doc.status];
				const BadgeIcon = badge.icon;
				return (
					<div key={doc.title} className={cn("flex flex-col gap-2 p-3", MOCK_CARD)}>
						<div className="flex items-start justify-between gap-3">
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<p className="text-[14px] font-bold tracking-[-0.015em]">{doc.title}</p>
								<p className="truncate text-[12px] text-[#687a80]">{doc.sub}</p>
							</div>
							<div className="flex flex-none items-center gap-1.5">
								{doc.homolog ? (
									<span className="inline-flex items-center gap-1.5 rounded-[14px] bg-[#ffb900] px-3 py-1.5 text-[12px] font-medium leading-[1.25] text-[#171717]">
										<Globe className="size-4 flex-none" />
										HOMOLOGAÇÃO
									</span>
								) : null}
								<span
									className={cn(
										"inline-flex items-center gap-1.5 rounded-[14px] px-3 py-1.5 text-[12px] font-medium leading-[1.25] text-white",
										badge.className,
									)}
								>
									<BadgeIcon className="size-4 flex-none" />
									{doc.status}
								</span>
								<span className="flex size-8 items-center justify-center text-[#0e1214]">
									<EllipsisVertical className="size-4 flex-none" />
								</span>
							</div>
						</div>
						{doc.problem ? (
							<div className="flex items-center justify-between gap-2 rounded-lg bg-[#fdecec] px-2 py-1.5">
								<span className="inline-flex items-center gap-1.5 rounded-md bg-white/70 px-2 py-[3px] text-[11px] font-semibold text-[#b42318]">
									<TriangleAlert className="size-3 flex-none" />
									{doc.problem}
								</span>
								<span className="inline-flex h-6 items-center rounded-full border border-[#e3e8ea] bg-white px-2.5 text-[12px] font-medium">{doc.cta}</span>
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
