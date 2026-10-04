import type { ReactNode } from "react";
import { Box } from "./engine";
import {
	Bag,
	BarChart,
	Bunting,
	Calculator,
	Calendar,
	ChatBubble,
	Clipboard,
	Clock,
	CoinStack,
	Cube,
	Floor,
	GiftBox,
	Glyph,
	LoyaltyCard,
	Monitor,
	Phone,
	Pole,
	PriceTag,
	Store,
	Target,
} from "./objects";
import { ISO } from "./palette";

// Capas isométricas do blog e das páginas de funcionalidade. Cada cena é composta só com os
// objetos de ./objects, numa plataforma comum — assim todas as capas parecem da mesma família.
// Ordem do pintor: o que tem x + y menor (mais ao fundo) é desenhado primeiro.
const SCENES = {
	// Black Friday + Natal: a loja de rua no centro, sacolas e presentes na calçada.
	"black-friday-natal": (
		<g>
			<Floor x={-150} y={-120} w={300} d={240} />
			<Store x={-110} y={-100} />
			<Calendar x={60} y={-96} highlight={10} />
			<PriceTag x={-150} y={20} z={96} />
			<Bag x={30} y={30} m={ISO.blue} s={1.1} />
			<GiftBox x={70} y={40} s={40} />
			<Bag x={-20} y={70} />
			<GiftBox x={40} y={82} s={30} m={ISO.blue} ribbon={ISO.amber} />
			<Cube x={-130} y={-60} z={150} s={12} />
			<Cube x={120} y={100} z={120} s={9} m={ISO.blue} />
		</g>
	),
	// Quanto vale um cliente que volta: pilhas de moedas crescendo ao lado do gráfico.
	"valor-do-cliente": (
		<g>
			<Floor x={-140} y={-100} w={270} d={200} />
			<BarChart x={-120} y={-90} heights={[30, 52, 74, 104]} />
			<CoinStack x={4} y={44} count={3} />
			<CoinStack x={48} y={44} count={5} />
			<CoinStack x={92} y={44} count={8} />
			<LoyaltyCard x={-128} y={20} z={0} />
			<Glyph x={60} y={-30} z={80} glyph="heart" />
			<Cube x={-140} y={-80} z={130} s={10} m={ISO.blue} />
		</g>
	),
	// WhatsApp: o celular com a conversa, a régua de tempo e o relógio da janela de 24h.
	whatsapp: (
		<g>
			<Floor x={-140} y={-100} w={270} d={200} />
			<Calendar x={-120} y={-90} highlight={5} />
			<Phone x={-20} y={-20} />
			<ChatBubble x={-110} y={30} z={118} w={60} h={34} />
			<ChatBubble x={52} y={-12} z={140} w={56} h={30} m={ISO.amber} tailLeft={false} />
			<ChatBubble x={52} y={-12} z={96} w={44} h={26} m={ISO.paper} tailLeft={false} lines={1} />
			<Clock x={70} y={70} z={30} r={30} />
			<CoinStack x={-70} y={80} count={3} r={15} />
		</g>
	),
	// Cashback: cartão de fidelidade, moedas voltando e a calculadora da margem.
	cashback: (
		<g>
			<Floor x={-140} y={-100} w={270} d={200} />
			<Calculator x={-120} y={-90} />
			<LoyaltyCard x={-50} y={-70} z={34} m={ISO.navy} />
			<CoinStack x={-70} y={50} count={4} />
			<CoinStack x={-26} y={60} count={6} />
			<LoyaltyCard x={20} y={10} />
			<CoinStack x={80} y={-50} count={2} r={14} />
			<GiftBox x={70} y={70} s={30} m={ISO.blue} ribbon={ISO.amber} />
		</g>
	),
	// RFM: o alvo dos segmentos, o gráfico e a lista de quem acionar.
	rfm: (
		<g>
			<Floor x={-140} y={-100} w={270} d={200} />
			<BarChart x={-125} y={-95} heights={[64, 40, 86, 24]} />
			<Target x={70} y={-30} />
			<Clipboard x={-80} y={0} checked={2} />
			<CoinStack x={70} y={70} count={4} r={15} />
			<Cube x={130} y={-100} z={110} s={10} />
		</g>
	),
	// Fechamento da semana: prancheta com o checklist, calendário e o gráfico da semana.
	"fechamento-semanal": (
		<g>
			<Floor x={-140} y={-100} w={270} d={200} />
			<Calendar x={-118} y={-96} highlight={4} />
			<BarChart x={10} y={-96} heights={[34, 50, 42, 70]} />
			<Clipboard x={-60} y={-10} checked={3} />
			<Clock x={70} y={60} z={20} r={26} />
			<Cube x={-140} y={60} z={110} s={10} m={ISO.blue} />
		</g>
	),
	// Festa Junina: a loja com bandeirinhas e a fogueira na frente.
	"festa-junina": (
		<g>
			<Floor x={-150} y={-120} w={300} d={240} />
			<Pole x={-150} y={20} h={110} />
			<Store x={-90} y={-110} />
			<Pole x={110} y={20} h={110} />
			<Bunting x={-148} y={22} z={108} length={262} sag={14} />
			{/* Fogueira: toras cruzadas e a chama */}
			<Box x={20} y={70} w={44} d={8} h={7} m={ISO.bronze} />
			<Box x={38} y={52} w={8} d={44} h={7} m={ISO.bronze} />
			<Glyph x={18} y={78} z={-2} glyph="flame" depth={6} />
			<GiftBox x={-90} y={60} s={34} m={ISO.blue} ribbon={ISO.amber} />
		</g>
	),
	// Funcionalidades
	"feature-cashback": (
		<g>
			<Floor x={-140} y={-100} w={270} d={200} />
			<LoyaltyCard x={-110} y={-80} />
			<CoinStack x={30} y={-40} count={7} />
			<CoinStack x={-40} y={50} count={4} />
			<CoinStack x={10} y={60} count={2} />
			<GiftBox x={70} y={60} s={30} m={ISO.blue} ribbon={ISO.amber} />
		</g>
	),
	"feature-campanhas": (
		<g>
			<Floor x={-140} y={-100} w={270} d={200} />
			<Phone x={-30} y={-30} />
			<ChatBubble x={-120} y={20} z={110} w={58} h={32} />
			<ChatBubble x={44} y={-20} z={130} w={52} h={28} m={ISO.amber} tailLeft={false} />
			<Target x={70} y={70} />
			<Glyph x={-100} y={90} z={0} glyph="bolt" depth={6} />
		</g>
	),
	"feature-pdi": (
		<g>
			<Floor x={-140} y={-100} w={270} d={200} />
			<Monitor x={-70} y={-60} />
			<Glyph x={40} y={40} z={0} glyph="trophy" depth={7} />
			<CoinStack x={-80} y={70} count={3} r={15} />
			<GiftBox x={80} y={-80} s={34} />
		</g>
	),
	"feature-bi": (
		<g>
			<Floor x={-140} y={-100} w={270} d={200} />
			<BarChart x={-120} y={-90} heights={[30, 56, 44, 80, 104]} />
			<Target x={60} y={40} />
			<Clipboard x={-110} y={20} checked={2} />
		</g>
	),
} satisfies Record<string, ReactNode>;

