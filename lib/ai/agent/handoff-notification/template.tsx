import { loadBrandLogo } from "@/lib/brand/assets";
import { RECOMPRA_BRAND_BLUE, RECOMPRA_BRAND_YELLOW } from "@/lib/brand/watermark-layout";
import type { ReactElement } from "react";

export const HANDOFF_HEADER_WIDTH = 1200;
export const HANDOFF_HEADER_HEIGHT = 628;

export type THandoffHeaderPayload = {
	organizationName: string;
	organizationLogoDataUrl: string | null;
	clientName: string;
	clientPhone: string;
	reason: string;
};

function truncate(value: string, maximumLength: number) {
	const normalized = value.replace(/\s+/g, " ").trim();
	return normalized.length <= maximumLength ? normalized : `${normalized.slice(0, maximumLength - 1).trimEnd()}…`;
}

export async function buildHandoffHeaderElement(payload: THandoffHeaderPayload): Promise<ReactElement> {
	const logo = await loadBrandLogo("horizontalBlue");
	const clientName = truncate(payload.clientName, 42);
	const organizationName = truncate(payload.organizationName, 42);
	const organizationInitial = organizationName.charAt(0).toUpperCase() || "?";
	const reason = truncate(payload.reason, 145);

	return (
		<div
			style={{
				display: "flex",
				width: HANDOFF_HEADER_WIDTH,
				height: HANDOFF_HEADER_HEIGHT,
				background: "#F5F8FC",
				fontFamily: "Outfit",
				color: "#102747",
			}}
		>
			<div style={{ display: "flex", width: 28, height: "100%", background: RECOMPRA_BRAND_YELLOW }} />

			<div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "52px 62px 48px" }}>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
					<img src={logo.dataUrl} alt="RecompraCRM" width={236} height={54} style={{ objectFit: "contain" }} />
					<div
						style={{
							display: "flex",
							alignItems: "center",
							padding: "12px 20px",
							borderRadius: 999,
							background: "#E9F0FA",
							color: RECOMPRA_BRAND_BLUE,
							fontSize: 18,
							fontWeight: 700,
							letterSpacing: 1.8,
						}}
					>
						TRANSFERÊNCIA DA IA
					</div>
				</div>

				<div style={{ display: "flex", alignItems: "stretch", flex: 1, marginTop: 38 }}>
					<div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "56%", paddingRight: 48 }}>
						<div style={{ display: "flex", color: "#62728A", fontSize: 19, fontWeight: 700, letterSpacing: 2.2 }}>CLIENTE AGUARDANDO</div>
						<div style={{ display: "flex", marginTop: 13, fontSize: 54, fontWeight: 700, lineHeight: 1.06, letterSpacing: -1.5 }}>{clientName}</div>
						<div style={{ display: "flex", marginTop: 14, fontSize: 27, fontWeight: 600, color: RECOMPRA_BRAND_BLUE }}>{payload.clientPhone}</div>
						<div style={{ display: "flex", alignItems: "center", marginTop: 25 }}>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									width: 52,
									height: 52,
									borderRadius: 15,
									background: "#FFFFFF",
									border: "2px solid #DCE5F1",
									overflow: "hidden",
									color: RECOMPRA_BRAND_BLUE,
									fontSize: 22,
									fontWeight: 700,
								}}
							>
								{payload.organizationLogoDataUrl ? (
									<img src={payload.organizationLogoDataUrl} alt={organizationName} width={48} height={48} style={{ objectFit: "contain" }} />
								) : (
									organizationInitial
								)}
							</div>
							<div style={{ display: "flex", marginLeft: 15, color: "#62728A", fontSize: 20, fontWeight: 700 }}>{organizationName}</div>
						</div>
					</div>

					<div
						style={{
							display: "flex",
							flexDirection: "column",
							justifyContent: "space-between",
							width: "44%",
							borderRadius: 28,
							background: RECOMPRA_BRAND_BLUE,
							padding: "34px 38px",
							color: "#FFFFFF",
						}}
					>
						<div style={{ display: "flex", flexDirection: "column" }}>
							<div style={{ display: "flex", color: "#BCD0EC", fontSize: 17, fontWeight: 700, letterSpacing: 2 }}>MOTIVO</div>
							<div style={{ display: "flex", marginTop: 15, fontSize: 27, fontWeight: 600, lineHeight: 1.28 }}>{reason}</div>
						</div>
						<div style={{ display: "flex", alignItems: "center", paddingTop: 24, borderTop: "2px solid rgba(255,255,255,0.18)" }}>
							<div style={{ display: "flex", width: 12, height: 12, borderRadius: 99, background: RECOMPRA_BRAND_YELLOW, marginRight: 13 }} />
							<div style={{ display: "flex", fontSize: 19, fontWeight: 700 }}>Próxima ação: continuar o atendimento</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
