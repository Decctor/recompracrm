import type { ReactNode } from "react";
import { Box } from "./engine";
import {
	Bag,
	BarChart,
	Calculator,
	Calendar,
	ChatBubble,
	Clipboard,
	Clock,
	CoinStack,
	GiftBox,
	Gear,
	Glyph,
	LoyaltyCard,
	Monitor,
	Phone,
	PriceTag,
	Store,
	Target,
} from "./objects";
import { ISO } from "./palette";

// Ícones isométricos: um objeto sobre um pedestal, com a escala que o faz ocupar o pedestal. Substituem os emojis nos blocos de destaque
// do blog e das páginas de funcionalidade — mesma luz, mesma paleta das capas.
const ICONS = {
	store: [0.6, <Store x={-65} y={-48} />],
	calendar: [0.85, <Calendar x={-38} y={-6} />],
	phone: [0.8, <Phone x={-29} y={-4} />],
	chat: [1.0, (
		<g>
			<ChatBubble x={-44} y={4} z={66} w={52} h={30} />
			<ChatBubble x={-6} y={4} z={30} w={46} h={26} m={ISO.amber} tailLeft={false} />
		</g>
	)],
	coins: [1.1, (
		<g>
			<CoinStack x={-14} y={-14} count={5} />
			<CoinStack x={16} y={14} count={3} />
		</g>
	)],
	chart: [0.85, <BarChart x={-62} y={-16} heights={[28, 46, 64, 90]} />],
	gift: [1.25, <GiftBox x={-24} y={-24} s={48} />],
	bag: [1.15, (
		<g>
			<Bag x={-34} y={-16} s={1.1} m={ISO.blue} />
			<Bag x={2} y={8} m={ISO.paper} />
		</g>
	)],
	checklist: [0.9, <Clipboard x={-37} y={-48} checked={3} />],
	card: [0.95, (
		<g>
			<LoyaltyCard x={-46} y={-29} />
			<LoyaltyCard x={-46} y={-29} z={8} m={ISO.navy} />
		</g>
	)],
	tag: [1.25, <PriceTag x={-34} y={0} z={20} />],
	clock: [1.25, <Clock x={-28} y={0} z={8} r={28} />],
	monitor: [0.78, <Monitor x={-42} y={-20} />],
	target: [1.35, <Target x={0} y={0} />],
	calculator: [1.3, <Calculator x={-23} y={-30} />],
	gear: [1.6, <Gear x={-24} y={4} z={4} />],
	heart: [1.6, <Glyph x={-24} y={4} z={4} glyph="heart" />],
	bolt: [1.6, <Glyph x={-24} y={4} z={4} glyph="bolt" />],
	sparkle: [1.5, <Glyph x={-24} y={4} z={4} glyph="sparkle" />],
	flame: [1.6, <Glyph x={-24} y={4} z={4} glyph="flame" />],
	check: [1.6, <Glyph x={-24} y={4} z={4} glyph="check" m={ISO.blue} />],
	trophy: [1.55, <Glyph x={-24} y={4} z={4} glyph="trophy" />],
	lock: [1.55, <Glyph x={-24} y={4} z={4} glyph="lock" m={ISO.blue} />],
	plug: [1.55, <Glyph x={-24} y={4} z={4} glyph="plug" m={ISO.blue} />],
} satisfies Record<string, [number, ReactNode]>;

export type TIsoIconKey = keyof typeof ICONS;
export const ISO_ICON_KEYS = Object.keys(ICONS) as TIsoIconKey[];

type IsoIconProps = {
	icon: TIsoIconKey;
	className?: string;
	// Ícone decorativo por padrão (o título do bloco já diz o que ele é).
	label?: string;
};

export function IsoIcon({ icon, className, label }: IsoIconProps) {
	return (
		<svg
			viewBox="-96 -118 192 172"
			className={className}
			role={label ? "img" : undefined}
			aria-label={label}
			aria-hidden={label ? undefined : true}
			focusable="false"
		>
			<Box x={-56} y={-56} z={-12} w={112} d={112} h={12} m={ISO.sky} />
			<g transform={`scale(${ICONS[icon][0]})`}>{ICONS[icon][1]}</g>
		</svg>
	);
}
