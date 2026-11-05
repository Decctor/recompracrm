import assert from "node:assert/strict";
import test from "node:test";
import {
	describeSerialScaleDetectionAttempt,
	formatSerialBytesHex,
	formatSerialBytesText,
	judgeSerialScaleDetection,
	type TSerialScaleDetectionAttempt,
} from "./serial-scale-diagnostics";

function attempt(partial: Partial<TSerialScaleDetectionAttempt>): TSerialScaleDetectionAttempt {
	return { label: "4800 bps · 8N1", bytes: 0, unpromptedBytes: 0, frames: 0, errors: [], sample: [], ...partial };
}

test("formats bytes as hex and as text with named control characters", () => {
	const bytes = [0x02, 0x30, 0x30, 0x34, 0x34, 0x36, 0x03, 0x0d, 0x0a, 0xff];
	assert.equal(formatSerialBytesHex(bytes), "02 30 30 34 34 36 03 0D 0A FF");
	assert.equal(formatSerialBytesText(bytes), "<STX>00446<ETX><CR><LF><FF>");
});

test("silence on every framing is a cable/port verdict", () => {
	const verdict = judgeSerialScaleDetection([attempt({}), attempt({ label: "9600 bps · 8N1" })]);
	assert.deepEqual(verdict, { kind: "SILENT" });
});

test("bytes or line errors on any framing mean the scale talks in an unknown format", () => {
	const verdict = judgeSerialScaleDetection([
		attempt({}),
		attempt({ label: "9600 bps · 8N1", errors: [{ name: "FramingError", count: 3 }] }),
		attempt({ label: "2400 bps · 7E1", bytes: 12, sample: [0x41] }),
	]);
	assert.deepEqual(verdict, { kind: "UNRECOGNIZED", activeLabels: ["9600 bps · 8N1", "2400 bps · 7E1"] });
});

test("describes each attempt in one line", () => {
	assert.equal(describeSerialScaleDetectionAttempt(attempt({})), "nada recebido");
	assert.equal(
		describeSerialScaleDetectionAttempt(attempt({ bytes: 14, unpromptedBytes: 7, errors: [{ name: "FramingError", count: 2 }] })),
		"14 bytes · 7 sem pedir · nenhum quadro reconhecido · erro de enquadramento (velocidade ou formato diferentes) ×2",
	);
	assert.equal(describeSerialScaleDetectionAttempt(attempt({ bytes: 7, frames: 1 })), "7 bytes · 1 quadro válido");
});
