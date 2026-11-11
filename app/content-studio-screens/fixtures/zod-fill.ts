import type { ZodTypeAny } from "zod";

/**
 * Valor válido para qualquer schema Zod: booleanos ligados, textos vazios, números zero, enums na
 * primeira opção, defaults respeitados. Serve para as partes da sessão que a tela não mostra
 * (permissões e configuração da organização) sem copiar centenas de chaves à mão.
 */
export function fillFromSchema(schema: ZodTypeAny): unknown {
	const def = schema._def;
	switch (def.typeName) {
		case "ZodObject": {
			const shape = def.shape();
			return Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, fillFromSchema(value as ZodTypeAny)]));
		}
		case "ZodBoolean":
			return true;
		case "ZodString":
			return "";
		case "ZodNumber":
			return 0;
		case "ZodDate":
			return new Date("2026-11-01T12:00:00Z");
		case "ZodEnum":
			return def.values[0];
		case "ZodNativeEnum":
			return Object.values(def.values)[0];
		case "ZodLiteral":
			return def.value;
		case "ZodArray":
			return [];
		case "ZodRecord":
			return {};
		case "ZodDefault":
			return def.defaultValue();
		case "ZodOptional":
		case "ZodNullable":
			return fillFromSchema(def.innerType);
		case "ZodEffects":
			return fillFromSchema(def.schema);
		case "ZodUnion":
		case "ZodDiscriminatedUnion":
			return fillFromSchema(def.options[0]);
		case "ZodPipeline":
			return fillFromSchema(def.in);
		case "ZodLazy":
			return fillFromSchema(def.getter());
		default:
			return null;
	}
}
