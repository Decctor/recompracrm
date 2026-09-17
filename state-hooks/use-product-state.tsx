import { ProductFiscalProfileSchema } from "@/schemas/fiscal";
import {
	ProductAddOnOptionSchema,
	ProductAddOnSchema,
	ProductOptionSchema,
	ProductOptionValueSchema,
	ProductSchema,
	ProductVariantSchema,
} from "@/schemas/products";
import { buildVariantMatrixCombos, variantComboSignature } from "@/lib/products/variant-matrix";
import { useCallback, useMemo, useState } from "react";
import z from "zod";

// -----------------------------------------------------------------------------
// VARIANT OPTIONS — local state schemas (eixos/valores estruturados)
// -----------------------------------------------------------------------------
// referenciaId is a client-side stable key used to wire variants <-> values
// before any server id exists, so the matrix can be generated fully in-memory.

export const VariantOptionValueRefStateSchema = z.object({
	id: z.string().optional(), // junction row id (when persisted)
	opcaoReferenciaId: z.string(), // local key -> productOptions[].referenciaId
	valorReferenciaId: z.string(), // local key -> option value referenciaId
	opcaoId: z.string().optional().nullable(), // resolved server id (edit flow)
	opcaoValorId: z.string().optional().nullable(),
	deletar: z.boolean().optional(),
});
export type TVariantOptionValueRefState = z.infer<typeof VariantOptionValueRefStateSchema>;

export const ProductOptionValueStateSchema = ProductOptionValueSchema.omit({ organizacaoId: true, opcaoId: true }).extend({
	referenciaId: z.string(),
	id: z.string().optional(),
	deletar: z.boolean().optional(),
});
export type TProductOptionValueState = z.infer<typeof ProductOptionValueStateSchema>;

export const ProductOptionStateSchema = ProductOptionSchema.omit({ organizacaoId: true, produtoId: true }).extend({
	referenciaId: z.string(),
	id: z.string().optional(),
	deletar: z.boolean().optional(),
	valores: z.array(ProductOptionValueStateSchema),
});
export type TProductOptionState = z.infer<typeof ProductOptionStateSchema>;

export const ProductStateSchema = z.object({
	product: ProductSchema.omit({ organizacaoId: true }).extend({
		// Sempre definido no estado do formulário (o hook aplica o default), embora opcional no payload.
		vendavel: z.boolean(),
		imagemCapaHolder: z.object({
			file: z.instanceof(File).optional().nullable(),
			previewUrl: z
				.string({
					required_error: "URL da imagem capa do produto não informada.",
					invalid_type_error: "Tipo não válido para URL da imagem capa do produto.",
				})
				.optional()
				.nullable(),
		}),
	}),

	productVariants: z.array(
		ProductVariantSchema.omit({ organizacaoId: true, produtoId: true }).extend({
			imagemCapaHolder: z.object({
				file: z.instanceof(File).optional().nullable(),
				previewUrl: z
					.string({
						required_error: "URL da imagem capa da variante não informada.",
						invalid_type_error: "Tipo não válido para URL da imagem capa da variante.",
					})
					.optional()
					.nullable(),
			}),
			perfisFiscais: z.array(
				ProductFiscalProfileSchema.omit({ organizacaoId: true, produtoId: true, produtoVarianteId: true }).extend({
					id: z
						.string({
							required_error: "ID do perfil fiscal não informado.",
							invalid_type_error: "Tipo não válido para ID do perfil fiscal.",
						})
						.optional(),
					deletar: z
						.boolean({
							required_error: "Deletar perfil fiscal não informado.",
							invalid_type_error: "Tipo não válido para deletar perfil fiscal.",
						})
						.optional(),
				}),
			),
			addOns: z.array(
				ProductAddOnSchema.omit({ organizacaoId: true }).extend({
					opcoes: z.array(
						ProductAddOnOptionSchema.omit({ organizacaoId: true, produtoAddOnId: true }).extend({
							produtoConsumo: z
								.string({
									required_error: "ID do produto de consumo não informado.",
									invalid_type_error: "Tipo não válido para ID do produto de consumo.",
								})
								.optional()
								.nullable(),
							id: z
								.string({
									required_error: "ID da opção não informado.",
									invalid_type_error: "Tipo não válido para ID da opção.",
								})
								.optional(),
							deletar: z
								.boolean({
									required_error: "Deletar opção não informado.",
									invalid_type_error: "Tipo não válido para deletar opção.",
								})
								.optional(),
						}),
					),
					id: z
						.string({
							required_error: "ID do adicional não informado.",
							invalid_type_error: "Tipo não válido para ID do adicional.",
						})
						.optional(),
					deletar: z
						.boolean({
							required_error: "Deletar adicional não informado.",
							invalid_type_error: "Tipo não válido para deletar adicional.",
						})
						.optional(),
				}),
			),
			opcoesValores: z.array(VariantOptionValueRefStateSchema).optional(),
			id: z
				.string({
					required_error: "ID da variante não informado.",
					invalid_type_error: "Tipo não válido para ID da variante.",
				})
				.optional(),
			deletar: z
				.boolean({
					required_error: "Deletar variante não informado.",
					invalid_type_error: "Tipo não válido para deletar variante.",
				})
				.optional(),
		}),
	),
	productOptions: z.array(ProductOptionStateSchema),
	productAddOns: z.array(
		ProductAddOnSchema.omit({ organizacaoId: true }).extend({
			opcoes: z.array(
				ProductAddOnOptionSchema.omit({ organizacaoId: true, produtoAddOnId: true }).extend({
					produtoConsumo: z
						.string({
							required_error: "ID do produto de consumo não informado.",
							invalid_type_error: "Tipo não válido para ID do produto de consumo.",
						})
						.optional()
						.nullable(),
					id: z
						.string({
							required_error: "ID da opção não informado.",
							invalid_type_error: "Tipo não válido para ID da opção.",
						})
						.optional(),
					deletar: z
						.boolean({
							required_error: "Deletar opção não informado.",
							invalid_type_error: "Tipo não válido para deletar opção.",
						})
						.optional(),
				}),
			),
			id: z
				.string({
					required_error: "ID do adicional não informado.",
					invalid_type_error: "Tipo não válido para ID do adicional.",
				})
				.optional(),
			deletar: z
				.boolean({
					required_error: "Deletar adicional não informado.",
					invalid_type_error: "Tipo não válido para deletar adicional.",
				})
				.optional(),
			// Regra deste produto (override no vínculo produto↔grupo): null = herda min/max do grupo.
			vinculoMinOpcoes: z
				.number({
					invalid_type_error: "Tipo não válido para mínimo de opções do vínculo.",
				})
				.optional()
				.nullable(),
			vinculoMaxOpcoes: z
				.number({
					invalid_type_error: "Tipo não válido para máximo de opções do vínculo.",
				})
				.optional()
				.nullable(),
		}),
	),
	productFiscalProfiles: z.array(
		ProductFiscalProfileSchema.omit({ organizacaoId: true, produtoId: true, produtoVarianteId: true }).extend({
			id: z
				.string({
					required_error: "ID do perfil fiscal não informado.",
					invalid_type_error: "Tipo não válido para ID do perfil fiscal.",
				})
				.optional(),
			deletar: z
				.boolean({
					required_error: "Deletar perfil fiscal não informado.",
					invalid_type_error: "Tipo não válido para deletar perfil fiscal.",
				})
				.optional(),
		}),
	),
});

