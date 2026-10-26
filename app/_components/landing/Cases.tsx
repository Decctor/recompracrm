import { CaseShowcase } from "./CaseShowcase";
import { Container } from "./primitives";

export function LandingCases() {
	return (
		<section id="resultado" className="bg-white py-24 sm:py-[136px]">
			<Container>
				<CaseShowcase />
				<p className="mt-5 text-[13px] text-[#687a80]">
					Lojas em operação em 14 cidades do Triângulo Mineiro e Alto Paranaíba, entre elas Uberlândia, Patos de Minas, Ituiutaba e Araxá.
				</p>
			</Container>
		</section>
	);
}
