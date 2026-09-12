"use client";

import ClientAddressesSection from "./_components/ClientAddressesSection";
import ClientContactSection from "./_components/ClientContactSection";
import ClientFiscalSection from "./_components/ClientFiscalSection";
import ClientIdentificationSection from "./_components/ClientIdentificationSection";
import ClientRelationshipSection from "./_components/ClientRelationshipSection";
import { type TClientRegistryClient, getClientRegistryCompleteness, mapClientToState } from "@/lib/clients/client-registry-state";
import { useClientSectionEditor } from "@/state-hooks/use-client-section-editor";
import { useMemo } from "react";

type ClientRegistryTabProps = {
	client: TClientRegistryClient;
	callbacks: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

/**
 * Cadastro do cliente, editável no lugar — mesmo contrato do cadastro de produto: cada seção tem o
 * próprio rascunho e a própria barra de aplicar, e nada vai ao servidor sem o usuário mandar.
 *
 * Os campos essenciais em falta são medidos contra o cliente do servidor, não contra o rascunho:
 * o destaque âmbar marca o que ainda não foi preenchido de verdade, e não some enquanto o usuário
 * digita — some quando ele aplica.
 */
export default function ClientRegistryTab({ client, callbacks }: ClientRegistryTabProps) {
	const identificationEditor = useClientSectionEditor({ client, section: "identification", callbacks });
	const contactEditor = useClientSectionEditor({ client, section: "contact", callbacks });
	const addressesEditor = useClientSectionEditor({ client, section: "addresses", callbacks });
	const fiscalEditor = useClientSectionEditor({ client, section: "fiscal", callbacks });
	const relationshipEditor = useClientSectionEditor({ client, section: "relationship", callbacks });

	const missingFields = useMemo(() => getClientRegistryCompleteness(mapClientToState(client)).camposFaltantes, [client]);

	return (
		<div className="flex w-full flex-col gap-6">
			<ClientIdentificationSection editor={identificationEditor} idExterno={client.idExterno ?? null} missingFields={missingFields} />
			<ClientContactSection editor={contactEditor} missingFields={missingFields} />
			<ClientAddressesSection editor={addressesEditor} missingFields={missingFields} />
			<div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-2">
				<ClientFiscalSection editor={fiscalEditor} />
				<ClientRelationshipSection editor={relationshipEditor} consentimentoMarketingData={client.consentimentoMarketingData ?? null} />
			</div>
		</div>
	);
}
