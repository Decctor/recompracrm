export type TMetaTemplateCategory = "AUTHENTICATION" | "MARKETING" | "UTILITY";
export type TMetaTemplateStatus = "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED";
export type TMetaTemplateQuality = "HIGH" | "MEDIUM" | "LOW" | "PENDING";
export type TMetaTemplateParameterFormat = "POSITIONAL" | "NAMED";

export type TMetaTemplateExample = {
	header_text?: string[];
	header_handle?: string[];
	body_text?: string[][];
	body_text_named_params?: Array<{ param_name: string; example: string }>;
};

export type TMetaTemplateButton = {
	type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
	text: string;
	url?: string;
	phone_number?: string;
	example?: string[];
};

export type TMetaTemplateComponent = {
	type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
	format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";
	text?: string;
	example?: TMetaTemplateExample;
	buttons?: TMetaTemplateButton[];
};

export type TMetaTemplate = {
	id: string;
	name: string;
	status: TMetaTemplateStatus;
	category: TMetaTemplateCategory;
	language: string;
	parameter_format?: TMetaTemplateParameterFormat;
	components: TMetaTemplateComponent[];
	quality_score?: {
		score?: TMetaTemplateQuality;
	};
	rejected_reason?: string;
};

export type TMetaCreateTemplatePayload = {
	name: string;
	category: "authentication" | "marketing" | "utility";
	language: string;
	parameter_format: "positional" | "named";
	components: TMetaTemplateComponent[];
};

export type TWhatsappTemplateSendParameter =
	| { type: "text"; text: string }
	// Botão de resposta rápida: payload devolvido no toque (docs/dev-planning/survey-campaigns-plan.md §5.1).
	| { type: "payload"; payload: string }
	| { type: "image"; image: { link: string } }
	| { type: "video"; video: { link: string } }
	| { type: "document"; document: { link: string; filename?: string } };

export type TWhatsappTemplateSendComponent = {
	type: "header" | "body" | "button";
	sub_type?: "url" | "quick_reply";
	index?: string;
	parameters?: TWhatsappTemplateSendParameter[];
};

export type TWhatsappTemplateSendPayload = {
	messaging_product: "whatsapp";
	to: string;
	type: "template";
	template: {
		name: string;
		language: { code: string };
		components?: TWhatsappTemplateSendComponent[];
	};
};
