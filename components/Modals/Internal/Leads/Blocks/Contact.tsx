import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { formatToPhone } from "@/lib/formatting";
import type { TInternalLead } from "@/schemas/internal-leads";
import type { TUseInternalLeadState } from "@/state-hooks/use-internal-lead-state";
import { User } from "lucide-react";
type LeadsContactBlockProps = {
	lead: TUseInternalLeadState["state"];
	updateLead: TUseInternalLeadState["updateLead"];
};

export default function LeadsContactBlock({ lead, updateLead }: LeadsContactBlockProps) {
	return (
		<ResponsiveMenuSection title="CONTATO" icon={<User className="w-3.5 h-3.5" />}>
			<TextInput
				label="NOME DO CONTATO"
				placeholder="Preencha aqui o nome do contato..."
				value={lead.contatoNome}
				handleChange={(v) => updateLead({ contatoNome: v })}
				required
			/>
			<TextInput
				label="E-MAIL DO CONTATO"
				placeholder="Preencha aqui o e-mail do contato..."
				value={lead.contatoEmail}
				handleChange={(v) => updateLead({ contatoEmail: v })}
				required
			/>
			<TextInput
				label="TELEFONE DO CONTATO"
				placeholder="Preencha aqui o telefone do contato..."
				value={lead.contatoTelefone ?? ""}
				handleChange={(v) => updateLead({ contatoTelefone: formatToPhone(v) })}
			/>
			<TextInput
				label="CARGO DO CONTATO"
				placeholder="Preencha aqui o cargo do contato..."
				value={lead.contatoCargo ?? ""}
				handleChange={(v) => updateLead({ contatoCargo: v })}
			/>
		</ResponsiveMenuSection>
	);
}