export type TProductState = z.infer<typeof ProductStateSchema>;
export type TProductAddOnState = TProductState["productAddOns"][number];
export type TProductAddOnOptionState = TProductAddOnState["opcoes"][number];
export type TVariantAddOnState = TProductVariantState["addOns"][number];

type UseProductStateProps = {
	initialState?: Partial<TProductState>;
};
export const useProductState = ({ initialState }: UseProductStateProps = {}) => {
	const [state, setState] = useState<TProductState>({
		product: {
			vendavel: initialState?.product?.vendavel ?? true,
			codigo: initialState?.product?.codigo ?? "",
			nome: initialState?.product?.nome ?? "",
			descricao: initialState?.product?.descricao ?? null,
			unidade: initialState?.product?.unidade ?? "",
			ncm: initialState?.product?.ncm ?? "",
			tipo: initialState?.product?.tipo ?? "",
			grupo: initialState?.product?.grupo ?? "",
			rastreamentoEstoqueAtivo: initialState?.product?.rastreamentoEstoqueAtivo ?? false,
			imagemCapaHolder: {
				file: initialState?.product?.imagemCapaHolder?.file ?? null,
				previewUrl: initialState?.product?.imagemCapaHolder?.previewUrl ?? null,
			},
		},
		productFiscalProfiles: initialState?.productFiscalProfiles ?? [],
		productVariants: initialState?.productVariants ?? [],
		productOptions: initialState?.productOptions ?? [],
		productAddOns: initialState?.productAddOns ?? [],
	});

	// ===== PRODUTO PRINCIPAL =====

	const updateProduct = useCallback((updates: Partial<Omit<TProductState["product"], "imagemCapaHolder">>) => {
		setState((prev) => ({
			...prev,
			product: {
				...prev.product,
				...updates,
			},
		}));
	}, []);

	const updateProductImageHolder = useCallback((holder: Partial<TProductState["product"]["imagemCapaHolder"]>) => {
		setState((prev) => ({
			...prev,
			product: {
				...prev.product,
				imagemCapaHolder: {
					...prev.product.imagemCapaHolder,
					...holder,
				},
			},
		}));
	}, []);

	// ===== VARIANTES DO PRODUTO =====

	const addProductVariant = useCallback((variant: TProductVariantState) => {
		setState((prev) => ({
			...prev,
			productVariants: [...prev.productVariants, variant],
		}));
	}, []);

	const updateProductVariant = useCallback((index: number, updates: Partial<Omit<TProductVariantState, "imagemCapaHolder" | "addOns">>) => {
		setState((prev) => ({
			...prev,
			productVariants: prev.productVariants.map((variant, i) => (i === index ? { ...variant, ...updates } : variant)),
		}));
	}, []);

	const updateProductVariantImageHolder = useCallback((variantIndex: number, holder: Partial<TProductVariantState["imagemCapaHolder"]>) => {
		setState((prev) => ({
			...prev,
			productVariants: prev.productVariants.map((variant, i) =>
				i === variantIndex
					? {
							...variant,
							imagemCapaHolder: {
								...variant.imagemCapaHolder,
								...holder,
							},
						}
					: variant,
			),
		}));
	}, []);

	const removeProductVariant = useCallback((index: number) => {
		setState((prev) => {
			const variant = prev.productVariants[index];
			// Se é uma variante existente (tem id), marca como deletar
			if (variant?.id) {
				return {
					...prev,
					productVariants: prev.productVariants.map((v, i) => (i === index ? { ...v, deletar: true } : v)),
				};
			}
			// Se é nova (sem id), remove da lista
			return {
				...prev,
				productVariants: prev.productVariants.filter((_, i) => i !== index),
			};
		});
	}, []);

	// ===== EIXOS DE VARIAÇÃO (OPTIONS) E SEUS VALORES =====

	const addProductOption = useCallback((option?: Partial<TProductOptionState>) => {
		setState((prev) => ({
			...prev,
			productOptions: [
				...prev.productOptions,
				{
					referenciaId: option?.referenciaId ?? crypto.randomUUID(),
					id: option?.id,
					nome: option?.nome ?? "",
					tipo: option?.tipo ?? "TEXTO",
					ordem: option?.ordem ?? prev.productOptions.filter((o) => !o.deletar).length,
					valores: option?.valores ?? [],
					deletar: option?.deletar,
				},
			],
		}));
	}, []);

	const updateProductOption = useCallback((index: number, updates: Partial<Omit<TProductOptionState, "valores" | "referenciaId">>) => {
		setState((prev) => ({
			...prev,
			productOptions: prev.productOptions.map((option, i) => (i === index ? { ...option, ...updates } : option)),
		}));
	}, []);

	const removeProductOption = useCallback((index: number) => {
		setState((prev) => {
			const option = prev.productOptions[index];
			// Existente (tem id) -> soft-delete; nova -> remove da lista
			if (option?.id) {
				return {
					...prev,
					productOptions: prev.productOptions.map((o, i) => (i === index ? { ...o, deletar: true } : o)),
				};
			}
			return {
				...prev,
				productOptions: prev.productOptions.filter((_, i) => i !== index),
			};
		});
	}, []);

	const addProductOptionValue = useCallback((optionIndex: number, value?: Partial<TProductOptionValueState>) => {
		setState((prev) => ({
			...prev,
			productOptions: prev.productOptions.map((option, i) => {
				if (i !== optionIndex) return option;
				return {
					...option,
					valores: [
						...option.valores,
						{
							referenciaId: value?.referenciaId ?? crypto.randomUUID(),
							id: value?.id,
							nome: value?.nome ?? "",
							valorAuxiliar: value?.valorAuxiliar ?? null,
							imagemCapaUrl: value?.imagemCapaUrl ?? null,
							ordem: value?.ordem ?? option.valores.filter((v) => !v.deletar).length,
							deletar: value?.deletar,
						},
					],
				};
			}),
		}));
	}, []);

	const updateProductOptionValue = useCallback(
		(optionIndex: number, valueIndex: number, updates: Partial<Omit<TProductOptionValueState, "referenciaId">>) => {
			setState((prev) => ({
				...prev,
				productOptions: prev.productOptions.map((option, i) =>
					i === optionIndex ? { ...option, valores: option.valores.map((v, j) => (j === valueIndex ? { ...v, ...updates } : v)) } : option,
				),
			}));
		},
		[],
	);

	const removeProductOptionValue = useCallback((optionIndex: number, valueIndex: number) => {
		setState((prev) => ({
			...prev,
			productOptions: prev.productOptions.map((option, i) => {
				if (i !== optionIndex) return option;
				const value = option.valores[valueIndex];
				// Existente (tem id) -> soft-delete; novo -> remove da lista
				if (value?.id) {
					return { ...option, valores: option.valores.map((v, j) => (j === valueIndex ? { ...v, deletar: true } : v)) };
				}
				return { ...option, valores: option.valores.filter((_, j) => j !== valueIndex) };
			}),
		}));
	}, []);

	// Gera o produto cartesiano dos eixos ativos em variantes, reconciliando com as
	// variantes ja existentes pela assinatura da combinacao de valores:
	// - combinacao existente -> preservada (e reativada se estava marcada p/ remover)
	// - combinacao nova -> variante nova
	// - variante de matriz cuja combinacao deixou de existir -> soft-delete (se persistida) ou descartada
	// Variantes "planas" (sem opcoesValores) sao preservadas intactas.
	const generateVariantMatrix = useCallback((defaults?: { precoVenda?: number; precoCusto?: number }) => {
		setState((prev) => {
			const combos = buildVariantMatrixCombos(prev.productOptions);
			if (combos.length === 0) return prev;

			const flatVariants = prev.productVariants.filter((variant) => (variant.opcoesValores ?? []).length === 0);
			const matrixVariants = prev.productVariants.filter((variant) => (variant.opcoesValores ?? []).length > 0);
			const matrixBySignature = new Map(matrixVariants.map((variant) => [variantComboSignature(variant.opcoesValores ?? []), variant]));

			const kept: TProductState["productVariants"] = combos.map((combo) => {
				const signature = variantComboSignature(combo);
				const existing = matrixBySignature.get(signature);
				if (existing) {
					matrixBySignature.delete(signature);
					return { ...existing, deletar: undefined };
				}
				const newVariant: TProductState["productVariants"][number] = {
					nome: combo.map((ref) => ref.valorNome).join(" / "),
					codigo: "",
					precoCusto: defaults?.precoCusto ?? 0,
					precoVenda: defaults?.precoVenda ?? 0,
					quantidade: 0,
					ativo: true,
					rastreamentoEstoqueAtivo: false,
					imagemCapaHolder: { file: null, previewUrl: null },
					perfisFiscais: [],
					addOns: [],
					opcoesValores: combo.map((ref) => ({ opcaoReferenciaId: ref.opcaoReferenciaId, valorReferenciaId: ref.valorReferenciaId })),
				};
				return newVariant;
			});

			const removed: TProductState["productVariants"] = [];
			for (const variant of matrixBySignature.values()) {
				if (variant.id) removed.push({ ...variant, deletar: true });
			}

			return { ...prev, productVariants: [...flatVariants, ...kept, ...removed] };
		});
	}, []);

	// ===== ADD-ONS DO PRODUTO PRINCIPAL =====

	const addProductAddOn = useCallback((addOn: TProductAddOnState) => {
		setState((prev) => ({
			...prev,
			productAddOns: [...prev.productAddOns, addOn],
		}));
	}, []);

	const updateProductAddOn = useCallback((index: number, updates: Partial<Omit<TProductAddOnState, "opcoes">>) => {
		setState((prev) => ({
			...prev,
			productAddOns: prev.productAddOns.map((addOn, i) => (i === index ? { ...addOn, ...updates } : addOn)),
		}));
	}, []);

	const removeProductAddOn = useCallback((index: number) => {
		setState((prev) => {
			const addOn = prev.productAddOns[index];
			// Se é um add-on existente (tem id), marca como deletar
			if (addOn?.id) {
				return {
					...prev,
					productAddOns: prev.productAddOns.map((a, i) => (i === index ? { ...a, deletar: true } : a)),
				};
			}
			// Se é novo (sem id), remove da lista
			return {
				...prev,
				productAddOns: prev.productAddOns.filter((_, i) => i !== index),
			};
		});
	}, []);

	const moveProductAddOn = useCallback((index: number, direction: "up" | "down") => {
		setState((prev) => {
			const visible = prev.productAddOns
				.map((addOn, originalIndex) => ({ addOn, originalIndex }))
				.filter(({ addOn }) => !addOn.deletar);
			const position = visible.findIndex(({ originalIndex }) => originalIndex === index);
			const target = direction === "up" ? position - 1 : position + 1;
			if (position < 0 || target < 0 || target >= visible.length) return prev;

			const reorderedVisible = visible.map(({ addOn }) => addOn);
			const [moved] = reorderedVisible.splice(position, 1);
			reorderedVisible.splice(target, 0, moved);

			return {
				...prev,
				productAddOns: [...reorderedVisible, ...prev.productAddOns.filter((addOn) => addOn.deletar)],
			};
		});
	}, []);

	// ===== OPÇÕES DE ADD-ON DO PRODUTO =====

	const addProductAddOnOption = useCallback((addOnIndex: number, option: TProductAddOnOptionState) => {
		setState((prev) => ({
			...prev,
			productAddOns: prev.productAddOns.map((addOn, i) =>
				i === addOnIndex
					? {
							...addOn,
							opcoes: [...addOn.opcoes, option],
						}
					: addOn,
			),
		}));
	}, []);

	const updateProductAddOnOption = useCallback((addOnIndex: number, optionIndex: number, updates: Partial<TProductAddOnOptionState>) => {
		setState((prev) => ({
			...prev,
			productAddOns: prev.productAddOns.map((addOn, i) =>
				i === addOnIndex
					? {
							...addOn,
							opcoes: addOn.opcoes.map((option, j) => (j === optionIndex ? { ...option, ...updates } : option)),
						}
					: addOn,
			),
		}));
	}, []);

	const removeProductAddOnOption = useCallback((addOnIndex: number, optionIndex: number) => {
		setState((prev) => ({
			...prev,
			productAddOns: prev.productAddOns.map((addOn, i) => {
				if (i !== addOnIndex) return addOn;

				const option = addOn.opcoes[optionIndex];
				// Se é uma opção existente (tem id), marca como deletar
				if (option?.id) {
					return {
						...addOn,
						opcoes: addOn.opcoes.map((o, j) => (j === optionIndex ? { ...o, deletar: true } : o)),
					};
				}
				// Se é nova (sem id), remove da lista
				return {
					...addOn,
					opcoes: addOn.opcoes.filter((_, j) => j !== optionIndex),
				};
			}),
		}));
	}, []);

	// ===== ADD-ONS DE VARIANTE =====

	const addVariantAddOn = useCallback((variantIndex: number, addOn: TVariantAddOnState) => {
		setState((prev) => ({
			...prev,
			productVariants: prev.productVariants.map((variant, i) =>
				i === variantIndex
					? {
							...variant,
							addOns: [...variant.addOns, addOn],
						}
					: variant,
			),
		}));
	}, []);

	const updateVariantAddOn = useCallback((variantIndex: number, addOnIndex: number, updates: Partial<Omit<TVariantAddOnState, "opcoes">>) => {
		setState((prev) => ({
			...prev,
			productVariants: prev.productVariants.map((variant, i) =>
				i === variantIndex
					? {
							...variant,
							addOns: variant.addOns.map((addOn, j) => (j === addOnIndex ? { ...addOn, ...updates } : addOn)),
						}
					: variant,
			),
		}));
	}, []);

	const removeVariantAddOn = useCallback((variantIndex: number, addOnIndex: number) => {
		setState((prev) => ({
			...prev,
			productVariants: prev.productVariants.map((variant, i) => {
				if (i !== variantIndex) return variant;

				const addOn = variant.addOns[addOnIndex];
				// Se é um add-on existente (tem id), marca como deletar
				if (addOn?.id) {
					return {
						...variant,
						addOns: variant.addOns.map((a, j) => (j === addOnIndex ? { ...a, deletar: true } : a)),
					};
				}
				// Se é novo (sem id), remove da lista
				return {
					...variant,
					addOns: variant.addOns.filter((_, j) => j !== addOnIndex),
				};
			}),
		}));
	}, []);

	// ===== OPÇÕES DE ADD-ON DE VARIANTE =====

	const addVariantAddOnOption = useCallback((variantIndex: number, addOnIndex: number, option: TProductAddOnOptionState) => {
		setState((prev) => ({
			...prev,
			productVariants: prev.productVariants.map((variant, i) =>
				i === variantIndex
					? {
							...variant,
							addOns: variant.addOns.map((addOn, j) =>
								j === addOnIndex
									? {
											...addOn,
											opcoes: [...addOn.opcoes, option],
										}
									: addOn,
							),
						}
					: variant,
			),
		}));
	}, []);

	const updateVariantAddOnOption = useCallback(
		(variantIndex: number, addOnIndex: number, optionIndex: number, updates: Partial<TProductAddOnOptionState>) => {
			setState((prev) => ({
				...prev,
				productVariants: prev.productVariants.map((variant, i) =>
					i === variantIndex
						? {
								...variant,
								addOns: variant.addOns.map((addOn, j) =>
									j === addOnIndex
										? {
												...addOn,
												opcoes: addOn.opcoes.map((option, k) => (k === optionIndex ? { ...option, ...updates } : option)),
											}
										: addOn,
								),
							}
						: variant,
				),
			}));
		},
		[],
	);

	const removeVariantAddOnOption = useCallback((variantIndex: number, addOnIndex: number, optionIndex: number) => {
		setState((prev) => ({
			...prev,
			productVariants: prev.productVariants.map((variant, i) => {
				if (i !== variantIndex) return variant;

				return {
					...variant,
					addOns: variant.addOns.map((addOn, j) => {
						if (j !== addOnIndex) return addOn;

						const option = addOn.opcoes[optionIndex];
						// Se é uma opção existente (tem id), marca como deletar
						if (option?.id) {
							return {
								...addOn,
								opcoes: addOn.opcoes.map((o, k) => (k === optionIndex ? { ...o, deletar: true } : o)),
							};
						}
						// Se é nova (sem id), remove da lista
						return {
							...addOn,
							opcoes: addOn.opcoes.filter((_, k) => k !== optionIndex),
						};
					}),
				};
			}),
		}));
	}, []);

	// ===== PERFIS FISCAIS DO PRODUTO =====

	const addProductFiscalProfile = useCallback((profile: TProductState["productFiscalProfiles"][number]) => {
		setState((prev) => ({
			...prev,
			productFiscalProfiles: [...prev.productFiscalProfiles, profile],
		}));
	}, []);

	const updateProductFiscalProfile = useCallback((index: number, updates: Partial<Omit<TProductState["productFiscalProfiles"][number], "id">>) => {
		setState((prev) => ({
			...prev,
			productFiscalProfiles: prev.productFiscalProfiles.map((profile, i) => (i === index ? { ...profile, ...updates } : profile)),
		}));
	}, []);

	const removeProductFiscalProfile = useCallback((fiscalProfileIndex: number) => {
		setState((prev) => {
			const fiscalProfile = prev.productFiscalProfiles[fiscalProfileIndex];
			// Se é um perfil fiscal existente (tem id), marca como deletar
			if (fiscalProfile?.id) {
				return {
					...prev,
					productFiscalProfiles: prev.productFiscalProfiles.map((profile, i) => (i === fiscalProfileIndex ? { ...profile, deletar: true } : profile)),
				};
			}
			// Se é novo (sem id), remove da lista
			return {
				...prev,
				productFiscalProfiles: prev.productFiscalProfiles.filter((_, i) => i !== fiscalProfileIndex),
			};
		});
	}, []);

	// ===== PERFIS FISCAIS DE VARIANTE =====

	const addVariantFiscalProfile = useCallback((variantIndex: number, profile: TProductState["productVariants"][number]["perfisFiscais"][number]) => {
		setState((prev) => ({
			...prev,
			productVariants: prev.productVariants.map((variant, i) =>
				i === variantIndex ? { ...variant, perfisFiscais: [...variant.perfisFiscais, profile] } : variant,
			),
		}));
	}, []);

	const updateVariantFiscalProfile = useCallback(
		(variantIndex: number, profileIndex: number, updates: Partial<Omit<TProductState["productVariants"][number]["perfisFiscais"][number], "id">>) => {
			setState((prev) => ({
				...prev,
				productVariants: prev.productVariants.map((variant, i) =>
					i === variantIndex
						? { ...variant, perfisFiscais: variant.perfisFiscais.map((profile, j) => (j === profileIndex ? { ...profile, ...updates } : profile)) }
						: variant,
				),
			}));
		},
		[],
	);

	const removeVariantFiscalProfile = useCallback((variantIndex: number, profileIndex: number) => {
		setState((prev) => ({
			...prev,
			productVariants: prev.productVariants.map((variant, vIdx) => {
				if (vIdx !== variantIndex) return variant;

				const fiscalProfileFound = variant.perfisFiscais[profileIndex];
				// Se é um perfil fiscal existente (tem id), marca como deletar
				if (fiscalProfileFound?.id) {
					return {
						...variant,
						perfisFiscais: variant.perfisFiscais.map((profile, fpIdx) => (fpIdx === profileIndex ? { ...profile, deletar: true } : profile)),
					};
				}
				// Se é novo (sem id), remove da lista
				return {
					...variant,
					perfisFiscais: variant.perfisFiscais.filter((_, fpIdx) => fpIdx !== profileIndex),
				};
			}),
		}));
	}, []);
	// ===== RESET E ESTADO COMPLETO =====

	const resetState = useCallback((newState: TProductState) => {
		setState(newState);
	}, []);

	const redefineState = useCallback((newState: TProductState) => {
		setState(newState);
	}, []);
	return {
		state,
		// Produto principal
		updateProduct,
		updateProductImageHolder,
		// Variantes
		addProductVariant,
		updateProductVariant,
		updateProductVariantImageHolder,
		removeProductVariant,
		// Eixos de variação e seus valores
		addProductOption,
		updateProductOption,
		removeProductOption,
		addProductOptionValue,
		updateProductOptionValue,
		removeProductOptionValue,
		generateVariantMatrix,
		// Add-ons do produto
		addProductAddOn,
		updateProductAddOn,
		removeProductAddOn,
		moveProductAddOn,
		// Opções de add-on do produto
		addProductAddOnOption,
		updateProductAddOnOption,
		removeProductAddOnOption,
		// Add-ons de variante
		addVariantAddOn,
		updateVariantAddOn,
		removeVariantAddOn,
		// Opções de add-on de variante
		addVariantAddOnOption,
		updateVariantAddOnOption,
		removeVariantAddOnOption,
		// Perfis fiscais do produto
		addProductFiscalProfile,
		updateProductFiscalProfile,
		removeProductFiscalProfile,
		// Perfis fiscais de variante
		addVariantFiscalProfile,
		updateVariantFiscalProfile,
		removeVariantFiscalProfile,
		// Utilitários
		resetState,
		redefineState,
	};
};
export type TUseProductState = ReturnType<typeof useProductState>;

