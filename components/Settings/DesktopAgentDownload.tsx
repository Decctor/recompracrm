import { formatDateAsLocale } from "@/lib/formatting";
import { useCurrentAgentVersion } from "@/lib/queries/desktop-agent";
import { Download, MonitorDown, Plus } from "lucide-react";
import { Button } from "../ui/button";
import SettingsPanelSection from "./SettingsPanelSection";

// O download do instalador mora ao lado do botão que gera o código de
// ativação: o fluxo real é ATIVAR DISPOSITIVO -> baixar -> instalar -> colar o
// código, e separar as duas metades em telas diferentes é o que faz alguém
// procurar o instalador no lugar errado.
//
// O link aponta direto para o Supabase Storage, e não para uma rota daqui:
// funções da Vercel têm limite de ~4,5 MB de resposta e o instalador tem ~49 MB.
export default function DesktopAgentDownload({ onActivateAgent }: { onActivateAgent?: () => void }) {
	const { data: version, isLoading } = useCurrentAgentVersion();

	// Nenhuma versão publicada ainda é estado legítimo (antes do primeiro
	// release). Sumir é melhor que mostrar um botão que não leva a lugar algum.
	if (isLoading || !version) return null;

	const sizeMb = (version.tamanhoBytes / 1024 / 1024).toFixed(1);

	// A seção mora aqui, e não em SettingsDevices, porque é aqui que se sabe se há versão
	// publicada: um título "DOWNLOADS" sobre um espaço vazio é pior que nenhum título.
	return (
		<SettingsPanelSection
			title="DOWNLOADS"
			icon={<MonitorDown className="h-4 w-4 min-h-4 min-w-4" />}
			description="Instaladores dos programas que rodam na máquina da loja."
		>
			<div className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs md:flex-row md:items-center md:justify-between">
				<div className="flex items-start gap-3">
					<div className="flex h-10 w-10 min-h-10 min-w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
						<MonitorDown className="h-5 w-5" />
					</div>
					<div className="flex flex-col gap-0.5">
						<h3 className="text-sm font-bold tracking-tight">Agente de Periféricos</h3>
						<p className="text-xs text-muted-foreground">
							Versão {version.versao} · {sizeMb} MB
							{version.dataPublicacao ? ` · publicada em ${formatDateAsLocale(version.dataPublicacao)}` : null}
						</p>
						<p className="text-xs text-muted-foreground">
							Depois de instalar, cole nele o código de ativação gerado aqui. Ele imprime cupons e etiquetas em segundo plano.
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					{onActivateAgent ? (
						<Button variant="outline" size="sm" className="flex items-center gap-2 whitespace-nowrap" onClick={onActivateAgent}>
							<Plus className="h-4 w-4 min-h-4 min-w-4" /> ATIVAR ESTE AGENTE
						</Button>
					) : null}
					<Button asChild size="sm" className="flex items-center gap-2 whitespace-nowrap">
						{/* Sem target=_blank: é um download, não uma navegação — abrir aba
					    em branco que fecha sozinha assusta quem está na loja. */}
						<a href={version.downloadUrl} download>
							<Download className="h-4 w-4 min-h-4 min-w-4" />
							BAIXAR INSTALADOR
						</a>
					</Button>
				</div>
			</div>
		</SettingsPanelSection>
	);
}
