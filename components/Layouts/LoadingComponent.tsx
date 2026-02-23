import React from "react";

function LoadingComponent() {
	return (
		<div className="grow bg-background p-6 md:p-10 flex flex-col items-center justify-center gap-6 min-h-[50vh]">
			<div className="relative flex items-center justify-center gap-1 h-32">
				{/* Barra 1 - Esquerda */}
				<div className="w-5 h-8 bg-primary rounded-full animate-[wave_1.2s_ease-in-out_infinite] [animation-delay:0s]" />

				{/* Barra 2 */}
				<div className="w-5 h-20 bg-primary rounded-full animate-[wave_1.2s_ease-in-out_infinite] [animation-delay:0.15s]" />

				{/* Barra 3 - Centro */}
				<div className="w-5 h-10 bg-primary rounded-full animate-[wave_1.2s_ease-in-out_infinite] [animation-delay:0.3s]" />

				{/* Barra 4 */}
				<div className="w-5 h-20 bg-primary rounded-full animate-[wave_1.2s_ease-in-out_infinite] [animation-delay:0.45s]" />

				{/* Barra 5 - Direita */}
				<div className="w-5 h-8 bg-primary rounded-full animate-[wave_1.2s_ease-in-out_infinite] [animation-delay:0.6s]" />
			</div>
		</div>
	);
}

export default LoadingComponent;