export type TIsoCoverKey = keyof typeof SCENES;
export const ISO_COVER_KEYS = Object.keys(SCENES) as TIsoCoverKey[];

type IsoCoverProps = {
	scene: TIsoCoverKey;
	// Sem label a capa é decorativa (cards, onde o título ao lado já diz do que se trata).
	label?: string;
	className?: string;
	// "soft": fundo azul-claro (cards, hero). "deep": azul profundo (destaque do índice).
	tone?: "soft" | "deep";
};

export function IsoCover({ scene, label, className, tone = "soft" }: IsoCoverProps) {
	const bg = tone === "deep" ? { base: "#1a3d7a", halo: "#24549c", dot: "#3b6db8" } : { base: "#eef3fb", halo: "#e2ebf8", dot: "#c6d7ef" };
	return (
		<svg
			viewBox="-320 -230 640 400"
			preserveAspectRatio="xMidYMid slice"
			className={className}
			role={label ? "img" : undefined}
			aria-label={label || undefined}
			aria-hidden={label ? undefined : true}
			focusable="false"
		>
			<rect x={-320} y={-230} width={640} height={400} fill={bg.base} />
			<circle cx={0} cy={-30} r={190} fill={bg.halo} />
			{Array.from({ length: 6 }, (_, i) => (
				<circle key={i} cx={-270 + i * 108} cy={i % 2 ? -190 : 130} r={3} fill={bg.dot} />
			))}
			<g transform="translate(0 16) scale(1.2)">{SCENES[scene]}</g>
		</svg>
	);
}
