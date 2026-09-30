import { splitStreetType } from "./address-parsing";
import { toComparable } from "./brazilian-locations";

/**
 * Consultas ao ViaCEP nos dois sentidos: CEP -> endereço e endereço -> CEP. As duas são silenciosas
 * (devolvem `null`/`[]` em qualquer falha) porque quem chama decide como avisar — o formulário de
 * endereço mostra uma linha de status, não um toast por consulta.
 */

export type TViaCepAddress = {
	cep: string;
	logradouro: string;
	complemento: string;
	bairro: string;
	localidade: string;
	uf: string;
};

const VIACEP_TIMEOUT_MS = 5000;

export async function fetchViaCepByCep(cep: string): Promise<TViaCepAddress | null> {
	const digits = cep.replace(/\D/g, "");
	if (digits.length !== 8) return null;
	try {
		const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(VIACEP_TIMEOUT_MS) });
		if (!response.ok) return null;
		const data = (await response.json()) as TViaCepAddress | { erro: true };
		if ("erro" in data) return null;
		return data;
	} catch {
		return null;
	}
}

/**
 * Busca por logradouro dentro de uma cidade. O ViaCEP ignora acento e caixa, mas não entende tipo
 * abreviado ("R Quinze de Novembro" volta vazio), então a busca vai só com o nome.
 */
export async function searchViaCepByStreet({
	uf,
	cidade,
	logradouro,
}: {
	uf: string;
	cidade: string;
	logradouro: string;
}): Promise<TViaCepAddress[]> {
	const name = splitStreetType(logradouro).name;
	// Mínimos do ViaCEP: UF com 2 letras, cidade e logradouro com 3 caracteres.
	if (uf.length !== 2 || cidade.trim().length < 3 || name.trim().length < 3) return [];
	const path = [uf, cidade.trim(), name.trim()].map(encodeURIComponent).join("/");
	try {
		const response = await fetch(`https://viacep.com.br/ws/${path}/json/`, { signal: AbortSignal.timeout(VIACEP_TIMEOUT_MS) });
		if (!response.ok) return [];
		const data = (await response.json()) as TViaCepAddress[] | { erro: true };
		return Array.isArray(data) ? data : [];
	} catch {
		return [];
	}
}

type TNumberRange = { min: number | null; max: number | null; parity: "EVEN" | "ODD" | null };

/**
 * Lê a faixa de numeração do `complemento` do ViaCEP: "até 1099/1100", "de 1047 a 1865 - lado
 * ímpar", "de 1101/1102 ao fim", "lado par". Complemento que começa por número ("522") é CEP de
 * grande usuário — um prédio específico — e volta como `"SPECIFIC"`.
 */
export function parseViaCepNumberRange(complemento: string): TNumberRange | "SPECIFIC" | null {
	const value = toComparable(complemento);
	if (!value) return null;
	// Faixas sempre começam por "de", "até" ou "lado"; começar por número é endereço de um prédio
	// ("522", "1374 12 Andar").
	if (/^\d/.test(value)) return "SPECIFIC";

	const parity = /LADO IMPAR/.test(value) ? "ODD" : /LADO PAR/.test(value) ? "EVEN" : null;
	const pair = (first: string, second?: string) => [Number(first), second ? Number(second) : Number(first)];

	const between = value.match(/DE (\d+)(?:\/(\d+))? A (\d+)(?:\/(\d+))?/);
	if (between) {
		return { min: Math.min(...pair(between[1], between[2])), max: Math.max(...pair(between[3], between[4])), parity };
	}
	const fromOn = value.match(/DE (\d+)(?:\/(\d+))? AO FIM/);
	if (fromOn) return { min: Math.min(...pair(fromOn[1], fromOn[2])), max: null, parity };
	const upTo = value.match(/ATE (\d+)(?:\/(\d+))?/);
	if (upTo) return { min: null, max: Math.max(...pair(upTo[1], upTo[2])), parity };
	if (parity) return { min: null, max: null, parity };
	return null;
}

function numberFitsRange(numero: number, complemento: string) {
	const range = parseViaCepNumberRange(complemento);
	if (range === "SPECIFIC") return false;
	if (!range) return true;
	if (range.min !== null && numero < range.min) return false;
	if (range.max !== null && numero > range.max) return false;
	if (range.parity === "EVEN" && numero % 2 !== 0) return false;
	if (range.parity === "ODD" && numero % 2 === 0) return false;
	return true;
}

export type TViaCepStreetMatch = {
	logradouro: string;
	bairro: string | null;
	cep: string | null;
};

/**
 * Escolhe, entre os resultados da busca por logradouro, o que corresponde ao endereço digitado.
 *
 * Uma rua longa tem vários CEPs (por bairro, por faixa de numeração, por prédio). O CEP só é
 * devolvido quando sobra um candidato; com vários no mesmo bairro, sai só o bairro; com bairros
 * diferentes ("Balduíno Taques" passa por Centro, Órfãs e Estrela), sai só a grafia do logradouro.
 */
export function pickViaCepStreetMatch({
	results,
	logradouro,
	bairro,
	numero,
}: {
	results: TViaCepAddress[];
	logradouro: string;
	bairro?: string | null;
	numero?: string | null;
}): TViaCepStreetMatch | null {
	const target = splitStreetType(logradouro);
	const targetName = toComparable(target.name);

	let candidates = results.filter((result) => {
		const street = splitStreetType(result.logradouro);
		if (toComparable(street.name) !== targetName) return false;
		// "Paulista" casa com "Avenida Paulista" e com "Viela Paulista": o tipo digitado desempata.
		return !target.type || !street.type || street.type === target.type;
	});
	if (candidates.length === 0) return null;

	const general = candidates.filter((result) => parseViaCepNumberRange(result.complemento) !== "SPECIFIC");
	if (general.length > 0) candidates = general;

	if (bairro) {
		const sameNeighborhood = candidates.filter((result) => toComparable(result.bairro) === toComparable(bairro));
		if (sameNeighborhood.length > 0) candidates = sameNeighborhood;
	}

	const houseNumber = numero ? Number.parseInt(numero, 10) : Number.NaN;
	if (Number.isFinite(houseNumber)) {
		const inRange = candidates.filter((result) => numberFitsRange(houseNumber, result.complemento));
		if (inRange.length > 0) candidates = inRange;
	}

	const neighborhoods = [...new Set(candidates.map((result) => result.bairro).filter(Boolean))];
	const streets = new Set(candidates.map((result) => result.logradouro));
	return {
		// Grafias diferentes sobrando ("Avenida Paulista" e "Viela Paulista"): mantém o que foi digitado.
		logradouro: streets.size === 1 ? candidates[0].logradouro : logradouro,
		bairro: neighborhoods.length === 1 ? neighborhoods[0] : null,
		cep: candidates.length === 1 ? candidates[0].cep : null,
	};
}
