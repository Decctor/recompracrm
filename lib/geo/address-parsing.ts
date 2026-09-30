import { BrazilStatesAndCities } from "@/utils/states-cities";
import { isKnownCityForUf, normalizeCityName, normalizeUf, toComparable } from "./brazilian-locations";

/**
 * Leitura local de um endereço colado como texto livre ("R. Quinze de Novembro, 512 - Centro, Ponta
 * Grossa - PR, 84010-020"), sem rede. É o primeiro degrau do preenchimento automático: resolve na
 * hora o formato do Google Maps, o de etiqueta ("Rua: ... / Bairro: ...") e o das mensagens curtas
 * de WhatsApp. O que ela não entende com segurança sai com `confident: false`, e quem chama decide
 * se paga a interpretação por IA.
 *
 * Nunca completa estado/cidade com a região padrão da organização: a região só ajuda a reconhecer a
 * cidade escrita no texto. Completar com o padrão é papel do formulário, que já nasce com ele.
 */

export type TParsedAddress = {
	localizacaoCep: string | null;
	localizacaoEstado: string | null;
	localizacaoCidade: string | null;
	localizacaoBairro: string | null;
	localizacaoLogradouro: string | null;
	localizacaoNumero: string | null;
	localizacaoComplemento: string | null;
};

export type TAddressRegion = {
	localizacaoEstado: string | null;
	localizacaoCidade: string | null;
};

export type TAddressParseResult = {
	address: TParsedAddress;
	/**
	 * `true` quando o logradouro foi reconhecido por tipo ("Rua", "Av.") ou por etiqueta e nenhum
	 * trecho do texto ficou sem lugar. Um endereço com sobras pode estar certo, mas não dá para saber.
	 */
	confident: boolean;
};

export const EMPTY_PARSED_ADDRESS: TParsedAddress = {
	localizacaoCep: null,
	localizacaoEstado: null,
	localizacaoCidade: null,
	localizacaoBairro: null,
	localizacaoLogradouro: null,
	localizacaoNumero: null,
	localizacaoComplemento: null,
};

// Tipo de logradouro comparável (sem acento, caixa alta) -> forma por extenso.
const STREET_TYPES: Record<string, string> = {
	RUA: "Rua",
	R: "Rua",
	AVENIDA: "Avenida",
	AV: "Avenida",
	AVN: "Avenida",
	ALAMEDA: "Alameda",
	AL: "Alameda",
	TRAVESSA: "Travessa",
	TV: "Travessa",
	TRAV: "Travessa",
	RODOVIA: "Rodovia",
	ROD: "Rodovia",
	ESTRADA: "Estrada",
	EST: "Estrada",
	PRACA: "Praça",
	PC: "Praça",
	PCA: "Praça",
	LARGO: "Largo",
	LGO: "Largo",
	VIELA: "Viela",
	SERVIDAO: "Servidão",
	SERV: "Servidão",
	BECO: "Beco",
	PASSAGEM: "Passagem",
	LADEIRA: "Ladeira",
	VIADUTO: "Viaduto",
};

const STREET_TYPE_PATTERN = new RegExp(`^(${Object.keys(STREET_TYPES).join("|")})(?:\\.\\s*|\\s+)(.+)$`);

/**
 * Separa o tipo do nome do logradouro: `"R. Quinze de Novembro"` -> `{ type: "Rua", name: "Quinze de
 * Novembro" }`. Sem tipo reconhecido, o texto inteiro é o nome.
 */
export function splitStreetType(value: string): { type: string | null; name: string } {
	const trimmed = value.trim().normalize("NFC");
	// Mesmo tamanho no original e no comparável: NFD + remoção de acento não muda a contagem de
	// caracteres-base, então o índice do nome vale nos dois.
	const comparable = trimmed
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toUpperCase();
	const match = comparable.match(STREET_TYPE_PATTERN);
	if (!match) return { type: null, name: trimmed };
	const name = trimmed.slice(trimmed.length - match[2].length).trim();
	return { type: STREET_TYPES[match[1]], name };
}

