import brazilianStates from "@/utils/jsons/brazillian-states.json";
import { BrazilStatesAndCities } from "@/utils/states-cities";

/**
 * Normalização de UF e cidade para a forma canônica usada no banco: UF sempre em sigla de duas
 * letras (`"PR"`), cidade sempre em caixa alta e acentuada (`"PONTA GROSSA"`).
 *
 * Existe porque cada integração entrega o endereço num formato diferente — a NuvemShop manda
 * `billing_province` por extenso (`"Paraná"`), o CardápioWeb já manda sigla, o iFood varia. Sem um
 * ponto único de normalização o dado entra misturado e quebra três consumidores de uma vez:
 *
 * - **Fiscal**: `buildSaleScenario` compara a UF de origem com a do destinatário para decidir se a
 *   operação é intra ou interestadual. `"PR" !== "PARANÁ"` classifica venda interna como
 *   interestadual e emite CFOP 6102 no lugar de 5102.
 * - **Campanhas**: `lib/campaigns/filters.ts` filtra público por `inArray(localizacaoEstado, ...)`,
 *   que nunca casa quando metade da base está por extenso.
 * - **Provedor fiscal**: o payload da Spedy espera a sigla no campo `state`.
 *
 * As duas fontes de verdade já existiam no repositório e são reaproveitadas aqui:
 * `utils/jsons/brazillian-states.json` (sigla + nome por extenso) e `BrazilStatesAndCities`
 * (lista oficial de municípios por UF, já em caixa alta).
 */

type TBrazilianState = { codigo_uf: number; uf: string; nome: string; regiao: string };

/** Remove acentos, colapsa espaços e sobe para caixa alta — forma comparável, não a forma final. */
export function toComparable(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.toUpperCase();
}

const STATES = brazilianStates as TBrazilianState[];

/** Siglas válidas, para reconhecer o que já está normalizado. */
const UF_CODES = new Set(STATES.map((state) => state.uf.toUpperCase()));

/** Nome por extenso (comparável) -> sigla. `"PARANA"` -> `"PR"`. */
const UF_BY_NAME = new Map(STATES.map((state) => [toComparable(state.nome), state.uf.toUpperCase()]));

/**
 * Índice cidade(comparável)+UF -> nome canônico do município, construído sob demanda.
 * Guardado num módulo-nível porque `BrazilStatesAndCities` tem ~5.500 municípios e o custo de
 * montar o índice não deve se repetir a cada linha de um backfill.
 */
let cityIndex: Map<string, string> | null = null;

function getCityIndex(): Map<string, string> {
	if (cityIndex) return cityIndex;
	const index = new Map<string, string>();
	for (const [uf, cities] of Object.entries(BrazilStatesAndCities)) {
		for (const city of cities) index.set(`${uf}|${toComparable(city)}`, city);
	}
	cityIndex = index;
	return index;
}

/**
 * Converte qualquer representação de UF na sigla canônica.
 *
 * Aceita a sigla (`"pr"`, `"PR"`) e o nome por extenso com ou sem acento (`"Paraná"`, `"parana"`).
 * Retorna `null` quando o valor é vazio ou não corresponde a nenhuma unidade federativa — nunca
 * devolve um palpite, porque uma UF errada é pior que uma UF ausente para o cálculo fiscal.
 */
export function normalizeUf(value: string | null | undefined): string | null {
	if (!value) return null;
	const comparable = toComparable(value);
	if (!comparable) return null;
	if (comparable.length === 2 && UF_CODES.has(comparable)) return comparable;
	return UF_BY_NAME.get(comparable) ?? null;
}

/**
 * Converte o nome de um município na forma canônica (caixa alta, acentuada) usada no banco.
 *
 * Quando a UF é informada e reconhecida, valida o município contra a lista oficial daquela UF e
 * devolve a grafia canônica — é o caminho que corrige acentuação e caixa de uma vez. Quando a UF é
 * desconhecida ou o município não está na lista, devolve o valor apenas saneado (caixa alta,
 * espaços colapsados), preservando o dado do cliente em vez de descartá-lo.
 */
export function normalizeCityName(value: string | null | undefined, uf?: string | null): string | null {
	if (!value) return null;
	const comparable = toComparable(value);
	if (!comparable) return null;

	const normalizedUf = normalizeUf(uf);
	if (normalizedUf) {
		const canonical = getCityIndex().get(`${normalizedUf}|${comparable}`);
		if (canonical) return canonical;
	}
	return comparable;
}

/** `true` quando o município consta da lista oficial da UF — usado para medir qualidade do dado. */
export function isKnownCityForUf(city: string | null | undefined, uf: string | null | undefined): boolean {
	const normalizedUf = normalizeUf(uf);
	if (!normalizedUf || !city) return false;
	return getCityIndex().has(`${normalizedUf}|${toComparable(city)}`);
}

export type TNormalizedLocation = { estado: string | null; cidade: string | null };

/**
 * Normaliza o par estado + cidade de uma vez. A UF é resolvida primeiro porque é ela que permite
 * validar o município contra a lista correta.
 *
 * Use este helper nos mapeadores de integração, no ponto em que o endereço externo vira entidade
 * do banco — normalizar na leitura, e não na escrita, deixaria o dado torto persistido.
 */
export function normalizeLocation({ estado, cidade }: { estado?: string | null; cidade?: string | null }): TNormalizedLocation {
	const normalizedUf = normalizeUf(estado);
	return {
		estado: normalizedUf,
		cidade: normalizeCityName(cidade, normalizedUf),
	};
}
