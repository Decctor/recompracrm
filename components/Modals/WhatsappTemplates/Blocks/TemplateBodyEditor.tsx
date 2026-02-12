import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { WhatsappTemplateVariables } from "@/lib/whatsapp/template-variables";
import type { TWhatsappTemplateBodyParameter } from "@/schemas/whatsapp-templates";
import Mention from "@tiptap/extension-mention";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Braces, ChevronDown, FileText, List, ListOrdered } from "lucide-react";
import { useEffect, useState } from "react";
import suggestion from "./suggestion";
type TemplateBodyEditorProps = {
	content: string;
	contentChangeCallback: (content: string) => void;
	parametros: TWhatsappTemplateBodyParameter[];
	onParametrosChange: (parametros: TWhatsappTemplateBodyParameter[]) => void;
};

function TemplateBodyEditor({ content, contentChangeCallback, parametros, onParametrosChange }: TemplateBodyEditorProps) {
	const [charCount, setCharCount] = useState(0);

	const editor = useEditor({
		extensions: [
			StarterKit,
			Mention.configure({
				HTMLAttributes: {
					class: "mention",
				},
				suggestion: {
					...suggestion,
					char: "{",
				},
				renderLabel({ node }) {
					// For mention nodes, we'll display them with their identifier
					// The extraction logic will assign them numeric positions
					const label = WhatsappTemplateVariables.find((v) => v.value === node.attrs.id)?.label;
					return `{{${label?.toUpperCase()}}}`;
				},
			}),
		],
		content: content,
		immediatelyRender: false,
		onUpdate: ({ editor }) => {
			const html = editor.getHTML();
			const text = editor.getText();
			contentChangeCallback(html);
			setCharCount(text.length);

			// Extract variables from content
			extractVariablesFromContent(editor);
		},
	});

	// Extract variables from HTML content in the order they appear
	const extractVariablesFromContent = (editor: Editor) => {
		const text = editor.getText();
		const resolveVariableIdentifier = (rawToken: string) => {
			const token = rawToken.trim();
			if (!token) {
				return null;
			}
			const matchByValue = WhatsappTemplateVariables.find((variable) => variable.value.toLowerCase() === token.toLowerCase());
			if (matchByValue) {
				return matchByValue.value;
			}
			const matchByLabel = WhatsappTemplateVariables.find((variable) => variable.label.toLowerCase() === token.toLowerCase());
			return matchByLabel?.value ?? null;
		};

		// Extract ALL variables (anything between {{ and }}) in order of appearance
		const variableRegex = /\{\{([^}]+)\}\}/g;
		const foundVariables: string[] = []; // Array to maintain order
		const seenIdentifiers = new Set<string>(); // Set to track unique variables

		const matches = text.matchAll(variableRegex);
		for (const match of matches) {
			const identifier = resolveVariableIdentifier(match[1]);
			if (identifier && !seenIdentifiers.has(identifier)) {
				foundVariables.push(identifier);
				seenIdentifiers.add(identifier);
			}
		}

		console.log("EXTRACTING VARIABLES FROM CONTENT...", {
			text: text,
			foundVariables: foundVariables,
		});

		// Build the new parameters list based on order of appearance
		const newParametros: TWhatsappTemplateBodyParameter[] = [];

		foundVariables.forEach((variableId, index) => {
			const positionNumber = (index + 1).toString(); // 1, 2, 3, etc.

			// Check if we already have a parameter with this identificador
			const existingByIdentifier = parametros.find((p) => p.identificador === variableId);

			if (existingByIdentifier) {
				// Reuse existing parameter but update its position number
				newParametros.push({
					...existingByIdentifier,
					nome: positionNumber, // Update position based on order
				});
			} else {
				// Create new parameter
				newParametros.push({
					nome: positionNumber,
					exemplo: "",
					identificador: variableId,
				});
			}
		});

		console.log("NEW PARAMETROS:", newParametros);

		// Only update if there are changes
		if (JSON.stringify(newParametros) !== JSON.stringify(parametros)) {
			onParametrosChange(newParametros);
		}
	};

	useEffect(() => {
		if (editor && content !== editor.getHTML()) {
			editor.commands.setContent(content);
		}
	}, [content, editor]);

	const insertNamedVariable = (variableValue: string) => {
		if (!editor) return;

		editor
			.chain()
			.focus()
			.insertContent([
				{
					type: "mention",
					attrs: {
						id: variableValue,
					},
				},
				{ type: "text", text: " " },
			])
			.run();

		// The extractVariablesFromContent will be called automatically by onUpdate
		// and will assign the correct positional number based on order of appearance
	};

	if (!editor) return null;

	const maxChars = 1024;
	const isOverLimit = charCount > maxChars;
	console.log({
		content: content,
		parametros: parametros,
	});
	return (
		<ResponsiveMenuSection title="CORPO DA MENSAGEM" icon={<FileText size={15} />}>
			<div className="flex items-center flex-wrap gap-2 border-b border-primary/10 p-3">
				<div className="flex gap-1">
					<Button
						type="button"
						size="sm"
						variant={editor.isActive("bold") ? "default" : "ghost"}
						onClick={() => editor.chain().focus().toggleBold().run()}
					>
						<strong>B</strong>
					</Button>
					<Button
						type="button"
						size="sm"
						onClick={() => editor.chain().focus().toggleItalic().run()}
						variant={editor.isActive("italic") ? "default" : "ghost"}
					>
						<em>I</em>
					</Button>
					<Button
						type="button"
						size="sm"
						onClick={() => editor.chain().focus().toggleStrike().run()}
						variant={editor.isActive("strike") ? "default" : "ghost"}
					>
						<s>S</s>
					</Button>
				</div>

				<div className="h-6 w-px bg-gray-300" />

				<div className="flex gap-1">
					<Button
						type="button"
						size="sm"
						onClick={() => editor.chain().focus().toggleBulletList().run()}
						variant={editor.isActive("bulletList") ? "default" : "ghost"}
					>
						<List className="w-4 h-4 min-w-4 min-h-4" />
					</Button>
					<Button
						type="button"
						size="sm"
						onClick={() => editor.chain().focus().toggleOrderedList().run()}
						variant={editor.isActive("orderedList") ? "default" : "ghost"}
					>
						<ListOrdered className="w-4 h-4 min-w-4 min-h-4" />
					</Button>
				</div>

				<div className="h-6 w-px bg-gray-300" />

				<DropdownMenu modal={false}>
					<DropdownMenuTrigger asChild>
						<Button type="button" size="sm" variant="secondary" className="gap-1.5">
							<Braces className="h-3.5 w-3.5" />
							<span>+ VARIÁVEL</span>
							<ChevronDown className="h-3.5 w-3.5 opacity-70" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" sideOffset={8} className="z-110 w-[320px] overflow-hidden p-0">
						<div className="border-b bg-muted/40 px-3 py-2.5">
							<div className="flex items-center gap-2">
								<div className="rounded-md bg-primary/10 p-1.5 text-primary">
									<Braces className="h-3.5 w-3.5" />
								</div>
								<div className="flex flex-col">
									<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variáveis do template</span>
									<span className="text-xs text-muted-foreground">{WhatsappTemplateVariables.length} disponíveis</span>
								</div>
							</div>
						</div>
						<div className="max-h-[300px] overflow-y-auto p-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
						{WhatsappTemplateVariables.map((variable) => (
							<DropdownMenuItem key={variable.id} onSelect={() => insertNamedVariable(variable.value)} className="items-start rounded-md px-2 py-2">
								<div className="flex w-full items-start justify-between gap-3">
									<div className="flex min-w-0 flex-col">
										<span className="truncate font-medium">{variable.label}</span>
										<span className="truncate text-xs text-muted-foreground">{`{{${variable.value}}}`}</span>
									</div>
									<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">#{variable.id}</span>
								</div>
							</DropdownMenuItem>
						))}
						</div>
						<DropdownMenuSeparator className="my-0" />
						<div className="px-3 py-2 text-[11px] text-muted-foreground">Dica: digite <span className="font-mono">{"{"}</span> no editor para abrir sugestões rápidas.</div>
					</DropdownMenuContent>
				</DropdownMenu>

				<div className="ml-auto flex items-center gap-2">
					<span className={`text-sm font-medium ${isOverLimit ? "text-red-500" : "text-primary/60"}`}>
						{charCount} / {maxChars}
					</span>
				</div>
			</div>

			<EditorContent editor={editor} className="prose max-w-none p-6 min-h-[200px]" suppressHydrationWarning />

			{parametros.length > 0 && (
				<div className="border-t border-primary/10 p-3 space-y-3">
					<h4 className="text-sm font-semibold">Variáveis e Exemplos</h4>
					{parametros.map((param, index) => {
						// Find the variable label from WhatsappTemplateVariables
						const variableInfo = WhatsappTemplateVariables.find((v) => v.value === param.identificador);
						const displayLabel = variableInfo?.label || param.identificador || "Variável sem identificador";

						return (
							<div key={index.toString()} className="space-y-1">
								<div className="flex items-center gap-2">
									<span className="text-xs font-mono bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">{`{{${param.nome}}}`}</span>
									<span className="text-xs text-muted-foreground">→</span>
									<span className="text-xs font-medium">{displayLabel}</span>
								</div>
								<input
									type="text"
									value={param.exemplo}
									onChange={(e) => {
										const newParametros = [...parametros];
										newParametros[index] = { ...param, exemplo: e.target.value };
										onParametrosChange(newParametros);
									}}
									placeholder="Valor de exemplo"
									className="w-full px-2 py-1 text-sm border rounded"
								/>
							</div>
						);
					})}
				</div>
			)}

			<style jsx global>{`
				.ProseMirror {
					min-height: 200px;
					outline: none;
				}

				.ProseMirror p {
					margin: 0.5rem 0;
				}

				.ProseMirror ul,
				.ProseMirror ol {
					padding-left: 2rem;
				}
				
				.mention {
					background-color: rgba(0, 0, 0, 0.1);
					border-radius: 0.2rem;
					padding: 0.1rem 0.3rem;
					box-decoration-break: clone;
				}
				
				/* Dark mode */
				@media (prefers-color-scheme: dark) {
					.mention {
						background-color: rgba(255, 255, 255, 0.1);
					}
				}
			`}</style>
		</ResponsiveMenuSection>
	);
}

export default TemplateBodyEditor;
