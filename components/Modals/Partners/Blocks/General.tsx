import TextInput from "@/components/Inputs/TextInput";
import { formatPhoneAsBase, formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import type { TPartnerState } from "@/schemas/partners";
import { Code, LayoutGrid } from "lucide-react";
import Image from "next/image";
import { MdAttachFile } from "react-icons/md";

type PartnersGeneralBlockProps = {
	partner: TPartnerState["partner"];
	updatePartner: (changes: Partial<TPartnerState["partner"]>) => void;
	avatarHolder: TPartnerState["avatarHolder"];
	updateAvatar: (changes: Partial<TPartnerState["avatarHolder"]>) => void;
};
export function GeneralBlock({ partner, updatePartner, avatarHolder, updateAvatar }: PartnersGeneralBlockProps) {
	return (
		<div className="flex w-full flex-col gap-3">
			<div className="flex w-fit items-center gap-2 rounded bg-primary/20 px-2 py-1">
				<LayoutGrid className="h-4 min-h-4 w-4 min-w-4" />
				<h1 className="w-fit text-start font-medium text-xs tracking-tight">INFORMAÇÕES GERAIS</h1>
			</div>
			<div className="flex w-full flex-col gap-1.5">
				<div className="w-full flex items-center justify-center">
					<div className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 text-primary">
						<Code className="h-4 min-h-4 w-4 min-w-4" />
						<h1 className="w-fit text-start font-medium text-xs tracking-tight">{partner.identificador}</h1>
					</div>
				</div>
				<ImageContent imageUrl={partner.avatarUrl} imageHolder={avatarHolder} updateImageHolder={updateAvatar} />
				<TextInput
					value={partner.nome}
					label="NOME"
					placeholder="Preencha aqui o nome do parceiro..."
					handleChange={(value) => updatePartner({ nome: value })}
					width="100%"
				/>
				<TextInput
					value={partner.codigoAfiliacao || ""}
					label="CÓDIGO DE AFILIAÇÃO"
					placeholder="Preencha aqui o código do parceiro..."
					handleChange={(value) => updatePartner({ codigoAfiliacao: value.toUpperCase() })}
					width="100%"
				/>
				<TextInput
					value={partner.clienteId || ""}
					label="CLIENTE VINCULADO (ID)"
					placeholder="Opcional: sobrescreva o cliente vinculado..."
					handleChange={(value) => updatePartner({ clienteId: value })}
					width="100%"
				/>
				<TextInput
					value={partner.cpfCnpj || ""}
					label="CPF/CNPJ"
					placeholder="Preencha aqui o CPF/CNPJ do parceiro..."
					handleChange={(value) => updatePartner({ cpfCnpj: formatToCPForCNPJ(value) })}
					width="100%"
				/>
				<TextInput
					label="TELEFONE"
					value={partner.telefone || ""}
					placeholder="Preencha aqui o telefone do parceiro..."
					handleChange={(value) => updatePartner({ telefone: formatToPhone(value), telefoneBase: formatPhoneAsBase(value) })}
					width="100%"
				/>
				<TextInput
					label="EMAIL"
					value={partner.email || ""}
					placeholder="Preencha aqui o email do parceiro..."
					handleChange={(value) => updatePartner({ email: value })}
					width="100%"
				/>
			</div>
		</div>
	);
}

function ImageContent({
	imageUrl,
	imageHolder,
	updateImageHolder,
}: {
	imageUrl: TPartnerState["partner"]["avatarUrl"];
	imageHolder: TPartnerState["avatarHolder"];
	updateImageHolder: (image: TPartnerState["avatarHolder"]) => void;
}) {
	return (
		<div className="flex w-full items-center justify-center">
			<label className="relative w-32 h-32 cursor-pointer overflow-hidden rounded-full" htmlFor="avatar-input-file">
				<ImagePreview imageHolder={imageHolder} imageUrl={imageUrl} />
				<input
					accept=".png,.jpeg,.jpg"
					className="absolute h-full w-full cursor-pointer opacity-0"
					id="avatar-input-file"
					multiple={false}
					onChange={(e) => {
						const file = e.target.files?.[0] ?? null;
						updateImageHolder({ file, previewUrl: file ? URL.createObjectURL(file) : null });
					}}
					tabIndex={-1}
					type="file"
				/>
			</label>
		</div>
	);
}

function ImagePreview({ imageUrl, imageHolder }: { imageUrl: TPartnerState["partner"]["avatarUrl"]; imageHolder: TPartnerState["avatarHolder"] }) {
	if (imageHolder.previewUrl) {
		return <Image alt="Avatar do parceiro." fill={true} objectFit="cover" src={imageHolder.previewUrl} />;
	}
	if (imageUrl) {
		return <Image alt="Avatar do parceiro." fill={true} objectFit="cover" src={imageUrl} />;
	}

	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-primary/20">
			<MdAttachFile className="h-6 w-6" />
			<p className="text-center font-medium text-xs">DEFINIR AVATAR</p>
		</div>
	);
}
