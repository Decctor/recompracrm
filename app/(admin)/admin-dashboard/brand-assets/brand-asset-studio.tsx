"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLogo, brandLogoSource } from "@/components/Brand/BrandLogo";
import { BRAND_COLORS } from "@/lib/brand/tokens";
import { toJpeg, toPng } from "html-to-image";
import {
	BriefcaseBusiness,
	CalendarDays,
	ChevronDown,
	CircleDollarSign,
	Download,
	Gift,
	Handshake,
	Headphones,
	Lightbulb,
	Megaphone,
	MessageCircle,
	PackageCheck,
	PartyPopper,
	Settings,
	ShoppingBag,
	Sparkles,
	Store,
	Truck,
	Users,
	Wrench,
	type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

const BACKGROUNDS = [
	{ key: "blue", label: "Azul", color: BRAND_COLORS.blue },
	{ key: "amber", label: "Amarelo", color: BRAND_COLORS.amber },
	{ key: "red", label: "Vermelho", color: BRAND_COLORS.red },
	{ key: "white", label: "Branco", color: BRAND_COLORS.white },
	{ key: "black", label: "Preto", color: BRAND_COLORS.black },
] as const;

const TRANSPARENT_BACKGROUND = { key: "transparent", label: "Transparente", color: "transparent" } as const;
const TRANSPARENCY_PREVIEW_STYLE = {
	backgroundColor: "#808080",
	backgroundImage: "conic-gradient(#a3a3a3 25%, transparent 0 50%, #a3a3a3 0 75%, transparent 0)",
	backgroundSize: "16px 16px",
};

// Catálogo completo — espelha `BRAND_LOGO_SOURCES`. `color-on-dark` traz duas
// barras brancas no símbolo, então só rende em fundo escuro; os lockups
// `*-badge` trazem a própria cápsula azul e servem em qualquer fundo.
const LOGOS = [
	{ name: "Horizontal · colorida (fundo escuro)", slug: "horizontal-color-on-dark", src: brandLogoSource("horizontal", "color-on-dark") },
	{ name: "Horizontal · preta", slug: "horizontal-black", src: brandLogoSource("horizontal", "black") },
	{ name: "Horizontal · branca", slug: "horizontal-white", src: brandLogoSource("horizontal", "white") },
	{ name: "Horizontal · azul", slug: "horizontal-blue", src: brandLogoSource("horizontal", "blue") },
	{ name: "Cápsula + texto · fundo claro", slug: "horizontal-badge-color-on-light", src: brandLogoSource("horizontal-badge", "color-on-light") },
	{ name: "Cápsula + texto · fundo escuro", slug: "horizontal-badge-color-on-dark", src: brandLogoSource("horizontal-badge", "color-on-dark") },
	{ name: "Empilhada · colorida (fundo escuro)", slug: "stacked-color-on-dark", src: brandLogoSource("stacked", "color-on-dark") },
	{ name: "Empilhada · preta", slug: "stacked-black", src: brandLogoSource("stacked", "black") },
	{ name: "Empilhada · branca", slug: "stacked-white", src: brandLogoSource("stacked", "white") },
	{ name: "Empilhada · azul", slug: "stacked-blue", src: brandLogoSource("stacked", "blue") },
	{ name: "Ícone · colorido (fundo escuro)", slug: "icon-color-on-dark", src: brandLogoSource("icon", "color-on-dark") },
	{ name: "Ícone na cápsula · qualquer fundo", slug: "icon-badge-color", src: brandLogoSource("icon-badge", "color") },
	{ name: "Ícone · preto", slug: "icon-black", src: brandLogoSource("icon", "black") },
	{ name: "Ícone · branco", slug: "icon-white", src: brandLogoSource("icon", "white") },
	{ name: "Ícone · azul", slug: "icon-blue", src: brandLogoSource("icon", "blue") },
	{ name: "Wordmark · preto", slug: "wordmark-black", src: brandLogoSource("wordmark", "black") },
	{ name: "Wordmark · branco", slug: "wordmark-white", src: brandLogoSource("wordmark", "white") },
	{ name: "Wordmark · azul", slug: "wordmark-blue", src: brandLogoSource("wordmark", "blue") },
] as const;

const SYMBOLS: { key: string; label: string; icon: LucideIcon }[] = [
	{ key: "partners", label: "Parceiros", icon: Handshake },
	{ key: "clients", label: "Clientes", icon: Users },
	{ key: "marketing", label: "Marketing", icon: Megaphone },
	{ key: "implementation", label: "Implementações", icon: Wrench },
	{ key: "operations", label: "Operações", icon: Settings },
	{ key: "stores", label: "Lojas", icon: Store },
	{ key: "sales", label: "Vendas", icon: ShoppingBag },
	{ key: "support", label: "Atendimento", icon: Headphones },
	{ key: "events", label: "Eventos", icon: CalendarDays },
	{ key: "financial", label: "Financeiro", icon: CircleDollarSign },
	{ key: "logistics", label: "Logística", icon: Truck },
	{ key: "deliveries", label: "Entregas", icon: PackageCheck },
	{ key: "ideas", label: "Ideias", icon: Lightbulb },
	{ key: "content", label: "Conteúdo", icon: Sparkles },
	{ key: "community", label: "Comunidade", icon: MessageCircle },
	{ key: "business", label: "Negócios", icon: BriefcaseBusiness },
	{ key: "benefits", label: "Benefícios", icon: Gift },
	{ key: "celebrations", label: "Conquistas", icon: PartyPopper },
];

const FEATURED_SYMBOLS = SYMBOLS.slice(0, 6);
const MORE_SYMBOLS = SYMBOLS.slice(6);

function downloadDataUrl(dataUrl: string, filename: string) {
	const link = document.createElement("a");
	link.download = filename;
	link.href = dataUrl;
	link.click();
}

async function exportNode(node: HTMLElement, filename: string, format: "png" | "jpeg" = "png") {
	await document.fonts.ready;
	const options = { pixelRatio: 2, cacheBust: true, quality: 0.95 };
	const dataUrl = format === "jpeg" ? await toJpeg(node, options) : await toPng(node, options);
	downloadDataUrl(dataUrl, `${filename}.${format === "jpeg" ? "jpg" : "png"}`);
}

function ColorPicker({
	value,
	onChange,
	allowTransparent = false,
}: {
	value: string;
	onChange: (color: string) => void;
	allowTransparent?: boolean;
}) {
	const backgrounds = allowTransparent ? [...BACKGROUNDS, TRANSPARENT_BACKGROUND] : BACKGROUNDS;

	return (
		<div className="flex flex-wrap gap-2" aria-label="Cor de fundo">
			{backgrounds.map((background) => (
				<button
					type="button"
					key={background.key}
					onClick={() => onChange(background.color)}
					aria-pressed={value === background.color}
					className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${value === background.color ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-foreground/30"}`}
				>
					<span
						className="size-4 rounded-full border border-black/15"
						style={background.color === "transparent" ? TRANSPARENCY_PREVIEW_STYLE : { backgroundColor: background.color }}
					/>
					{background.label}
				</button>
			))}
		</div>
	);
}

function LogoCard({ logo }: { logo: (typeof LOGOS)[number] }) {
	const [background, setBackground] = useState<string>(BRAND_COLORS.white);
	const previewRef = useRef<HTMLDivElement>(null);
	const isTransparent = background === "transparent";

	const handleRasterExport = useCallback(
		async (format: "png" | "jpeg") => {
			if (!previewRef.current) return;
			if (format === "jpeg" && isTransparent) return;
			try {
				const backgroundSuffix = isTransparent ? "sem-fundo" : background.slice(1);
				await exportNode(previewRef.current, `recompra-logo-${logo.slug}-${backgroundSuffix}`, format);
				toast.success(`Logo exportada em ${format.toUpperCase()}.`);
			} catch {
				toast.error("Não foi possível exportar a logo.");
			}
		},
		[background, isTransparent, logo.slug],
	);

	return (
		<article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
			<div style={isTransparent ? TRANSPARENCY_PREVIEW_STYLE : undefined}>
				<div ref={previewRef} className="flex aspect-[4/3] items-center justify-center p-8" style={{ backgroundColor: background }}>
					<Image src={logo.src} alt={logo.name} className="max-h-full w-full object-contain" />
				</div>
			</div>
			<div className="space-y-3 border-t p-4">
				<h3 className="font-semibold">{logo.name}</h3>
				<ColorPicker value={background} onChange={setBackground} allowTransparent />
				<div className="flex flex-wrap gap-2">
					<Button size="sm" onClick={() => handleRasterExport("png")}>
						<Download /> PNG
					</Button>
					<Button size="sm" variant="outline" disabled={isTransparent} onClick={() => handleRasterExport("jpeg")}>
						<Download /> JPEG
					</Button>
					<Button size="sm" variant="ghost" asChild>
						<a href={logo.src.src} download={`recompra-logo-${logo.slug}.svg`}>
							<Download /> SVG
						</a>
					</Button>
				</div>
				{isTransparent ? <p className="text-xs text-muted-foreground">PNG preserva o fundo transparente. JPEG precisa de um fundo colorido.</p> : null}
			</div>
		</article>
	);
}

function BrandedBadge({ icon: SymbolIcon }: { icon: LucideIcon }) {
	return (
		<div className="flex items-center justify-center">
			<div className="z-10 flex size-40 items-center justify-center rounded-full border-2 border-white bg-white shadow-xl">
				<SymbolIcon className="size-20 text-black" strokeWidth={2.2} />
			</div>
			<div className="-ml-6 flex size-40 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#24549c] shadow-xl">
				<BrandLogo lockup="icon" tone="color-on-dark" alt="Recompra" className="size-[86%] object-contain" />
			</div>
		</div>
	);
}

function SymbolOptions({ symbols, value, onChange }: { symbols: typeof SYMBOLS; value: string; onChange: (key: string) => void }) {
	return (
		<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
			{symbols.map((item) => (
				<button
					type="button"
					key={item.key}
					onClick={() => onChange(item.key)}
					className={`flex items-center gap-2 rounded-lg border p-2 text-left text-xs font-medium transition ${value === item.key ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
				>
					<item.icon className="size-4" />
					{item.label}
				</button>
			))}
		</div>
	);
}

function CoverCreator() {
	const [symbolKey, setSymbolKey] = useState("partners");
	const [background, setBackground] = useState<string>(BRAND_COLORS.blue);
	const [label, setLabel] = useState("");
	const previewRef = useRef<HTMLDivElement>(null);
	const symbol = SYMBOLS.find((item) => item.key === symbolKey) ?? SYMBOLS[0];

	async function handleExport() {
		if (!previewRef.current) return;
		try {
			await exportNode(previewRef.current, `recompra-capa-${symbol.key}`);
			toast.success("Capa exportada em PNG.");
		} catch {
			toast.error("Não foi possível exportar a capa.");
		}
	}

	return (
		<article className="grid overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[minmax(300px,0.9fr)_1.1fr]">
			<div className="flex items-center justify-center bg-muted/40 p-5">
				<div
					ref={previewRef}
					className="flex aspect-square w-full max-w-[440px] flex-col items-center justify-center gap-8 overflow-hidden p-10"
					style={{ backgroundColor: background }}
				>
					<BrandedBadge icon={symbol.icon} />
					{label.trim() ? (
						<div className="max-w-full text-center text-4xl font-extrabold tracking-tight text-white drop-shadow-md">{label.trim()}</div>
					) : null}
				</div>
			</div>
			<div className="flex flex-col gap-5 p-5 md:p-6">
				<div>
					<h3 className="text-lg font-bold">Monte uma capa</h3>
					<p className="text-sm text-muted-foreground">Use em Destaques, grupos do WhatsApp ou outros canais.</p>
				</div>
				<div className="space-y-2">
					<span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Símbolo</span>
					<SymbolOptions symbols={FEATURED_SYMBOLS} value={symbolKey} onChange={setSymbolKey} />
				</div>
				<div className="space-y-2">
					<span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Fundo</span>
					<ColorPicker value={background} onChange={setBackground} />
				</div>
				<details className="group rounded-xl border border-border bg-muted/20 open:bg-muted/30">
					<summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
						Mais símbolos e opções
						<ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" />
					</summary>
					<div className="space-y-5 border-t px-4 py-4">
						<div className="space-y-2">
							<span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Outros símbolos</span>
							<SymbolOptions symbols={MORE_SYMBOLS} value={symbolKey} onChange={setSymbolKey} />
						</div>
						<div className="space-y-2">
							<label htmlFor="cover-label" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
								Texto opcional
							</label>
							<Input id="cover-label" value={label} maxLength={28} onChange={(event) => setLabel(event.target.value)} placeholder="Ex.: Implementações" />
							<p className="text-xs text-muted-foreground">Deixe vazio para uma capa somente com ícones.</p>
						</div>
					</div>
				</details>
				<Button className="mt-auto self-start" onClick={handleExport}>
					<Download /> Baixar PNG
				</Button>
				<p className="text-xs text-muted-foreground">O arquivo é exportado em alta resolução, ideal para recorte circular.</p>
			</div>
		</article>
	);
}

export function BrandAssetStudio() {
	return (
		<div className="space-y-10">
			<section className="space-y-4">
				<div>
					<p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Biblioteca oficial</p>
					<h2 className="text-xl font-bold">Logos para download</h2>
					<p className="text-sm text-muted-foreground">Escolha um fundo e exporte a versão pronta para uso.</p>
				</div>
				<div className="grid gap-4 lg:grid-cols-3">
					{LOGOS.map((logo) => (
						<LogoCard key={logo.slug} logo={logo} />
					))}
				</div>
			</section>
			<section className="space-y-4">
				<div>
					<p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Social</p>
					<h2 className="text-xl font-bold">Criador de capas</h2>
				</div>
				<CoverCreator />
			</section>
		</div>
	);
}
