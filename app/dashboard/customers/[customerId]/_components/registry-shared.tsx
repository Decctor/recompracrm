import { Chip } from "@/components/ui/chip";
import { CircleAlert } from "lucide-react";

/**
 * Campo essencial vazio: contorno tracejado e fundo âmbar, no lugar onde o dado falta.
 *
 * O aviso mora no campo, não numa faixa no topo da seção: uma lista de pendências obriga a ler a
 * lista, voltar ao formulário e procurar. Âmbar porque é atenção, não erro — cadastro incompleto
 * não impede salvar o resto.
 */
export const MISSING_ESSENTIAL_FIELD_CLASS = "border-dashed border-warning/60 bg-warning-surface";

export function MissingEssentialsChip({ count }: { count: number }) {
	if (count <= 0) return null;

	return (
		<Chip.Root size="xs" shape="pill" variant="warning">
			<Chip.Icon>
				<CircleAlert />
			</Chip.Icon>
			<Chip.Label>{count === 1 ? "1 campo essencial em falta" : `${count} campos essenciais em falta`}</Chip.Label>
		</Chip.Root>
	);
}
