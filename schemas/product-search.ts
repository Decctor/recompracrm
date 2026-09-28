import { z } from "zod";
import { normalizeProductSearchTerms, PRODUCT_SEARCH_MAX_LENGTH, PRODUCT_SEARCH_MAX_TERMS } from "@/lib/products/search-terms";

// GET arrays follow the project's comma-separated query parameter convention.
export const ProductSearchQuerySchema = z
	.string({ required_error: "Busca não informada.", invalid_type_error: "Tipo inválido para busca." })
	.max(PRODUCT_SEARCH_MAX_TERMS * (PRODUCT_SEARCH_MAX_LENGTH + 1), "Busca muito longa.")
	.nullish()
	.transform(normalizeProductSearchTerms)
	.pipe(
		z
			.array(
				z
					.string({ required_error: "Termo não informado.", invalid_type_error: "Tipo inválido para termo." })
					.max(PRODUCT_SEARCH_MAX_LENGTH, "Cada termo pode ter até 100 caracteres."),
				{ required_error: "Termos não informados.", invalid_type_error: "Tipo inválido para termos." },
			)
			.max(PRODUCT_SEARCH_MAX_TERMS, "Busque até 5 termos por vez."),
	);
