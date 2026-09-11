"use client";

import { BrandLogo } from "@/components/Brand/BrandLogo";
import { PrintDock, useLocalPrintDock } from "@/components/Print/PrintDock";
import Image from "next/image";
import { TCashbackProgramEntity, TOrganizationEntity } from "@/services/drizzle/schema";
import { hexToRgba, useOrgColors } from "@/components/Providers/OrgColorsProvider";
import { POI_ACCENT_GRADIENT, POI_PRIMARY_GRADIENT } from "@/lib/point-of-interaction/theme";
import { Camera, Gift, Scan, Smartphone } from "lucide-react";
import { getCashbackUnitLabel } from "@/lib/formatting";

type PointOfInteractionDisplayPageProps = {
	org: {
		id: TOrganizationEntity["id"];
		cnpj: TOrganizationEntity["cnpj"];
		nome: TOrganizationEntity["nome"];
		logoUrl: TOrganizationEntity["logoUrl"];
		telefone: TOrganizationEntity["telefone"];
		poiQrCodeMobileDataUrl: TOrganizationEntity["poiQrCodeMobileDataUrl"];
	};
	cashbackProgram?: {
		terminologia: TCashbackProgramEntity["terminologia"];
	};
};

type TDisplayMode = "A4" | "A5" | "A6";

const DISPLAY_MODES = ["A4", "A5", "A6"] as const satisfies ReadonlyArray<TDisplayMode>;

const DISPLAY_MODE_CONFIG: Record<
	TDisplayMode,
	{
		widthMm: number;
		heightMm: number;
		headerClassName: string;
		logoWrapperStyle: { width: string; height: string };
		logoClassName: string;
		orgNameClassName: string;
		titleClassName: string;
		subtitleClassName: string;
		waveClassName: string;
		bodyClassName: string;
		qrSize: string;
		scanBadgeClassName: string;
		scanIconClassName: string;
		dividerClassName: string;
		dividerTextClassName: string;
		stepsClassName: string;
		stepCircleClassName: string;
		stepIconClassName: string;
		stepLabelClassName: string;
		taglineClassName: string;
		footerClassName: string;
		poweredByLogoClassName: string;
	}
> = {
	A4: {
		widthMm: 210,
		heightMm: 297,
		headerClassName: "pt-10 pb-14 px-10",
		logoWrapperStyle: { width: "150px", height: "150px" },
		logoClassName: "w-full h-full",
		orgNameClassName: "text-xl px-4 py-2",
		titleClassName: "text-5xl",
		subtitleClassName: "text-sm mt-2",
		waveClassName: "h-[40px]",
		bodyClassName: "px-10 pt-8 pb-6",
		qrSize: "230px",
		scanBadgeClassName: "mt-4 gap-2 px-5 py-3 text-sm",
		scanIconClassName: "w-7 h-7",
		dividerClassName: "my-6 gap-3",
		dividerTextClassName: "text-sm",
		stepsClassName: "gap-4",
		stepCircleClassName: "w-16 h-16",
		stepIconClassName: "w-7 h-7",
		stepLabelClassName: "text-xs",
		taglineClassName: "text-sm mt-6 px-8",
		footerClassName: "gap-3 px-6 py-3",
		poweredByLogoClassName: "w-28 h-7",
	},
	A5: {
		widthMm: 148,
		heightMm: 210,
		headerClassName: "pt-7 pb-10 px-6",
		logoWrapperStyle: { width: "100px", height: "100px" },
		logoClassName: "w-full h-full",
		orgNameClassName: "text-base px-2 py-1",
		titleClassName: "text-4xl",
		subtitleClassName: "text-xs mt-1",
		waveClassName: "h-[32px]",
		bodyClassName: "px-6 pt-6 pb-4",
		qrSize: "180px",
		scanBadgeClassName: "mt-2 gap-1.5 px-4 py-2 text-xs",
		scanIconClassName: "w-6 h-6",
		dividerClassName: "my-3 gap-2",
		dividerTextClassName: "text-xs",
		stepsClassName: "gap-2",
		stepCircleClassName: "w-12 h-12",
		stepIconClassName: "w-6 h-6",
		stepLabelClassName: "text-[10px]",
		taglineClassName: "text-[11px] mt-3 px-4",
		footerClassName: "gap-2 px-4 py-2",
		poweredByLogoClassName: "w-24 h-6",
	},
	A6: {
		widthMm: 105,
		heightMm: 148,
		headerClassName: "pt-5 pb-7 px-4",
		logoWrapperStyle: { width: "60px", height: "60px" },
		logoClassName: "w-full h-full",
		orgNameClassName: "text-sm px-2 py-1",
		titleClassName: "text-[1.7rem]",
		subtitleClassName: "text-[9px] mt-1",
		waveClassName: "h-[24px]",
		bodyClassName: "px-4 pt-4 pb-3",
		qrSize: "124px",
		scanBadgeClassName: "mt-2 gap-1 px-3 py-1.5 text-[10px]",
		scanIconClassName: "w-4 h-4",
		dividerClassName: "my-2.5 gap-1.5",
		dividerTextClassName: "text-[9px]",
		stepsClassName: "gap-1.5",
		stepCircleClassName: "w-9 h-9",
		stepIconClassName: "w-4 h-4",
		stepLabelClassName: "text-[8px]",
		taglineClassName: "text-[9px] mt-2.5 px-2",
		footerClassName: "gap-1.5 px-3 py-1.5",
		poweredByLogoClassName: "w-16 h-4",
	},
};

