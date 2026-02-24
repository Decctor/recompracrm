"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, BarChart3, Calendar, Crown, DollarSign, Package, PieChart, ShoppingCart, TrendingUp, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types & Constants ───

type DashboardView = "kpis" | "rankings" | "charts";

const VIEW_DURATIONS: Record<DashboardView, number> = {
	kpis: 5000,
	rankings: 5000,
	charts: 5000,
};

const VIEWS: DashboardView[] = ["kpis", "rankings", "charts"];

// ─── Hooks ───

function useAnimatedCounter(target: number, duration: number, active: boolean, startDelay = 0) {
	const [value, setValue] = useState(0);
	const rafRef = useRef<number | null>(null);
	const startTimeRef = useRef<number | null>(null);

	useEffect(() => {
		if (!active) {
			setValue(0);
			startTimeRef.current = null;
			return;
		}

		const timeout = setTimeout(() => {
			const start = performance.now();
			startTimeRef.current = start;

			const animate = (now: number) => {
				const elapsed = now - start;
				const progress = Math.min(elapsed / duration, 1);
				const eased = 1 - (1 - progress) * (1 - progress);
				setValue(eased * target);
				if (progress < 1) {
					rafRef.current = requestAnimationFrame(animate);
				}
			};
			rafRef.current = requestAnimationFrame(animate);
		}, startDelay);

		return () => {
			clearTimeout(timeout);
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		};
	}, [target, duration, active, startDelay]);

	return value;
}

// ─── Mini Chart Components ───

// Animated area chart (simplified SVG)
function MiniAreaChart({ active, color = "#24549C" }: { active: boolean; color?: string }) {
	const [progress, setProgress] = useState(0);

	useEffect(() => {
		if (!active) {
			setProgress(0);
			return;
		}
		const interval = setInterval(() => {
			setProgress((p) => Math.min(p + 0.02, 1));
		}, 30);
		return () => clearInterval(interval);
	}, [active]);

	// Sample data points for area chart
	const points = [
		{ x: 0, y: 65 },
		{ x: 14, y: 55 },
		{ x: 28, y: 70 },
		{ x: 42, y: 45 },
		{ x: 56, y: 60 },
		{ x: 70, y: 40 },
		{ x: 84, y: 55 },
		{ x: 98, y: 35 },
		{ x: 112, y: 50 },
		{ x: 126, y: 30 },
		{ x: 140, y: 45 },
		{ x: 154, y: 25 },
		{ x: 168, y: 38 },
		{ x: 182, y: 20 },
		{ x: 196, y: 35 },
		{ x: 210, y: 15 },
	];

	const visiblePoints = Math.floor(points.length * progress);
	const pathPoints = points.slice(0, Math.max(visiblePoints, 2));

	const linePath = pathPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
	const areaPath = `${linePath} L ${pathPoints[pathPoints.length - 1]?.x || 0} 80 L 0 80 Z`;

	return (
		<svg viewBox="0 0 220 85" className="w-full h-full" preserveAspectRatio="none">
			<defs>
				<linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
					<stop offset="0%" stopColor={color} stopOpacity="0.3" />
					<stop offset="100%" stopColor={color} stopOpacity="0" />
				</linearGradient>
			</defs>
			{/* Grid lines */}
			{[20, 40, 60].map((y) => (
				<line key={y} x1="0" y1={y} x2="220" y2={y} stroke="white" strokeOpacity="0.05" strokeWidth="1" />
			))}
			{/* Area fill */}
			<path d={areaPath} fill="url(#areaGradient)" />
			{/* Line */}
			<path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
			{/* Current point indicator */}
			{visiblePoints > 0 && pathPoints[pathPoints.length - 1] && (
				<circle cx={pathPoints[pathPoints.length - 1].x} cy={pathPoints[pathPoints.length - 1].y} r="3" fill={color} className="animate-pulse" />
			)}
		</svg>
	);
}

