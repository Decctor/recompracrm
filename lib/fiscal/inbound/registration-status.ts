import type {
	TFiscalInboundManifestEventEnum,
	TFiscalInboundRegistrationStatusEnum,
	TFiscalInboundSituacaoEnum,
	TPurchaseStatusEnum,
} from "@/schemas/enums";

/**
 * Onde a nota recebida está diante das compras. Derivada, nunca gravada — a mesma regra existe em SQL
 * (`buildInboundRegistrationStatusSql` em `lib/fiscal/inbound/index.ts`), e as duas mudam juntas:
 *
 * 1. Cancelada ou denegada na SEFAZ → CANCELADA: não há o que registrar.
 * 2. Ligada a uma compra que não foi cancelada → REGISTRADA.
 * 3. Desconhecida ou marcada como não realizada → DESCONSIDERADA: não vira compra.
 * 4. O resto → A_REGISTRAR.
 */
export function resolveInboundRegistrationStatus(doc: {
	situacao: TFiscalInboundSituacaoEnum | null;
	manifestacaoAtual: TFiscalInboundManifestEventEnum | null;
	compra: { status: TPurchaseStatusEnum } | null;
}): TFiscalInboundRegistrationStatusEnum {
	if (doc.situacao === "CANCELADA" || doc.situacao === "DENEGADA") return "CANCELADA";
	if (doc.compra && doc.compra.status !== "CANCELADA") return "REGISTRADA";
	if (doc.manifestacaoAtual === "DESCONHECIMENTO" || doc.manifestacaoAtual === "NAO_REALIZADA") return "DESCONSIDERADA";
	return "A_REGISTRAR";
}

/** Número e série da NF-e lidos da chave de acesso (posições fixas do leiaute: série 23-25, número 26-34). */
export function parseAccessKeyNumber(chaveAcesso: string) {
	const digits = chaveAcesso.replace(/[^0-9]/g, "");
	if (digits.length !== 44) return { numero: null, serie: null };
	return { numero: String(Number(digits.slice(25, 34))), serie: String(Number(digits.slice(22, 25))) };
}

/** Opção sintética do filtro de manifestação: nota sem manifestação alguma. */
export const INBOUND_WITHOUT_MANIFEST_FILTER = "SEM_MANIFESTACAO";