export default function PointOfInteractionDisplayPage({ org, cashbackProgram }: PointOfInteractionDisplayPageProps) {
	const { colors } = useOrgColors();
	const dock = useLocalPrintDock({ title: "Display do ponto de interação", subject: org.nome, defaults: { size: "A5" } });
	const mode = dock.state.selections.size as TDisplayMode;
	const displayConfig = DISPLAY_MODE_CONFIG[mode] ?? DISPLAY_MODE_CONFIG.A5;

	const steps = [
		{
			icon: Smartphone,
			lines: ["Abra sua", "câmera"],
		},
		{
			icon: Scan,
			lines: ["Escaneie o", "QR"],
		},
		{
			icon: Gift,
			lines: ["Pontue e/ou", "resgate prêmios"],
		},
	];

	return (
		<div
			className="min-h-screen flex items-center justify-center p-4 pb-24 md:p-8 md:pb-8 print:p-0 print:min-h-0"
			style={{ backgroundColor: "var(--poi-tint)" }}
		>
			<div className="flex items-start justify-center print:block">
				<div
					className="bg-white shadow-2xl print:shadow-none relative overflow-hidden flex flex-col rounded-2xl print:rounded-none"
					style={{
						width: `${displayConfig.widthMm}mm`,
						height: `${displayConfig.heightMm}mm`,
					}}
				>
					{/* Header */}
					<div
						className={`relative flex flex-col items-center justify-center overflow-hidden ${displayConfig.headerClassName}`}
						style={{ backgroundColor: "var(--poi-primary)", backgroundImage: POI_PRIMARY_GRADIENT }}
					>
						{/* Decorative dots pattern */}
						<div
							className="absolute inset-0 opacity-10"
							style={{
								backgroundImage: `radial-gradient(circle, ${colors.primaryForeground} 1px, transparent 1px)`,
								backgroundSize: "16px 16px",
							}}
						/>

						{/* Logo or Org Name */}
						{org.logoUrl ? (
							<div className="flex items-center justify-center relative z-10 mb-3 bg-white rounded-xl p-2 shadow-lg" style={displayConfig.logoWrapperStyle}>
								<div className={`relative ${displayConfig.logoClassName} rounded-xl overflow-hidden`}>
									<Image src={org.logoUrl} alt={`Logo ${org.nome}`} fill sizes={displayConfig.qrSize} />
								</div>
							</div>
						) : (
							<p
								className={`relative z-10 font-bold mb-2 text-center rounded-lg bg-white/20 ${displayConfig.orgNameClassName}`}
								style={{ color: colors.primaryForeground }}
							>
								{org.nome}
							</p>
						)}

						{/* Main Headline */}
						<div className="relative z-10 text-center">
							<h2 className={`font-black leading-none tracking-tight uppercase ${displayConfig.titleClassName}`} style={{ color: colors.primaryForeground }}>
								Ganhe E RESGATE
							</h2>
							<h2 className={`font-black leading-none tracking-tight uppercase ${displayConfig.titleClassName}`} style={{ color: colors.primaryForeground }}>
								{cashbackProgram ? getCashbackUnitLabel(cashbackProgram.terminologia) : "Cashback!"}
							</h2>
							<p
								className={`font-semibold uppercase tracking-widest opacity-80 ${displayConfig.subtitleClassName}`}
								style={{ color: colors.primaryForeground }}
							>
								✦ FÁCIL E RÁPIDO ✦
							</p>
						</div>

						{/* Wave separator */}
						<div className="absolute -bottom-px left-0 right-0 w-full overflow-hidden leading-none">
							<svg
								className={`relative block w-full ${displayConfig.waveClassName}`}
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 1200 120"
								preserveAspectRatio="none"
							>
								<path d="M0,60 C150,100 350,0 600,60 C850,120 1050,20 1200,60 L1200,120 L0,120 Z" fill="white" />
							</svg>
						</div>
					</div>

					{/* Body */}
					<div className={`flex-1 flex flex-col items-center z-10 bg-white ${displayConfig.bodyClassName}`}>
						{/* QR Code Card */}
						<div className="relative w-full flex flex-col items-center">
							{/* Outer decorative ring */}
							<div className="p-1 rounded-2xl" style={{ backgroundColor: "var(--poi-primary)", backgroundImage: POI_ACCENT_GRADIENT }}>
								<div className="bg-white p-3 rounded-xl flex flex-col items-center shadow-inner">
									<div
										className="flex items-center justify-center rounded-lg overflow-hidden"
										style={{ width: displayConfig.qrSize, height: displayConfig.qrSize, backgroundColor: hexToRgba(colors.primary, 0.04) }}
									>
										{org.poiQrCodeMobileDataUrl ? (
											<img src={org.poiQrCodeMobileDataUrl} alt="QR Code" className="w-full h-full object-contain p-1" />
										) : (
											<p className="text-xs text-center px-2" style={{ color: hexToRgba(colors.primary, 0.5) }}>
												QR Code indisponível
											</p>
										)}
									</div>
								</div>
							</div>

							{/* Scan label badge */}
							<div
								className={`flex items-center rounded-full font-bold uppercase tracking-widest shadow-sm ${displayConfig.scanBadgeClassName}`}
								style={{ backgroundColor: colors.primary, color: colors.primaryForeground }}
							>
								<Camera className={displayConfig.scanIconClassName} /> Aponte a câmera aqui
							</div>
						</div>

						{/* Divider */}
						<div className={`w-full flex items-center ${displayConfig.dividerClassName}`}>
							<div className="flex-1 h-px" style={{ backgroundColor: hexToRgba(colors.primary, 0.2) }} />
							<span
								className={`font-semibold uppercase tracking-widest ${displayConfig.dividerTextClassName}`}
								style={{ color: hexToRgba(colors.primary, 0.5) }}
							>
								como funciona
							</span>
							<div className="flex-1 h-px" style={{ backgroundColor: hexToRgba(colors.primary, 0.2) }} />
						</div>

						{/* Steps */}
						<div className={`w-full flex justify-around ${displayConfig.stepsClassName}`}>
							{steps.map((step, i) => {
								const StepIcon = step.icon;

								return (
									<div key={i} className="flex flex-col items-center gap-1 flex-1">
										<div
											className={`rounded-full flex items-center justify-center text-lg shadow-sm ${displayConfig.stepCircleClassName}`}
											style={{ backgroundColor: hexToRgba(colors.primary, 0.12) }}
										>
											<StepIcon className={displayConfig.stepIconClassName} />
										</div>
										<span className={`font-semibold text-center leading-tight text-gray-600 ${displayConfig.stepLabelClassName}`}>
											{step.lines[0]} <br /> {step.lines[1]}
										</span>
									</div>
								);
							})}
						</div>

						{/* Tagline */}
						<p className={`text-center text-gray-400 font-medium leading-snug ${displayConfig.taglineClassName}`}>
							Acumule pontos a cada compra e troque por benefícios exclusivos.
						</p>
					</div>

					{/* Footer */}
					<div className={`w-full flex items-center justify-center bg-[#24549C] text-white ${displayConfig.footerClassName}`}>
						<p className={`font-medium tracking-tight ${mode === "A6" ? "text-[8px]" : "text-[11px]"}`}>Powered by</p>
						<div className={`relative ${displayConfig.poweredByLogoClassName}`}>
							<BrandLogo lockup="horizontal" tone="color-on-dark" alt="RecompraCRM" fill className="object-contain" />
						</div>
					</div>
				</div>

				{/* Uma composição só. As duas cópias anteriores — o painel `lg:` e a cápsula mobile — já
				    tinham divergido: a de mobile perdeu as dimensões em milímetros e o modo atual. */}
				<PrintDock.Provider {...dock}>
					<PrintDock.Frame>
						<PrintDock.Identity />
						<PrintDock.Divider />
						<PrintDock.Options groupId="size" label="Formato do display">
							{DISPLAY_MODES.map((displayMode) => (
								<PrintDock.Option
									key={displayMode}
									value={displayMode}
									label={`${displayMode} · ${DISPLAY_MODE_CONFIG[displayMode].widthMm} × ${DISPLAY_MODE_CONFIG[displayMode].heightMm} mm`}
								>
									{displayMode}
								</PrintDock.Option>
							))}
						</PrintDock.Options>
						<PrintDock.Divider />
						<PrintDock.Readout>
							<PrintDock.ReadoutValue>
								{displayConfig.widthMm} × {displayConfig.heightMm} mm
							</PrintDock.ReadoutValue>
							<PrintDock.ReadoutNote>Escolha o formato antes de imprimir</PrintDock.ReadoutNote>
						</PrintDock.Readout>
						<PrintDock.Print />
					</PrintDock.Frame>
				</PrintDock.Provider>
			</div>
		</div>
	);
}
