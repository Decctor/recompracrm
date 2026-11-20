import type { TClientByLookupOutput } from "@/app/api/clients/lookup/route";
import type { TRedemptionLimit } from "@/app/(external)/point-of-interaction/[orgId]/_shared/types";
import DateInput from "@/components/Inputs/DateInput";
import ClientLocationAddressPaste from "@/components/Clients/ClientLocationAddressPaste";
import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import { Checkbox } from "@/components/ui/checkbox";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { formatCashbackValue, formatNameAsInitials, formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import { useClientLocationAutofill } from "@/lib/hooks/use-client-location-autofill";
import { useOrganizationRegion } from "@/lib/queries/organizations";
import { useSellersSimplified } from "@/lib/queries/sellers";
import { cn } from "@/lib/utils";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import type {
	TPointOfInteractionNewInternalTransactionRequestState,
	TUsePointOfInteractionNewInternalTransactionRequestState,
} from "@/state-hooks/use-point-of-interaction-new-internal-transaction-request";
import { Check, ChevronDown, ChevronRight, Loader2, Plus, UserRound } from "lucide-react";
import { useState } from "react";
import { BrazilianCitiesOptionsFromUF, BrazilianStatesOptions } from "@/utils/states-cities";

export const CLIENT_PHONE_COMPLETE_LENGTH = 15;

type TClientState = TPointOfInteractionNewInternalTransactionRequestState["client"];

const OPTIONAL_CLIENT_FIELDS = ["cpfCnpj", "dataNascimento", "email", "autorVendedorId"] as const satisfies readonly (keyof TClientState)[];
const ADDRESS_CLIENT_FIELDS = [
	"localizacaoCep",
	"localizacaoEstado",
	"localizacaoCidade",
	"localizacaoBairro",
	"localizacaoLogradouro",
	"localizacaoNumero",
	"localizacaoComplemento",
] as const satisfies readonly (keyof TClientState)[];

function describeRedemptionLimit(limit: TRedemptionLimit) {
	if (!limit.tipo || limit.valor === null) return "Sem limite";
	if (limit.tipo === "FIXO") return `até ${formatCashbackValue(limit.valor, limit.terminologia)} por venda`;
	return `até ${limit.valor}% da venda`;
}

type NewTransactionClientProps = {
	client: TClientState;
	updateClient: TUsePointOfInteractionNewInternalTransactionRequestState["updateClient"];
	resetClient: TUsePointOfInteractionNewInternalTransactionRequestState["resetClient"];
	marketingConsent: boolean;
	updateMarketingConsent: TUsePointOfInteractionNewInternalTransactionRequestState["updateMarketingConsent"];
	clientData: TClientByLookupOutput["data"] | null | undefined;
	isLookingUp: boolean;
	availableCashback: number;
	redemptionLimit: TRedemptionLimit;
	terminology: TCashbackProgramTerminologyEnum;
};
export function NewTransactionClient({
	client,
	updateClient,
	resetClient,
	marketingConsent,
	updateMarketingConsent,
	clientData,
	isLookingUp,
	availableCashback,
	redemptionLimit,
	terminology,
}: NewTransactionClientProps) {
	const isPhoneComplete = client.telefone.length === CLIENT_PHONE_COMPLETE_LENGTH;
	const clientFound = isPhoneComplete && !!clientData;
	const clientNotFound = isPhoneComplete && !isLookingUp && !clientData;

	return (
		<ResponsiveMenuSection title="CLIENTE" icon={<UserRound className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className={cn("grid grid-cols-1 gap-3", clientNotFound && "md:grid-cols-2")}>
				<div className="flex flex-col gap-1">
					<TextInput
						label="TELEFONE"
						placeholder="(00) 00000-0000"
						inputMode="tel"
						autoFocus
						value={client.telefone}
						handleChange={(value) => {
							const telefone = formatToPhone(value);
							// Outro telefone, outro cliente: nada do que foi digitado para o anterior continua valendo.
							if (client.id != null || telefone.length < client.telefone.length) resetClient(telefone);
							else updateClient({ telefone });
						}}
					/>
					<ClientLookupStatus isPhoneComplete={isPhoneComplete} isLookingUp={isLookingUp} clientFound={clientFound} clientNotFound={clientNotFound} />
				</div>
				{clientNotFound ? (
					<TextInput label="NOME" required placeholder="Nome do cliente" value={client.nome} handleChange={(value) => updateClient({ nome: value })} />
				) : null}
			</div>

			{clientFound && clientData ? (
				<div className="flex flex-col gap-3 rounded-2xl border border-border p-3 sm:flex-row sm:items-center sm:p-4">
					<div className="flex min-w-0 flex-1 items-center gap-3">
						<span className="flex size-11 min-w-11 items-center justify-center rounded-full bg-primary text-sm font-bold text-brand">
							{formatNameAsInitials(clientData.nome)}
						</span>
						<div className="flex min-w-0 flex-col">
							<span className="truncate text-base font-semibold">{clientData.nome}</span>
							<span className="text-xs text-muted-foreground">{formatToPhone(clientData.telefone ?? "")}</span>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<div className="flex flex-col rounded-xl bg-secondary px-3 py-2 sm:items-end">
							<span className="text-[0.65rem] text-muted-foreground">SALDO DISPONÍVEL</span>
							<span className="text-lg font-bold">{formatCashbackValue(availableCashback, terminology)}</span>
						</div>
						<div className="flex flex-col rounded-xl bg-secondary px-3 py-2 sm:items-end">
							<span className="text-[0.65rem] text-muted-foreground">LIMITE DE RESGATE</span>
							<span className="pt-0.5 text-sm font-semibold">{describeRedemptionLimit(redemptionLimit)}</span>
						</div>
					</div>
				</div>
			) : null}

			{clientNotFound ? (
				<>
					<p className="text-xs text-muted-foreground">Nenhum cadastro com este telefone. Com o nome já dá para seguir; o saldo começa em zero.</p>
					<NewClientMoreData client={client} updateClient={updateClient} />
					<label className="flex cursor-pointer items-start gap-2.5 text-sm">
						<Checkbox checked={marketingConsent} onCheckedChange={(checked) => updateMarketingConsent(checked === true)} className="mt-0.5" />
						<span>Cliente aceita receber ofertas e avisos do programa pelo WhatsApp</span>
					</label>
				</>
			) : null}
		</ResponsiveMenuSection>
	);
}

function ClientLookupStatus({
	isPhoneComplete,
	isLookingUp,
	clientFound,
	clientNotFound,
}: {
	isPhoneComplete: boolean;
	isLookingUp: boolean;
	clientFound: boolean;
	clientNotFound: boolean;
}) {
	if (!isPhoneComplete) return <span className="text-xs text-muted-foreground">O saldo aparece assim que o número estiver completo.</span>;
	if (isLookingUp)
		return (
			<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<Loader2 className="size-3 animate-spin" />
				Buscando cliente...
			</span>
		);
	if (clientFound)
		return (
			<span className="flex w-fit items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300">
				<Check className="size-3" strokeWidth={3} />
				Cliente encontrado
			</span>
		);
	if (clientNotFound)
		return (
			<span className="flex w-fit items-center gap-1 rounded-full bg-brand-secondary/10 px-2 py-0.5 text-xs font-semibold text-brand-secondary dark:text-blue-200">
				<Plus className="size-3" />
				Novo cliente
			</span>
		);
	return null;
}

/**
 * Cadastro progressivo: só o nome é obrigatório. O resto fica fechado em "Mais dados do cliente"
 * para quem quiser completar no balcão, e o endereço, que raramente se pede, num segundo nível.
 */
function NewClientMoreData({ client, updateClient }: { client: TClientState; updateClient: NewTransactionClientProps["updateClient"] }) {
	const [isOpen, setIsOpen] = useState(false);
	const [isAddressOpen, setIsAddressOpen] = useState(false);
	const { data: sellers } = useSellersSimplified();

	const filledAddress = ADDRESS_CLIENT_FIELDS.some((field) => !!client[field]);
	const filledCount = OPTIONAL_CLIENT_FIELDS.filter((field) => !!client[field]).length + (filledAddress ? 1 : 0);
	const totalCount = OPTIONAL_CLIENT_FIELDS.length + 1;

	return (
		<div className="overflow-hidden rounded-2xl border border-border">
			<button
				type="button"
				aria-expanded={isOpen}
				onClick={() => setIsOpen((prev) => !prev)}
				className={cn("flex w-full items-center gap-2.5 bg-secondary/50 px-3.5 py-2.5 text-left hover:bg-secondary", isOpen && "border-b border-border")}
			>
				{isOpen ? <ChevronDown className="size-4 min-w-4" /> : <ChevronRight className="size-4 min-w-4" />}
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="text-sm font-semibold">
						Mais dados do cliente <span className="font-normal text-muted-foreground">(opcional)</span>
					</span>
					{!isOpen ? <span className="truncate text-xs text-muted-foreground">CPF, nascimento, e-mail, quem atendeu, endereço</span> : null}
				</span>
				{filledCount > 0 ? (
					<span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
						{filledCount} de {totalCount} preenchidos
					</span>
				) : null}
			</button>

			{isOpen ? (
				<div className="flex flex-col gap-3 p-3.5">
					<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
						<TextInput
							label="CPF/CNPJ"
							placeholder="Opcional"
							value={client.cpfCnpj ?? ""}
							handleChange={(value) => updateClient({ cpfCnpj: formatToCPForCNPJ(value) || null })}
						/>
						<DateInput
							label="NASCIMENTO"
							value={client.dataNascimento ?? undefined}
							handleChange={(value) => updateClient({ dataNascimento: value ?? null })}
						/>
						<TextInput
							label="E-MAIL"
							placeholder="email@exemplo.com"
							inputMode="email"
							value={client.email ?? ""}
							handleChange={(value) => updateClient({ email: value || null })}
						/>
					</div>
					<SelectInput
						label="QUEM ATENDEU"
						value={client.autorVendedorId ?? null}
						options={sellers?.map((seller) => ({ id: seller.id, value: seller.id, label: seller.nome })) ?? null}
						handleChange={(value) => updateClient({ autorVendedorId: value })}
						onReset={() => updateClient({ autorVendedorId: null })}
						resetOptionLabel="O OPERADOR DESTA TRANSAÇÃO"
					/>

					<div className="overflow-hidden rounded-xl border border-dashed border-border">
						<button
							type="button"
							aria-expanded={isAddressOpen}
							onClick={() => setIsAddressOpen((prev) => !prev)}
							className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-secondary/50"
						>
							{isAddressOpen ? <ChevronDown className="size-4 min-w-4" /> : <ChevronRight className="size-4 min-w-4" />}
							<span className="text-sm font-semibold">Endereço</span>
							<span className="truncate text-xs text-muted-foreground">Pelo CEP ou colando o endereço completo</span>
						</button>
						{isAddressOpen ? <NewClientAddress client={client} updateClient={updateClient} /> : null}
					</div>
				</div>
			) : null}
		</div>
	);
}

/**
 * Endereço do cliente novo com o mesmo preenchimento automático dos outros formulários de cliente:
 * CEP completo busca rua, bairro, cidade e estado (e leva o foco ao número); um endereço colado
 * (WhatsApp, Maps, etiqueta) é lido pelo parser local e, quando ele não tem certeza, pela IA.
 * A região da organização só ajuda a reconhecer a cidade do texto — não preenche nada sozinha.
 */
function NewClientAddress({ client, updateClient }: { client: TClientState; updateClient: NewTransactionClientProps["updateClient"] }) {
	const { data: organizationRegion = null } = useOrganizationRegion();
	const autofill = useClientLocationAutofill({ location: client, updateLocation: updateClient, defaultRegion: organizationRegion });
	return (
		<div className="flex flex-col gap-3 border-t border-dashed border-border p-3">
			<ClientLocationAddressPaste autofill={autofill} />
			<div className="grid grid-cols-1 gap-3 md:grid-cols-6">
				<div className="md:col-span-2">
					<TextInput label="CEP" placeholder="00000-000" inputMode="numeric" value={client.localizacaoCep ?? ""} handleChange={autofill.handleCepChange} />
				</div>
				<div className="md:col-span-2">
					<SelectInput
						label="ESTADO"
						value={client.localizacaoEstado ?? null}
						options={BrazilianStatesOptions}
						handleChange={autofill.handleStateChange}
						onReset={() => updateClient({ localizacaoEstado: null, localizacaoCidade: null })}
						resetOptionLabel="NÃO DEFINIDO"
					/>
				</div>
				<div className="md:col-span-2">
					<SelectInput
						label="CIDADE"
						value={client.localizacaoCidade ?? null}
						options={BrazilianCitiesOptionsFromUF(client.localizacaoEstado ?? "")}
						handleChange={(value) => updateClient({ localizacaoCidade: value || null })}
						onReset={() => updateClient({ localizacaoCidade: null })}
						resetOptionLabel="NÃO DEFINIDO"
					/>
				</div>
				<div className="md:col-span-2">
					<TextInput
						label="BAIRRO"
						placeholder="Bairro"
						value={client.localizacaoBairro ?? ""}
						handleChange={(value) => updateClient({ localizacaoBairro: value || null })}
					/>
				</div>
				<div className="md:col-span-3">
					<TextInput
						label="LOGRADOURO"
						placeholder="Rua, avenida..."
						value={client.localizacaoLogradouro ?? ""}
						handleChange={(value) => updateClient({ localizacaoLogradouro: value || null })}
					/>
				</div>
				<div className="md:col-span-1">
					<TextInput
						id={autofill.numberInputId}
						label="NÚMERO"
						placeholder="Nº"
						value={client.localizacaoNumero ?? ""}
						handleChange={(value) => updateClient({ localizacaoNumero: value || null })}
					/>
				</div>
				<div className="md:col-span-6">
					<TextInput
						label="COMPLEMENTO"
						placeholder="Apartamento, bloco, referência..."
						value={client.localizacaoComplemento ?? ""}
						handleChange={(value) => updateClient({ localizacaoComplemento: value || null })}
					/>
				</div>
			</div>
		</div>
	);
}