// Mini donut chart
function MiniDonutChart({ active }: { active: boolean }) {
	const [progress, setProgress] = useState(0);

	useEffect(() => {
		if (!active) {
			setProgress(0);
			return;
		}
		const timeout = setTimeout(() => {
			const interval = setInterval(() => {
				setProgress((p) => Math.min(p + 0.03, 1));
			}, 20);
			return () => clearInterval(interval);
		}, 300);
		return () => clearTimeout(timeout);
	}, [active]);

	const segments = [
		{ percent: 35, color: "#24549C", label: "Cosméticos" },
		{ percent: 28, color: "#FFB900", label: "Skin Care" },
		{ percent: 22, color: "#22c55e", label: "Cabelos" },
		{ percent: 15, color: "#a855f7", label: "Outros" },
	];

	const radius = 32;
	const innerRadius = 20;
	const center = 40;

	let cumulativePercent = 0;

	return (
		<div className="flex items-center gap-3">
			<svg viewBox="0 0 80 80" className="w-20 h-20">
				{segments.map((segment, i) => {
					const startAngle = cumulativePercent * 3.6 * (Math.PI / 180);
					const segmentProgress = Math.min(progress * 100 - cumulativePercent, segment.percent) / segment.percent;
					const endAngle = (cumulativePercent + segment.percent * Math.max(segmentProgress, 0)) * 3.6 * (Math.PI / 180);
					cumulativePercent += segment.percent;

					const x1 = center + radius * Math.sin(startAngle);
					const y1 = center - radius * Math.cos(startAngle);
					const x2 = center + radius * Math.sin(endAngle);
					const y2 = center - radius * Math.cos(endAngle);
					const x3 = center + innerRadius * Math.sin(endAngle);
					const y3 = center - innerRadius * Math.cos(endAngle);
					const x4 = center + innerRadius * Math.sin(startAngle);
					const y4 = center - innerRadius * Math.cos(startAngle);

					const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

					const path = `
            M ${x1} ${y1}
            A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}
            L ${x3} ${y3}
            A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}
            Z
          `;

					return <path key={i} d={path} fill={segment.color} opacity={segmentProgress > 0 ? 1 : 0.2} />;
				})}
				{/* Center text */}
				<text x={center} y={center - 2} textAnchor="middle" className="fill-white text-[0.5rem] font-bold">
					100%
				</text>
				<text x={center} y={center + 6} textAnchor="middle" className="fill-white/40 text-[0.25rem]">
					VENDAS
				</text>
			</svg>
			{/* Legend */}
			<div className="flex flex-col gap-1">
				{segments.map((segment, i) => (
					<div key={i} className="flex items-center gap-1.5">
						<div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: segment.color }} />
						<span className="text-[0.4rem] text-white/60">{segment.label}</span>
						<span className="text-[0.4rem] text-white/80 font-bold ml-auto">{segment.percent}%</span>
					</div>
				))}
			</div>
		</div>
	);
}

// ─── KPI Stat Card ───

function MiniStatCard({
	icon: Icon,
	label,
	value,
	change,
	positive,
	prefix = "",
	suffix = "",
	iconColor = "text-blue-400",
	iconBg = "bg-blue-500/10",
	delay = 0,
	active,
}: {
	icon: React.ElementType;
	label: string;
	value: number;
	change: number;
	positive: boolean;
	prefix?: string;
	suffix?: string;
	iconColor?: string;
	iconBg?: string;
	delay?: number;
	active: boolean;
}) {
	const animatedValue = useAnimatedCounter(value, 1200, active, delay);

	const formatValue = (v: number) => {
		if (prefix === "R$ ") {
			return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);
		}
		return v.toFixed(suffix === "%" ? 1 : 0);
	};

	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: delay / 1000 }}
			className="bg-white/[0.03] border border-white/5 rounded-lg p-2 flex flex-col gap-1"
		>
			<div className="flex items-center gap-1.5">
				<div className={cn("p-1 rounded-md", iconBg)}>
					<Icon className={cn("w-2.5 h-2.5", iconColor)} />
				</div>
				<span className="text-[0.4rem] text-white/50 font-medium uppercase tracking-wide">{label}</span>
			</div>
			<div className="flex items-end justify-between">
				<div className="text-[0.7rem] font-black text-white tabular-nums">
					{prefix}
					{formatValue(animatedValue)}
					{suffix}
				</div>
				<div className={cn("flex items-center gap-0.5 text-[0.35rem] font-bold", positive ? "text-green-400" : "text-red-400")}>
					{positive ? <ArrowUp className="w-2 h-2" /> : <ArrowDown className="w-2 h-2" />}
					{change}%
				</div>
			</div>
		</motion.div>
	);
}

