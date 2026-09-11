import { loadBrandLogo } from "@/lib/brand/assets";
import { getWatermarkLayout, RECOMPRA_BRAND_BLUE, RECOMPRA_BRAND_YELLOW } from "@/lib/brand/watermark-layout";
import type { ReactElement } from "react";

// Proporção 1.91:1 — a que a Meta usa para cabeçalhos de imagem em templates.
export const INVITE_HEADER_WIDTH = 1200;
export const INVITE_HEADER_HEIGHT = 628;

const ORB_DIAMETER = 200;
const ORB_LAYOUT = getWatermarkLayout(ORB_DIAMETER, 4);

// Satori não aceita tamanho percentual em <img>: os "74%"/"86%" do watermark do
// admin viram px aqui. Mesmas proporções, resolvidas na hora do build.
const ORGANIZATION_LOGO_SIZE = Math.round(ORB_DIAMETER * 0.74);
const BRAND_LOGO_SIZE = Math.round(ORB_DIAMETER * 0.86);

type BuildInviteHeaderElementParams = {
	organizationName: string;
	/** Logo da organização já inlinado como data URL — satori não busca URL remota de forma confiável. */
	organizationLogoDataUrl: string | null;
};

function Orb({ background, children }: { background: string; children: ReactElement }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				width: ORB_DIAMETER,
				height: ORB_DIAMETER,
				borderRadius: ORB_DIAMETER / 2,
				border: `${ORB_LAYOUT.border}px solid #FFFFFF`,
				background,
				overflow: "hidden",
			}}
		>
			{children}
		</div>
	);
}

/**
 * Cabeçalho do convite de organização: os dois orbes (logo da organização +
 * símbolo Recompra) sobre o azul da marca, com a chamada do convite.
 *
 * Renderizado por satori — vale a regra do `lib/brand/README.md`: toda `div`
 * com filhos precisa de `display: flex`, e só existem os pesos 400/600/700.
 */
export async function buildOrganizationInviteHeaderElement({
	organizationName,
	organizationLogoDataUrl,
}: BuildInviteHeaderElementParams): Promise<ReactElement> {
	const brandLogo = await loadBrandLogo("iconColorOnDark");
	const initial = organizationName.trim().charAt(0).toUpperCase() || "?";

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				width: INVITE_HEADER_WIDTH,
				height: INVITE_HEADER_HEIGHT,
				backgroundColor: RECOMPRA_BRAND_BLUE,
				backgroundImage: `linear-gradient(135deg, ${RECOMPRA_BRAND_BLUE} 0%, #183A6B 100%)`,
				fontFamily: "Outfit",
			}}
		>
			<div style={{ display: "flex", alignItems: "center" }}>
				<Orb background="#FFFFFF">
					{organizationLogoDataUrl ? (
						<img
							src={organizationLogoDataUrl}
							alt={organizationName}
							width={ORGANIZATION_LOGO_SIZE}
							height={ORGANIZATION_LOGO_SIZE}
							style={{ objectFit: "contain" }}
						/>
					) : (
						<div style={{ display: "flex", fontSize: Math.round(ORB_DIAMETER * 0.42), fontWeight: 700, color: RECOMPRA_BRAND_BLUE }}>{initial}</div>
					)}
				</Orb>

				<div style={{ display: "flex", marginLeft: -ORB_LAYOUT.overlap }}>
					<Orb background={RECOMPRA_BRAND_BLUE}>
						<img src={brandLogo.dataUrl} alt="Recompra" width={BRAND_LOGO_SIZE} height={BRAND_LOGO_SIZE} style={{ objectFit: "contain" }} />
					</Orb>
				</div>
			</div>

			<div
				style={{
					display: "flex",
					marginTop: 56,
					fontSize: 28,
					fontWeight: 700,
					letterSpacing: 6,
					color: RECOMPRA_BRAND_YELLOW,
				}}
			>
				VOCÊ FOI CONVIDADO
			</div>

			<div
				style={{
					display: "flex",
					marginTop: 18,
					maxWidth: INVITE_HEADER_WIDTH - 160,
					fontSize: 64,
					fontWeight: 700,
					color: "#FFFFFF",
					textAlign: "center",
					lineHeight: 1.15,
				}}
			>
				{organizationName}
			</div>

			<div style={{ display: "flex", marginTop: 20, fontSize: 30, fontWeight: 400, color: "rgba(255,255,255,0.78)" }}>no RecompraCRM</div>
		</div>
	);
}