export const ProductVariantStateSchema = ProductVariantSchema.omit({ organizacaoId: true, produtoId: true }).extend({
	imagemCapaHolder: z.object({
		file: z.instanceof(File).optional().nullable(),
		previewUrl: z
			.string({
				required_error: "URL da imagem capa da variante não informada.",
				invalid_type_error: "Tipo não válido para URL da imagem capa da variante.",
			})
			.optional()
			.nullable(),
	}),
	perfisFiscais: z.array(
		ProductFiscalProfileSchema.omit({ organizacaoId: true, produtoId: true, produtoVarianteId: true }).extend({
			id: z
				.string({
					required_error: "ID do perfil fiscal não informado.",
					invalid_type_error: "Tipo não válido para ID do perfil fiscal.",
				})
				.optional(),
			deletar: z
				.boolean({
					required_error: "Deletar perfil fiscal não informado.",
					invalid_type_error: "Tipo não válido para deletar perfil fiscal.",
				})
				.optional(),
		}),
	),
	addOns: z.array(
		ProductAddOnSchema.omit({ organizacaoId: true }).extend({
			opcoes: z.array(
				ProductAddOnOptionSchema.omit({ organizacaoId: true, produtoAddOnId: true }).extend({
					produtoConsumo: z
						.string({
							required_error: "ID do produto de consumo não informado.",
							invalid_type_error: "Tipo não válido para ID do produto de consumo.",
						})
						.optional()
						.nullable(),
					id: z
						.string({
							required_error: "ID da opção não informado.",
							invalid_type_error: "Tipo não válido para ID da opção.",
						})
						.optional(),
					deletar: z
						.boolean({
							required_error: "Deletar opção não informado.",
							invalid_type_error: "Tipo não válido para deletar opção.",
						})
						.optional(),
				}),
			),
			id: z
				.string({
					required_error: "ID do adicional não informado.",
					invalid_type_error: "Tipo não válido para ID do adicional.",
				})
				.optional(),
			deletar: z
				.boolean({
					required_error: "Deletar adicional não informado.",
					invalid_type_error: "Tipo não válido para deletar adicional.",
				})
				.optional(),
		}),
	),
	opcoesValores: z.array(VariantOptionValueRefStateSchema).optional(),
});
export type TProductVariantState = z.infer<typeof ProductVariantStateSchema>;

