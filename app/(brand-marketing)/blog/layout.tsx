import { BlogFooter } from "./_components/BlogFooter";

// O cabeçalho é o Dock, e cada página escolhe a variante (`blog` no índice, `artigo` no artigo);
// por isso ele fica nas páginas e só o rodapé é comum.
export default function BlogLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen bg-white text-[#0e1214]">
			{children}
			<BlogFooter />
		</div>
	);
}
