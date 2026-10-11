"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecordingState = "idle" | "recording" | "stopped" | "error";

export type AudioRecorderResult = {
	// State
	recordingState: RecordingState;
	recordingDuration: number; // in seconds
	audioBlob: Blob | null;
	audioUrl: string | null;
	error: string | null;
	audioLevels: number[]; // Array of audio levels for waveform (0-100)

	// Actions
	startRecording: () => Promise<void>;
	stopRecording: () => void;
	cancelRecording: () => void;
	resetRecording: () => void;

	// Permissions
	hasPermission: boolean | null; // null = not checked, true = granted, false = denied
};

const MAX_DURATION = 300; // 5 minutes in seconds
const WAVEFORM_BARS = 40;
const AUDIO_LEVEL_UPDATE_INTERVAL = 50; // Update every 50ms for smooth animation

/**
 * Custom hook for audio recording with MediaRecorder API
 * Handles browser format detection, real-time audio levels, and duration limits
 */
export function useAudioRecorder(): AudioRecorderResult {
	const [recordingState, setRecordingState] = useState<RecordingState>("idle");
	const [recordingDuration, setRecordingDuration] = useState(0);
	const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
	const [audioUrl, setAudioUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [hasPermission, setHasPermission] = useState<boolean | null>(null);
	const [audioLevels, setAudioLevels] = useState<number[]>(() => Array(WAVEFORM_BARS).fill(0));

	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const audioContextRef = useRef<AudioContext | null>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const startTimeRef = useRef<number | null>(null);
	const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null);

	/**
	 * Get the best supported audio MIME type for recording
	 * Prioritizes OGG/Opus for maximum WhatsApp compatibility
	 */
	const getSupportedMimeType = useCallback((): { mimeType: string; isWhatsAppCompatible: boolean } => {
		// Prioritize OGG with Opus codec - this is WhatsApp's native format
		// and has the best compatibility
		const preferredTypes = [
			"audio/ogg;codecs=opus", // Firefox, Chrome - Best for WhatsApp
			"audio/ogg", // Fallback for ogg without codec specification
			"audio/webm;codecs=opus", // Chrome fallback - will be converted to OGG
			"audio/webm", // Generic WebM - will be converted to OGG
		];

		// Try preferred formats
		for (const type of preferredTypes) {
			if (MediaRecorder.isTypeSupported(type)) {
				const isOgg = type.includes("ogg");
				console.log("[AudioRecorder] Using MIME type:", type, isOgg ? "(native WhatsApp format)" : "(will convert to OGG)");
				return { mimeType: type, isWhatsAppCompatible: isOgg };
			}
		}

		// Last resort fallback
		const lastResortTypes = ["audio/mp4", "audio/mpeg", "audio/aac"];
		for (const type of lastResortTypes) {
			if (MediaRecorder.isTypeSupported(type)) {
				console.warn("[AudioRecorder] Using fallback format (will convert to OGG):", type);
				return { mimeType: type, isWhatsAppCompatible: false };
			}
		}

		console.warn("[AudioRecorder] No preferred MIME type supported, using default");
		return { mimeType: "", isWhatsAppCompatible: false };
	}, []);

	/**
	 * Update audio levels for waveform visualization
	 */
	const updateAudioLevels = useCallback(() => {
		if (!analyserRef.current) return;

		const analyser = analyserRef.current;
		const dataArray = new Uint8Array(analyser.frequencyBinCount);
		analyser.getByteFrequencyData(dataArray);

		// Calculate average amplitude across frequency bins
		const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;

		// Normalize to 0-100 range and add some amplification for better visual
		const normalizedLevel = Math.min(100, (average / 128) * 100 * 1.5);

		// Update levels array by shifting and adding new level
		setAudioLevels((prev) => {
			const newLevels = [...prev.slice(1), normalizedLevel];
			return newLevels;
		});
	}, []);

	/**
	 * Libera timers, microfone e contexto de áudio. Usado nos caminhos de erro, onde nenhum
	 * `onstop` virá limpar o que já foi aberto (ex.: permissão concedida, mas o MediaRecorder falha).
	 */
	const releaseCaptureResources = useCallback(() => {
		if (durationIntervalRef.current) {
			clearInterval(durationIntervalRef.current);
			durationIntervalRef.current = null;
		}
		if (audioLevelIntervalRef.current) {
			clearInterval(audioLevelIntervalRef.current);
			audioLevelIntervalRef.current = null;
		}
		if (streamRef.current) {
			for (const track of streamRef.current.getTracks()) {
				track.stop();
			}
			streamRef.current = null;
		}
		if (audioContextRef.current) {
			void audioContextRef.current.close();
			audioContextRef.current = null;
		}
		analyserRef.current = null;
	}, []);

	/**
	 * Start audio recording
	 */
	const startRecording = useCallback(async () => {
		try {
			console.log("[AudioRecorder] Starting recording...");
			setError(null);
			chunksRef.current = [];
			setAudioLevels(Array(WAVEFORM_BARS).fill(0));

			// Request microphone access
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					sampleRate: 48000,
					channelCount: 1, // Mono
				},
			});

			streamRef.current = stream;
			setHasPermission(true);

			// Setup audio context for level monitoring
			audioContextRef.current = new AudioContext();
			const source = audioContextRef.current.createMediaStreamSource(stream);
			const analyser = audioContextRef.current.createAnalyser();
			analyser.fftSize = 256;
			analyser.smoothingTimeConstant = 0.8;
			source.connect(analyser);
			analyserRef.current = analyser;

			// Get supported MIME type
			const { mimeType, isWhatsAppCompatible } = getSupportedMimeType();

			if (!isWhatsAppCompatible) {
				console.warn("[AudioRecorder] Recording in non-WhatsApp-compatible format. Audio may not send correctly.");
			}

			// Create MediaRecorder
			const mediaRecorder = new MediaRecorder(stream, {
				mimeType: mimeType || undefined,
				audioBitsPerSecond: 64000, // 64 kbps for good voice quality
			});

			mediaRecorderRef.current = mediaRecorder;

			// Handle data available
			mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					chunksRef.current.push(event.data);
				}
			};

			// Handle recording stop
			mediaRecorder.onstop = () => {
				// Cancelar ou falhar já liberou o stream (e voltou o estado); o `stop` assíncrono do
				// MediaRecorder não deve ressuscitar uma gravação descartada.
				if (!streamRef.current) return;
				console.log("[AudioRecorder] Recording stopped");
				const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
				setAudioBlob(blob);

				// Create URL for preview
				const url = URL.createObjectURL(blob);
				setAudioUrl(url);

				setRecordingState("stopped");

				// Cleanup
				if (streamRef.current) {
					for (const track of streamRef.current.getTracks()) {
						track.stop();
					}
					streamRef.current = null;
				}
				if (audioContextRef.current) {
					audioContextRef.current.close();
					audioContextRef.current = null;
				}
			};

			// Handle errors
			mediaRecorder.onerror = (event) => {
				console.error("[AudioRecorder] MediaRecorder error:", event);
				releaseCaptureResources();
				setError("Erro ao gravar áudio");
				setRecordingState("error");
			};

			// Start recording
			mediaRecorder.start(100); // Collect data every 100ms
			startTimeRef.current = Date.now();
			// Só agora o estado vira "recording": antes disso o usuário ainda pode negar o microfone, e
			// a barra de gravação não deve aparecer para uma gravação que não existe.
			setRecordingDuration(0);
			setRecordingState("recording");

			// Start duration timer
			durationIntervalRef.current = setInterval(() => {
				if (startTimeRef.current) {
					const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
					setRecordingDuration(elapsed);

					// Auto-stop at max duration
					if (elapsed >= MAX_DURATION) {
						console.log("[AudioRecorder] Max duration reached, stopping...");
						stopRecording();
					}
				}
			}, 100);

			// Start audio level monitoring
			audioLevelIntervalRef.current = setInterval(updateAudioLevels, AUDIO_LEVEL_UPDATE_INTERVAL);

			console.log("[AudioRecorder] Recording started successfully");
		} catch (err) {
			console.error("[AudioRecorder] Error starting recording:", err);
			releaseCaptureResources();

			let errorMessage = "Erro ao acessar microfone";
			if (err instanceof Error) {
				if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
					errorMessage = "Permissão de microfone negada";
					setHasPermission(false);
				} else if (err.name === "NotFoundError") {
					errorMessage = "Nenhum microfone encontrado";
				} else if (err.name === "NotReadableError") {
					errorMessage = "Microfone já está em uso";
				}
			}

			setError(errorMessage);
			setRecordingState("error");
		}
	}, [getSupportedMimeType, updateAudioLevels, releaseCaptureResources]);

	/**
	 * Stop recording
	 */
	const stopRecording = useCallback(() => {
		console.log("[AudioRecorder] Stopping recording...");

		if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
			mediaRecorderRef.current.stop();
		}

		// Clear intervals
		if (durationIntervalRef.current) {
			clearInterval(durationIntervalRef.current);
			durationIntervalRef.current = null;
		}
		if (audioLevelIntervalRef.current) {
			clearInterval(audioLevelIntervalRef.current);
			audioLevelIntervalRef.current = null;
		}
	}, []);

	/**
	 * Cancel recording and clean up
	 */
	const cancelRecording = useCallback(() => {
		console.log("[AudioRecorder] Cancelling recording...");

		// Stop recording if active
		if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
			mediaRecorderRef.current.stop();
		}

		// Clear intervals
		if (durationIntervalRef.current) {
			clearInterval(durationIntervalRef.current);
			durationIntervalRef.current = null;
		}
		if (audioLevelIntervalRef.current) {
			clearInterval(audioLevelIntervalRef.current);
			audioLevelIntervalRef.current = null;
		}

		// Cleanup stream
		if (streamRef.current) {
			for (const track of streamRef.current.getTracks()) {
				track.stop();
			}
			streamRef.current = null;
		}

		// Cleanup audio context
		if (audioContextRef.current) {
			audioContextRef.current.close();
			audioContextRef.current = null;
		}

		// Reset state
		setRecordingState("idle");
		setRecordingDuration(0);
		setAudioBlob(null);
		if (audioUrl) {
			URL.revokeObjectURL(audioUrl);
		}
		setAudioUrl(null);
		setAudioLevels(Array(WAVEFORM_BARS).fill(0));
		chunksRef.current = [];
		startTimeRef.current = null;
	}, [audioUrl]);

	/**
	 * Reset recording state (after sending)
	 */
	const resetRecording = useCallback(() => {
		console.log("[AudioRecorder] Resetting recording...");

		if (audioUrl) {
			URL.revokeObjectURL(audioUrl);
		}

		setRecordingState("idle");
		setRecordingDuration(0);
		setAudioBlob(null);
		setAudioUrl(null);
		setError(null);
		setAudioLevels(Array(WAVEFORM_BARS).fill(0));
		chunksRef.current = [];
		startTimeRef.current = null;
	}, [audioUrl]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			// Clear intervals
			if (durationIntervalRef.current) {
				clearInterval(durationIntervalRef.current);
			}
			if (audioLevelIntervalRef.current) {
				clearInterval(audioLevelIntervalRef.current);
			}

			// Stop stream
			if (streamRef.current) {
				for (const track of streamRef.current.getTracks()) {
					track.stop();
				}
			}

			// Close audio context
			if (audioContextRef.current) {
				audioContextRef.current.close();
			}

			// Revoke URL
			if (audioUrl) {
				URL.revokeObjectURL(audioUrl);
			}
		};
	}, [audioUrl]);

	return {
		recordingState,
		recordingDuration,
		audioBlob,
		audioUrl,
		error,
		audioLevels,
		startRecording,
		stopRecording,
		cancelRecording,
		resetRecording,
		hasPermission,
	};
}
