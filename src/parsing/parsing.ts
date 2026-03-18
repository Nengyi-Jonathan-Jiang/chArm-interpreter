import { splitWhitespace } from "../util/util";

export type Token<type extends string = string> = {
    readonly type: type;
    readonly line: string;
    readonly lineNumber: number;
    readonly lineRange: readonly [ number, number ];
    readonly originalRange: readonly [ number, number ];
    isError?: boolean;
};

export function getTokenContents (token: Token): string {
    return token.line.substring(...token.lineRange);
}

export function getTokenLength (token: Token): number {
    return token.lineRange[1] - token.lineRange[0];
}

export function sliceToken<K extends string> (
    token: Token<any>, type: K,
    start: number, end: number,
): Token<K> {
    if (start < 0
        || token.lineRange[0] + end > token.lineRange[1]
        || token.originalRange[0] + end > token.originalRange[1]
        || start > end) {
        throw new Error("Bad token slice");
    }
    return {
        type,
        line:          token.line,
        lineNumber:    token.lineNumber,
        lineRange:     [
            token.lineRange[0] + start, token.lineRange[0] + end,
        ],
        originalRange: [
            token.originalRange[0] + start, token.originalRange[0] + end,
        ],
    };
}

export function relabelToken<K extends string> (
    token: Token<any>, type: K): Token<K> {
    return { ...token, type };
}

export function splitToken<K1 extends string, K2 extends string> (
    token: Token<any>, type1: K1, type2: K2,
    pos: number,
): [ Token<K1>, Token<K2> ] {
    return [
        sliceToken(token, type1, 0, pos),
        sliceToken(token, type2, pos, getTokenLength(token)),
    ];
}

export function trimToken<K extends string> (token: Token<K>): Token<K> {
    const [ a, b ] = splitWhitespace(getTokenContents(token));
    return sliceToken(token, token.type, a.length, a.length + b.length);
}

export function extractBeginning<K extends string, K1 extends string> (
    tok: Token<K>, regex: RegExp,
    type: K1 | ((match: RegExpMatchArray) => K1),
): [ Token<K1>, Token<K> ] | null {
    const match = getTokenContents(tok).match(regex);
    if (match === null) return null;

    const pos1 = match.index!;
    const pos2 = pos1 + match[0].length;

    const token = sliceToken(
        tok, typeof type === "function" ? type(match) : type,
        pos1, pos2,
    );

    const rest = sliceToken(tok, tok.type, pos2, getTokenLength(tok));
    return [ token, rest ];
}