type UseProductVariantStateProps = {
	initialState?: Partial<TProductVariantState>;
};

export function useProductVariantState({ initialState }: UseProductVariantStateProps) {
	const initialStateComplete = useMemo(
		() => ({
			nome: initialState?.nome ?? "",
			codigo: initialState?.codigo ?? "",
			precoCusto: initialState?.precoCusto ?? 0,
			precoVenda: initialState?.precoVenda ?? 0,
			quantidade: initialState?.quantidade ?? 0,
			ativo: initialState?.ativo ?? true,
			rastreamentoEstoqueAtivo: initialState?.rastreamentoEstoqueAtivo ?? false,
			imagemCapaHolder: initialState?.imagemCapaHolder ?? { file: null, previewUrl: null },
			perfisFiscais: initialState?.perfisFiscais ?? [],
			addOns: initialState?.addOns ?? [],
		}),
		[initialState],
	);
	const [state, setState] = useState<TProductVariantState>(initialStateComplete);

	const updateVariant = useCallback((updates: Partial<TProductVariantState>) => {
		setState((prev) => ({
			...prev,
			...updates,
		}));
	}, []);

	function updateVariantImageHolder(updates: Partial<TProductVariantState["imagemCapaHolder"]>) {
		setState((prev) => ({
			...prev,
			imagemCapaHolder: {
				...prev.imagemCapaHolder,
				...updates,
			},
		}));
	}

	const resetState = useCallback(() => {
		setState(initialStateComplete);
	}, [initialStateComplete]);

	const redefineState = useCallback((newState: TProductVariantState) => {
		setState(newState);
	}, []);

	return {
		state,
		updateVariant,
		updateVariantImageHolder,
		resetState,
		redefineState,
	};
}
export type TUseProductVariantState = ReturnType<typeof useProductVariantState>;

