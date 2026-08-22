/**
 * Throwaway measurement harness — issue #5.
 *
 * The fixture allowlist the four `spike-*` route handlers resolve `?fixture=`
 * against. No caller-supplied URL is ever fetched: every URL a handler fetches
 * comes from this hard-coded map. Byte lengths and SHA-1 hashes are what the
 * Wikimedia Commons API reported on 2026-08-22; a handler re-checks the byte
 * length (and, where cheap, the hash) of what it actually downloads against
 * these expected values and reports a mismatch rather than failing silently.
 *
 * This whole directory is deleted before the pull request that carries it
 * goes ready — see the decision record this spike produces.
 */

export interface FixtureEntry {
	/** Source URL. Fetched at measurement time, never committed. */
	readonly url: string;
	/** Expected byte length, from the Wikimedia Commons API on 2026-08-22. */
	readonly expectedBytes: number;
	/** Expected SHA-1, from the Wikimedia Commons API on 2026-08-22. */
	readonly expectedSha1: string;
	readonly mime: string;
	readonly pixels: { readonly width: number; readonly height: number };
	readonly credit: string;
}

export const FIXTURES = {
	"photo-50mb": {
		url: "https://upload.wikimedia.org/wikipedia/commons/7/7b/012_Wild_Chamois_Riederalp_Photo_by_Giles_Laurent.jpg",
		expectedBytes: 54_326_024,
		expectedSha1: "7cc2e7e9948ad702ae6d2c2993066d79f762d6d2",
		mime: "image/jpeg",
		pixels: { width: 7952, height: 5304 },
		credit: "CC BY-SA 4.0, Giles Laurent",
	},
	"photo-12mp": {
		url: "https://upload.wikimedia.org/wikipedia/commons/5/5a/%27go_slow%27_Traffic_sign_-_Bangalore.jpg",
		expectedBytes: 4_264_656,
		expectedSha1: "654e51555d930da416041b9dc026af7a4c609356",
		mime: "image/jpeg",
		pixels: { width: 4032, height: 3024 },
		credit: "CC0, Pappinupappi1001 — taken with an iPhone 13 Pro",
	},
	"screenshot-png": {
		url: "https://upload.wikimedia.org/wikipedia/commons/a/aa/Screenshot_DarkCosmos_Alpha.png",
		expectedBytes: 757_120,
		expectedSha1: "87ede83f95dfb0bdec9ceee751ed97e31c21d0ab",
		mime: "image/png",
		pixels: { width: 1920, height: 1080 },
		credit: "CC BY-SA 4.0, Killarnee",
	},
	"transparent-png": {
		url: "https://upload.wikimedia.org/wikipedia/commons/9/9e/Wikimania_2024_logo_%28transparent_background%2C_blue%29.png",
		expectedBytes: 111_013,
		expectedSha1: "34d0d6bbb17c29d4cc71f1404e7113c4d7853f6b",
		mime: "image/png",
		pixels: { width: 4020, height: 1601 },
		credit: "CC0, Kasia Ostrowska",
	},
	"animated-gif": {
		url: "https://upload.wikimedia.org/wikipedia/commons/d/dd/Muybridge_race_horse_animated.gif",
		expectedBytes: 568_203,
		expectedSha1: "1e92e47e94d547fe7a55bf594cc590b13dc2b5de",
		mime: "image/gif",
		pixels: { width: 300, height: 200 },
		credit: "Public domain, Eadweard Muybridge",
	},
	"already-small": {
		url: "https://upload.wikimedia.org/wikipedia/commons/3/3a/Flower_202.jpg",
		expectedBytes: 44_662,
		expectedSha1: "4f3046d78841997a3b94d57421864b8b912f1add",
		mime: "image/jpeg",
		pixels: { width: 1500, height: 1000 },
		credit: "CC BY-SA 4.0, Kamalimaddy",
	},
} as const satisfies Record<string, FixtureEntry>;

export type FixtureKey = keyof typeof FIXTURES;

export const FIXTURE_KEYS = Object.keys(FIXTURES) as FixtureKey[];

export function isFixtureKey(value: string | null): value is FixtureKey {
	return value !== null && Object.hasOwn(FIXTURES, value);
}

/** Wikimedia rejects requests with no descriptive User-Agent. */
export const FIXTURE_USER_AGENT =
	"tsuzuri-spike/1.0 (+https://github.com/axross/tsuzuri)";
