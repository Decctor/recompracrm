import axios from "axios";

export async function updateProgress(input: { aulaId: string; concluido: boolean; progressoSegundos: number }) {
	const { data } = await axios.post("/api/community/progress", input);
	return data;
}