// ─── Rankings View ───

function RankingsView({ active }: { active: boolean }) {
	const sellers = [
		{ name: "Ana Silva", value: 45200, percent: 100 },
		{ name: "Roberto Santos", value: 38900, percent: 86 },
		{ name: "Carla Dias", value: 32100, percent: 71 },
		{ name: "Marcos Lima", value: 28500, percent: 63 },
		{ name: "Juliana Costa", value: 25400, percent: 56 },
	];

	const [visibleItems, setVisibleItems] = useState(0);

	useEffect(() => {
		if (!active) {
			setVisibleItems(0);
			return;
		}
		let i = 0;
		const interval = setInterval(() => {
			if (i < sellers.length) {
				setVisibleItems(i + 1);
				i++;
			} else {
				clearInterval(interval);
			}
		}, 400);
		return () => clearInterval(interval);
	}, [active, sellers.length]);

	const getMedalColor = (rank: number) => {
		if (rank === 1) return "text-yellow-400";
		if (rank === 2) return "text-gray-300";
		if (rank === 3) return "text-orange-400";
		return "text-white/30";
	};

	const getProgressColor = (rank: number) => {
		if (rank === 1) return "bg-yellow-500";
		if (rank === 2) return "bg-gray-400";
		if (rank === 3) return "bg-orange-500";
		return "bg-[#24549C]";
	};

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="flex items-center justify-between px-2 py-1.5 bg-white/[0.02] border-b border-white/5 rounded-t-lg mb-2">
				<div className="flex items-center gap-1.5">
					<Crown className="w-3 h-3 text-yellow-400" />
					<span className="text-[0.5rem] font-bold text-white/70 uppercase tracking-wider">Ranking de Vendedores</span>
				</div>
				<span className="text-[0.35rem] text-white/40 bg-white/5 px-1.5 py-0.5 rounded">TOP 5</span>
			</div>

			{/* Rankings list */}
			<div className="flex-1 flex flex-col gap-1.5 px-1">
				{sellers.slice(0, visibleItems).map((seller, idx) => (
					<motion.div
						key={seller.name}
						initial={{ opacity: 0, x: -10 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ type: "spring", stiffness: 400, damping: 30 }}
						className="flex items-center gap-2"
					>
						{/* Rank */}
						<div className="w-4 flex items-center justify-center shrink-0">
							{idx < 3 ? (
								<Crown className={cn("w-3 h-3", getMedalColor(idx + 1))} />
							) : (
								<span className="text-[0.5rem] font-bold text-white/30">{idx + 1}</span>
							)}
						</div>

						{/* Avatar */}
						<div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0">
							<span className="text-[0.35rem] font-bold text-white/60">
								{seller.name
									.split(" ")
									.map((n) => n[0])
									.join("")}
							</span>
						</div>

						{/* Name and bar */}
						<div className="flex-1 min-w-0">
							<div className="text-[0.45rem] text-white/80 font-medium truncate mb-0.5">{seller.name}</div>
							<div className="h-1 bg-white/5 rounded-full overflow-hidden">
								<motion.div
									className={cn("h-full rounded-full", getProgressColor(idx + 1))}
									initial={{ width: 0 }}
									animate={{ width: `${seller.percent}%` }}
									transition={{ duration: 0.8, delay: 0.2 }}
								/>
							</div>
						</div>

						{/* Value */}
						<div className="text-[0.45rem] font-bold text-white/80 tabular-nums shrink-0">R$ {(seller.value / 1000).toFixed(1)}k</div>
					</motion.div>
				))}
			</div>

			{/* Footer metric */}
			<div className="mt-auto px-2 py-1.5 bg-white/[0.02] border-t border-white/5 rounded-b-lg flex items-center justify-between">
				<span className="text-[0.4rem] text-white/40">Total da equipe</span>
				<span className="text-[0.5rem] font-bold text-[#24549C]">R$ 170.1k</span>
			</div>
		</div>
	);
}

