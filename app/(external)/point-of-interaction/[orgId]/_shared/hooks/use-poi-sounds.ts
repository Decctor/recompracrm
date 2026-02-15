import useSound from "use-sound";

export function usePoiSounds() {
	const [playAction] = useSound("/sounds/action-completed.mp3");
	const [playSuccess] = useSound("/sounds/success.mp3");
	return { playAction, playSuccess };
}