export const ProductAddOnStateSchema = ProductAddOnSchema.omit({ organizacaoId: true }).extend({
	opcoes: z.array(
		ProductAddOnOptionSchema.omit({ organizacaoId: true, produtoAddOnId: true }).extend({
			produtoConsumo: z
				.string({
					required_error: "ID do produto de consumo não informado.",
					invalid_type_error: "Tipo não válido para ID do produto de consumo.",
				})
				.optional()
				.nullable(),
			id: z
				.string({
					required_error: "ID da opção não informado.",
					invalid_type_error: "Tipo não válido para ID da opção.",
				})
				.optional(),
			deletar: z
				.boolean({
					required_error: "Deletar opção não informado.",
					invalid_type_error: "Tipo não válido para deletar opção.",
				})
				.optional(),
		}),
	),
	id: z
		.string({
			required_error: "ID do adicional não informado.",
			invalid_type_error: "Tipo não válido para ID do adicional.",
		})
		.optional(),
	deletar: z
		.boolean({
			required_error: "Deletar adicional não informado.",
			invalid_type_error: "Tipo não válido para deletar adicional.",
		})
		.optional(),
});
export type TSingleProductAddOnState = z.infer<typeof ProductAddOnStateSchema>;

type UseProductAddOnStateProps = {
	initialState?: Partial<TSingleProductAddOnState>;
};