// ─── KPIs View ───

function KPIsView({ active }: { active: boolean }) {
	return (
		<div className="flex flex-col h-full gap-2">
			{/* KPI Grid */}
			<div className="grid grid-cols-2 gap-1.5">
				<MiniStatCard
					icon={DollarSign}
					label="Vendas"
					value={47850}
					change={12}
					positive
					prefix="R$ "
					iconColor="text-green-400"
					iconBg="bg-green-500/10"
					delay={0}
					active={active}
				/>
				<MiniStatCard
					icon={ShoppingCart}
					label="Ticket Médio"
					value={287}
					change={5}
					positive
					prefix="R$ "
					iconColor="text-blue-400"
					iconBg="bg-blue-500/10"
					delay={100}
					active={active}
				/>
				<MiniStatCard
					icon={Users}
					label="Clientes"
					value={342}
					change={8}
					positive
					iconColor="text-purple-400"
					iconBg="bg-purple-500/10"
					delay={200}
					active={active}
				/>
				<MiniStatCard
					icon={TrendingUp}
					label="Margem"
					value={32.5}
					change={2}
					positive={false}
					suffix="%"
					iconColor="text-yellow-400"
					iconBg="bg-yellow-500/10"
					delay={300}
					active={active}
				/>
			</div>

			{/* Chart section */}
			<div className="flex-1 bg-white/[0.02] border border-white/5 rounded-lg p-2 flex flex-col min-h-0">
				<div className="flex items-center justify-between mb-1">
					<span className="text-[0.4rem] text-white/50 font-medium uppercase">Faturamento (30 dias)</span>
					<div className="flex items-center gap-1">
						<div className="w-1.5 h-1.5 rounded-full bg-[#24549C]" />
						<span className="text-[0.35rem] text-white/40">Atual</span>
					</div>
				</div>
				<div className="flex-1 min-h-0">
					<MiniAreaChart active={active} color="#24549C" />
				</div>
			</div>
		</div>
	);
}

// ─── Charts View (Pie + Heatmap) ───

