import { cn } from "@/lib/utils";

type SectionHeadingProps = {
	eyebrow: string;
	title: string;
	muted: string;
	tone?: "light" | "dark";
	className?: string;
};

// Título das seções numeradas: rótulo "0X · Seção" e um h2 de duas linhas, a segunda esmaecida.
export function SectionHeading({ eyebrow, title, muted, tone = "light", className }: SectionHeadingProps) {
	const isDark = tone === "dark";
	return (
		<div className={className}>
			<p className={cn("mb-4 text-[13px] font-semibold", isDark ? "text-[#ffb900]" : "text-[#24549c]")}>{eyebrow}</p>
			<h2 className="text-[48px] font-semibold leading-[1.05] tracking-[-0.035em] max-md:text-[36px] max-[400px]:text-[32px]">
				{title}
				<br />
				<span className={isDark ? "text-white/55" : "text-[#687a80]"}>{muted}</span>
			</h2>
		</div>
	);
}
