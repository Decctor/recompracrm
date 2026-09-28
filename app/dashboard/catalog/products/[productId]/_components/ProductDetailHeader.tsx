import type { TGetProductsOutputById } from "@/app/api/products/route";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ArrowLeft, CircleOff, Code } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { appRoutes } from "@/lib/navigation/routes";

type ProductDetailHeaderProps = {
	product: TGetProductsOutputById;
};

export default function ProductDetailHeader({ product }: ProductDetailHeaderProps) {
	return (
		<div className="flex w-full flex-col gap-4">
			<Button variant="ghost" size="fit" asChild className="rounded-full hover:bg-primary/10 flex items-center gap-1 px-2 py-2 w-fit">
				<Link href={`${appRoutes.catalog.products()}?view=database`} className="flex items-center gap-1">
					<ArrowLeft className="w-5 h-5" />
					VOLTAR
				</Link>
			</Button>
			<div className="flex w-full flex-col items-center gap-3 lg:flex-row lg:items-start">
				{product.imagemCapaUrl ? (
					<div className="relative h-20 w-20 min-h-20 min-w-20 overflow-hidden rounded-2xl border border-border">
						<Image src={product.imagemCapaUrl} alt={product.nome} fill className="object-cover" />
					</div>
				) : null}
				<div className="flex flex-col items-center gap-2 lg:items-start">
					<div className="flex flex-col items-center gap-2 lg:flex-row">
						<div className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-2 text-center text-[0.65rem] font-bold italic text-foreground/80">
							<Code className="h-4 min-h-4 w-4 min-w-4" />
							<p>{product.codigo}</p>
						</div>
						<h1 className="text-xl font-extrabold leading-none tracking-tight md:text-2xl">{product.nome}</h1>
						{product.ativo === false ? (
							<Chip.Root variant="muted" size="md" shape="pill" className="text-foreground/70">
								<Chip.Icon>
									<CircleOff />
								</Chip.Icon>
								<Chip.Label>INATIVO</Chip.Label>
							</Chip.Root>
						) : null}
					</div>
					{product.grupo ? (
						<p className="text-sm text-muted-foreground">
							Grupo: <span className="font-medium text-foreground">{product.grupo}</span>
						</p>
					) : null}
				</div>
			</div>
		</div>
	);
}
