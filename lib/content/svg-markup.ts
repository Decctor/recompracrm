import { Fragment, isValidElement, type ReactElement, type ReactNode } from "react";

// Serializa uma árvore React de SVG em string, sem `react-dom/server` (que o Next proíbe em rotas
// de metadata como opengraph-image). Serve às ilustrações isométricas: componentes de função
// puros, sem hooks nem contexto. Não use para UI genérica.
const ATTRIBUTE_NAMES: Record<string, string> = {
	className: "class",
	strokeWidth: "stroke-width",
	strokeLinecap: "stroke-linecap",
	strokeLinejoin: "stroke-linejoin",
	fillRule: "fill-rule",
	textAnchor: "text-anchor",
	fontSize: "font-size",
	fontWeight: "font-weight",
	fontFamily: "font-family",
};

function escape(value: string) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderSvgMarkup(node: ReactNode): string {
	if (node === null || node === undefined || typeof node === "boolean") return "";
	if (typeof node === "string" || typeof node === "number") return escape(String(node));
	if (Array.isArray(node)) return node.map(renderSvgMarkup).join("");
	if (!isValidElement(node)) return "";

	const element = node as ReactElement<Record<string, unknown> & { children?: ReactNode }>;
	const { type, props } = element;
	if (type === Fragment) return renderSvgMarkup(props.children);
	if (typeof type === "function") return renderSvgMarkup((type as (p: typeof props) => ReactNode)(props));
	if (typeof type !== "string") throw new Error("renderSvgMarkup: tipo de elemento não suportado");

	const attributes = Object.entries(props)
		.filter(([key, value]) => key !== "children" && value !== undefined && value !== null && value !== false && typeof value !== "function")
		.map(([key, value]) => `${ATTRIBUTE_NAMES[key] ?? key}="${escape(String(value))}"`)
		.join(" ");
	const children = renderSvgMarkup(props.children);
	const open = attributes ? `<${type} ${attributes}` : `<${type}`;
	return children ? `${open}>${children}</${type}>` : `${open}/>`;
}
