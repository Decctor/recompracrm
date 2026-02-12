import { cn } from "@/lib/utils";
import type { WhatsappTemplateVariables } from "@/lib/whatsapp/template-variables";
import { Braces } from "lucide-react";
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

type VariableListProps = {
	items: typeof WhatsappTemplateVariables;
	command: (props: { id: string; label: string }) => void;
};

export const VariableList = forwardRef((props: VariableListProps, ref) => {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

	const selectItem = (index: number) => {
		const item = props.items[index];
		if (item) {
			props.command({ id: item.value, label: item.value });
		}
	};

	const upHandler = () => {
		if (props.items.length === 0) {
			return;
		}
		setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
	};

	const downHandler = () => {
		if (props.items.length === 0) {
			return;
		}
		setSelectedIndex((selectedIndex + 1) % props.items.length);
	};

	const enterHandler = () => {
		selectItem(selectedIndex);
	};

	useEffect(() => {
		setSelectedIndex((current) => (current >= props.items.length ? 0 : current));
	}, [props.items.length]);

	useEffect(() => {
		const item = itemRefs.current[selectedIndex];
		if (!item || !scrollContainerRef.current) {
			return;
		}
		item.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	useImperativeHandle(ref, () => ({
		onKeyDown: ({ event }: { event: KeyboardEvent }) => {
			if (event.key === "ArrowUp") {
				upHandler();
				return true;
			}

			if (event.key === "ArrowDown") {
				downHandler();
				return true;
			}

			if (event.key === "Enter") {
				enterHandler();
				return true;
			}

			return false;
		},
	}));

	return (
		<div className="bg-popover/95 backdrop-blur-sm text-popover-foreground rounded-md border border-border/80 shadow-lg min-w-[240px] max-h-[280px] overflow-hidden">
			<div className="border-b border-border/60 bg-muted/40 px-2.5 py-2">
				<div className="flex items-center gap-2">
					<div className="rounded bg-primary/10 p-1 text-primary">
						<Braces className="h-3.5 w-3.5" />
					</div>
					<div className="flex flex-col">
						<span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Variaveis</span>
						<span className="text-[10px] text-muted-foreground">Selecione para inserir</span>
					</div>
				</div>
			</div>
			<div
				ref={scrollContainerRef}
				className="max-h-[228px] overflow-y-auto p-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent"
			>
				{props.items.length ? (
					props.items.map((item, index) => (
						<button
							type="button"
							ref={(el) => {
								itemRefs.current[index] = el;
							}}
							className={cn(
								"flex w-full flex-col items-start gap-1 rounded-sm px-2 py-1.5 text-sm outline-none select-none",
								index === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground",
							)}
							key={item.id}
							onPointerDown={(event) => {
								event.preventDefault();
								selectItem(index);
							}}
						>
							<span className="font-medium">{item.label}</span>
							<span className="text-xs text-muted-foreground truncate max-w-full text-left">{`{{${item.value}}}`}</span>
						</button>
					))
				) : (
					<div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma variavel encontrada.</div>
				)}
			</div>
		</div>
	);
});

VariableList.displayName = "VariableList";
