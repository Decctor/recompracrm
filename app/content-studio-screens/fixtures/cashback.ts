import type { TGetCashbackProgramOutput } from "@/app/api/cashback-programs/route";
import { DEMO_ORGANIZATION_ID } from "./session";

// Episódios 001 e 005: 5% de cashback, validade de 45 dias, uso mínimo de R$ 20.
export const DEMO_CASHBACK_PROGRAM = {
	id: "content-studio-cashback",
	organizacaoId: DEMO_ORGANIZATION_ID,
	ativo: true,
	titulo: "Clube da Sorveteria",
	descricao: "5% de volta em toda compra, para usar em até 45 dias.",
	terminologia: "DINHEIRO",
	modalidadeDescontosPermitida: true,
	modalidadeRecompensasPermitida: false,
	acumuloTipo: "PERCENTUAL",
	acumuloValor: 5,
	acumuloValorParceiro: 0,
	acumuloRegraValorMinimo: 20,
	acumuloPermitirViaIntegracao: false,
	acumuloPermitirViaPontoIntegracao: true,
	acumuloRegrasPagamento: null,
	resgatePermitirViaPos: true,
	resgatePermitirViaPontoIntegracao: true,
	resgatePermitirViaLojaDigital: false,
	expiracaoRegraValidadeValor: 45,
	resgateLimiteTipo: null,
	resgateLimiteValor: null,
	dataInsercao: new Date("2026-03-01T12:00:00Z"),
	dataAtualizacao: new Date("2026-10-20T12:00:00Z"),
	recompensas: [],
} satisfies Exclude<TGetCashbackProgramOutput["data"], null>;
