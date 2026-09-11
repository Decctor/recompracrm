"use client";

import { BrandLogo } from "@/components/Brand/BrandLogo";
import { PrintDock, type TPrintDockContextValue } from "@/components/Print/PrintDock";
import {
	REWARDS_PAPER_SIZES,
	type TRewardsDisplayLayout,
	type TRewardsPaperOrientation,
	type TRewardsPaperSize,
	describeRewardsDisplayLayout,
	measureWidestCashbackValue,
	paginateRewards,
	resolveRewardsDisplayLayout,
	splitCashbackValue,
} from "@/lib/cashback/rewards-display-layout";
import { formatDecimalPlaces, formatNameAsInitials } from "@/lib/formatting";
import { RectangleHorizontal, RectangleVertical } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./cashback-rewards-display.module.css";

export type TCashbackRewardsPaperSize = TRewardsPaperSize;
export type TCashbackRewardsPaperOrientation = TRewardsPaperOrientation;

type TPrize = {
	id: string;
	titulo: string;
	descricao: string | null;
	valor: number;
	imagemCapaUrl: string | null;
};

type TProgram = {
	titulo: string;
	descricao: string | null;
	terminologia: "DINHEIRO" | "PONTOS";
	acumuloTipo: "FIXO" | "PERCENTUAL";
	acumuloValor: number;
	acumuloRegraValorMinimo: number;
	expiracaoRegraValidadeValor: number;
};

type CashbackRewardsDisplayPageProps = {
	organization: { nome: string; logoUrl: string | null };
	program: TProgram;
	prizes: TPrize[];
	initialSize: TCashbackRewardsPaperSize;
	initialOrientation: TCashbackRewardsPaperOrientation;
};

/** Constante do CSS: 96px por polegada. Converte milímetro em pixel para escalar a folha na tela. */
const PX_PER_MM = 96 / 25.4;

function getAccumulationCopy(program: TProgram) {
	const currency = program.terminologia === "PONTOS" ? "pontos" : "saldo";
	if (program.acumuloTipo === "PERCENTUAL") {
		if (program.acumuloValor <= 0) return "Programa sem acúmulo ativo";
		return `${formatDecimalPlaces(program.acumuloValor)}% de cada compra vira ${currency}`;
	}
	if (program.acumuloValor <= 0) return "Programa sem acúmulo ativo";
	const gain =
		program.terminologia === "PONTOS" ? `${formatDecimalPlaces(program.acumuloValor)} pontos` : `R$ ${formatDecimalPlaces(program.acumuloValor, 2, 2)}`;
	if (program.acumuloRegraValorMinimo > 0) return `${gain} a cada compra de R$ ${formatDecimalPlaces(program.acumuloRegraValorMinimo, 0, 0)} ou mais`;
	return `${gain} a cada compra`;
}

/**
 * Converte o preço em cashback no esforço que ele custa — é a informação que faz o cliente decidir,
 * e a única coisa na célula que ele não consegue calcular sozinho olhando para a folha.
 */
function getRequirementCopy(prize: TPrize, program: TProgram) {
	if (program.acumuloValor <= 0) return null;
	if (program.acumuloTipo === "PERCENTUAL") {
		return `≈ R$ ${formatDecimalPlaces(prize.valor / (program.acumuloValor / 100), 0, 0)} em compras`;
	}
	const purchases = Math.ceil(prize.valor / program.acumuloValor);
	if (program.acumuloRegraValorMinimo > 0) return `≈ ${purchases} compras de R$ ${formatDecimalPlaces(program.acumuloRegraValorMinimo, 0, 0)}`;
	return `≈ ${purchases} ${purchases === 1 ? "compra" : "compras"}`;
}

function updatePreviewUrl(size: TCashbackRewardsPaperSize, orientation: TCashbackRewardsPaperOrientation) {
	const url = new URL(window.location.href);
	url.searchParams.set("size", size);
	url.searchParams.set("orientation", orientation);
	window.history.replaceState(null, "", url);
}

