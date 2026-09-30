import { getClientLocationAddressByCEP, resolveClientLocationAddressFromText } from "@/lib/clients/locations";
import { formatToCEP } from "@/lib/formatting";
import type { TAddressRegion, TParsedAddress } from "@/lib/geo/address-parsing";
import { useId, useRef, useState } from "react";

export type TClientLocationAutofillStatus =
	| { kind: "IDLE" }
	| { kind: "LOADING"; message: string }
	| { kind: "SUCCESS"; message: string }
	| { kind: "ERROR"; message: string };

type UseClientLocationAutofillParams = {
	location: { localizacaoEstado?: string | null; localizacaoCidade?: string | null };
	updateLocation: (changes: Partial<TParsedAddress>) => void;
	defaultRegion?: TAddressRegion | null;
};

/**
 * Comportamento compartilhado pelos formulários de endereço de cliente (modal do PDV, bloco do
 * cadastro, página do cliente), cada um com seu próprio layout:
 *
 * - CEP completo busca o endereço e leva o foco ao número, o único campo que o CEP não resolve;
 * - trocar o estado limpa a cidade (ou volta à cidade padrão, se for o estado da organização) em
 *   vez de escolher a primeira da lista;
 * - endereço colado vira campos (`resolveClientLocationAddressFromText`).
 *
 * O status substitui os toasts: no caixa, uma linha dentro do formulário atrapalha menos.
 */
export function useClientLocationAutofill({ location, updateLocation, defaultRegion = null }: UseClientLocationAutofillParams) {
	const numberInputId = useId();
	const [status, setStatus] = useState<TClientLocationAutofillStatus>({ kind: "IDLE" });
	// Só a consulta mais recente escreve no formulário: um CEP digitado de novo, ou um segundo
	// endereço colado, não pode ser sobrescrito pela resposta atrasada do anterior.
	const latestRequestRef = useRef(0);

	function focusNumber() {
		// O preenchimento chega no próximo render; o foco espera o campo existir com o valor novo.
		requestAnimationFrame(() => document.getElementById(numberInputId)?.focus());
	}

	async function lookupCep(cep: string) {
		const requestId = ++latestRequestRef.current;
		setStatus({ kind: "LOADING", message: "Buscando CEP..." });
		const address = await getClientLocationAddressByCEP(cep);
		if (requestId !== latestRequestRef.current) return;
		if (!address) {
			setStatus({ kind: "ERROR", message: "CEP não encontrado. Preencha o endereço manualmente." });
			return;
		}
		// CEP de cidade pequena vem sem rua e sem bairro: o que o operador já digitou fica.
		updateLocation({
			localizacaoEstado: address.localizacaoEstado,
			localizacaoCidade: address.localizacaoCidade,
			...(address.localizacaoLogradouro ? { localizacaoLogradouro: address.localizacaoLogradouro } : {}),
			...(address.localizacaoBairro ? { localizacaoBairro: address.localizacaoBairro } : {}),
		});
		setStatus({ kind: "SUCCESS", message: "Endereço preenchido pelo CEP." });
		focusNumber();
	}

	function handleCepChange(value: string) {
		const formattedCep = formatToCEP(value);
		updateLocation({ localizacaoCep: formattedCep || null });
		if (formattedCep.length === 9) void lookupCep(formattedCep);
	}

	function handleStateChange(value: string | null) {
		const isDefaultState = !!value && value === defaultRegion?.localizacaoEstado;
		updateLocation({ localizacaoEstado: value || null, localizacaoCidade: isDefaultState ? defaultRegion.localizacaoCidade : null });
	}

	async function fillFromText(text: string) {
		if (!text.trim()) return;
		const requestId = ++latestRequestRef.current;
		setStatus({ kind: "LOADING", message: "Interpretando endereço..." });
		// A região do formulário, e não só a da organização: se o operador já trocou a cidade, é nela
		// que o texto deve ser lido.
		const region: TAddressRegion | null = location.localizacaoEstado
			? { localizacaoEstado: location.localizacaoEstado, localizacaoCidade: location.localizacaoCidade ?? null }
			: defaultRegion;

		const { address, source } = await resolveClientLocationAddressFromText({ text, defaultRegion: region });
		if (requestId !== latestRequestRef.current) return;
		if (!address.localizacaoLogradouro && !address.localizacaoCep) {
			setStatus({ kind: "ERROR", message: "Não foi possível reconhecer um endereço no texto." });
			return;
		}

		// O texto colado é o endereço inteiro: rua, número, bairro, complemento e CEP são substituídos
		// (um CEP antigo ao lado de uma rua nova seria pior que CEP vazio). Estado e cidade só mudam
		// quando o texto os traz — senão vale o que o formulário já tinha, normalmente a região padrão.
		const stateChanged = !!address.localizacaoEstado && address.localizacaoEstado !== location.localizacaoEstado;
		updateLocation({
			localizacaoCep: address.localizacaoCep,
			localizacaoLogradouro: address.localizacaoLogradouro,
			localizacaoNumero: address.localizacaoNumero,
			localizacaoBairro: address.localizacaoBairro,
			localizacaoComplemento: address.localizacaoComplemento,
			localizacaoEstado: address.localizacaoEstado ?? location.localizacaoEstado ?? null,
			localizacaoCidade: address.localizacaoCidade ?? (stateChanged ? null : (location.localizacaoCidade ?? null)),
		});
		setStatus({
			kind: "SUCCESS",
			message: source === "AI" ? "Endereço interpretado com IA. Confira os campos." : "Endereço preenchido. Confira os campos.",
		});
		if (!address.localizacaoNumero) focusNumber();
	}

	return {
		status,
		numberInputId,
		handleCepChange,
		handleStateChange,
		fillFromText,
	};
}

export type TUseClientLocationAutofill = ReturnType<typeof useClientLocationAutofill>;
