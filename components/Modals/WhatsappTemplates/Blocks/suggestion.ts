import { WhatsappTemplateVariables } from "@/lib/whatsapp/template-variables";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { VariableList } from "./VariableList";

type VariableListRef = {
	onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

export default {
	items: ({ query }: { query: string }) => {
		// Clean query if it starts with { (since trigger is { and user might type {{)
		const cleanQuery = query.startsWith("{") ? query.slice(1) : query;

		return WhatsappTemplateVariables.filter(
			(item) => item.label.toLowerCase().includes(cleanQuery.toLowerCase()) || item.value.toLowerCase().includes(cleanQuery.toLowerCase()),
		);
	},

	render: () => {
		let component: ReactRenderer;
		let popup: HTMLElement | null = null;
		let popupContainer: HTMLElement | null = null;

		const positionPopup = (rect: DOMRect) => {
			if (!popup) {
				return;
			}
			if (popupContainer && popupContainer !== document.body) {
				const containerRect = popupContainer.getBoundingClientRect();
				popup.style.top = `${rect.bottom - containerRect.top + popupContainer.scrollTop}px`;
				popup.style.left = `${rect.left - containerRect.left + popupContainer.scrollLeft}px`;
				return;
			}
			popup.style.top = `${rect.bottom}px`;
			popup.style.left = `${rect.left}px`;
		};

		return {
			onStart: (props: SuggestionProps) => {
				component = new ReactRenderer(VariableList, {
					props,
					editor: props.editor,
				});

				if (!props.clientRect) {
					return;
				}

				popup = component.element;
				popupContainer = props.editor.view.dom.closest("[role='dialog']") as HTMLElement | null;
				const shouldRenderInDialog = Boolean(popupContainer);
				popup.style.position = shouldRenderInDialog ? "absolute" : "fixed";
				popup.style.pointerEvents = "auto";
				popup.style.zIndex = "10000";

				(popupContainer ?? document.body).appendChild(popup);

				const rect = props.clientRect();
				if (rect) {
					positionPopup(rect);
				}
			},

			onUpdate(props: SuggestionProps) {
				component.updateProps(props);

				if (!props.clientRect) {
					return;
				}

				const rect = props.clientRect();
				if (rect) {
					positionPopup(rect);
				}
			},

			onKeyDown(props: SuggestionKeyDownProps) {
				if (props.event.key === "Escape") {
					popup?.remove();

					return true;
				}

				return (component.ref as VariableListRef | null)?.onKeyDown(props) ?? false;
			},

			onExit() {
				popup?.remove();
				component.destroy();
			},
		};
	},
};
