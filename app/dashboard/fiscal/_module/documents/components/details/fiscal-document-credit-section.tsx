import { Section } from "@/components/ui/section";
import { FiscalCreditDecisionEnum, FiscalSaleDestinationEnum } from "@/schemas/enums";
import { z } from "zod";

const SnapshotSchema = z.object({
	creditoIcms: z.object({
		fiscalDestinacao: FiscalSaleDestinationEnum.nullish(),
		fiscalCreditoIcms: FiscalCreditDecisionEnum.nullish(),
		competencia: z.string(),
		valorTotal: z.number(),
		mensagem: z.string(),
		parcelas: z.array(z.object({ percentual: z.number(), valor: z.number() })),
		autorId: z.string().nullish(),
		origem: z.string().optional(),
		dataDeclaracao: z.string().nullish(),
	}),
});

export function FiscalDocumentCreditSection({ snapshot }: { snapshot: string | null }) {
	if (!snapshot) return null;
	let parsed;
	try {
		parsed = SnapshotSchema.safeParse(JSON.parse(snapshot));
	} catch {
		return null;
	}
	if (!parsed.success) return null;
	const credit = parsed.data.creditoIcms;
	if (!credit.fiscalDestinacao && !credit.fiscalCreditoIcms && !credit.parcelas.length) return null;
	const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
	return (
		<Section.Root>
			<Section.Header>
				<Section.Title>Crédito de ICMS do Simples</Section.Title>
			</Section.Header>
			<Section.Body>
				<dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
					<div>
						<dt className="text-muted-foreground">Destinação declarada</dt>
						<dd>
							{credit.fiscalDestinacao === "REVENDA_INDUSTRIALIZACAO"
								? "Revenda ou industrialização"
								: credit.fiscalDestinacao === "CONSUMO_FINAL"
									? "Uso ou consumo final"
									: "Não informada"}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Tratamento</dt>
						<dd>
							{credit.fiscalCreditoIcms === "COM_CREDITO"
								? "Com crédito nos itens elegíveis"
								: credit.fiscalCreditoIcms === "SEM_CREDITO"
									? "Sem crédito"
									: "Não confirmado"}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Competência utilizada</dt>
						<dd>{credit.competencia}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Crédito informado</dt>
						<dd>{currency(credit.valorTotal)}</dd>
					</div>
					{credit.parcelas.map((part) => (
						<div key={part.percentual}>
							<dt className="text-muted-foreground">Alíquota {part.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%</dt>
							<dd>{currency(part.valor)}</dd>
						</div>
					))}
					<div>
						<dt className="text-muted-foreground">Origem</dt>
						<dd>{credit.origem === "MANUAL" ? "Emissão manual" : "Emissão automática"}</dd>
					</div>
					{credit.dataDeclaracao ? (
						<div>
							<dt className="text-muted-foreground">Registro da decisão</dt>
							<dd>
								{new Date(credit.dataDeclaracao).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
								{credit.autorId ? ` · Responsável: ${credit.autorId}` : " · Sistema"}
							</dd>
						</div>
					) : null}
				</dl>
				{credit.mensagem ? <p className="break-words text-sm text-muted-foreground">{credit.mensagem}</p> : null}
			</Section.Body>
		</Section.Root>
	);
}
