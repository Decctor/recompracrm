import { notFound } from "next/navigation";
import ScreensPreview from "./preview";

// Só em desenvolvimento: o content-studio (content-studio/tools/capture-screens.ts) fotografa aqui as
// telas reais do produto, com os dados de exemplo de cada episódio, para os Reels mostrarem a
// interface 1:1. Os componentes são os do app; só as respostas da API são fixas (fixtures/).
export default async function Page({ searchParams }: { searchParams: Promise<{ screen?: string }> }) {
	if (process.env.NODE_ENV !== "development") notFound();
	const { screen } = await searchParams;
	return <ScreensPreview screen={screen ?? ""} />;
}
