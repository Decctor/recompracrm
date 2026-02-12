"use client";

import { MentionList } from "@/components/inputs/TiptapMentionList";
import { cn } from "@/lib/utils";
import Mention from "@tiptap/extension-mention";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

type User = {
	id: string;
	nome: string;
	avatar?: string | null;
};

type TiptapEditorProps = {
	value: string;
	onChange: (value: string) => void;
	users: User[];
	onMentionAdd?: (userId: string) => void;
	placeholder?: string;
	className?: string;
	editorClassName?: string;
};

export type TiptapEditorRef = {
	getEditor: () => Editor | null;
};

export const TiptapEditor = forwardRef<TiptapEditorRef, TiptapEditorProps>(
	({ value, onChange, users, onMentionAdd, placeholder = "Escreva aqui...", className, editorClassName }, ref) => {
		// Use ref to keep users up-to-date in the suggestion callbacks
		const usersRef = useRef(users);

		// Update ref whenever users changes
		useEffect(() => {
			usersRef.current = users;
		}, [users]);

		const editor = useEditor({
			extensions: [
				StarterKit,
				Mention.configure({
					HTMLAttributes: {
						class: "mention",
					},
					renderHTML: ({ node }) => {
						return [
							"span",
							{
								class: "mention",
								"data-type": "mention",
								"data-id": node.attrs.id,
								"data-label": node.attrs.label,
							},
							`@${node.attrs.label ?? node.attrs.id}`,
						];
					},
					suggestion: {
						char: "@",
						items: ({ query }) => {
							return usersRef.current.filter((user) => user.nome.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
						},
						render: () => {
							let component: MentionList | null = null;
							let popup: HTMLDivElement | null = null;
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
								onStart: (props) => {
									component = new MentionList({
										props: {
											...props,
											users: usersRef.current,
											onSelect: (user: User) => {
												props.command({ id: user.id, label: user.nome });
												if (onMentionAdd) {
													onMentionAdd(user.id);
												}
											},
										},
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

								onUpdate(props) {
									component?.updateProps({
										...props,
										users: usersRef.current,
										onSelect: (user: User) => {
											props.command({ id: user.id, label: user.nome });
											if (onMentionAdd) {
												onMentionAdd(user.id);
											}
										},
									});

									if (!props.clientRect) {
										return;
									}

									const rect = props.clientRect();
									if (rect) {
										positionPopup(rect);
									}
								},

								onKeyDown(props) {
									if (props.event.key === "Escape") {
										popup?.remove();
										return true;
									}

									return component?.onKeyDown(props) ?? false;
								},

								onExit() {
									popup?.remove();
									component?.destroy();
								},
							};
						},
					},
				}),
			],
			content: value,
			onUpdate: ({ editor }) => {
				onChange(editor.getHTML());
			},
			editorProps: {
				attributes: {
					class: cn("prose prose-sm sm:prose-base dark:prose-invert max-w-none focus:outline-none min-h-[120px] px-3 py-2", editorClassName),
				},
			},
			immediatelyRender: false,
		});

		useEffect(() => {
			if (editor && value !== editor.getHTML()) {
				editor.commands.setContent(value);
			}
		}, [value, editor]);

		useImperativeHandle(ref, () => ({
			getEditor: () => editor,
		}));

		return (
			<div className={cn("w-full relative", className)}>
				<div className="rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
					<EditorContent editor={editor} />
				</div>
				{!editor?.getText() && <div className="pointer-events-none absolute top-2 left-3 text-muted-foreground text-sm">{placeholder}</div>}
			</div>
		);
	},
);

TiptapEditor.displayName = "TiptapEditor";
