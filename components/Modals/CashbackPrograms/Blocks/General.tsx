import CheckboxInput from "@/components/Inputs/CheckboxInput";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TUseCashbackProgramState } from "@/state-hooks/use-cashback-program-state";
import { LayoutGrid } from "lucide-react";

type CashbackProgramsGeneralBlockProps = {
	cashbackProgram: TUseCashbackProgramState["state"]["cashbackProgram"];
	updateCashbackProgram: TUseCashbackProgramState["updateCashbackProgram"];
};
export default function CashbackProgramsGeneralBlock({ cashbackProgram, updateCashbackProgram }: CashbackProgramsGeneralBlockProps) {
	return (
		<ResponsiveMenuSection title="INFORMAÇÕES GERAIS" icon={<LayoutGrid className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="w-full flex items-center justify-center">
				<CheckboxInput
					checked={cashbackProgram.ativo}
					labelTrue="ATIVO"
					labelFalse="ATIVO"
					handleChange={(value) => updateCashbackProgram({ ativo: value })}
					justify="justify-center"
				/>
			</div>
			<TextInput
				value={cashbackProgram.titulo}
				label="TÍTULO"
				placeholder="Preencha aqui o título do programa de cashback..."
				handleChange={(value) => updateCashbackProgram({ titulo: value })}
				width="100%"
			/>
			<TextareaInput
				value={cashbackProgram.descricao ?? ""}
				label="DESCRIÇÃO"
				placeholder="Preencha aqui a descrição do programa de cashback..."
				handleChange={(value) => updateCashbackProgram({ descricao: value })}
			/>
			<div className="w-full flex items-center gap-2 flex-col lg:flex-row">
				<div className="w-full flex items-center justify-center lg:w-1/2">
					<CheckboxInput
						checked={cashbackProgram.modalidadeDescontosPermitida}
						labelTrue="PERMITIR DESCONTOS"
						labelFalse="PERMITIR DESCONTOS"
						handleChange={(value) => updateCashbackProgram({ modalidadeDescontosPermitida: value })}
					/>
				</div>
				<div className="w-full flex items-center justify-center lg:w-1/2">
					<CheckboxInput
						checked={cashbackProgram.modalidadeRecompensasPermitida}
						labelTrue="PERMITIR RECOMPENSAS"
						labelFalse="PERMITIR RECOMPENSAS"
						handleChange={(value) => updateCashbackProgram({ modalidadeRecompensasPermitida: value })}
					/>
				</div>
			</div>
		</ResponsiveMenuSection>
	);
}
