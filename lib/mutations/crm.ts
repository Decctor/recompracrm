import type {
	TCreateActivityInput,
	TCreateActivityOutput,
	TDeleteActivityOutput,
	TUpdateActivityInput,
	TUpdateActivityOutput,
} from "@/app/api/admin/crm/activities/route";
import type {
	TCreateTemplateInput,
	TCreateTemplateOutput,
	TDeleteTemplateOutput,
	TUpdateTemplateInput,
	TUpdateTemplateOutput,
} from "@/app/api/admin/crm/activity-templates/route";
import type { TMoveLeadInput, TMoveLeadOutput } from "@/app/api/admin/crm/leads/kanban/route";
import type { TCreateLeadInput, TCreateLeadOutput, TDeleteLeadOutput, TUpdateLeadInput, TUpdateLeadOutput } from "@/app/api/admin/crm/leads/route";
import type {
	TCreateNoteInput,
	TCreateNoteOutput,
	TDeleteNoteInput,
	TDeleteNoteOutput,
	TUpdateNoteInput,
	TUpdateNoteOutput,
} from "@/app/api/admin/crm/notes/route";
import axios from "axios";

// ==================== Leads ====================

export async function createInternalLead(info: TCreateLeadInput) {
	try {
		const { data } = await axios.post<TCreateLeadOutput>("/api/admin/crm/leads", info);
		return data;
	} catch (error) {
		console.log("Error running createInternalLead", error);
		throw error;
	}
}

export async function updateInternalLead(input: TUpdateLeadInput) {
	const { data } = await axios.put<TUpdateLeadOutput>(`/api/admin/crm/leads?id=${input.leadId}`, input);
	return data;
}

export async function deleteInternalLead(id: string) {
	try {
		const { data } = await axios.delete<TDeleteLeadOutput>(`/api/admin/crm/leads?id=${id}`);
		return data;
	} catch (error) {
		console.log("Error running deleteInternalLead", error);
		throw error;
	}
}

export async function moveInternalLead(info: TMoveLeadInput) {
	try {
		const { data } = await axios.patch<TMoveLeadOutput>("/api/admin/crm/leads/kanban", info);
		return data;
	} catch (error) {
		console.log("Error running moveInternalLead", error);
		throw error;
	}
}

// ==================== Activities ====================

export async function createActivity(info: TCreateActivityInput) {
	try {
		const { data } = await axios.post<TCreateActivityOutput>("/api/admin/crm/activities", info);
		return data;
	} catch (error) {
		console.log("Error running createActivity", error);
		throw error;
	}
}

export async function updateActivity(input: TUpdateActivityInput) {
	try {
		const { data } = await axios.put<TUpdateActivityOutput>("/api/admin/crm/activities", input);
		return data;
	} catch (error) {
		console.log("Error running updateActivity", error);
		throw error;
	}
}

export async function completeActivity(id: string) {
	try {
		const { data } = await axios.put<TUpdateActivityOutput>(`/api/admin/crm/activities?id=${id}`, {
			activity: { status: "CONCLUIDA" },
		});
		return data;
	} catch (error) {
		console.log("Error running completeActivity", error);
		throw error;
	}
}

export async function deleteActivity(id: string) {
	try {
		const { data } = await axios.delete<TDeleteActivityOutput>(`/api/admin/crm/activities?id=${id}`);
		return data;
	} catch (error) {
		console.log("Error running deleteActivity", error);
		throw error;
	}
}

// ==================== Notes ====================

export async function createNote(info: TCreateNoteInput) {
	try {
		const { data } = await axios.post<TCreateNoteOutput>("/api/admin/crm/notes", info);
		return data;
	} catch (error) {
		console.log("Error running createNote", error);
		throw error;
	}
}

export async function updateNote({ id, conteudo }: TUpdateNoteInput & { id: string }) {
	try {
		const { data } = await axios.put<TUpdateNoteOutput>(`/api/admin/crm/notes?id=${id}`, { conteudo });
		return data;
	} catch (error) {
		console.log("Error running updateNote", error);
		throw error;
	}
}

export async function deleteNote(input: TDeleteNoteInput) {
	try {
		const { data } = await axios.delete<TDeleteNoteOutput>(`/api/admin/crm/notes?id=${input.id}`);
		return data;
	} catch (error) {
		console.log("Error running deleteNote", error);
		throw error;
	}
}

// ==================== Activity Templates ====================

export async function createActivityTemplate(info: TCreateTemplateInput) {
	try {
		const { data } = await axios.post<TCreateTemplateOutput>("/api/admin/crm/activity-templates", info);
		return data;
	} catch (error) {
		console.log("Error running createActivityTemplate", error);
		throw error;
	}
}

export async function updateActivityTemplate({ id, ...info }: TUpdateTemplateInput & { id: string }) {
	try {
		const { data } = await axios.put<TUpdateTemplateOutput>(`/api/admin/crm/activity-templates?id=${id}`, info);
		return data;
	} catch (error) {
		console.log("Error running updateActivityTemplate", error);
		throw error;
	}
}

export async function deleteActivityTemplate(id: string) {
	try {
		const { data } = await axios.delete<TDeleteTemplateOutput>(`/api/admin/crm/activity-templates?id=${id}`);
		return data;
	} catch (error) {
		console.log("Error running deleteActivityTemplate", error);
		throw error;
	}
}