function ChartsView({ active }: { active: boolean }) {
	const weekDays = [
		{ day: "Seg", value: 85, sales: 42 },
		{ day: "Ter", value: 92, sales: 48 },
		{ day: "Qua", value: 78, sales: 38 },
		{ day: "Qui", value: 95, sales: 51 },
		{ day: "Sex", value: 100, sales: 56 },
		{ day: "Sáb", value: 70, sales: 35 },
		{ day: "Dom", value: 45, sales: 22 },
	];

	const [showHeatmap, setShowHeatmap] = useState(false);

	useEffect(() => {
		if (!active) {
			setShowHeatmap(false);
			return;
		}
		const timer = setTimeout(() => setShowHeatmap(true), 800);
		return () => clearTimeout(timer);
	}, [active]);

	const getHeatColor = (value: number) => {
		if (value >= 95) return "bg-[#24549C]";
		if (value >= 80) return "bg-[#24549C]/70";
		if (value >= 60) return "bg-[#24549C]/40";
		return "bg-[#24549C]/20";
	};

	return (
		<div className="flex flex-col h-full gap-2">
			{/* Pie chart section */}
			<div className="bg-white/[0.02] border border-white/5 rounded-lg p-2">
				<div className="flex items-center gap-1.5 mb-2">
					<PieChart className="w-3 h-3 text-purple-400" />
					<span className="text-[0.45rem] font-bold text-white/60 uppercase tracking-wider">Vendas por Categoria</span>
				</div>
				<MiniDonutChart active={active} />
			</div>

			{/* Weekly heatmap */}
			<div className="flex-1 bg-white/[0.02] border border-white/5 rounded-lg p-2 flex flex-col min-h-0">
				<div className="flex items-center gap-1.5 mb-2">
					<Calendar className="w-3 h-3 text-yellow-400" />
					<span className="text-[0.45rem] font-bold text-white/60 uppercase tracking-wider">Vendas por Dia</span>
					<span className="ml-auto text-[0.35rem] text-green-400 font-bold flex items-center gap-0.5">
						<Crown className="w-2 h-2" /> Sex
					</span>
				</div>
				<div className="grid grid-cols-7 gap-1">
					{weekDays.map((d, i) => (
						<motion.div
							key={d.day}
							initial={{ opacity: 0, scale: 0.8 }}
							animate={showHeatmap ? { opacity: 1, scale: 1 } : { opacity: 0.3, scale: 0.8 }}
							transition={{ delay: i * 0.08 }}
							className="flex flex-col items-center"
						>
							<span className="text-[0.35rem] text-white/40 mb-0.5">{d.day}</span>
							<div
								className={cn(
									"w-full aspect-square rounded-md flex items-center justify-center transition-colors",
									showHeatmap ? getHeatColor(d.value) : "bg-white/5",
								)}
							>
								<span className="text-[0.4rem] font-bold text-white/80">{d.sales}</span>
							</div>
						</motion.div>
					))}
				</div>
				<div className="flex items-center justify-center gap-2 mt-1.5">
					<div className="flex items-center gap-0.5">
						<div className="w-2 h-2 rounded-sm bg-[#24549C]/20" />
						<span className="text-[0.3rem] text-white/30">Baixo</span>
					</div>
					<div className="flex items-center gap-0.5">
						<div className="w-2 h-2 rounded-sm bg-[#24549C]" />
						<span className="text-[0.3rem] text-white/30">Alto</span>
					</div>
				</div>
			</div>
		</div>
	);
}

// ─── Main wireframe component ───

