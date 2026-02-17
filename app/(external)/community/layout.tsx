import { getCurrentSession } from "@/lib/authentication/session";
import { BookOpen, LogIn, User } from "lucide-react";
import Link from "next/link";

export default async function CommunityLayout({ children }: { children: React.ReactNode }) {
	const session = await getCurrentSession();

	return (
		<div className="flex flex-col min-h-dvh w-full bg-background">
			{/* Header */}
			<header className="w-full border-b border-primary/10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
					<Link href="/community" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
						<div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
							<BookOpen className="w-4 h-4 text-primary-foreground" />
						</div>
						<span className="font-bold text-lg tracking-tight">Comunidade</span>
					</Link>

					<nav className="flex items-center gap-4">
						<Link href="/community" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
							Cursos
						</Link>
						{session ? (
							<Link
								href="/dashboard"
								className="flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
							>
								<User className="w-3.5 h-3.5" />
								{session.user.nome?.split(" ")[0] ?? "Minha conta"}
							</Link>
						) : (
							<Link
								href="/auth/signin"
								className="flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
							>
								<LogIn className="w-3.5 h-3.5" />
								Entrar
							</Link>
						)}
					</nav>
				</div>
			</header>

			{/* Main content */}
			<main className="flex-1 w-full">{children}</main>

			{/* Footer */}
			<footer className="w-full border-t border-primary/10 bg-primary/[0.02]">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
					<p className="text-xs text-muted-foreground">Powered by RecompraCRM</p>
					<div className="flex items-center gap-4">
						<Link href="/legal" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
							Termos
						</Link>
					</div>
				</div>
			</footer>
		</div>
	);
}