export function useProductAddOnState({ initialState }: UseProductAddOnStateProps) {
	const initialStateComplete = useMemo<TSingleProductAddOnState>(
		() => ({
			id: initialState?.id,
			nome: initialState?.nome ?? "",
			internoNome: initialState?.internoNome ?? "",
			minOpcoes: initialState?.minOpcoes ?? 0,
			maxOpcoes: initialState?.maxOpcoes ?? 1,
			ativo: initialState?.ativo ?? true,
			opcoes: initialState?.opcoes ?? [],
			deletar: initialState?.deletar,
		}),
		[initialState],
	);
	const [state, setState] = useState<TSingleProductAddOnState>(initialStateComplete);

	const updateAddOn = useCallback((updates: Partial<Omit<TSingleProductAddOnState, "opcoes">>) => {
		setState((prev) => ({ ...prev, ...updates }));
	}, []);

	const addOption = useCallback((option?: Partial<TSingleProductAddOnState["opcoes"][number]>) => {
		setState((prev) => ({
			...prev,
			opcoes: [
				...prev.opcoes,
				{
					nome: option?.nome ?? "",
					codigo: option?.codigo ?? "",
					precoDelta: option?.precoDelta ?? 0,
					maxQtdePorItem: option?.maxQtdePorItem ?? 1,
					ativo: option?.ativo ?? true,
					quantidadeConsumo: option?.quantidadeConsumo ?? 1,
					produtoConsumo: option?.produtoConsumo ?? null,
					produtoId: option?.produtoId ?? null,
					produtoVarianteId: option?.produtoVarianteId ?? null,
				},
			],
		}));
	}, []);

	const updateOption = useCallback((optionIndex: number, updates: Partial<TSingleProductAddOnState["opcoes"][number]>) => {
		setState((prev) => ({
			...prev,
			opcoes: prev.opcoes.map((option, index) => (index === optionIndex ? { ...option, ...updates } : option)),
		}));
	}, []);

	const removeOption = useCallback((optionIndex: number) => {
		setState((prev) => {
			const option = prev.opcoes[optionIndex];
			if (option?.id) {
				return {
					...prev,
					opcoes: prev.opcoes.map((item, index) => (index === optionIndex ? { ...item, deletar: true } : item)),
				};
			}

			return {
				...prev,
				opcoes: prev.opcoes.filter((_, index) => index !== optionIndex),
			};
		});
	}, []);

	const resetState = useCallback(() => {
		setState(initialStateComplete);
	}, [initialStateComplete]);

	const redefineState = useCallback((newState: TSingleProductAddOnState) => {
		setState(newState);
	}, []);

	return {
		state,
		updateAddOn,
		addOption,
		updateOption,
		removeOption,
		resetState,
		redefineState,
	};
}
export type TUseProductAddOnState = ReturnType<typeof useProductAddOnState>;

