import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { OrgColorsProvider } from "@/components/Providers/OrgColorsProvider";
import { REWARDS_PAPER_ORIENTATIONS, REWARDS_PAPER_SIZES } from "@/lib/cashback/rewards-display-layout";
import { derivePoiTheme, getPoiThemeStyle } from "@/lib/point-of-interaction/theme";
import { db } from "@/services/drizzle";
import CashbackRewardsDisplayPage, { type TCashbackRewardsPaperOrientation, type TCashbackRewardsPaperSize } from "./cashback-rewards-display-page";

const PAPER_SIZES = new Set<TCashbackRewardsPaperSize>(REWARDS_PAPER_SIZES);
const PAPER_ORIENTATIONS = new Set<TCashbackRewardsPaperOrientation>(REWARDS_PAPER_ORIENTATIONS);

function readSearchParam(value: string | string[] | undefined) {
	return Array.isArray(value) ? value[0] : value;
}

export default async function CashbackRewardsDisplay({
	params,
	searchParams,
}: {
	params: Promise<{ orgId: string }>;
	searchParams: Promise<{ size?: string | string[]; orientation?: string | string[] }>;
}) {
	const [{ orgId }, rawSearchParams] = await Promise.all([params, searchParams]);
	if (!orgId) return <ErrorComponent msg="Oops, parâmetro inválido." />;

	const sizeParam = readSearchParam(rawSearchParams.size)?.toUpperCase() as TCashbackRewardsPaperSize | undefined;
	const orientationParam = readSearchParam(rawSearchParams.orientation)?.toLowerCase() as TCashbackRewardsPaperOrientation | undefined;
	const initialSize = sizeParam && PAPER_SIZES.has(sizeParam) ? sizeParam : "A4";
	const initialOrientation = orientationParam && PAPER_ORIENTATIONS.has(orientationParam) ? orientationParam : "portrait";

	const [organization, program] = await Promise.all([
		db.query.organizations.findFirst({
			where: (fields, { eq }) => eq(fields.id, orgId),
			columns: {
				id: true,
				nome: true,
				logoUrl: true,
				corPrimaria: true,
				corPrimariaForeground: true,
				corSecundaria: true,
				corSecundariaForeground: true,
			},
		}),
		db.query.cashbackPrograms.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.organizacaoId, orgId), eq(fields.ativo, true)),
			columns: {
				id: true,
				titulo: true,
				descricao: true,
				terminologia: true,
				acumuloTipo: true,
				acumuloValor: true,
				acumuloRegraValorMinimo: true,
				expiracaoRegraValidadeValor: true,
			},
			with: {
				recompensas: {
					where: (fields, { eq }) => eq(fields.ativo, true),
					orderBy: (fields, { asc }) => [asc(fields.valor), asc(fields.titulo)],
					columns: { id: true, titulo: true, descricao: true, valor: true, imagemCapaUrl: true },
					with: {
						produto: { columns: { imagemCapaUrl: true } },
						produtoVariante: { columns: { imagemCapaUrl: true } },
					},
				},
			},
		}),
	]);

	if (!organization) return <ErrorComponent msg="Organização não encontrada." />;
	if (!program) return <ErrorComponent msg="Programa de cashback ativo não encontrado." />;
	if (program.recompensas.length === 0) return <ErrorComponent msg="O programa não possui recompensas ativas para imprimir." />;

	const prizes = program.recompensas.map((prize) => ({
		id: prize.id,
		titulo: prize.titulo,
		descricao: prize.descricao,
		valor: prize.valor,
		imagemCapaUrl: prize.imagemCapaUrl ?? prize.produtoVariante?.imagemCapaUrl ?? prize.produto?.imagemCapaUrl ?? null,
	}));
	const theme = derivePoiTheme(organization);

	return (
		<OrgColorsProvider
			corPrimaria={organization.corPrimaria}
			corPrimariaForeground={organization.corPrimariaForeground}
			corSecundaria={organization.corSecundaria}
			corSecundariaForeground={organization.corSecundariaForeground}
			scoped
		>
			<div className="contents" style={getPoiThemeStyle(theme)}>
				<CashbackRewardsDisplayPage
					organization={{ nome: organization.nome, logoUrl: organization.logoUrl }}
					program={{
						titulo: program.titulo,
						descricao: program.descricao,
						terminologia: program.terminologia,
						acumuloTipo: program.acumuloTipo,
						acumuloValor: program.acumuloValor,
						acumuloRegraValorMinimo: program.acumuloRegraValorMinimo,
						expiracaoRegraValidadeValor: program.expiracaoRegraValidadeValor,
					}}
					prizes={prizes}
					initialSize={initialSize}
					initialOrientation={initialOrientation}
				/>
			</div>
		</OrgColorsProvider>
	);
}
