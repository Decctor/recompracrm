import { parseBrazilianAddress, type TAddressRegion, type TParsedAddress } from "@/lib/geo/address-parsing";
import { normalizeLocation, isKnownCityForUf } from "@/lib/geo/brazilian-locations";
import { fetchViaCepByCep, pickViaCepStreetMatch, searchViaCepByStreet } from "@/lib/geo/viacep";
import { parseClientLocationAddress } from "@/lib/mutations/clients/locations";

export type TClientLocationAddressByCEP = {
	localizacaoCep: string;
	localizacaoLogradouro: string | null;
	localizacaoBairro: string | null;
	localizacaoEstado: string | null;
	localizacaoCidade: string | null;
};

/**
 * Busca o endereço de um CEP e devolve os campos de localização já normalizados para os valores
 * canônicos de estado/cidade (utils/states-cities). Retorna null quando o CEP não é encontrado;
 * avisar o usuário é papel de quem chama.
 */
export async function getClientLocationAddressByCEP(cep: string): Promise<TClientLocationAddressByCEP | null> {
	const addressInfo = await fetchViaCepByCep(cep);
	if (!addressInfo) return null;

	const { estado, cidade } = normalizeLocation({ estado: addressInfo.uf, cidade: addressInfo.localidade });
	return {
		localizacaoCep: cep,
		localizacaoLogradouro: addressInfo.logradouro || null,
		localizacaoBairro: addressInfo.bairro || null,
		localizacaoEstado: estado,
		localizacaoCidade: cidade && isKnownCityForUf(cidade, estado) ? cidade : null,
	};
}

/**
 * Completa o endereço lido do texto com o ViaCEP. Com CEP, o ViaCEP é a fonte de rua, bairro e
 * cidade; sem CEP, a busca por logradouro na cidade (a escrita ou a da região padrão) acha o CEP
 * quando o bairro ou a numeração desempatam.
 */
async function enrichAddressWithViaCep(address: TParsedAddress, defaultRegion: TAddressRegion | null): Promise<TParsedAddress> {
	if (address.localizacaoCep) {
		const byCep = await getClientLocationAddressByCEP(address.localizacaoCep);
		if (!byCep) return address;
		return {
			...address,
			localizacaoEstado: byCep.localizacaoEstado ?? address.localizacaoEstado,
			localizacaoCidade: byCep.localizacaoCidade ?? address.localizacaoCidade,
			localizacaoBairro: byCep.localizacaoBairro ?? address.localizacaoBairro,
			// CEP de cidade pequena não tem logradouro: fica o que foi escrito.
			localizacaoLogradouro: byCep.localizacaoLogradouro ?? address.localizacaoLogradouro,
		};
	}

	if (!address.localizacaoLogradouro) return address;
	const uf = address.localizacaoEstado ?? defaultRegion?.localizacaoEstado ?? null;
	const regionCity = uf === defaultRegion?.localizacaoEstado ? defaultRegion?.localizacaoCidade : null;
	const cidade = address.localizacaoCidade ?? regionCity ?? null;
	if (!uf || !cidade) return address;

	const results = await searchViaCepByStreet({ uf, cidade, logradouro: address.localizacaoLogradouro });
	const match = pickViaCepStreetMatch({
		results,
		logradouro: address.localizacaoLogradouro,
		bairro: address.localizacaoBairro,
		numero: address.localizacaoNumero,
	});
	if (!match) return address;
	return {
		...address,
		localizacaoLogradouro: match.logradouro,
		localizacaoBairro: address.localizacaoBairro ?? match.bairro,
		localizacaoCep: match.cep,
		localizacaoEstado: address.localizacaoEstado ?? (match.cep ? uf : null),
		localizacaoCidade: address.localizacaoCidade ?? (match.cep ? cidade : null),
	};
}

export type TResolvedAddressFromText = {
	address: TParsedAddress;
	source: "LOCAL" | "AI";
};

/**
 * Transforma um endereço colado em campos do formulário, do mais barato ao mais caro: leitura local
 * (instantânea), IA só quando a leitura local não tem confiança, e o ViaCEP por cima das duas.
 * Se a IA falhar, fica a leitura local — incompleta é melhor que nada para quem está no caixa.
 */
export async function resolveClientLocationAddressFromText({
	text,
	defaultRegion,
}: {
	text: string;
	defaultRegion: TAddressRegion | null;
}): Promise<TResolvedAddressFromText> {
	const local = parseBrazilianAddress(text, { defaultRegion });

	let parsed: TResolvedAddressFromText = { address: local.address, source: "LOCAL" };
	if (!local.confident) {
		try {
			const { data } = await parseClientLocationAddress({ text, defaultRegion });
			parsed = { address: data.address, source: "AI" };
		} catch (error) {
			console.error("[CLIENT_LOCATION_AUTOFILL] Falha na interpretação por IA, usando a leitura local.", error);
		}
	}

	return { address: await enrichAddressWithViaCep(parsed.address, defaultRegion), source: parsed.source };
}
