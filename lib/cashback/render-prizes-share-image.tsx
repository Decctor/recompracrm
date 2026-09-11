import { renderBrandAssetPng } from "@/lib/brand/render";
import sharp from "sharp";

export type TCashbackPrizesShareImageMode = "summary" | "promoting";

export type TCashbackPrizesShareImagePrize = {
	titulo: string;
	valor: number;
	imagemCapaUrl: string | null;
};

type RenderCashbackPrizesShareImageInput = {
	mode: TCashbackPrizesShareImageMode;
	organization: {
		nome: string;
		logoUrl: string | null;
		corPrimaria: string | null;
		corSecundaria: string | null;
	};
	program: {
		titulo: string;
		terminologia: "DINHEIRO" | "PONTOS";
		acumuloTipo: "FIXO" | "PERCENTUAL";
		acumuloValor: number;
		acumuloRegraValorMinimo: number;
		expiracaoRegraValidadeValor: number;
	};
	prizes: TCashbackPrizesShareImagePrize[];
};

const WIDTH = 1080;
const COLUMNS = 5;
const CARD_WIDTH = 184;
const CARD_HEIGHT = 270;
const GAP = 13;

function formatNumber(value: number) {
	return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function formatMoney(value: number) {
	return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(value);
}

function formatCashbackValue(value: number, terminology: "DINHEIRO" | "PONTOS") {
	return terminology === "PONTOS" ? `${formatNumber(value)} pontos` : formatMoney(value);
}

async function loadImageAsPngDataUrl(source: string | null, width: number, height: number) {
	if (!source) return null;
	try {
		const response = await fetch(source, { signal: AbortSignal.timeout(8_000) });
		if (!response.ok) return null;
		const png = await sharp(Buffer.from(await response.arrayBuffer()))
			.resize({ width, height, fit: "contain", withoutEnlargement: true })
			.png()
			.toBuffer();
		return `data:image/png;base64,${png.toString("base64")}`;
	} catch {
		return null;
	}
}

function getAccumulationCopy(program: RenderCashbackPrizesShareImageInput["program"]) {
	if (program.acumuloTipo === "PERCENTUAL") {
		return `${formatNumber(program.acumuloValor)}% do valor das compras vira ${program.terminologia === "PONTOS" ? "pontos" : "saldo"}`;
	}
	return `${formatCashbackValue(program.acumuloValor, program.terminologia)} por compra válida`;
}

function getRequirementCopy({ prizeValue, program }: { prizeValue: number; program: RenderCashbackPrizesShareImageInput["program"] }) {
	if (program.acumuloTipo === "PERCENTUAL") {
		if (program.acumuloValor <= 0) return "Acúmulo indisponível";
		return `Gasto estimado: ${formatMoney(prizeValue / (program.acumuloValor / 100))}`;
	}
	if (program.acumuloValor <= 0) return "Acúmulo indisponível";
	const purchases = Math.ceil(prizeValue / program.acumuloValor);
	const minimumPurchase = program.acumuloRegraValorMinimo;
	return minimumPurchase > 0 ? `${formatNumber(purchases)} compras de ${formatMoney(minimumPurchase)}+` : `${formatNumber(purchases)} compras válidas`;
}

export async function renderCashbackPrizesShareImage({ mode, organization, program, prizes }: RenderCashbackPrizesShareImageInput) {
	if (mode !== "summary") throw new Error("Modo de imagem ainda não implementado.");

	const [logo, prizesWithImages] = await Promise.all([
		loadImageAsPngDataUrl(organization.logoUrl, 340, 224),
		Promise.all(
			prizes.map(async (prize) => ({
				...prize,
				image: await loadImageAsPngDataUrl(prize.imagemCapaUrl, 300, 236),
			})),
		),
	]);
	const rows = Math.ceil(prizes.length / COLUMNS);
	const height = 380 + rows * CARD_HEIGHT + Math.max(0, rows - 1) * GAP;
	const primaryColor = organization.corPrimaria ?? "#153f75";
	const accentColor = organization.corSecundaria ?? "#d7e2ee";
	const validityCopy = program.expiracaoRegraValidadeValor > 0 ? `Saldo válido por ${formatNumber(program.expiracaoRegraValidadeValor)} dias.` : null;

	return renderBrandAssetPng({
		width: WIDTH,
		height,
		element: (
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					width: "100%",
					height: "100%",
					padding: "52px 54px 40px",
					fontFamily: "Outfit",
					color: "#17243a",
					background: "#f4f7fa",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "126px" }}>
					<div style={{ display: "flex", flexDirection: "column", width: "720px" }}>
						<div style={{ display: "flex", fontSize: "22px", fontWeight: 600, color: primaryColor }}>{organization.nome}</div>
						<div style={{ display: "flex", marginTop: "8px", fontSize: "46px", fontWeight: 700 }}>Resumo dos prêmios</div>
						<div style={{ display: "flex", marginTop: "5px", fontSize: "18px", color: "#64748b" }}>{program.titulo}</div>
					</div>
					{logo ? <img src={logo} style={{ width: "170px", height: "112px", objectFit: "contain" }} /> : null}
				</div>

				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						marginTop: "18px",
						marginBottom: "24px",
						padding: "18px 24px",
						borderRadius: "14px",
						borderLeft: `7px solid ${accentColor}`,
						background: primaryColor,
						color: "white",
					}}
				>
					<div style={{ display: "flex", flexDirection: "column" }}>
						<div style={{ display: "flex", fontSize: "21px", fontWeight: 700 }}>Regra de acúmulo</div>
						<div style={{ display: "flex", marginTop: "3px", fontSize: "17px", opacity: 0.86 }}>{getAccumulationCopy(program)}</div>
					</div>
					<div style={{ display: "flex", fontSize: "19px", fontWeight: 700 }}>{prizes.length} prêmios ativos</div>
				</div>

				<div style={{ display: "flex", flexWrap: "wrap", gap: `${GAP}px`, alignContent: "flex-start" }}>
					{prizesWithImages.map((prize, index) => (
						<div
							key={`${prize.titulo}-${index}`}
							style={{
								display: "flex",
								flexDirection: "column",
								width: `${CARD_WIDTH}px`,
								height: `${CARD_HEIGHT}px`,
								padding: "12px",
								border: "1.5px solid #d9e2ec",
								borderRadius: "14px",
								background: "white",
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									height: "128px",
									borderRadius: "9px",
									background: "#f5f7fa",
									overflow: "hidden",
								}}
							>
								{prize.image ? (
									<img src={prize.image} style={{ width: "150px", height: "118px", objectFit: "contain" }} />
								) : (
									<div
										style={{
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											width: "54px",
											height: "54px",
											borderRadius: "50%",
											background: "#e5eaf0",
											color: "#7b8794",
											fontSize: "27px",
										}}
									>
										★
									</div>
								)}
							</div>
							<div style={{ display: "flex", height: "50px", marginTop: "9px", fontSize: "15px", fontWeight: 700, lineHeight: 1.14, overflow: "hidden" }}>
								{prize.titulo}
							</div>
							<div style={{ display: "flex", fontSize: "20px", fontWeight: 700, color: primaryColor }}>
								{formatCashbackValue(prize.valor, program.terminologia)}
							</div>
							<div style={{ display: "flex", marginTop: "3px", fontSize: "12px", color: "#64748b" }}>
								{getRequirementCopy({ prizeValue: prize.valor, program })}
							</div>
						</div>
					))}
				</div>

				<div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: "18px", fontSize: "14px", color: "#64748b" }}>
					<div style={{ display: "flex" }}>Valores sujeitos às regras do programa.</div>
					{validityCopy ? <div style={{ display: "flex" }}>{validityCopy}</div> : null}
				</div>
			</div>
		),
	});
}
