import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import type { TUseClientState } from "@/state-hooks/use-client-state";
import { CustomersAcquisitionChannels } from "@/utils/select-options";
import { LayoutGrid } from "lucide-react";

type ClientGeneralBlockProps = {
	client: TUseClientState["state"]["client"];
	updateClient: TUseClientState["updateClient"];
};

export default function ClientGeneralBlock({ client, updateClient }: ClientGeneralBlockProps) {
	return (
		<ResponsiveMenuSection title="INFORMAÇÕES GERAIS" icon={<LayoutGrid className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="w-full grid grid-cols-1 gap-2 md:grid-cols-2">
				<TextInput
					label="NOME"
					placeholder="Digite o nome do cliente..."
					value={client.nome}
					handleChange={(value) => updateClient({ nome: value })}
					width="100%"
				/>
				<TextInput
					label="TELEFONE"
					placeholder="(00) 00000-0000"
					value={formatToPhone(client.telefone ?? "")}
					handleChange={(value) => updateClient({ telefone: formatToPhone(value) })}
					width="100%"
				/>
				<TextInput
					label="CPF/CNPJ"
					placeholder="Digite o CPF/CNPJ"
					value={client.cpfCnpj ?? ""}
					handleChange={(value) => updateClient({ cpfCnpj: formatToCPForCNPJ(value) || null })}
					width="100%"
				/>
				<TextInput
					label="EMAIL"
					placeholder="Digite o email do cliente"
					value={client.email ?? ""}
					handleChange={(value) => updateClient({ email: value })}
					width="100%"
				/>
			</div>
			<SelectInput
				label="CANAL DE AQUISIÇÃO"
				value={client.canalAquisicao ?? null}
				options={CustomersAcquisitionChannels}
				handleChange={(value) => updateClient({ canalAquisicao: value })}
				onReset={() => updateClient({ canalAquisicao: null })}
				resetOptionLabel="NÃO DEFINIDO"
				width="100%"
			/>
		</ResponsiveMenuSection>
	);
}
