import type { TFiscalSaleContext } from "@/lib/fiscal/types";
import { mapTaxRegistration, nonEmptyString, onlyDigits, sanitizeNfeText } from "./utils";

/**
 * Grupo do transportador (X03) da NFC-e com entrega a domicilio.
 *
 * A SEFAZ trata `transporta` e o indicador de presenca como um par: com indPres=4 o grupo e
 * obrigatorio (rejeicao 786) e com qualquer outro indPres ele e proibido (rejeicao 754). Por isso
 * o grupo nasce da presenca ja resolvida no payload, nao da modalidade da venda — uma entrega
 * reclassificada como presencial (classificacao excepcional) nao pode levar transportador.
 *
 * A entrega e da propria loja, entao o transportador e a empresa emitente e a modalidade e `free`
 * — "Sem Ocorrencia de Transporte" (modFrete 9). Declarar frete contratado numa entrega propria e
 * o que devolve a rejeicao 753; o valor cobrado do cliente continua no `freightAmount` dos itens e
 * do total, que e onde a NFC-e o espera.
 */
export function buildSpedyTransport({
	presenceType,
	fiscalConfiguracao,
}: {
	presenceType: string | undefined;
	fiscalConfiguracao: TFiscalSaleContext["organizacao"]["fiscalConfiguracao"];
}) {
	if (presenceType !== "delivery") return undefined;
	if (!fiscalConfiguracao?.cpfCnpj || !fiscalConfiguracao.nomeRazaoSocial) return undefined;

	const endereco = fiscalConfiguracao.endereco;
	return {
		freightModality: "free",
		carrier: {
			name: sanitizeNfeText(fiscalConfiguracao.nomeRazaoSocial, 60),
			federalTaxNumber: onlyDigits(fiscalConfiguracao.cpfCnpj),
			stateTaxNumber: mapTaxRegistration(fiscalConfiguracao.inscricaoEstadual),
			email: nonEmptyString(fiscalConfiguracao.emailFiscal),
			phone: onlyDigits(fiscalConfiguracao.telefoneFiscal),
			address: endereco
				? {
						street: sanitizeNfeText(endereco.logradouro, 60),
						district: sanitizeNfeText(endereco.bairro, 60),
						postalCode: onlyDigits(endereco.cep),
						number: sanitizeNfeText(endereco.numero, 60),
						additionalInformation: sanitizeNfeText(endereco.complemento, 60),
						city: {
							name: sanitizeNfeText(endereco.cidade, 60),
							state: endereco.uf?.toLowerCase(),
						},
						country: "BRA",
					}
				: undefined,
		},
	};
}