function AnalyticsDashboardWireframe() {
	const [currentView, setCurrentView] = useState<DashboardView>("kpis");
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const advanceView = useCallback(() => {
		setCurrentView((prev) => {
			const idx = VIEWS.indexOf(prev);
			return VIEWS[(idx + 1) % VIEWS.length];
		});
	}, []);

	useEffect(() => {
		const duration = VIEW_DURATIONS[currentView];
		timeoutRef.current = setTimeout(advanceView, duration);
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, [currentView, advanceView]);

	const getViewLabel = (view: DashboardView) => {
		switch (view) {
			case "kpis":
				return "Visão Geral";
			case "rankings":
				return "Rankings";
			case "charts":
				return "Análises";
		}
	};

	return (
		<div className="relative w-full max-w-md mx-auto">
			{/* Glow behind */}
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] h-[110%] bg-purple-500/10 blur-3xl rounded-full -z-10" />

			{/* Device frame */}
			<div className="bg-zinc-950 border border-white/10 rounded-[1.25rem] shadow-2xl shadow-black/50 overflow-hidden">
				{/* Header bar */}
				<div className="flex items-center px-3 py-2 bg-zinc-900/80 border-b border-white/5 gap-1.5">
					<div className="w-1.5 h-1.5 rounded-full bg-red-500/60" />
					<div className="w-1.5 h-1.5 rounded-full bg-yellow-500/60" />
					<div className="w-1.5 h-1.5 rounded-full bg-green-500/60" />
					<div className="ml-2 flex items-center gap-1.5">
						<BarChart3 className="w-3 h-3 text-purple-400" />
						<span className="text-[0.5rem] font-bold text-white/60">Dashboard Analytics</span>
					</div>
				</div>

				{/* Tab navigation */}
				<div className="flex border-b border-white/5">
					{VIEWS.map((view) => (
						<button
							key={view}
							type="button"
							onClick={() => setCurrentView(view)}
							className={cn(
								"flex-1 py-1.5 text-[0.45rem] font-bold uppercase tracking-wider transition-colors border-b-2",
								currentView === view ? "text-purple-400 border-purple-400 bg-purple-500/5" : "text-white/30 border-transparent hover:text-white/50",
							)}
						>
							{getViewLabel(view)}
						</button>
					))}
				</div>

				{/* Content area */}
				<div className="p-2 min-h-[280px] sm:min-h-[300px]">
					<AnimatePresence mode="wait">
						<motion.div
							key={currentView}
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.25 }}
							className="h-[260px] sm:h-[280px]"
						>
							{currentView === "kpis" && <KPIsView active={currentView === "kpis"} />}
							{currentView === "rankings" && <RankingsView active={currentView === "rankings"} />}
							{currentView === "charts" && <ChartsView active={currentView === "charts"} />}
						</motion.div>
					</AnimatePresence>
				</div>

				{/* Bottom progress dots */}
				<div className="flex items-center justify-center gap-1.5 pb-3">
					{VIEWS.map((view) => (
						<div
							key={view}
							className={cn("h-1 rounded-full transition-all duration-500", currentView === view ? "w-5 bg-purple-500" : "w-1 bg-white/15")}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

// ─── Exported Section ───

export default function AnalyticsSection() {
	return (
		<section className="py-24 bg-white border-y border-black/5 relative overflow-hidden">
			<div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
				<div className="grid lg:grid-cols-2 gap-16 items-center">
					{/* Left: Wireframe */}
					<div className="order-2 lg:order-1">
						<AnalyticsDashboardWireframe />
					</div>

					{/* Right: Text content */}
					<div className="order-1 lg:order-2">
						<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 border border-purple-100 text-purple-600 text-sm font-bold mb-6">
							<BarChart3 className="w-4 h-4" />
							Analytics em Profundidade
						</div>
						<h2 className="text-3xl md:text-5xl font-extrabold mb-6 text-slate-900 leading-tight">
							Decisões baseadas em dados. <br />
							<span className="text-brand">Não em achismo.</span>
						</h2>
						<p className="text-lg text-slate-600 mb-8 leading-relaxed font-medium">
							Pare de abrir 5 planilhas. Um dashboard mostra vendas em tempo real, ticket médio, curva ABC de produtos, e performance da equipe. Tudo em uma
							tela só.
						</p>

						<div className="grid sm:grid-cols-2 gap-4">
							<div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-purple-300 hover:shadow-lg hover:shadow-purple-900/5 transition-all">
								<TrendingUp className="w-6 h-6 text-green-500 mb-3" />
								<h4 className="font-bold text-slate-900 text-lg mb-1">Vendas em Tempo Real</h4>
								<p className="text-[15px] text-slate-600 font-medium">Acompanhe o faturamento do dia sem esperar o fechamento.</p>
							</div>
							<div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-purple-300 hover:shadow-lg hover:shadow-purple-900/5 transition-all">
								<Package className="w-6 h-6 text-blue-500 mb-3" />
								<h4 className="font-bold text-slate-900 text-lg mb-1">Curva ABC de Produtos</h4>
								<p className="text-[15px] text-slate-600 font-medium">Saiba quais 20% dos produtos geram 80% do faturamento.</p>
							</div>
							<div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-purple-300 hover:shadow-lg hover:shadow-purple-900/5 transition-all">
								<Crown className="w-6 h-6 text-[#FFB900] mb-3" />
								<h4 className="font-bold text-slate-900 text-lg mb-1">Rankings da Equipe</h4>
								<p className="text-[15px] text-slate-600 font-medium">Veja quem bateu a meta e quem precisa de apoio.</p>
							</div>
							<div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-purple-300 hover:shadow-lg hover:shadow-purple-900/5 transition-all">
								<Calendar className="w-6 h-6 text-purple-500 mb-3" />
								<h4 className="font-bold text-slate-900 text-lg mb-1">Padrões por Período</h4>
								<p className="text-[15px] text-slate-600 font-medium">Identifique os melhores dias e horários de venda.</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
