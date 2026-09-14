import SelectInput from "@/components/Inputs/SelectInput";
import CouponBlockShell from "./BlockShell";
import { Button } from "@/components/ui/button";
import { useClientTags } from "@/lib/queries/clients";
import { cn } from "@/lib/utils";
import type { TUseInternalCouponState } from "@/state-hooks/use-internal-coupon-state";
import { RFMLabels } from "@/utils/rfm";
import { Plus, Tag, Trash2, Users } from "lucide-react";
import { type ReactNode, useState } from "react";

type TAudienceType = "TAG" | "RFM";

type CouponAudienceBlockProps = {
	couponAudiences: TUseInternalCouponState["state"]["couponAudiences"];
	addCouponAudience: TUseInternalCouponState["addCouponAudience"];
	removeCouponAudience: TUseInternalCouponState["removeCouponAudience"];
	embedded?: boolean;
};
export default function CouponAudienceBlock({ couponAudiences, addCouponAudience, removeCouponAudience, embedded }: CouponAudienceBlockProps) {
	// Preserva o índice original: removeCouponAudience opera sobre o array completo (com soft-deletes).
	const visibleAudiences = couponAudiences.map((audience, index) => ({ audience, index })).filter(({ audience }) => !audience.deletar);

	return (
		<CouponBlockShell embedded={embedded} title="RESTRINGIR POR PÚBLICO" icon={<Users className="h-4 min-h-4 w-4 min-w-4" />}>
			<p className="text-sm font-medium text-muted-foreground">
				Sem restrição, o cupom vale para qualquer cliente identificado. Ao restringir, o cliente precisa ter uma das tags ou estar em um dos segmentos
				escolhidos.
			</p>

			<div className="flex w-full flex-col overflow-hidden rounded-xl border border-border bg-background">
				<div className="hidden min-h-9 w-full items-center border-b border-border bg-muted/60 px-3 py-1.5 text-[0.68rem] font-medium uppercase text-muted-foreground lg:flex">
					<p className="w-[32%]">Tipo</p>
					<p className="flex-1">Público</p>
					<p className="w-9 shrink-0 text-center">Ações</p>
				</div>

				{visibleAudiences.map(({ audience, index }) => {
					const isTag = !!audience.clienteTagId;
					return (
						<div
							key={`${audience.clienteTagId ?? audience.segmentacaoRFM}-${index}`}
							className="flex w-full items-center gap-3 border-t border-border px-3 py-2.5 transition-colors first:border-t-0 hover:bg-muted/40"
						>
							<div className="flex shrink-0 items-center gap-1.5 lg:w-[32%]">
								<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
									{isTag ? <Tag className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
								</span>
								<span className="hidden text-xs font-medium text-muted-foreground lg:inline">{isTag ? "Tag" : "Segmento"}</span>
							</div>
							<span className="min-w-0 flex-1 truncate text-sm font-medium">
								{isTag ? (audience.clienteTagTitulo ?? audience.clienteTagId) : audience.segmentacaoRFM}
							</span>
							<Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeCouponAudience(index)}>
								<Trash2 className="h-3.5 w-3.5 text-destructive" />
							</Button>
						</div>
					);
				})}

				<DraftAudienceRow couponAudiences={couponAudiences} addCouponAudience={addCouponAudience} />
			</div>
		</CouponBlockShell>
	);
}

function DraftAudienceRow({
	couponAudiences,
	addCouponAudience,
}: {
	couponAudiences: CouponAudienceBlockProps["couponAudiences"];
	addCouponAudience: CouponAudienceBlockProps["addCouponAudience"];
}) {
	const { data: clientTags } = useClientTags();
	const [type, setType] = useState<TAudienceType>("TAG");

	// Opções já escolhidas ficam de fora da linha em branco para evitar duplicatas.
	const activeAudiences = couponAudiences.filter((audience) => !audience.deletar);
	const usedTagIds = new Set(activeAudiences.map((audience) => audience.clienteTagId).filter(Boolean));
	const usedSegments = new Set(activeAudiences.map((audience) => audience.segmentacaoRFM).filter(Boolean));

	const options =
		type === "TAG"
			? (clientTags ?? [])
					.filter((clientTag) => !usedTagIds.has(clientTag.id))
					.map((clientTag) => ({ id: clientTag.id, value: clientTag.id, label: clientTag.titulo }))
			: RFMLabels.filter((rfmLabel) => !usedSegments.has(rfmLabel.text)).map((rfmLabel) => ({
					id: rfmLabel.text,
					value: rfmLabel.text,
					label: rfmLabel.text,
				}));

	function handleSelect(value: string) {
		if (type === "TAG") {
			const tag = clientTags?.find((clientTag) => clientTag.id === value);
			addCouponAudience({ clienteTagId: value, segmentacaoRFM: null, clienteTagTitulo: tag?.titulo ?? null });
			return;
		}
		addCouponAudience({ clienteTagId: null, segmentacaoRFM: value });
	}

	return (
		<div className="flex w-full flex-col gap-2 border-t border-dashed border-border bg-muted/20 px-3 py-2.5 lg:flex-row lg:items-center">
			<div className="flex shrink-0 items-center gap-1.5 lg:w-[32%]">
				<Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				<div className="inline-flex items-center rounded-md border border-border bg-background p-0.5">
					<TypeTab label="TAG" icon={<Tag className="h-3 w-3" />} active={type === "TAG"} onClick={() => setType("TAG")} />
					<TypeTab label="SEGMENTO" icon={<Users className="h-3 w-3" />} active={type === "RFM"} onClick={() => setType("RFM")} />
				</div>
			</div>
			<div className="min-w-0 flex-1">
				<SelectInput
					// value fica sempre null: a linha é um rascunho que compromete no clique e volta a ficar em branco.
					value={null}
					label="PÚBLICO"
					showLabel={false}
					resetOptionLabel={type === "TAG" ? "SELECIONE UMA TAG..." : "SELECIONE UM SEGMENTO..."}
					holderClassName="h-auto min-h-9 rounded-md border-transparent bg-transparent px-2 py-1 text-left font-normal text-muted-foreground shadow-none hover:border-border hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40"
					handleChange={handleSelect}
					onReset={() => undefined}
					options={options}
				/>
			</div>
		</div>
	);
}

function TypeTab({ label, icon, active, onClick }: { label: string; icon: ReactNode; active: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"flex items-center gap-1 rounded px-2 py-1 text-[0.7rem] font-medium transition-colors",
				active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
			)}
		>
			{icon}
			{label}
		</button>
	);
}
