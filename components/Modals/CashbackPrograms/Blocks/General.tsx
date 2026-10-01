import CheckboxInput from "@/components/Inputs/CheckboxInput";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import { Button } from "@/components/ui/button";
import type { TUseCashbackProgramState } from "@/state-hooks/use-cashback-program-state";
import { CashbackProgramTerminologyOptions } from "@/utils/select-options";
import { LayoutGrid } from "lucide-react";
import CashbackProgramBlockShell from "./BlockShell";

type CashbackProgramsGeneralBlockProps = {
	cashbackProgram: TUseCashbackProgramState["state"]["cashbackProgram"];
	updateCashbackProgram: TUseCashbackProgramState["updateCashbackProgram"];
	embedded?: boolean;
};
export default function CashbackProgramsGeneralBlock({ cashbackProgram, updateCashbackProgram, embedded }: CashbackProgramsGeneralBlockProps) {
	return (
		<CashbackProgramBlockShell embedded={embedded} title="INFORMAÇÕES GERAIS" icon={<LayoutGrid className="h-4 min-h-4 w-4 min-w-4" />}>
			{/* Embutido, ativar/pausar mora no cabeçalho da página: é uma ação, não um campo do cadastro. */}
			{!embedded ? (
				<div className="w-full flex items-center justify-center">
					<CheckboxInput
						checked={cashbackProgram.ativo}
						labelTrue="ATIVO"
						labelFalse="ATIVO"
						handleChange={(value) => updateCashbackProgram({ ativo: value })}
						justify="justify-center"
					/>
				</div>
			) : null}
			<TextInput
				value={cashbackProgram.titulo}
				label="TÍTULO"
				placeholder="Preencha aqui o título do programa de cashback..."
				handleChange={(value) => updateCashbackProgram({ titulo: value })}
			/>
			<TextareaInput
				value={cashbackProgram.descricao ?? ""}
				label="DESCRIÇÃO"
				placeholder="Preencha aqui a descrição do programa de cashback..."
				handleChange={(value) => updateCashbackProgram({ descricao: value })}
			/>
			<div className="w-full flex flex-col gap-1">
				<h3 className="text-sm font-medium tracking-tight text-foreground/80">TERMINOLOGIA</h3>
				<div className="w-full flex items-center gap-2 flex-wrap">
					{CashbackProgramTerminologyOptions.map((option) => (
						<Button
							key={option.value}
							type="button"
							variant={cashbackProgram.terminologia === option.value ? "default" : "outline"}
							size="sm"
							aria-pressed={cashbackProgram.terminologia === option.value}
							onClick={() => updateCashbackProgram({ terminologia: option.value })}
						>
							{option.icon}
							{option.label}
						</Button>
					))}
				</div>
			</div>
		</CashbackProgramBlockShell>
	);
}
