import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { OrgColorsProvider } from "@/components/Providers/OrgColorsProvider";
import { db } from "@/services/drizzle";
import { redirect } from "next/navigation";
import NewSaleContent from "./new-transaction-page";

export default async function NewSalePage({
	params,
	searchParams,
}: {
	params: Promise<{ orgId: string }>;
	searchParams: Promise<{ clientId?: string; filledOperatorPassword?: string; mode?: string; intent?: string }>;
}) {
	const { orgId } = await params;
	const { clientId, filledOperatorPassword, mode, intent } = await searchParams;
	const interfaceMode = mode === "mobile" ? "mobile" : "kiosk";
	// Intenção declarada no hub (?intent=pontuar|resgatar) — só enviesa o modo inicial do wizard,
	// nunca destrava algo que as flags do programa não permitam.
	const interfaceIntent = intent === "pontuar" || intent === "resgatar" ? intent : null;

	if (!orgId) {
		return <ErrorComponent msg="Oops, parâmetro inválido." />;
	}

	// clientId is now required - redirect to hub if missing
	if (!clientId) {
		const modeParam = interfaceMode === "mobile" ? "?mode=mobile" : "";
		redirect(`/point-of-interaction/${orgId}${modeParam}`);
	}

	const org = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, orgId),
		columns: {
			id: true,
			cnpj: true,
			nome: true,
			logoUrl: true,
			telefone: true,
			corPrimaria: true,
			corPrimariaForeground: true,
			corSecundaria: true,
			corSecundariaForeground: true,
			poiConfirmacaoValorObrigatoria: true,
		},
	});
	if (!org) {
		return <ErrorComponent msg="Organização não encontrada" />;
	}

	// Validate that the client exists and belongs to this org
	const clientRecord = await db.query.clients.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, clientId), eq(fields.organizacaoId, orgId)),
		columns: { id: true },
	});
	if (!clientRecord) {
		const modeParam = interfaceMode === "mobile" ? "?mode=mobile" : "";
		redirect(`/point-of-interaction/${orgId}${modeParam}`);
	}

	const prizes = await db.query.cashbackProgramPrizes.findMany({
		where: (fields, { and, eq }) => and(eq(fields.organizacaoId, orgId), eq(fields.ativo, true)),
		columns: {
			id: true,
			titulo: true,
			descricao: true,
			imagemCapaUrl: true,
			valor: true,
		},
		with: {
			produto: {
				columns: {
					grupo: true,
					precoVenda: true,
				},
			},
			produtoVariante: {
				columns: {
					precoVenda: true,
				},
			},
		},
	});

	const normalizedPrizes = prizes.flatMap((prize) => {
		const valorVenda = prize.produtoVariante?.precoVenda ?? prize.produto?.precoVenda ?? 0;
		return [{ ...prize, valorVenda }];
	});
	const cashbackProgramConfig = await db.query.cashbackPrograms.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.organizacaoId, orgId), eq(fields.ativo, true)),
		columns: {
			terminologia: true,
			modalidadeDescontosPermitida: true,
			modalidadeRecompensasPermitida: true,
			acumuloPermitirViaPontoIntegracao: true,
			resgatePermitirViaPontoIntegracao: true,
		},
	});

	const orgWithCashbackConfig = {
		...org,
		terminologia: cashbackProgramConfig?.terminologia ?? "DINHEIRO",
		modalidadeDescontosPermitida: cashbackProgramConfig?.modalidadeDescontosPermitida ?? true,
		modalidadeRecompensasPermitida: cashbackProgramConfig?.modalidadeRecompensasPermitida ?? false,
		// Sem programa ativo não há acúmulo nem resgate a permitir — fail-closed, igual ao 403 da API de transação.
		acumuloPermitirViaPontoIntegracao: cashbackProgramConfig?.acumuloPermitirViaPontoIntegracao ?? false,
		resgatePermitirViaPontoIntegracao: cashbackProgramConfig?.resgatePermitirViaPontoIntegracao ?? false,
	};

	return (
		<OrgColorsProvider
			corPrimaria={org.corPrimaria}
			corPrimariaForeground={org.corPrimariaForeground}
			corSecundaria={org.corSecundaria}
			corSecundariaForeground={org.corSecundariaForeground}
		>
			<NewSaleContent
				org={orgWithCashbackConfig}
				clientId={clientId}
				prizes={normalizedPrizes}
				initialOperatorPassword={filledOperatorPassword}
				mode={interfaceMode}
				intent={interfaceIntent}
			/>
		</OrgColorsProvider>
	);
}