/** O trecho é só o tipo, sem nome: "Rua", "Av." — o que vem depois ainda é nome, não número. */
function isBareStreetType(value: string) {
	return Object.hasOwn(STREET_TYPES, toComparable(value).replace(/\.$/, ""));
}

const CEP_PATTERN = /\b(\d{2})\.?(\d{3})-(\d{3})\b/;
const LABELED_CEP_PATTERN = /\bcep\s*[:.]?\s*(\d{2})\.?(\d{3})-?(\d{3})\b/i;
const BARE_CEP_SEGMENT_PATTERN = /^(\d{5})(\d{3})$/;

const NUMBER_PATTERN = /^(?:n[º°o.]?\s*|n[uú]mero\s*)?(\d{1,6}\s?[A-Za-z]?)$/i;
const NO_NUMBER_PATTERN = /^(?:s\s?\/\s?n[º°o]?|sem n[uú]mero)$/i;

const COMPLEMENT_KEYWORDS =
	"ap(?:to|t|artamento)?\\.?|bl(?:oco)?\\.?|casa|fundos|sala|sl\\.?|conj(?:unto)?\\.?|cj\\.?|andar|lote|lt\\.?|quadra|qd\\.?|torre|ed(?:if[ií]cio)?\\.?|cond(?:om[ií]nio)?\\.?|kitnet|sobrado|loja|box|galp[aã]o|port[aã]o|perto|pr[oó]x(?:imo)?\\.?|em frente|ao lado|esquina|ref(?:er[eê]ncia)?\\.?";
const COMPLEMENT_PATTERN = new RegExp(`^(?:${COMPLEMENT_KEYWORDS})(?=\\s|\\d|$)`, "i");
// Complemento colado no logradouro depois do número: "Rua X 45 apto 12".
const INLINE_COMPLEMENT_PATTERN = new RegExp(`^(.*?\\d+\\s?[A-Za-z]?)\\s+((?:${COMPLEMENT_KEYWORDS})(?=\\s|\\d|$).*)$`, "i");

const NEIGHBORHOOD_LABEL_PATTERN = /^bairro\s+(.+)$/i;
const NEIGHBORHOOD_PREFIX_PATTERN = /^(?:jardim|jd\.?|vila|vl\.?|parque|pq\.?|residencial|res\.?|n[uú]cleo|conjunto habitacional)\s/i;

const COUNTRY_NAMES = new Set(["BRASIL", "BRAZIL"]);

type TFieldLabel = "LOGRADOURO" | "NUMERO" | "COMPLEMENTO" | "BAIRRO" | "CIDADE" | "ESTADO";
const FIELD_LABELS: { pattern: RegExp; field: TFieldLabel; streetType?: string }[] = [
	{ pattern: /^(?:endere[cç]o|logradouro)$/i, field: "LOGRADOURO" },
	{ pattern: /^rua$/i, field: "LOGRADOURO", streetType: "Rua" },
	{ pattern: /^avenida$/i, field: "LOGRADOURO", streetType: "Avenida" },
	{ pattern: /^(?:n[uú]mero|num|n[º°o]?)$/i, field: "NUMERO" },
	{ pattern: /^(?:complemento|compl|refer[eê]ncia|ponto de refer[eê]ncia|ref)$/i, field: "COMPLEMENTO" },
	{ pattern: /^bairro$/i, field: "BAIRRO" },
	{ pattern: /^(?:cidade|munic[ií]pio)$/i, field: "CIDADE" },
	{ pattern: /^(?:estado|uf)$/i, field: "ESTADO" },
];
const LABELED_SEGMENT_PATTERN = /^([^:=]{1,25}?)\s*[:=]\s*(.+)$/;

function formatCep(first: string, second: string, third: string) {
	return `${first}${second}-${third}`;
}

