"use client";

import CashbackProgramsAccumulationBlock from "@/components/Modals/CashbackPrograms/Blocks/Accumulation";
import CashbackProgramsExpirationBlock from "@/components/Modals/CashbackPrograms/Blocks/Expiration";
import CashbackProgramsGeneralBlock from "@/components/Modals/CashbackPrograms/Blocks/General";
import CashbackProgramsRedemptionBlock from "@/components/Modals/CashbackPrograms/Blocks/Redemption";
import CashbackProgramsRedemptionSurfacesBlock from "@/components/Modals/CashbackPrograms/Blocks/RedemptionSurfaces";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/section";
import type { TCashbackProgram, TCashbackProgramSection } from "@/lib/cashback/program-registry-state";
import { formatCashbackValue } from "@/lib/formatting";
import { type TUseCashbackProgramSectionEditor, useCashbackProgramSectionEditor } from "@/state-hooks/use-cashback-program-section-editor";
import { ArrowRight, LayoutGrid, MapPin, Percent, PiggyBank } from "lucide-react";
import type { ReactNode } from "react";

type TRegistryCallbacks = {
	onMutate?: () => void;
	onSettled?: () => void;
};

type CashbackProgramRegistryProps = {
	program: TCashbackProgram;
	userOrgHasIntegration: boolean;
	onManagePrizes: () => void;
	callbacks: TRegistryCallbacks;
};

/**
 * Aba Meu Programa: o cadastro do programa editável no lugar, seção por seção, como cupom, produto
 * e cliente. Substitui o modal `ControlCashbackProgram`, que abria seis blocos por cima da página
 * para mudar um número e devolvia a tela com `window.location.reload()`.
 */
export default function CashbackProgramRegistry({ program, userOrgHasIntegration, onManagePrizes, callbacks }: CashbackProgramRegistryProps) {
	return (
		<div className="grid w-full grid-cols-1 items-start gap-3 xl:grid-cols-2">
			<div className="flex w-full flex-col gap-3">
				<GeneralSection program={program} callbacks={callbacks} />
				<RedemptionSection program={program} callbacks={callbacks} onManagePrizes={onManagePrizes} />
			</div>
			<div className="flex w-full flex-col gap-3">
				<AccumulationSection program={program} callbacks={callbacks} userOrgHasIntegration={userOrgHasIntegration} />
				<SurfacesSection program={program} callbacks={callbacks} />
			</div>
		</div>
	);
}

type SectionProps = { program: TCashbackProgram; callbacks: TRegistryCallbacks };

function ProgramSection({
	icon,
	title,
	editor,
	children,
}: {
	icon: ReactNode;
	title: string;
	editor: TUseCashbackProgramSectionEditor;
	children: ReactNode;
}) {
	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>{icon}</Section.Icon>
				<Section.Title>{title}</Section.Title>
			</Section.Header>
			<Section.Body>
				{children}
				<SectionApplyBar
					isDirty={editor.isDirty}
					isPending={editor.isPending}
					disabled={!!editor.blockReason}
					disabledReason={editor.blockReason}
					onApply={editor.apply}
					onDiscard={editor.discard}
				/>
			</Section.Body>
		</Section.Root>
	);
}

function useSectionEditor(program: TCashbackProgram, section: TCashbackProgramSection, callbacks: TRegistryCallbacks) {
	return useCashbackProgramSectionEditor({ program, section, callbacks });
}

function GeneralSection({ program, callbacks }: SectionProps) {
	const editor = useSectionEditor(program, "general", callbacks);
	const terminologyChanged = editor.draft.terminologia !== program.terminologia;
	// Exemplo concreto da troca: o número fica, o rótulo muda. Um saldo de R$ 10,00 vira 10 pontos.
	const example = `${formatCashbackValue(10, program.terminologia)} ${program.terminologia === "PONTOS" ? "viram" : "vira"} ${formatCashbackValue(10, editor.draft.terminologia)}`;

	return (
		<ProgramSection icon={<LayoutGrid />} title="Informações gerais" editor={editor}>
			<CashbackProgramsGeneralBlock embedded cashbackProgram={editor.draft} updateCashbackProgram={editor.updateCashbackProgram} />
			{terminologyChanged ? (
				<Callout.Root tone="warning">
					<Callout.Title>Os saldos não são convertidos</Callout.Title>
					<Callout.Description>Só o rótulo muda: {example}. A troca aparece no tablet, no PDV, na loja e nas mensagens das campanhas.</Callout.Description>
				</Callout.Root>
			) : null}
		</ProgramSection>
	);
}

function AccumulationSection({ program, callbacks, userOrgHasIntegration }: SectionProps & { userOrgHasIntegration: boolean }) {
	const editor = useSectionEditor(program, "accumulation", callbacks);
	return (
		<ProgramSection icon={<PiggyBank />} title="Acúmulo e validade" editor={editor}>
			<CashbackProgramsAccumulationBlock
				embedded
				userOrgHasIntegration={userOrgHasIntegration}
				cashbackProgram={editor.draft}
				updateCashbackProgram={editor.updateCashbackProgram}
			/>
			<CashbackProgramsExpirationBlock embedded cashbackProgram={editor.draft} updateCashbackProgram={editor.updateCashbackProgram} />
		</ProgramSection>
	);
}

function RedemptionSection({ program, callbacks, onManagePrizes }: SectionProps & { onManagePrizes: () => void }) {
	const editor = useSectionEditor(program, "redemption", callbacks);
	const storedPrizesCount = program.recompensas.filter((prize) => !prize.dataArquivamento).length;
	const prizesSavedOn = program.modalidadeRecompensasPermitida && editor.draft.modalidadeRecompensasPermitida;
	const prizesTurningOff = !editor.draft.modalidadeRecompensasPermitida && storedPrizesCount > 0;

	return (
		<ProgramSection icon={<Percent />} title="Resgate" editor={editor}>
			<CashbackProgramsRedemptionBlock embedded cashbackProgram={editor.draft} updateCashbackProgram={editor.updateCashbackProgram} />
			{prizesSavedOn ? (
				<Button variant="outline" size="sm" className="w-fit" onClick={onManagePrizes}>
					GERENCIAR RECOMPENSAS
					{storedPrizesCount > 0 ? <span className="text-micro text-muted-foreground">{storedPrizesCount}</span> : null}
					<ArrowRight className="h-4 w-4" />
				</Button>
			) : null}
			{prizesTurningOff ? (
				<p className="text-xs text-muted-foreground">
					{storedPrizesCount === 1
						? "A recompensa cadastrada fica guardada e volta quando você reativar a troca."
						: `As ${storedPrizesCount} recompensas cadastradas ficam guardadas e voltam quando você reativar a troca.`}
				</p>
			) : null}
		</ProgramSection>
	);
}

function SurfacesSection({ program, callbacks }: SectionProps) {
	const editor = useSectionEditor(program, "surfaces", callbacks);
	return (
		<ProgramSection icon={<MapPin />} title="Onde o cliente pode resgatar" editor={editor}>
			<CashbackProgramsRedemptionSurfacesBlock embedded cashbackProgram={editor.draft} updateCashbackProgram={editor.updateCashbackProgram} />
		</ProgramSection>
	);
}