export const ProductFiscalProfileStateSchema = ProductFiscalProfileSchema.omit({
	organizacaoId: true,
	produtoId: true,
	produtoVarianteId: true,
}).extend({
	id: z
		.string({
			required_error: "ID do perfil fiscal não informado.",
			invalid_type_error: "Tipo não válido para ID do perfil fiscal.",
		})
		.optional(),
	deletar: z
		.boolean({
			required_error: "Deletar perfil fiscal não informado.",
			invalid_type_error: "Tipo não válido para deletar perfil fiscal.",
		})
		.optional(),
});
export type TSingleProductFiscalProfileState = z.infer<typeof ProductFiscalProfileStateSchema>;

type UseProductFiscalProfileStateProps = {
	initialState?: Partial<TSingleProductFiscalProfileState>;
};

export function useProductFiscalProfileState({ initialState }: UseProductFiscalProfileStateProps) {
	const initialStateComplete = useMemo<TSingleProductFiscalProfileState>(
		() => ({
			id: initialState?.id,
			grupoTributarioId: initialState?.grupoTributarioId ?? null,
			origemMercadoria: initialState?.origemMercadoria ?? "NACIONAL",
			ncm: initialState?.ncm ?? "",
			exTipi: initialState?.exTipi ?? null,
			cest: initialState?.cest ?? null,
			cfopPadrao: initialState?.cfopPadrao ?? null,
			unidadeComercial: initialState?.unidadeComercial ?? "UN",
			codigoBeneficioFiscal: initialState?.codigoBeneficioFiscal ?? null,
			ativo: initialState?.ativo ?? true,
			dataInsercao: initialState?.dataInsercao ?? new Date(),
			deletar: initialState?.deletar,
		}),
		[initialState],
	);
	const [state, setState] = useState<TSingleProductFiscalProfileState>(initialStateComplete);

	const updateFiscalProfile = useCallback((updates: Partial<Omit<TSingleProductFiscalProfileState, "id">>) => {
		setState((prev) => ({ ...prev, ...updates }));
	}, []);

	const resetState = useCallback(() => {
		setState(initialStateComplete);
	}, [initialStateComplete]);

	const redefineState = useCallback((newState: TSingleProductFiscalProfileState) => {
		setState(newState);
	}, []);

	return {
		state,
		updateFiscalProfile,
		resetState,
		redefineState,
	};
}
export type TUseProductFiscalProfileState = ReturnType<typeof useProductFiscalProfileState>;

