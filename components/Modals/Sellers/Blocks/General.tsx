import CheckboxInput from "@/components/Inputs/CheckboxInput";
import TextInput from "@/components/Inputs/TextInput";
import { formatToNumericPassword, formatToPhone } from "@/lib/formatting";
import type { TSellerState } from "@/schemas/sellers";
import { Code, LayoutGrid } from "lucide-react";
import Image from "next/image";
import { MdAttachFile } from "react-icons/md";

type SellerGeneralBlockProps = {
	seller: TSellerState["seller"];
	updateSeller: (changes: Partial<TSellerState["seller"]>) => void;
	avatarHolder: TSellerState["avatarHolder"];
	updateAvatar: (changes: Partial<TSellerState["avatarHolder"]>) => void;
};
export function GeneralBlock({ seller, updateSeller, avatarHolder, updateAvatar }: SellerGeneralBlockProps) {
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
						<h1 className="w-fit text-start font-medium text-xs tracking-tight">{seller.identificador}</h1>
					</div>
				</div>
				<div className="w-full flex items-center justify-center">
					<CheckboxInput labelTrue="ATIVO" labelFalse="ATIVO" checked={seller.ativo} handleChange={(value) => updateSeller({ ativo: value })} />
				</div>
				<ImageContent imageUrl={seller.avatarUrl} imageHolder={avatarHolder} updateImageHolder={updateAvatar} />
				<TextInput
					value={seller.nome}
					label="NOME"
					placeholder="Preencha aqui o nome do vendedor..."
					handleChange={(value) => updateSeller({ nome: value, identificador: value.toUpperCase() })}
					width="100%"
				/>
				<TextInput
					label="TELEFONE"
					value={seller.telefone || ""}
					placeholder="Preencha aqui o telefone do vendedor..."
					handleChange={(value) => updateSeller({ telefone: formatToPhone(value) })}
					width="100%"
				/>
				<TextInput
					label="EMAIL"
					value={seller.email || ""}
					placeholder="Preencha aqui o email do vendedor..."
					handleChange={(value) => updateSeller({ email: value })}
					width="100%"
				/>
				<TextInput
					label="IDENTIFICADOR"
					value={seller.identificador}
					placeholder="Preencha aqui o identificador do vendedor..."
					handleChange={(value) => updateSeller({ identificador: value })}
					width="100%"
				/>
				<TextInput
					label="SENHA DO OPERADOR"
					value={seller.senhaOperador}
					placeholder="Preencha aqui a senha do operador do vendedor..."
					handleChange={(value) => updateSeller({ senhaOperador: formatToNumericPassword(value) })}
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
	imageUrl: TSellerState["seller"]["avatarUrl"];
	imageHolder: TSellerState["avatarHolder"];
	updateImageHolder: (image: TSellerState["avatarHolder"]) => void;
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

function ImagePreview({ imageUrl, imageHolder }: { imageUrl: TSellerState["seller"]["avatarUrl"]; imageHolder: TSellerState["avatarHolder"] }) {
	if (imageHolder.previewUrl) {
		return <Image alt="Avatar do vendedor." fill={true} objectFit="cover" src={imageHolder.previewUrl} />;
	}
	if (imageUrl) {
		return <Image alt="Avatar do vendedor." fill={true} objectFit="cover" src={imageUrl} />;
	}

	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-primary/20">
			<MdAttachFile className="h-6 w-6" />
			<p className="text-center font-medium text-xs">DEFINIR AVATAR</p>
		</div>
	);
}