function extractCep(text: string): { cep: string | null; rest: string } {
	const labeled = text.match(LABELED_CEP_PATTERN);
	if (labeled) return { cep: formatCep(labeled[1], labeled[2], labeled[3]), rest: text.replace(labeled[0], " ") };
	const formatted = text.match(CEP_PATTERN);
	if (formatted) return { cep: formatCep(formatted[1], formatted[2], formatted[3]), rest: text.replace(formatted[0], " ") };
	return { cep: null, rest: text };
}

function splitSegments(text: string): string[] {
	return text
		.replace(/\r/g, "")
		.split(/\n|,|;|\s+[-–—|]\s+/)
		.map((segment) =>
			segment
				.trim()
				.replace(/^[-–—•*:\s]+/, "")
				.replace(/[\s.]+$/, "")
				.trim(),
		)
		.filter(Boolean);
}

/** Cidade/UF colados: "Ponta Grossa/PR", "Ponta Grossa-PR". */
function splitCityUf(segment: string): { city: string; uf: string } | null {
	const match = segment.match(/^(.+?)\s*[/-]\s*([A-Za-z]{2})$/);
	if (!match) return null;
	const uf = normalizeUf(match[2]);
	if (!uf || match[2].length !== 2) return null;
	return { city: match[1].trim(), uf };
}

function isTwoLetterUf(segment: string) {
	return segment.trim().length === 2 && normalizeUf(segment) !== null;
}

/** Município que existe em uma única UF. Homônimos não resolvem — sem UF, é chute. */
function findUniqueCity(segment: string): { city: string; uf: string } | null {
	const comparable = toComparable(segment);
	let found: { city: string; uf: string } | null = null;
	for (const [uf, cities] of Object.entries(BrazilStatesAndCities)) {
		for (const city of cities) {
			if (toComparable(city) !== comparable) continue;
			if (found) return null;
			found = { city, uf };
		}
	}
	return found;
}

function normalizeNumber(value: string) {
	if (NO_NUMBER_PATTERN.test(value.trim())) return "S/N";
	const match = value.trim().match(NUMBER_PATTERN);
	return match ? match[1].replace(/\s/g, "").toUpperCase() : value.trim();
}

type TStreetParts = { logradouro: string; numero: string | null; complemento: string | null; sobra: string | null };

/**
 * Lê um trecho que é logradouro: expande o tipo abreviado, separa o número do fim e o complemento
 * que vier depois do número. Um trecho que continua depois do número sem ser complemento
 * ("rua x 45 centro ponta grossa") volta como sobra — é a forma de dizer que a leitura é incerta.
 */
function parseStreetSegment(segment: string): TStreetParts {
	let head = segment.trim();
	let complemento: string | null = null;

	const inlineComplement = head.match(INLINE_COMPLEMENT_PATTERN);
	if (inlineComplement) {
		head = inlineComplement[1].trim();
		complemento = inlineComplement[2].trim();
	}

	let numero: string | null = null;
	let sobra: string | null = null;
	const trailingNumber = head.match(/^(.*?\S)\s*,?\s+(?:n[º°o.]?\s*|n[uú]mero\s*)?(\d{1,6}\s?[A-Za-z]?|s\s?\/\s?n)$/i);
	if (trailingNumber && !isBareStreetType(trailingNumber[1])) {
		head = trailingNumber[1].trim();
		numero = normalizeNumber(trailingNumber[2]);
	} else {
		// Número no meio do trecho. Não vale quando o que vem antes é só o tipo ("Rua 7 de Setembro")
		// nem quando o que vem depois continua o nome ("15 de Novembro").
		for (const match of head.matchAll(/\s(?:n[º°o.]?\s*)?(\d{1,6})\s+(?=\S)/gi)) {
			const before = head.slice(0, match.index).replace(/[\s,]+$/, "");
			const after = head.slice(match.index + match[0].length).trim();
			if (!before || isBareStreetType(before) || /^(?:de|do|da|dos|das)\b/i.test(after)) continue;
			head = before;
			numero = match[1];
			sobra = after;
			break;
		}
	}

	const { type, name } = splitStreetType(head);
	return { logradouro: type ? `${type} ${name}` : head, numero, complemento, sobra };
}

