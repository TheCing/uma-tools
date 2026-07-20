/**
 * Roster decoder — decodes the bit-packed roster share code produced by
 * https://uma.guide/roster-viewer/ (formats v1, v2, v4).
 *
 * Ported from kachi-dev/master:umalator/rosterDecoder.ts and then cleaned up, so this file
 * intentionally diverges from upstream; a future upstream format is a manual port.
 *
 * The BIT LAYOUTS ARE THE WIRE FORMAT and are dictated by the producer: field order, bit
 * widths and the +1 offsets must not change. roster.test.ts pins them with a synthetic
 * encoder. Style is ours; layout is not.
 *
 * Pure: no imports, no UI, no region coupling.
 */

// Minimum bits a record occupies, used to decide whether another one follows.
const V4_MIN_BITS = 109;
const V2_MIN_BITS = 162;
const V1_MIN_BITS = 129;

// Field widths (bits). Dictated by the producer — do not change.
const CARD_ID_BITS = 20;
const STAT_BITS = 11;
const TALENT_BITS = 3;
const RANK_BITS = 15;
const APT_BITS_V4 = 3;   // stored as value-1
const APT_BITS_V12 = 4;  // stored raw
const SKILL_ID_BITS = 20;
const SKILL_COUNT_BITS = 6;
const SKILL_LEVEL_BITS_V12 = 4;
const FACTOR_COUNT_BITS = 4;
const FACTOR_BITS = 24;
const PARENT_COUNT_BITS = 2;
const CREATE_TIME_BITS = 32;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

class BitVector {
	private readonly bits: number[];
	private pos: number;

	constructor(bits: number[] = []) {
		this.bits = bits;
		this.pos = 0;
	}

	read(n: number): number {
		let v = 0;
		for (let i = 0; i < n; i++) {
			v = (v << 1) | (this.pos < this.bits.length ? this.bits[this.pos++] : 0);
		}
		return v;
	}

	remaining(): number {
		return this.bits.length - this.pos;
	}

	static fromBase64(str: string): BitVector {
		const bits: number[] = [];
		for (const element of str) {
			const v = B64.indexOf(element);
			if (v < 0) continue;
			for (let j = 5; j >= 0; j--) bits.push((v >> j) & 1);
		}
		return new BitVector(bits);
	}
}

function b64ToBytes(str: string): Uint8Array<ArrayBuffer> {
	const result: number[] = [];
	for (let i = 0; i < str.length; i += 4) {
		const a = B64.indexOf(str[i] ?? '');
		const b = B64.indexOf(str[i + 1] ?? '');
		const c = B64.indexOf(str[i + 2] ?? '');
		const d = B64.indexOf(str[i + 3] ?? '');
		if (a >= 0 && b >= 0) result.push((a << 2) | (b >> 4));
		if (b >= 0 && c >= 0 && i + 2 < str.length) result.push(((b & 0xf) << 4) | (c >> 2));
		if (c >= 0 && d >= 0 && i + 3 < str.length) result.push(((c & 0x3) << 6) | d);
	}
	return new Uint8Array(result);
}

function bytesToB64(bytes: Uint8Array): string {
	let result = '';
	for (let i = 0; i < bytes.length; i += 3) {
		const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
		result += B64[a >> 2];
		result += B64[((a & 3) << 4) | (b >> 4)];
		result += i + 1 < bytes.length ? B64[((b & 0xf) << 2) | (c >> 6)] : '';
		result += i + 2 < bytes.length ? B64[c & 0x3f] : '';
	}
	return result;
}

