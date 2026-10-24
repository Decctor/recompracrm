import { Check } from "lucide-react";

export function CheckList({ items }: { items: string[] }) {
	return (
		<ul className="mt-7 flex list-none flex-col gap-3 p-0">
			{items.map((item) => (
				<li key={item} className="flex gap-3 text-[15px] leading-[1.5] text-[#2b3538]">
					<Check className="mt-[3px] size-4 flex-none text-[#24549c]" aria-hidden />
					{item}
				</li>
			))}
		</ul>
	);
}