type TSegmentKind =
	| { kind: "STREET"; parts: TStreetParts; byType: boolean }
	| { kind: "NUMBER"; value: string }
	| { kind: "COMPLEMENT"; value: string }
	| { kind: "NEIGHBORHOOD"; value: string }
	| { kind: "CITY"; value: string }
	| { kind: "STATE"; value: string }
	| { kind: "UNKNOWN"; value: string };

function classifyLabeled(field: TFieldLabel, value: string, streetType?: string): TSegmentKind {
	switch (field) {
		case "LOGRADOURO": {
			const withType = streetType && !splitStreetType(value).type ? `${streetType} ${value}` : value;
			return { kind: "STREET", parts: parseStreetSegment(withType), byType: true };
		}
		case "NUMERO":
			return { kind: "NUMBER", value: normalizeNumber(value) };
		case "COMPLEMENTO":
			return { kind: "COMPLEMENT", value };
		case "BAIRRO":
			return { kind: "NEIGHBORHOOD", value };
		case "CIDADE":
			return { kind: "CITY", value };
		case "ESTADO":
			return { kind: "STATE", value };
	}
}

export function parseBrazilianAddress(text: string, options: { defaultRegion?: TAddressRegion | null } = {}): TAddressParseResult {
	const { cep, rest } = extractCep(text);
	const address: TParsedAddress = { ...EMPTY_PARSED_ADDRESS, localizacaoCep: cep };
	const complements: string[] = [];
	const leftovers: string[] = [];

	const segments: string[] = [];
	for (const segment of splitSegments(rest)) {
		const cityUf = splitCityUf(segment);
		if (cityUf) segments.push(cityUf.city, cityUf.uf);
		else segments.push(segment);
	}

	// A UF explícita vem primeiro: é ela que decide em qual lista procurar a cidade.
	const explicitUf = segments.find(isTwoLetterUf);
	const cityUf = explicitUf ? normalizeUf(explicitUf) : (options.defaultRegion?.localizacaoEstado ?? null);

	const classified: TSegmentKind[] = segments.map((segment) => {
		const labeled = segment.match(LABELED_SEGMENT_PATTERN);
		if (labeled) {
			const label = FIELD_LABELS.find((candidate) => candidate.pattern.test(labeled[1].trim()));
			if (label) return classifyLabeled(label.field, labeled[2].trim(), label.streetType);
		}

		const comparable = toComparable(segment);
		if (COUNTRY_NAMES.has(comparable)) return { kind: "UNKNOWN", value: "" };
		if (!address.localizacaoCep && BARE_CEP_SEGMENT_PATTERN.test(comparable)) {
			const [, first, second] = comparable.match(BARE_CEP_SEGMENT_PATTERN)!;
			address.localizacaoCep = `${first}-${second}`;
			return { kind: "UNKNOWN", value: "" };
		}
		if (isTwoLetterUf(segment)) return { kind: "STATE", value: segment };
		if (NUMBER_PATTERN.test(segment) || NO_NUMBER_PATTERN.test(segment)) return { kind: "NUMBER", value: normalizeNumber(segment) };
		if (splitStreetType(segment).type) return { kind: "STREET", parts: parseStreetSegment(segment), byType: true };
		if (COMPLEMENT_PATTERN.test(segment)) return { kind: "COMPLEMENT", value: segment };
		const neighborhood = segment.match(NEIGHBORHOOD_LABEL_PATTERN);
		if (neighborhood) return { kind: "NEIGHBORHOOD", value: neighborhood[1].trim() };
		if (NEIGHBORHOOD_PREFIX_PATTERN.test(segment)) return { kind: "NEIGHBORHOOD", value: segment };
		if (cityUf && isKnownCityForUf(segment, cityUf)) return { kind: "CITY", value: segment };
		if (normalizeUf(segment)) return { kind: "STATE", value: segment };
		return { kind: "UNKNOWN", value: segment };
	});

	// Dois trechos que casam com cidade da UF: no formato brasileiro o bairro vem antes da cidade,
	// então só o último fica como cidade ("Estrela" é bairro de Ponta Grossa e município do RS).
	const cityIndexes = classified.flatMap((segment, index) => (segment.kind === "CITY" ? [index] : []));
	for (const index of cityIndexes.slice(0, -1)) classified[index] = { kind: "UNKNOWN", value: (classified[index] as { value: string }).value };

	let streetByType = false;
	const unknown: string[] = [];
	for (const segment of classified) {
		switch (segment.kind) {
			case "STREET":
				if (address.localizacaoLogradouro) {
					unknown.push(segment.parts.logradouro);
					break;
				}
				address.localizacaoLogradouro = segment.parts.logradouro;
				address.localizacaoNumero ??= segment.parts.numero;
				if (segment.parts.complemento) complements.push(segment.parts.complemento);
				if (segment.parts.sobra) leftovers.push(segment.parts.sobra);
				streetByType = segment.byType;
				break;
			case "NUMBER":
				if (address.localizacaoNumero) complements.push(segment.value);
				else address.localizacaoNumero = segment.value;
				break;
			case "COMPLEMENT":
				complements.push(segment.value);
				break;
			case "NEIGHBORHOOD":
				address.localizacaoBairro ??= segment.value;
				break;
			case "CITY":
				address.localizacaoCidade ??= segment.value;
				break;
			case "STATE":
				address.localizacaoEstado ??= normalizeUf(segment.value);
				break;
			case "UNKNOWN":
				if (segment.value) unknown.push(segment.value);
				break;
		}
	}

	// Sem UF nem região, uma cidade só é aceita se o nome existe em uma única UF.
	if (!address.localizacaoCidade && !cityUf) {
		const uniqueIndex = unknown.findIndex((segment) => findUniqueCity(segment));
		if (uniqueIndex >= 0) {
			const unique = findUniqueCity(unknown[uniqueIndex])!;
			address.localizacaoCidade = unique.city;
			address.localizacaoEstado ??= unique.uf;
			unknown.splice(uniqueIndex, 1);
		}
	}

	// Trechos sem tipo, na ordem em que o brasileiro escreve: logradouro, depois bairro. O resto é
	// sobra — vai para o complemento, mas derruba a confiança.
	if (!address.localizacaoLogradouro && unknown.length > 0) {
		const parts = parseStreetSegment(unknown.shift()!);
		address.localizacaoLogradouro = parts.logradouro;
		address.localizacaoNumero ??= parts.numero;
		if (parts.complemento) complements.push(parts.complemento);
		if (parts.sobra) leftovers.push(parts.sobra);
	}
	if (!address.localizacaoBairro && unknown.length > 0) address.localizacaoBairro = unknown.shift()!;
	leftovers.push(...unknown);

	const estado = address.localizacaoEstado ?? cityUf;
	address.localizacaoCidade = address.localizacaoCidade ? normalizeCityName(address.localizacaoCidade, estado) : null;
	// Cidade fora da lista oficial não entra: o formulário escolhe cidade de uma lista fechada.
	if (address.localizacaoCidade && !isKnownCityForUf(address.localizacaoCidade, estado)) address.localizacaoCidade = null;
	if (address.localizacaoCidade && !address.localizacaoEstado) address.localizacaoEstado = estado;

	const allComplements = [...complements, ...leftovers];
	address.localizacaoComplemento = allComplements.length > 0 ? allComplements.join(", ") : null;

	return {
		address,
		confident: streetByType && leftovers.length === 0,
	};
}