async function gunzip(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
	const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gzip(text: string): Promise<Uint8Array<ArrayBuffer>> {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface DecodedUma {
	card_id: number;
	talent_level?: number;
	rank_score?: number;
	create_time?: string;
	/** The uma's actual running style (1=nige, 2=senko, 3=sashi, 4=oikomi). Present only from
	 *  an UmaExtractor data.json import — the bit-packed share code does not encode it, so it
	 *  stays undefined there and callers fall back to inferring from aptitudes. */
	running_style?: number;
	speed: number;
	stamina: number;
	power: number;
	guts: number;
	wisdom: number;
	// aptitude values: V4 = 1-8, V1/V2 = 0-9
	apt_short: number;
	apt_mile: number;
	apt_middle: number;
	apt_long: number;
	apt_turf: number;
	apt_dirt: number;
	apt_nige: number;
	apt_senko: number;
	apt_sashi: number;
	apt_oikomi: number;
	/** NOTE: `level` is NOT uniform across transports. The v4 share code encodes it in a
	 *  single bit, so it is only ever 1 or 2; an UmaExtractor data.json import carries the
	 *  game's real value (1..6 observed). Nothing reads `level` today — calcTotalSP and
	 *  decodedUmaToUmaState both use only `id` — but do not assume the two agree. */
	skills: Array<{ id: number; level: number }>;
}

export async function saveRoster(umas: DecodedUma[]): Promise<string> {
	const compressed = await gzip(JSON.stringify(umas));
	return bytesToB64(compressed);
}

export async function loadRoster(stored: string): Promise<DecodedUma[]> {
	const bytes = b64ToBytes(stored);
	const decompressed = await gunzip(bytes);
	const json = new TextDecoder().decode(decompressed);
	return JSON.parse(json);
}

type Stats = Pick<DecodedUma, 'speed' | 'stamina' | 'power' | 'guts' | 'wisdom'>;

function readStats(bv: BitVector): Stats {
	return {
		speed:   bv.read(STAT_BITS),
		stamina: bv.read(STAT_BITS),
		power:   bv.read(STAT_BITS),
		guts:    bv.read(STAT_BITS),
		wisdom:  bv.read(STAT_BITS)
	};
}

type Aptitudes = Pick<DecodedUma,
	'apt_short' | 'apt_mile' | 'apt_middle' | 'apt_long' |
	'apt_turf' | 'apt_dirt' |
	'apt_nige' | 'apt_senko' | 'apt_sashi' | 'apt_oikomi'>;

/** width = bits per aptitude; offset = added to each raw value (v4 stores value-1). */
function readAptitudes(bv: BitVector, width: number, offset: number): Aptitudes {
	const r = () => bv.read(width) + offset;
	// Order is part of the wire format.
	return {
		apt_short: r(), apt_mile: r(), apt_middle: r(), apt_long: r(),
		apt_turf: r(), apt_dirt: r(),
		apt_nige: r(), apt_senko: r(), apt_sashi: r(), apt_oikomi: r()
	};
}

function readV4Uma(bv: BitVector): DecodedUma | null {
	if (bv.remaining() < V4_MIN_BITS) return null;

	const card_id = bv.read(CARD_ID_BITS);
	const talent_level = bv.read(TALENT_BITS) + 1;
	const has_rank = bv.read(1) === 1;
	const rank_score = has_rank ? bv.read(RANK_BITS) : undefined;

	const stats = readStats(bv);

	// Stored as aptitude-1 (0-7), actual = value+1 (1-8)
	const aptitudes = readAptitudes(bv, APT_BITS_V4, 1);

	const factor_count = bv.read(FACTOR_COUNT_BITS);
	for (let i = 0; i < factor_count; i++) bv.read(FACTOR_BITS);

	const skill_count = bv.read(SKILL_COUNT_BITS);
	const skills: Array<{ id: number; level: number }> = [];
	for (let i = 0; i < skill_count; i++) {
		const id = bv.read(SKILL_ID_BITS);
		const lvl = bv.read(1) === 0 ? 1 : 2;
		skills.push({ id, level: lvl });
	}

	const parent_count = bv.read(PARENT_COUNT_BITS);
	for (let p = 0; p < parent_count; p++) {
		bv.read(CARD_ID_BITS);
		bv.read(TALENT_BITS);
		const pfc = bv.read(FACTOR_COUNT_BITS);
		for (let i = 0; i < pfc; i++) bv.read(FACTOR_BITS);
	}

	return {
		card_id, talent_level, rank_score,
		...stats,
		...aptitudes,
		skills,
	};
}

function formatCreateTime(sec: number): string {
	const d = new Date(sec * 1000);
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, '0');
	const day = String(d.getUTCDate()).padStart(2, '0');
	const h = String(d.getUTCHours()).padStart(2, '0');
	const min = String(d.getUTCMinutes()).padStart(2, '0');
	const s = String(d.getUTCSeconds()).padStart(2, '0');
	return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

function readV2Uma(bv: BitVector): DecodedUma | null {
	if (bv.remaining() < V2_MIN_BITS) return null;

	const card_id = bv.read(CARD_ID_BITS);
	const stats = readStats(bv);
	const aptitudes = readAptitudes(bv, APT_BITS_V12, 0);

	const create_time = formatCreateTime(bv.read(CREATE_TIME_BITS));
	const has_rank = bv.read(1) === 1;
	const rank_score = has_rank ? bv.read(RANK_BITS) : undefined;

	const skill_count = bv.read(SKILL_COUNT_BITS);
	const skills: Array<{ id: number; level: number }> = [];
	for (let i = 0; i < skill_count && bv.remaining() >= SKILL_ID_BITS + SKILL_LEVEL_BITS_V12; i++) {
		const id = bv.read(SKILL_ID_BITS);
		const level = bv.read(SKILL_LEVEL_BITS_V12) + 1;
		skills.push({ id, level });
	}

	return {
		card_id,
		rank_score,
		create_time,
		...stats,
		...aptitudes,
		skills,
	};
}

function readV1Uma(bv: BitVector): DecodedUma | null {
	if (bv.remaining() < V1_MIN_BITS) return null;

	const card_id = bv.read(CARD_ID_BITS);
	const stats = readStats(bv);
	const aptitudes = readAptitudes(bv, APT_BITS_V12, 0);

	const skill_count = bv.read(SKILL_COUNT_BITS);
	const skills: Array<{ id: number; level: number }> = [];
	for (let i = 0; i < skill_count; i++) {
		const id = bv.read(SKILL_ID_BITS);
		const level = bv.read(SKILL_LEVEL_BITS_V12) + 1;
		skills.push({ id, level });
	}

	return {
		card_id,
		...stats,
		...aptitudes,
		skills,
	};
}

export async function decodeRoster(input: string): Promise<DecodedUma[]> {
	let encoded = input.trim();

	const hashIdx = encoded.indexOf('#');
	if (hashIdx >= 0) encoded = encoded.slice(hashIdx + 1);
	encoded = decodeURIComponent(encoded);

	if (!encoded) return [];

	if (encoded.startsWith('z')) {
		try {
			const compressedBytes = b64ToBytes(encoded.slice(1));
			const decompressedBytes = await gunzip(compressedBytes);
			encoded = bytesToB64(decompressedBytes);
		} catch {
			return [];
		}
	}

	const bv = BitVector.fromBase64(encoded);
	const version = bv.read(8);

	if (version === 4) {
		const result: DecodedUma[] = [];

		while (bv.remaining() >= V4_MIN_BITS) {
			const uma = readV4Uma(bv);
			if (!uma) break;
			result.push(uma);
		}

		return result;
	}

	if (version === 2) {
		const uma = readV2Uma(bv);
		return uma ? [uma] : [];
	}

	if (version === 1) {
		const uma = readV1Uma(bv);
		return uma ? [uma] : [];
	}

	return [];
}
