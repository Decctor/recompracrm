import type { ReactNode } from "react";
import { OnboardingSidebar, type OnboardingStage } from "./OnboardingSidebar";

type OnboardingLayoutProps = {
	children: ReactNode;
	currentStage: OnboardingStage;
};

export function OnboardingLayout({ children, currentStage }: OnboardingLayoutProps) {
	return (
		<div className="w-full min-h-screen flex flex-col md:flex-row md:items-center gap-3 md:gap-4 xl:gap-6 bg-gradient-to-br from-[#0f2c5c] via-[#1a4480] to-[#24549C] px-3 py-3 md:px-8 md:py-6 lg:px-12 lg:py-8 xl:px-24 xl:py-12 overflow-auto md:overflow-hidden relative">
			{/* Decorative background elements */}
			<div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[100px] pointer-events-none" />
			<div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-blue-400/10 rounded-full blur-[100px] pointer-events-none" />

			<OnboardingSidebar currentStage={currentStage} />
			<main className="grow bg-white/95 backdrop-blur-sm rounded-2xl flex flex-col gap-4 lg:gap-6 p-4 md:p-8 lg:p-10 xl:p-12 md:max-h-[calc(100vh-3rem)] lg:max-h-[90vh] xl:max-h-[85vh] overflow-hidden shadow-2xl shadow-black/50 border border-white/20 relative z-10 transition-all duration-300">
				{children}
			</main>
		</div>
	);
}
