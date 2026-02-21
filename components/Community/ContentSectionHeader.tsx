import { ChevronRight } from "lucide-react";
import Link from "next/link";

type ContentSectionHeaderProps = {
	title: string;
	href?: string;
	linkText?: string;
};

export function ContentSectionHeader({ title, href, linkText = "Explorar tudo" }: ContentSectionHeaderProps) {
	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-2">
				<div className="w-1 h-5 rounded-full bg-primary" />
				<h2 className="text-lg font-bold tracking-tight">{title}</h2>
			</div>
			{href && (
				<Link
					href={href}
					className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
				>
					{linkText}
					<ChevronRight className="w-3.5 h-3.5 min-w-3.5 min-h-3.5" />
				</Link>
			)}
		</div>
	);
}
