import type { TCreateProductInput, TCreateProductOutput, TUpdateProductInput, TUpdateProductOutput } from "@/app/api/products/route";
import type { TRenameProductGroupInput, TRenameProductGroupOutput } from "@/app/api/products/groups/route";
import type {
	TCreateProductVariantInput,
	TCreateProductVariantOutput,
	TUpdateProductVariantInput,
	TUpdateProductVariantOutput,
} from "@/app/api/products/variants/route";
import type {
	TCreateProductAddOnInput,
	TCreateProductAddOnOutput,
	TUpdateProductAddOnInput,
	TUpdateProductAddOnOutput,
} from "@/app/api/products/add-ons/route";
import type {
	TCreateProductAddOnReferenceInput,
	TCreateProductAddOnReferenceOutput,
	TDeleteProductAddOnReferenceInput,
	TDeleteProductAddOnReferenceOutput,
} from "@/app/api/products/add-ons/references/route";
import type {
	TCreateProductFiscalProfileInput,
	TCreateProductFiscalProfileOutput,
	TDeleteProductFiscalProfileInput,
	TDeleteProductFiscalProfileOutput,
	TUpdateProductFiscalProfileInput,
	TUpdateProductFiscalProfileOutput,
} from "@/app/api/products/fiscal-profiles/route";
import type { TUpdateProductMainSupplierInput, TUpdateProductMainSupplierOutput } from "@/app/api/products/main-supplier/route";
import axios from "axios";

export async function createProduct(input: TCreateProductInput) {
	const { data } = await axios.post<TCreateProductOutput>("/api/products", input);
	return data;
}

export async function updateProduct(input: TUpdateProductInput) {
	const { data } = await axios.put<TUpdateProductOutput>(`/api/products?id=${input.productId}`, input);
	return data;
}

export async function createProductVariant(input: TCreateProductVariantInput) {
	const { data } = await axios.post<TCreateProductVariantOutput>("/api/products/variants", input);
	return data;
}

export async function updateProductVariant(input: TUpdateProductVariantInput) {
	const { data } = await axios.put<TUpdateProductVariantOutput>("/api/products/variants", input);
	return data;
}

export async function createProductAddOn(input: TCreateProductAddOnInput) {
	const { data } = await axios.post<TCreateProductAddOnOutput>("/api/products/add-ons", input);
	return data;
}

export async function updateProductAddOn(input: TUpdateProductAddOnInput) {
	const { data } = await axios.put<TUpdateProductAddOnOutput>("/api/products/add-ons", input);
	return data;
}

export async function createProductAddOnReference(input: TCreateProductAddOnReferenceInput) {
	const { data } = await axios.post<TCreateProductAddOnReferenceOutput>("/api/products/add-ons/references", input);
	return data;
}

export async function deleteProductAddOnReference(input: TDeleteProductAddOnReferenceInput) {
	const searchParams = new URLSearchParams();
	searchParams.set("productId", input.productId);
	searchParams.set("productAddOnId", input.productAddOnId);
	if (input.productVariantId) searchParams.set("productVariantId", input.productVariantId);
	const { data } = await axios.delete<TDeleteProductAddOnReferenceOutput>(`/api/products/add-ons/references?${searchParams.toString()}`);
	return data;
}

export async function createProductFiscalProfile(input: TCreateProductFiscalProfileInput) {
	const { data } = await axios.post<TCreateProductFiscalProfileOutput>("/api/products/fiscal-profiles", input);
	return data;
}

export async function updateProductFiscalProfile(input: TUpdateProductFiscalProfileInput) {
	const { data } = await axios.put<TUpdateProductFiscalProfileOutput>("/api/products/fiscal-profiles", input);
	return data;
}

export async function deleteProductFiscalProfile(input: TDeleteProductFiscalProfileInput) {
	const { data } = await axios.delete<TDeleteProductFiscalProfileOutput>("/api/products/fiscal-profiles", { data: input });
	return data;
}

export async function renameProductGroup(input: TRenameProductGroupInput) {
	const { data } = await axios.put<TRenameProductGroupOutput>("/api/products/groups", input);
	return data;
}

export async function updateProductMainSupplier(input: TUpdateProductMainSupplierInput) {
	const { data } = await axios.put<TUpdateProductMainSupplierOutput>("/api/products/main-supplier", input);
	return data;
}
