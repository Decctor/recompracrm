import type { TCreateRealtimeTokenOutput } from "@/app/api/realtime/token/route";
import axios from "axios";

export async function fetchRealtimeAccessToken() {
	const { data } = await axios.get<TCreateRealtimeTokenOutput>("/api/realtime/token");
	return data.data;
}
