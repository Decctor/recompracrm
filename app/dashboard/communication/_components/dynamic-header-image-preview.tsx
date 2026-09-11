"use client";

import { BrandLogo } from "@/components/Brand/BrandLogo";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { hexToHsl, hexToRgba } from "@/components/Providers/OrgColorsProvider";
import { type TMessageTemplateDynamicHeaderPresetId } from "@/lib/message-templates/headers/dynamic-presets";
import { getDefaultMessageTemplateVariableExample } from "@/lib/message-templates/variables";

const RECOMPRA_BRAND_BLUE = "#24549C";

export type OrganizationTemplateTheme = {
	name: string;
	logoUrl: string | null;
	primaryColor: string;
	primaryForeground: string;
	secondaryColor: string;
	secondaryForeground: string;
};

export function DynamicHeaderImagePreview({
	presetId,
	organizationTheme,
	className,
}: {
	presetId: TMessageTemplateDynamicHeaderPresetId;
	organizationTheme: OrganizationTemplateTheme;
	className?: string;
}) {
	const sample = getDynamicHeaderPresetSample(presetId);
	const palette = buildThemePalette(organizationTheme);
	const gradientStyle = getPrimaryGradientStyle(organizationTheme.primaryColor);
	const currency = parseCurrencyDisplay(sample.cashbackValue);

	return (
		<div
			className={cn(
				"relative isolate flex aspect-[1.91/1] w-full overflow-hidden rounded-[clamp(0.65rem,2.4cqw,0.9rem)] text-left [container-type:inline-size]",
				className,
			)}
			style={{
				...gradientStyle,
				color: organizationTheme.primaryForeground,
				fontFamily: "var(--font-outfit, Outfit), ui-sans-serif, system-ui, sans-serif",
			}}
			aria-label="Prévia da imagem dinâmica do cabeçalho"
		>
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.09]"
				style={{
					backgroundImage: `radial-gradient(circle, ${organizationTheme.primaryForeground} 1px, transparent 1px)`,
					backgroundSize: "14px 14px",
				}}
			/>
			<div
				className="pointer-events-none absolute -right-[12%] -bottom-[28%] h-[72%] w-[52%] rounded-full opacity-[0.22]"
				style={{
					background: `radial-gradient(circle, ${hexToRgba(organizationTheme.secondaryColor, 0.55)} 0%, transparent 68%)`,
				}}
			/>

			<div className="relative z-10 flex h-full w-full flex-col">
				<div className="flex flex-1 flex-col justify-between p-[clamp(0.78rem,4cqw,1.12rem)] pb-[clamp(0.5rem,2.4cqw,0.72rem)]">
					<BrandHeader organizationTheme={organizationTheme} palette={palette} />

					<div className="max-w-[88%]">
						<p className="text-[clamp(0.46rem,1.72cqw,0.58rem)] font-bold uppercase tracking-[0.14em]" style={{ color: palette.foregroundSoft }}>
							{sample.clientName}, olha seu saldo
						</p>

						<div
							className="mt-[clamp(0.28rem,1.35cqw,0.44rem)] flex items-baseline gap-[0.12em] leading-none"
							style={{ fontVariantNumeric: "tabular-nums" }}
						>
							{currency.prefix ? (
								<span className="shrink-0 text-[clamp(1.05rem,5.8cqw,1.45rem)] font-bold tracking-[-0.03em]" style={{ color: palette.foregroundSoft }}>
									{currency.prefix}
								</span>
							) : null}
							<span className="text-[clamp(2.15rem,12.8cqw,3.15rem)] font-black tracking-[-0.045em]">{currency.amount}</span>
						</div>

						<p
							className="mt-[clamp(0.32rem,1.5cqw,0.46rem)] max-w-[16rem] text-[clamp(0.54rem,2cqw,0.68rem)] font-semibold leading-snug"
							style={{ color: palette.foregroundSoft }}
						>
							Use como desconto na próxima compra.
						</p>
					</div>
				</div>

				<CardFooter expirationLabel={sample.expirationLabel} palette={palette} />
			</div>
		</div>
	);
}

type ThemePalette = ReturnType<typeof buildThemePalette>;

function buildThemePalette(organizationTheme: OrganizationTemplateTheme) {
	const primaryDeep = shadeHexColor(organizationTheme.primaryColor, -32);

	return {
		primaryDeep,
		foregroundSoft: withAlpha(organizationTheme.primaryForeground, 0.9),
		foregroundMuted: withAlpha(organizationTheme.primaryForeground, 0.62),
	};
}

function getPrimaryGradientStyle(primaryColor: string): CSSProperties {
	const primaryHsl = hexToHsl(primaryColor);
	const lighterColor = `hsl(${primaryHsl.h}, ${Math.min(primaryHsl.s, 72)}%, ${Math.min(primaryHsl.l + 22, 88)}%)`;

	return {
		background: `linear-gradient(128deg, ${lighterColor} 0%, ${primaryColor} 52%, ${shadeHexColor(primaryColor, -18)} 100%)`,
	};
}

