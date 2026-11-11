import type { TScript, TSpeaker, TVoice } from "./types";

export type TTimedWord = { text: string; start: number; end: number; beat: number; speaker: TSpeaker };
export type TTimedBeat = { index: number; start: number; end: number; words: TTimedWord[] };
export type TCaptionChunk = { words: TTimedWord[]; start: number; end: number };
export type TTimeline = { beats: TTimedBeat[]; words: TTimedWord[]; duration: number };

/** Segundos de respiro depois da última palavra, para o CTA assentar. */
export const TAIL_SECONDS = 1.6;

export function normalizeWord(word: string) {
	return word
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]/g, "");
}

function bareWord(word: string) {
	return word.replace(/^[“"']+/, "").replace(/[.,:;!?…"”']+$/, "");
}

/**
 * Casa as palavras do roteiro com as palavras que a síntese devolveu. A síntese pode trocar uma
 * palavra por várias (pronúncia em `voice.spoken`) ou pular pontuação; o casamento anda em ordem e
 * olha até três palavras à frente, então um desvio pontual não desalinha o resto do vídeo.
 */
export function buildTimeline(script: TScript, voice: TVoice): TTimeline {
	const spoken = voice.spoken ?? {};
	const voiceWords = voice.words;
	const words: TTimedWord[] = [];
	let cursor = 0;

	script.beats.forEach((beat, beatIndex) => {
		for (const text of beat.say.split(/\s+/).filter(Boolean)) {
			const replacement = spoken[bareWord(text)];
			const tokens = (replacement ? replacement.split(/\s+/) : [text]).map(normalizeWord).filter(Boolean);
			if (tokens.length === 0) continue;

			let match = cursor;
			for (let look = 0; look < 4 && cursor + look < voiceWords.length; look++) {
				if (normalizeWord(voiceWords[cursor + look].text) === tokens[0]) {
					match = cursor + look;
					break;
				}
			}
			const first = voiceWords[Math.min(match, voiceWords.length - 1)];
			const last = voiceWords[Math.min(match + tokens.length - 1, voiceWords.length - 1)];
			cursor = match + tokens.length;
			words.push({ text, beat: beatIndex, speaker: beat.speaker, start: first.start, end: Math.max(last.end, first.start + 0.08) });
		}
	});

	const duration = voice.durationSeconds + TAIL_SECONDS;
	const beats: TTimedBeat[] = script.beats.map((_, index) => {
		const beatWords = words.filter((w) => w.beat === index);
		return { index, start: index === 0 ? 0 : (beatWords[0]?.start ?? 0), end: 0, words: beatWords };
	});
	beats.forEach((beat, i) => {
		beat.end = i < beats.length - 1 ? beats[i + 1].start : duration;
	});

	return { beats, words, duration };
}

/** Quebra a fala em pedaços de até 3 palavras (e ~18 letras), sempre cortando na pontuação. */
export function chunkCaptions(beat: TTimedBeat): TCaptionChunk[] {
	const chunks: TCaptionChunk[] = [];
	let current: TTimedWord[] = [];
	const flush = () => {
		if (current.length === 0) return;
		chunks.push({ words: current, start: current[0].start, end: current[current.length - 1].end });
		current = [];
	};
	for (const word of beat.words) {
		const letters = current.reduce((sum, w) => sum + bareWord(w.text).length + 1, 0) + bareWord(word.text).length;
		if (current.length >= 3 || (current.length > 0 && letters > 18)) flush();
		current.push(word);
		if (/[.,:;!?…]$/.test(word.text)) flush();
	}
	flush();
	return chunks;
}

/** Abertura da boca (0–1) de quem fala num instante: uma "sílaba" a cada ~2,6 letras da palavra. */
export function mouthOpenness(words: TTimedWord[], t: number, speaker: TSpeaker) {
	const word = words.find((w) => w.speaker === speaker && t >= w.start && t <= w.end);
	if (!word) return 0;
	const syllables = Math.max(1, Math.round(bareWord(word.text).length / 2.6));
	const progress = (t - word.start) / Math.max(0.05, word.end - word.start);
	return 0.2 + 0.8 * Math.abs(Math.sin(Math.PI * syllables * progress));
}

/** Instante em que uma palavra (normalizada) é falada dentro do passo, ou null. */
export function wordTime(beat: TTimedBeat, word: string) {
	const target = normalizeWord(word);
	return beat.words.find((w) => normalizeWord(w.text) === target)?.start ?? null;
}
