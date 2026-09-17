"use client";

import TemplatePreview from "@/components/MessageTemplates/TemplatePreview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { TMessageTemplateContent } from "@/schemas/message-templates";
import { Eye } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

/** Teto do preview no cartão: o bastante para reconhecer a mensagem, sem esticar o grid. */
const PREVIEW_CLIP_CLASS = "max-h-60";

type TemplatePreviewClipProps = {
	content: TMessageTemplateContent;
	title: string;
	subtitle?: string;
	dialogExtra?: ReactNode;
};

export default function TemplatePreviewClip({ content, title, subtitle, dialogExtra }: TemplatePreviewClipProps) {
	const clipRef = useRef<HTMLDivElement>(null);
	const [isClipped, setIsClipped] = useState(false);
	const [open, setOpen] = useState(false);

	useLayoutEffect(() => {
		const element = clipRef.current;
		if (!element) return;

		function measure(node: HTMLDivElement) {
			setIsClipped(node.scrollHeight > node.clientHeight + 1);
		}

		measure(element);
		const observer = new ResizeObserver(() => {
			if (clipRef.current) measure(clipRef.current);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [content]);

	return (
		<>
			<div className="relative">
				<div ref={clipRef} className={cn("overflow-hidden", PREVIEW_CLIP_CLASS)}>
					<TemplatePreview content={content} compact />
				</div>
				{isClipped ? (
					<div
						aria-hidden
						className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-[#e5ddd5] from-10% to-transparent"
					/>
				) : null}
				<Button
					type="button"
					size="icon-sm"
					variant="outline"
					aria-label={`Ver mensagem completa: ${title}`}
					onClick={(event) => {
						event.stopPropagation();
						setOpen(true);
					}}
					className="absolute right-2 bottom-2 z-10 rounded-full bg-card"
				>
					<Eye />
				</Button>
			</div>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-h-[min(90dvh,44rem)] w-full max-w-[calc(100%-2rem)] gap-4 overflow-y-auto sm:max-w-xl">
					<DialogHeader>
						<DialogTitle className="pr-8 text-left">{title}</DialogTitle>
						<div className="flex flex-wrap items-center gap-2">
							{subtitle ? <DialogDescription className="text-left">{subtitle}</DialogDescription> : null}
							{dialogExtra}
						</div>
					</DialogHeader>
					<TemplatePreview content={content} compact />
				</DialogContent>
			</Dialog>
		</>
	);
}
