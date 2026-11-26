/**
 * Comparação de nomes de pessoa para os scripts de saneamento de clientes (atribuição de vendas do
 * ERP e unificação de duplicatas). Tokens sem acento e sem partículas; nome vazio ou "CLIENTE" não
 * decide nada.
 */

export type TPersonVerdict = "MESMA_PESSOA" | "OUTRA_PESSOA" | "INCERTO";
export type TPersonVerdictBasis = "CPF" | "CPF_DIVERGE_NOME_IGUAL" | "NOME" | "NOME_PARCIAL" | "SEM_DADOS";

const NAME_PARTICLES = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "D"]);

export function nameTokens(value: string | null | undefined) {
	return (value ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toUpperCase()
		.replace(/[^A-Z ]/g, " ")
		.split(/\s+/)
		.filter((token) => token.length > 0 && !NAME_PARTICLES.has(token));
}

export function isPlaceholderName(tokens: string[]) {
	return tokens.length === 0 || (tokens.length === 1 && tokens[0] === "CLIENTE");
}

// Anotações que a loja escreve no nome ("(C/ADVG)", "(C/ADVOG)") e não fazem parte dele.
const NAME_NOTE_TOKENS = new Set(["C", "ADVG", "ADVOG", "ADV"]);

/** Distância de edição com transposição (OSA). Só precisa saber se é 0, 1 ou mais. */
function editDistance(a: string, b: string) {
	const rows = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
		}
	}
	return rows[a.length][b.length];
}

/**
 * Mesmo token; abreviação de até 2 letras (AP/APARECIDA, S/SILVA); ou erro de digitação de uma
 * letra num token de 4+ letras (NEUSA/NEUZA, CRSITINA/CRISTINA).
 */
function tokensMatch(a: string, b: string): "EXATO" | "APROXIMADO" | null {
	if (a === b) return "EXATO";
	const [short, long] = a.length <= b.length ? [a, b] : [b, a];
	if (short.length <= 2 && long.length > 2 && long.startsWith(short)) return "APROXIMADO";
	if (short.length >= 4 && editDistance(a, b) === 1) return "APROXIMADO";
	return null;
}

/**
 * Para dois cadastros com o MESMO documento: os nomes são da mesma pessoa? Mais estrito que
 * `compareNames` no nome parcial (MARIA EUGENIA DA SILVA × MARIA EUNICE DA SILVA não passa) e
 * tolerante a erro de digitação (JAME/JAIME) e abreviação (AP/APARECIDA). Aceita: nomes iguais, ou o mais curto (2+ tokens,
 * mesmo primeiro nome) contido em ordem no mais longo; em ambos, até 2 tokens aproximados.
 */
export function compareNamesForSameDocument(leftName: string, rightName: string): { compatible: boolean; basis: string } {
	const a = nameTokens(leftName).filter((token) => !NAME_NOTE_TOKENS.has(token));
	const b = nameTokens(rightName).filter((token) => !NAME_NOTE_TOKENS.has(token));
	if (isPlaceholderName(a) || isPlaceholderName(b)) return { compatible: true, basis: "SEM_NOME" };

	const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
	// O primeiro nome não aceita abreviação: "M SILVA" não prova nada.
	const firstMatch = tokensMatch(shorter[0], longer[0]);
	if (!firstMatch || (firstMatch === "APROXIMADO" && shorter[0].length <= 2)) return { compatible: false, basis: "PRIMEIRO_NOME_DIFERENTE" };
	if (shorter.length < 2 && longer.length >= 2) return { compatible: false, basis: "NOME_INCOMPLETO" };

	// O mais curto precisa aparecer, em ordem, dentro do mais longo.
	let typos = 0;
	let cursor = 0;
	for (const token of shorter) {
		let found = false;
		while (cursor < longer.length) {
			const match = tokensMatch(token, longer[cursor]);
			cursor += 1;
			if (match) {
				if (match === "APROXIMADO") typos += 1;
				found = true;
				break;
			}
		}
		if (!found) return { compatible: false, basis: "SOBRENOME_DIFERENTE" };
	}
	if (typos > 2) return { compatible: false, basis: "APROXIMACAO_DEMAIS" };
	const basis = shorter.length === longer.length ? "NOME" : "NOME_CONTIDO";
	return { compatible: true, basis: typos > 0 ? `${basis}_APROXIMADO` : basis };
}

export function compareNames(leftName: string, rightName: string): { verdict: TPersonVerdict; basis: TPersonVerdictBasis } {
	const a = nameTokens(leftName);
	const b = nameTokens(rightName);
	if (isPlaceholderName(a) || isPlaceholderName(b)) return { verdict: "INCERTO", basis: "SEM_DADOS" };
	if (a.join(" ") === b.join(" ")) return { verdict: "MESMA_PESSOA", basis: "NOME" };
	if (a[0] !== b[0]) return { verdict: "OUTRA_PESSOA", basis: "NOME" };
	if (a.length > 1 && b.length > 1 && a[a.length - 1] === b[b.length - 1]) return { verdict: "MESMA_PESSOA", basis: "NOME_PARCIAL" };
	const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
	if (shorter.length >= 2 && shorter.every((token) => longer.includes(token))) return { verdict: "MESMA_PESSOA", basis: "NOME_PARCIAL" };
	// Mesmo primeiro nome, sobrenomes diferentes: pode ser cadastro abreviado ou outra pessoa.
	return { verdict: "INCERTO", basis: "NOME_PARCIAL" };
}