/** Escala a folha para caber na largura disponível da tela; na impressão o CSS devolve o 1:1. */
function usePreviewScale(sheetWidthMm: number) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [availableWidth, setAvailableWidth] = useState(0);

	useEffect(() => {
		const node = containerRef.current;
		if (!node) return;
		const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	const scale = availableWidth > 0 ? Math.min(1, availableWidth / (sheetWidthMm * PX_PER_MM)) : 1;
	return { containerRef, scale };
}

function getSheetStyle(layout: TRewardsDisplayLayout) {
	return {
		"--sheet-w": `${layout.paper.width}mm`,
		"--sheet-h": `${layout.paper.height}mm`,
		"--band-masthead": `${layout.bands.masthead}mm`,
		"--band-rule": `${layout.bands.rule}mm`,
		"--band-footer": `${layout.bands.footer}mm`,
		"--inset": `${layout.bands.inset}mm`,
		"--gutter": `${layout.bands.gutter}mm`,
		"--cell-w": `${layout.cell.width}mm`,
		"--cell-pad-x": `${layout.padding.x}mm`,
		"--cell-pad-y": `${layout.padding.y}mm`,
		"--cell-gap": `${layout.gap}mm`,
		"--media-w": `${layout.media.width}mm`,
		"--media-h": `${layout.media.height}mm`,
		"--leader": `${layout.leader}mm`,
		"--t-title": `${layout.type.title}mm`,
		"--t-value": `${layout.type.value}mm`,
		"--t-cents": `${layout.type.cents}mm`,
		"--t-meta": `${layout.type.meta}mm`,
		"--t-desc": `${layout.type.description}mm`,
		"--title-lines": layout.titleLines,
	} as CSSProperties;
}

function PrizePrice({ prize, program }: { prize: TPrize; program: TProgram }) {
	const parts = splitCashbackValue(prize.valor, program.terminologia);
	return (
		<div className={styles.price}>
			{parts.prefix ? <span className={styles.pricePrefix}>{parts.prefix}</span> : null}
			<span className={styles.priceAmount}>{parts.amount}</span>
			{parts.cents ? <span className={styles.priceCents}>{parts.cents}</span> : null}
			{parts.suffix ? <span className={styles.priceSuffix}>{parts.suffix}</span> : null}
		</div>
	);
}

function PrizeMedia({ prize }: { prize: TPrize }) {
	return (
		<div className={styles.media}>
			{prize.imagemCapaUrl ? (
				// biome-ignore lint/performance/noImgElement: a folha é impressa em milímetros e a URL é externa à organização.
				<img src={prize.imagemCapaUrl} alt="" />
			) : (
				<span className={styles.mediaInitial}>{prize.titulo.trim().charAt(0).toUpperCase() || "?"}</span>
			)}
		</div>
	);
}

function PrizeCell({ prize, program, layout }: { prize: TPrize; program: TProgram; layout: TRewardsDisplayLayout }) {
	const requirement = layout.show.requirement ? getRequirementCopy(prize, program) : null;

	if (layout.composition === "menu") {
		return (
			<article className={styles.cell}>
				<PrizeMedia prize={prize} />
				<div className={styles.menuBody}>
					<div className={styles.menuText}>
						<h2 className={styles.cellTitle}>{prize.titulo}</h2>
						{requirement ? <p className={styles.cellMeta}>{requirement}</p> : null}
					</div>
					<span className={styles.leader} aria-hidden="true" />
					<PrizePrice prize={prize} program={program} />
				</div>
			</article>
		);
	}

	return (
		<article className={styles.cell}>
			<PrizeMedia prize={prize} />
			<h2 className={styles.cellTitle}>{prize.titulo}</h2>
			{layout.show.description && prize.descricao ? <p className={styles.cellDescription}>{prize.descricao}</p> : null}
			<PrizePrice prize={prize} program={program} />
			{requirement ? <p className={styles.cellMeta}>{requirement}</p> : null}
		</article>
	);
}

function Sheet({
	organization,
	program,
	layout,
	rows,
	pageIndex,
	pageCount,
}: {
	organization: CashbackRewardsDisplayPageProps["organization"];
	program: TProgram;
	layout: TRewardsDisplayLayout;
	rows: TPrize[][];
	pageIndex: number;
	pageCount: number;
}) {
	const accumulation = getAccumulationCopy(program);
	const validity = program.expiracaoRegraValidadeValor > 0 ? `${formatDecimalPlaces(program.expiracaoRegraValidadeValor)} dias` : null;
	// Sem a faixa de regras, a regra de acúmulo sobe para a tarja e a validade desce para o rodapé.
	const isCompact = layout.chrome === "compact";
	const note = isCompact ? accumulation : program.descricao;
	const finePrint =
		isCompact && validity
			? `Saldo válido por ${validity}. Consulte disponibilidade no atendimento.`
			: "Consulte disponibilidade no atendimento. Valores sujeitos às regras do programa.";

	return (
		// As custom properties ficam no frame, não na folha: é o frame que precisa de `--sheet-w` para
		// reservar a altura da folha escalada na tela. Custom property herda; medida não.
		<div className={styles.sheetFrame} style={getSheetStyle(layout)}>
			<article className={styles.sheet} data-composition={layout.composition}>
				<header className={styles.masthead}>
					<div className={styles.mark}>
						{organization.logoUrl ? (
							// biome-ignore lint/performance/noImgElement: a folha é impressa em milímetros e a URL é externa à organização.
							<img src={organization.logoUrl} alt="" />
						) : (
							<span className={styles.markInitials}>{formatNameAsInitials(organization.nome)}</span>
						)}
					</div>
					<div className={styles.identity}>
						<span className={styles.eyebrow}>{organization.nome}</span>
						<h1 className={styles.programTitle}>{program.titulo}</h1>
						{note ? <p className={styles.programNote}>{note}</p> : null}
					</div>
					{/* Uma frase, não rótulo + valor: "SEU SALDO" prometia um número e entregava sempre a
					    mesma instrução, então o rótulo só ocupava espaço na tarja. */}
					<div className={styles.callout}>
						<span className={styles.calloutText}>Consulte seu saldo no caixa</span>
					</div>
				</header>

				{isCompact ? null : (
					<div className={styles.ruleBand}>
						<div className={styles.rule}>
							<span className={styles.ruleLabel}>Como acumular</span>
							<span className={styles.ruleValue}>{accumulation}</span>
						</div>
						{validity ? (
							<div className={styles.rule}>
								<span className={styles.ruleLabel}>Validade</span>
								<span className={styles.ruleValue}>{validity}</span>
							</div>
						) : null}
					</div>
				)}

				<div className={styles.grid}>
					{rows.map((row) => (
						<div key={row[0].id} className={styles.row}>
							{row.map((prize) => (
								<PrizeCell key={prize.id} prize={prize} program={program} layout={layout} />
							))}
						</div>
					))}
				</div>

				<footer className={styles.footer}>
					<p className={styles.finePrint}>{finePrint}</p>
					<div className={styles.footerMark}>
						{pageCount > 1 ? (
							<span className={styles.pageNumber}>
								{pageIndex + 1}/{pageCount}
							</span>
						) : null}
						<BrandLogo lockup="horizontal-badge" tone="color-on-light" alt="RecompraCRM" />
					</div>
				</footer>
			</article>
		</div>
	);
}

export default function CashbackRewardsDisplayPage({
	organization,
	program,
	prizes,
	initialSize,
	initialOrientation,
}: CashbackRewardsDisplayPageProps) {
	const [paperSize, setPaperSize] = useState(initialSize);
	const [orientation, setOrientation] = useState(initialOrientation);

	// A maior coluna de valor dimensiona a grade inteira: um programa em pontos com cinco dígitos
	// não cabe nas mesmas colunas de um em reais com dois.
	const valueAdvanceEm = useMemo(
		() =>
			measureWidestCashbackValue(
				prizes.map((prize) => prize.valor),
				program.terminologia,
			),
		[prizes, program.terminologia],
	);
	const layout = useMemo(
		() => resolveRewardsDisplayLayout({ size: paperSize, orientation, prizeCount: prizes.length, valueAdvanceEm }),
		[orientation, paperSize, prizes.length, valueAdvanceEm],
	);
	const pages = useMemo(() => paginateRewards(prizes, layout), [layout, prizes]);
	const { containerRef, scale } = usePreviewScale(layout.paper.width);

	// O pôster carrega a escolha na URL (o lojista compartilha o link já no tamanho certo), então ele
	// monta o próprio valor do dock em vez de usar o estado local de `useLocalPrintDock`.
	const dock = useMemo<TPrintDockContextValue>(
		() => ({
			state: { selections: { size: paperSize, orientation } },
			actions: {
				select: (groupId, value) => {
					if (groupId === "size") setPaperSize(value as TCashbackRewardsPaperSize);
					if (groupId === "orientation") setOrientation(value as TCashbackRewardsPaperOrientation);
				},
				print: () => window.print(),
			},
			meta: { title: "Pôster de recompensas", subject: organization.nome },
		}),
		[orientation, organization.nome, paperSize],
	);

	useEffect(() => updatePreviewUrl(paperSize, orientation), [orientation, paperSize]);

	return (
		// Fundo neutro de bancada, não o tom da organização: a folha é branca e precisa ler como papel
		// pousado sobre uma superfície. O tint da marca aqui disputaria atenção com o próprio pôster.
		<main className="min-h-screen bg-muted">
			<style>{`@page { size: ${layout.paper.width}mm ${layout.paper.height}mm; margin: 0; }`}</style>

			<PrintDock.Provider {...dock}>
				<PrintDock.Frame>
					<PrintDock.Identity />

					<PrintDock.Divider />
					<PrintDock.Options groupId="size" label="Tamanho do papel">
						{REWARDS_PAPER_SIZES.map((size) => (
							<PrintDock.Option key={size} value={size}>
								{size}
							</PrintDock.Option>
						))}
					</PrintDock.Options>
					<PrintDock.Options groupId="orientation" label="Orientação do papel">
						<PrintDock.Option value="portrait" label="Retrato">
							<RectangleVertical className="size-4" aria-hidden="true" />
						</PrintDock.Option>
						<PrintDock.Option value="landscape" label="Paisagem">
							<RectangleHorizontal className="size-4" aria-hidden="true" />
						</PrintDock.Option>
					</PrintDock.Options>
					<PrintDock.Divider />
					<PrintDock.Readout>
						<PrintDock.ReadoutValue>{describeRewardsDisplayLayout(layout)}</PrintDock.ReadoutValue>
						<PrintDock.ReadoutNote>
							{prizes.length} {prizes.length === 1 ? "recompensa" : "recompensas"}
							{layout.legibility === "tight" ? " · letra no limite, um papel maior respira" : ""}
						</PrintDock.ReadoutNote>
					</PrintDock.Readout>
					<PrintDock.Print />
				</PrintDock.Frame>
			</PrintDock.Provider>

			<div ref={containerRef} className="mx-auto w-full max-w-7xl px-4 pt-10 pb-32 sm:px-6 print:max-w-none print:p-0">
				<div className="flex flex-col items-center gap-10 print:block print:gap-0" style={{ "--preview-scale": scale } as CSSProperties}>
					{pages.map((rows, pageIndex) => (
						<Sheet
							key={rows[0][0].id}
							organization={organization}
							program={program}
							layout={layout}
							rows={rows}
							pageIndex={pageIndex}
							pageCount={pages.length}
						/>
					))}
				</div>
			</div>
		</main>
	);
}
