import NumberInput from "@/components/Inputs/NumberInput";
import SelectProductWithVariants from "@/components/Inputs/SelectProductWithVariants";
import type { TSelectProductWithVariantsValue } from "@/components/Inputs/SelectProductWithVariants";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { formatToMoney } from "@/lib/formatting";
import { isValidNumber } from "@/lib/validation";
import type { TUseCashbackProgramState } from "@/state-hooks/use-cashback-program-state";
import { BadgeDollarSign, Gift, PencilIcon, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

type CashbackProgramsPrizesBlockProps = {
	cashbackProgramPrizes: TUseCashbackProgramState["state"]["cashbackProgramPrizes"];
	addCashbackProgramPrize: TUseCashbackProgramState["addCashbackProgramPrize"];
	updateCashbackProgramPrize: TUseCashbackProgramState["updateCashbackProgramPrize"];
	deleteCashbackProgramPrize: TUseCashbackProgramState["deleteCashbackProgramPrize"];
};
export default function CashbackProgramsPrizesBlock({
	cashbackProgramPrizes,
	addCashbackProgramPrize,
	updateCashbackProgramPrize,
	deleteCashbackProgramPrize,
}: CashbackProgramsPrizesBlockProps) {
	const [newPrizeMenuIsOpen, setNewPrizeMenuIsOpen] = useState(false);
	const [editingPrizeIndex, setEditingPrizeIndex] = useState<number | null>(null);
	const editingPrize = isValidNumber(editingPrizeIndex) ? cashbackProgramPrizes[editingPrizeIndex as number] : null;
	return (
		<ResponsiveMenuSection title="PRÊMIOS" icon={<Gift className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="w-full flex flex-col gap-1">
				<p className="text-sm font-medium text-muted-foreground">
					Define abaixo, se aplicável, recompensas rápidas que estarão disponíveis para resgate no seu programa de cashback.
				</p>
			</div>
			<div className="w-full flex items-center justify-end">
				<Button variant={"ghost"} size={"fit"} className="flex items-center gap-1 px-2 py-1 text-xs" onClick={() => setNewPrizeMenuIsOpen(true)}>
					<Plus className="w-4 h-4 min-w-4 min-h-4" />
					ADICIONAR
				</Button>
			</div>
			<div className="w-full flex flex-col gap-1.5">
				{cashbackProgramPrizes.length > 0 ? (
					cashbackProgramPrizes.map((prize, index) =>
						!prize.deletar ? (
							<CashbackProgramPrizeCard
								key={prize.id}
								prize={prize}
								handleRemoveClick={() => deleteCashbackProgramPrize(index)}
								handleEditClick={() => setEditingPrizeIndex(index)}
							/>
						) : null,
					)
				) : (
					<div className="w-full text-center text-sm font-medium tracking-tight text-muted-foreground">Oops, nenhum prêmio adicionado ainda.</div>
				)}
			</div>
			{newPrizeMenuIsOpen ? (
				<NewPrizeMenu
					closeMenu={() => setNewPrizeMenuIsOpen(false)}
					addCashbackProgramPrize={(v) => {
						addCashbackProgramPrize(v);
						setNewPrizeMenuIsOpen(false);
					}}
				/>
			) : null}
			{editingPrize ? (
				<EditPrizeMenu
					initialPrize={editingPrize}
					closeMenu={() => setEditingPrizeIndex(null)}
					updateCashbackProgramPrize={(v) => {
						updateCashbackProgramPrize(editingPrizeIndex as number, v);
						setEditingPrizeIndex(null);
					}}
				/>
			) : null}
		</ResponsiveMenuSection>
	);
}

type CashbackProgramPrizeCardProps = {
	prize: TUseCashbackProgramState["state"]["cashbackProgramPrizes"][number];
	handleRemoveClick: () => void;
	handleEditClick: () => void;
};
function CashbackProgramPrizeCard({ prize, handleRemoveClick, handleEditClick }: CashbackProgramPrizeCardProps) {
	return (
		<div className="w-full flex flex-col sm:flex-row gap-1.5 bg-card border-primary/20 rounded-xl border p-1.5 shadow-2xs">
			<div className="flex items-center justify-center">
				<div className="relative aspect-square w-16 h-16 max-w-16 max-h-16 min-w-16 min-h-16 rounded-lg overflow-hidden">
					{prize.imagemCapaUrl ? (
						<Image src={prize.imagemCapaUrl} alt={prize.titulo} fill className="object-cover" />
					) : (
						<div className="bg-primary/50 text-primary-foreground flex h-full w-full items-center justify-center">
							<Gift className="w-6 h-6" />
						</div>
					)}
				</div>
			</div>
			<div className="flex flex-col grow gap-1">
				<div className="grow w-full flex flex-col gap-0.5">
					<div className="w-full flex items-center flex-col md:flex-row justify-between gap-2">
						<h1 className="text-xs font-bold tracking-tight lg:text-sm">{prize.titulo}</h1>
						<div className="flex items-center gap-3 flex-col md:flex-row gap-y-1">
							<div className="flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[0.65rem]">
								<BadgeDollarSign className="w-4 min-w-4 h-4 min-h-4" />
								<p className="text-xs tracking-tight uppercase">{formatToMoney(prize.valor)}</p>
							</div>
						</div>
					</div>
					<p className="text-xs text-muted-foreground">{prize.descricao || "Nenhuma descrição definida..."}</p>
				</div>

				<div className="w-full flex items-center justify-end gap-2 flex-wrap">
					<Button
						variant="ghost"
						className="flex items-center gap-1.5 p-2 rounded-full hover:bg-destructive/10 hover:text-destructive duration-300 ease-in-out"
						size="fit"
						onClick={handleRemoveClick}
					>
						<Trash2 className="w-3 min-w-3 h-3 min-h-3" />
					</Button>
					<Button variant="ghost" className="flex items-center gap-1.5 p-2 rounded-full" size="fit" onClick={handleEditClick}>
						<PencilIcon className="w-3 min-w-3 h-3 min-h-3" />
					</Button>
				</div>
			</div>
		</div>
	);
}

type NewPrizeMenuProps = {
	closeMenu: () => void;
	addCashbackProgramPrize: TUseCashbackProgramState["addCashbackProgramPrize"];
};
function NewPrizeMenu({ closeMenu, addCashbackProgramPrize }: NewPrizeMenuProps) {
	const [newPrize, setNewPrize] = useState<TUseCashbackProgramState["state"]["cashbackProgramPrizes"][number]>({
		ativo: true,
		titulo: "",
		valor: 0,
		descricao: null,
		produtoId: null,
		produtoVarianteId: null,
		imagemCapaUrl: null,
	});

	function validateAndAddPrize(info: TUseCashbackProgramState["state"]["cashbackProgramPrizes"][number]) {
		if (info.titulo.trim().length < 3) return toast.error("Título do prêmio deve ter pelo menos 3 caracteres.");
		if (info.valor < 0) return toast.error("Valor do prêmio deve ser maior que 0.");
		return addCashbackProgramPrize(info);
	}
	return (
		<ResponsiveMenu
			menuTitle="NOVO PRÊMIO"
			menuDescription="Preencha os campos abaixo para criar um novo prêmio"
			menuActionButtonText="CRIAR PRÊMIO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => validateAndAddPrize(newPrize)}
			actionIsLoading={false}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeMenu}
		>
			<SelectProductWithVariants
				label="PRODUTO"
				value={newPrize.produtoId ? { productId: newPrize.produtoId, productVariantId: newPrize.produtoVarianteId } : null}
				handleChange={(value) => {
					setNewPrize((prev) => ({
						...prev,
						produtoId: value?.product?.id ?? null,
						produtoVarianteId: value?.productVariant?.id ?? null,
						titulo: value?.productVariant?.nome ?? value?.product?.descricao ?? prev.titulo,
						imagemCapaUrl: value?.productVariant?.imagemCapaUrl ?? value?.product?.imagemCapaUrl ?? null,
					}));
				}}
				onReset={() => {
					setNewPrize({ ...newPrize, produtoId: null, produtoVarianteId: null, imagemCapaUrl: null });
				}}
				resetOptionLabel="SELECIONE UM PRODUTO"
			/>
			<TextInput
				label="TÍTULO"
				placeholder="Título do prêmio..."
				width="100%"
				value={newPrize.titulo}
				handleChange={(value) => setNewPrize({ ...newPrize, titulo: value })}
			/>
			<TextareaInput
				label="DESCRIÇÃO"
				placeholder="Preencha aqui uma descrição visual para o cartão do prêmio..."
				value={newPrize.descricao ?? ""}
				handleChange={(value) => setNewPrize({ ...newPrize, descricao: value })}
			/>
			<NumberInput
				label="VALOR"
				placeholder="Preencha aqui o valor do prêmio em cashback..."
				width="100%"
				value={newPrize.valor}
				handleChange={(value) => setNewPrize({ ...newPrize, valor: value })}
			/>
		</ResponsiveMenu>
	);
}
type EditPrizeMenuProps = {
	initialPrize: TUseCashbackProgramState["state"]["cashbackProgramPrizes"][number];
	closeMenu: () => void;
	updateCashbackProgramPrize: (info: Parameters<TUseCashbackProgramState["updateCashbackProgramPrize"]>[1]) => void;
};
function EditPrizeMenu({ initialPrize, closeMenu, updateCashbackProgramPrize }: EditPrizeMenuProps) {
	const [newPrize, setNewPrize] = useState<TUseCashbackProgramState["state"]["cashbackProgramPrizes"][number]>(initialPrize);

	function validateAndUpdatePrize(info: TUseCashbackProgramState["state"]["cashbackProgramPrizes"][number]) {
		if (info.titulo.trim().length < 3) return toast.error("Título do prêmio deve ter pelo menos 3 caracteres.");
		if (info.valor < 0) return toast.error("Valor do prêmio deve ser maior que 0.");
		return updateCashbackProgramPrize(info);
	}
	return (
		<ResponsiveMenu
			menuTitle="EDITAR PRÊMIO"
			menuDescription="Preencha os campos abaixo para editar o prêmio"
			menuActionButtonText="ATUALIZAR PRÊMIO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => validateAndUpdatePrize(newPrize)}
			actionIsLoading={false}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeMenu}
		>
			<SelectProductWithVariants
				label="PRODUTO"
				value={newPrize.produtoId ? { productId: newPrize.produtoId, productVariantId: newPrize.produtoVarianteId } : null}
				handleChange={(value) => {
					setNewPrize((prev) => ({
						...prev,
						produtoId: value?.product?.id ?? null,
						produtoVarianteId: value?.productVariant?.id ?? null,
						titulo: value?.productVariant?.nome ?? value?.product?.descricao ?? prev.titulo,
						imagemCapaUrl: value?.productVariant?.imagemCapaUrl ?? value?.product?.imagemCapaUrl ?? null,
					}));
				}}
				onReset={() => {
					setNewPrize({ ...newPrize, produtoId: null, produtoVarianteId: null, imagemCapaUrl: null });
				}}
				resetOptionLabel="SELECIONE UM PRODUTO"
			/>
			<TextInput
				label="TÍTULO"
				placeholder="Título do prêmio..."
				width="100%"
				value={newPrize.titulo}
				handleChange={(value) => setNewPrize({ ...newPrize, titulo: value })}
			/>
			<TextareaInput
				label="DESCRIÇÃO"
				placeholder="Preencha aqui uma descrição visual para o cartão do prêmio..."
				value={newPrize.descricao ?? ""}
				handleChange={(value) => setNewPrize({ ...newPrize, descricao: value })}
			/>
			<NumberInput
				label="VALOR"
				placeholder="Preencha aqui o valor do prêmio em cashback..."
				width="100%"
				value={newPrize.valor}
				handleChange={(value) => setNewPrize({ ...newPrize, valor: value })}
			/>
		</ResponsiveMenu>
	);
}