function BrandHeader({ organizationTheme, palette }: { organizationTheme: OrganizationTemplateTheme; palette: ThemePalette }) {
	return (
		<div className="flex min-w-0 items-center gap-[clamp(0.5rem,2.4cqw,0.68rem)]">
			<div
				className="flex size-[clamp(1.75rem,8cqw,2.35rem)] shrink-0 items-center justify-center overflow-hidden rounded-[clamp(0.5rem,2.2cqw,0.7rem)] bg-white shadow-md"
				style={{
					boxShadow: `0 4px 14px -4px ${withAlpha(palette.primaryDeep, 0.45)}`,
				}}
			>
				{organizationTheme.logoUrl ? (
					<img src={organizationTheme.logoUrl} alt="" className="h-full w-full object-cover" />
				) : (
					<span className="text-[clamp(0.58rem,2.2cqw,0.72rem)] font-extrabold" style={{ color: organizationTheme.primaryColor }}>
						{organizationTheme.name.slice(0, 2).toUpperCase()}
					</span>
				)}
			</div>
			<div className="min-w-0">
				<p className="truncate text-[clamp(0.72rem,3.1cqw,0.94rem)] font-extrabold leading-none tracking-[-0.02em]">{organizationTheme.name}</p>
				<p className="mt-[0.35em] text-[clamp(0.44rem,1.55cqw,0.54rem)] font-bold uppercase tracking-[0.12em]" style={{ color: palette.foregroundMuted }}>
					Programa de cashback
				</p>
			</div>
		</div>
	);
}

function CardFooter({ expirationLabel, palette }: { expirationLabel: string; palette: ThemePalette }) {
	return (
		<div
			className="flex items-center justify-between gap-3 px-[clamp(0.78rem,4cqw,1.12rem)] py-[clamp(0.38rem,1.85cqw,0.52rem)]"
			style={{
				backgroundColor: RECOMPRA_BRAND_BLUE,
				borderTop: `1px solid white`,
			}}
		>
			<span className="min-w-0 truncate text-[clamp(0.5rem,1.85cqw,0.62rem)] font-semibold leading-tight" style={{ color: palette.foregroundSoft }}>
				{expirationLabel}
			</span>
			<div className="flex shrink-0 items-center">
				<div className="relative h-[clamp(1rem,2.75cqw,0.92rem)] w-[clamp(4rem,15cqw,4.2rem)]">
					<BrandLogo lockup="horizontal" tone="color-on-dark" alt="RecompraCRM" fill className="object-contain object-center" sizes="96px" />
				</div>
			</div>
		</div>
	);
}

function parseCurrencyDisplay(value: string) {
	const match = value.trim().match(/^(R\$\s*)(.+)$/i);
	if (!match) return { prefix: "", amount: value };
	return { prefix: "R$", amount: match[2].trim() };
}

function getDynamicHeaderPresetSample(presetId: TMessageTemplateDynamicHeaderPresetId) {
	if (presetId === "CASHBACK_AVAILABLE_BALANCE") {
		return {
			clientName: getDefaultMessageTemplateVariableExample("clientName"),
			cashbackValue: getDefaultMessageTemplateVariableExample("cashbackAvailableBalance"),
			expirationLabel: "SALDO PRONTO PARA RESGATE",
		};
	}

	return {
		clientName: "Lucas",
		cashbackValue: "R$ 42,00",
		expirationLabel: "SALDO PRONTO PARA RESGATE",
	};
}

function withAlpha(hexColor: string, alpha: number) {
	const normalized = normalizeHexColor(hexColor);
	const red = Number.parseInt(normalized.slice(1, 3), 16);
	const green = Number.parseInt(normalized.slice(3, 5), 16);
	const blue = Number.parseInt(normalized.slice(5, 7), 16);
	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function shadeHexColor(hexColor: string, percent: number) {
	const normalized = normalizeHexColor(hexColor);
	const amount = Math.round(2.55 * percent);
	const red = clampColorChannel(Number.parseInt(normalized.slice(1, 3), 16) + amount);
	const green = clampColorChannel(Number.parseInt(normalized.slice(3, 5), 16) + amount);
	const blue = clampColorChannel(Number.parseInt(normalized.slice(5, 7), 16) + amount);
	return `#${red.toString(16).padStart(2, "0")}${green.toString(16).padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`;
}

function normalizeHexColor(hexColor: string) {
	const fallback = "#24549c";
	if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hexColor)) return fallback;
	if (hexColor.length === 7) return hexColor;
	return `#${hexColor
		.slice(1)
		.split("")
		.map((character) => `${character}${character}`)
		.join("")}`;
}

function clampColorChannel(value: number) {
	return Math.max(0, Math.min(255, value));
}
