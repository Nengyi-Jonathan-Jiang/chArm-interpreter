export function wrapUndef<T>(
    x: T | undefined
): [] | [T];
export function wrapUndef<T, U>(
    x: T | undefined, f: (x: T) => U
): [] | [U];
/**
 * Wraps x in an 1-tuple. If x is undefined, returns the empty tuple.
 * 
 * This is useful when propagating optional arguments
 */
export function wrapUndef(
    x: any, f?: (x: any) => any
): any {
    return x === undefined ? [] : [f ? f(x) : x];
}

/** 
 * Union type of number literals from 0 to N - 1
 */
export type IntRange<N extends number> = IntRange_<N, []>;
type IntRange_<N extends number, A extends number[]>
    = A['length'] extends N ? A[number] : IntRange_<N, [...A, A['length']]>;

/** Generate a random BigInt with the given number of bits */
export function randUnsignedBigint(numBits: number): bigint {
    const res = randUnsignedBigintBytes((numBits + 7) >> 3);
    return res & ((1n << BigInt(numBits)) - 1n);
}
function randUnsignedBigintBytes(numBytes: number): bigint {
    if (numBytes === 1) {
        return BigInt(~~(Math.random() * 256));
    }
    return new Array(numBytes)
        .fill(null)
        .map((_, i) => randUnsignedBigintBytes(1) << BigInt(i << 3))
        .reduce((a, b) => a + b);
}

/** Converts a number to a hex string with the given number of digits */
export function toHexString(n: number | bigint, bytes: number) {
    return n.toString(16).padStart(bytes * 2, '0');
}

export function isUint64N(n: bigint): boolean {
    return (n & 0x8000_0000_0000_0000n) != 0n;
}
export function isUint64Z(n: bigint): boolean {
    return (n & 0xffff_ffff_ffff_ffffn) == 0n;
}
export function isUint64C(n: bigint): boolean {
    return n >= 0x1_0000_0000_0000_0000n;
}
export function getUint64Complement(n: bigint): bigint {
    return (~n + 1n) & 0xffff_ffff_ffff_ffffn;
}

export function className(x: object): string {
    return x.constructor.name;
}

export type FilterRecordValue<R extends Record<string, unknown>, V> =
    string & keyof { [K in keyof R as (
        R[K] extends V ? K : never
    )]: V }

export function splitWhitespace(s: string): [string, string, string] {
    const [, a, b, c] = s.match(/^(\s*)(|[^\s]|[^\s].*[^\s])(\s*)$/s) ?? [
        null, "", "", ""
    ];
    return [a, b, c];
}

export function clamp(x: number, min: number, max: number) {
    return x < min ? min : x > max ? max : x;
}