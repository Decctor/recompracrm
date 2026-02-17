import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import type { TInternalLead } from "@/schemas/internal-leads";
import type { TUseInternalLeadState } from "@/state-hooks/use-internal-lead-state";
import { Building2 } from "lucide-react";

type LeadsOrganizationBlockProps = {
	lead: TUseInternalLeadState["state"];
	updateLead: TUseInternalLeadState["updateLead"];
};

export default function LeadsOrganizationBlock({ lead, updateLead }: LeadsOrganizationBlockProps) {
	return (
		<ResponsiveMenuSection title="ORGANIZAÇÃO" icon={<Building2 className="w-3.5 h-3.5" />}>
			<TextInput
				label="NOME DA ORGANIZAÇÃO"
				placeholder="Preencha aqui o nome da organização..."
				value={lead.organizacaoNome}
				handleChange={(v) => updateLead({ organizacaoNome: v })}
				required
			/>
			<TextInput
				label="CNPJ DA ORGANIZAÇÃO"
				placeholder="Preencha aqui o CNPJ da organização..."
				value={lead.organizacaoCnpj}
				handleChange={(v) => updateLead({ organizacaoCnpj: formatToCPForCNPJ(v) })}
				required
			/>
			<TextInput
				label="TELEFONE DA ORGANIZAÇÃO"
				placeholder="Preencha aqui o telefone da organização..."
				value={lead.organizacaoTelefone ?? ""}
				handleChange={(v) => updateLead({ organizacaoTelefone: formatToPhone(v) })}
			/>
			<TextInput
				label="E-MAIL DA ORGANIZAÇÃO"
				placeholder="Preencha aqui o e-mail da organização..."
				value={lead.organizacaoEmail ?? ""}
				handleChange={(v) => updateLead({ organizacaoEmail: v })}
			/>
			<TextInput
				label="SITE DA ORGANIZAÇÃO"
				placeholder="Preencha aqui o site da organização..."
				value={lead.organizacaoSite ?? ""}
				handleChange={(v) => updateLead({ organizacaoSite: v })}
			/>
		</ResponsiveMenuSection>
	);
}
