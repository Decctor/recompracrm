"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TCommunityCourseAccessLevel, TCommunityCourseStatus } from "@/schemas/community";
import type { CourseFormState } from "./CourseForm";

type CourseFormMetadataBlockProps = {
	state: CourseFormState;
	updateState: <K extends keyof CourseFormState>(key: K, value: CourseFormState[K]) => void;
};

export default function CourseFormMetadataBlock({ state, updateState }: CourseFormMetadataBlockProps) {
	return (
		<div className="flex flex-col gap-4">
			{/* Title */}
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="titulo">Título do curso</Label>
				<Input
					id="titulo"
					placeholder="Ex: Introdução ao Marketing Digital"
					value={state.titulo}
					onChange={(e) => updateState("titulo", e.target.value)}
				/>
			</div>

			{/* Description */}
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="descricao">Descrição</Label>
				<Textarea
					id="descricao"
					placeholder="Descreva o conteúdo do curso..."
					value={state.descricao}
					onChange={(e) => updateState("descricao", e.target.value)}
					rows={3}
				/>
			</div>

			{/* Thumbnail URL */}
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="thumbnailUrl">URL da thumbnail</Label>
				<Input
					id="thumbnailUrl"
					placeholder="https://..."
					value={state.thumbnailUrl}
					onChange={(e) => updateState("thumbnailUrl", e.target.value)}
				/>
			</div>

			{/* Access Level + Status row */}
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				{/* Access Level */}
				<div className="flex flex-col gap-1.5">
					<Label>Nível de acesso</Label>
					<Select
						value={state.nivelAcesso}
						onValueChange={(v) => updateState("nivelAcesso", v as TCommunityCourseAccessLevel)}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="PUBLICO">Público</SelectItem>
							<SelectItem value="AUTENTICADO">Autenticado</SelectItem>
							<SelectItem value="ASSINATURA">Assinatura</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{/* Status */}
				<div className="flex flex-col gap-1.5">
					<Label>Status</Label>
					<Select
						value={state.status}
						onValueChange={(v) => updateState("status", v as TCommunityCourseStatus)}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="RASCUNHO">Rascunho</SelectItem>
							<SelectItem value="PUBLICADO">Publicado</SelectItem>
							<SelectItem value="ARQUIVADO">Arquivado</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>
		</div>
	);
}