export const ProductCoreStateSchema = ProductSchema.omit({ organizacaoId: true }).extend({
	// Sempre definido no estado do formulário (o hook aplica o default), embora opcional no payload.
	vendavel: z.boolean(),
	imagemCapaHolder: z.object({
		file: z.instanceof(File).optional().nullable(),
		previewUrl: z
			.string({
				required_error: "URL da imagem capa do produto não informada.",
				invalid_type_error: "Tipo não válido para URL da imagem capa do produto.",
			})
			.optional()
			.nullable(),
	}),
});

export type TProductCoreState = z.infer<typeof ProductCoreStateSchema>;

type UseProductCoreStateProps = {
	initialState?: Partial<TProductCoreState>;
};

export function useProductCoreState({ initialState }: UseProductCoreStateProps = {}) {
	const initialStateComplete = useMemo<TProductCoreState>(
		() => ({
			vendavel: initialState?.vendavel ?? true,
			nome: initialState?.nome ?? "",
			descricao: initialState?.descricao ?? null,
			codigo: initialState?.codigo ?? "",
			unidade: initialState?.unidade ?? "UN",
			ncm: initialState?.ncm ?? "",
			tipo: initialState?.tipo ?? "",
			grupo: initialState?.grupo ?? "",
			imagemCapaUrl: initialState?.imagemCapaUrl ?? null,
			precoCusto: initialState?.precoCusto ?? null,
			precoVenda: initialState?.precoVenda ?? null,
			quantidade: initialState?.quantidade ?? null,
			rastreamentoEstoqueAtivo: initialState?.rastreamentoEstoqueAtivo ?? false,
			imagemCapaHolder: {
				file: initialState?.imagemCapaHolder?.file ?? null,
				previewUrl: initialState?.imagemCapaHolder?.previewUrl ?? null,
			},
		}),
		[initialState],
	);

	const [state, setState] = useState<TProductCoreState>(initialStateComplete);

	const updateProduct = useCallback((updates: Partial<Omit<TProductCoreState, "imagemCapaHolder">>) => {
		setState((prev) => ({
			...prev,
			...updates,
		}));
	}, []);

	const updateProductImageHolder = useCallback((holder: Partial<TProductCoreState["imagemCapaHolder"]>) => {
		setState((prev) => ({
			...prev,
			imagemCapaHolder: {
				...prev.imagemCapaHolder,
				...holder,
			},
		}));
	}, []);

	const resetState = useCallback(() => {
		setState(initialStateComplete);
	}, [initialStateComplete]);

	const redefineState = useCallback((newState: TProductCoreState) => {
		setState(newState);
	}, []);

	return {
		state,
		updateProduct,
		updateProductImageHolder,
		resetState,
		redefineState,
	};
}

export type TUseProductCoreState = ReturnType<typeof useProductCoreState>;
