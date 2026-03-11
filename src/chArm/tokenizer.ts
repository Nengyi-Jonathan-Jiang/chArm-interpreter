import { splitWhitespace } from "../util/util";
import { B_condMap as conditions } from "./instructions";

export type Token<type extends string = string> = {
    readonly type: type,
    readonly line: string,
    readonly lineNumber: number,
    readonly lineRange: readonly [number, number],
    readonly originalRange: readonly [number, number],
    isError?: boolean
}

export function getTokenContents(token: Token): string {
    return token.line.substring(...token.lineRange);
}
export function getTokenLength(token: Token): number {
    return token.lineRange[1] - token.lineRange[0];
}

function sliceToken<K extends string>(
    token: Token<any>, type: K,
    start: number, end: number
): Token<K> {
    if (start < 0
        || token.lineRange[0] + end > token.lineRange[1]
        || token.originalRange[0] + end > token.originalRange[1]
        || start > end
    ) {
        throw new Error("Bad token slice");
    }
    return {
        type,
        line: token.line,
        lineNumber: token.lineNumber,
        lineRange: [
            token.lineRange[0] + start, token.lineRange[0] + end
        ],
        originalRange: [
            token.originalRange[0] + start, token.originalRange[0] + end
        ]
    };
}
function relabelToken<K extends string>(
    token: Token<any>, type: K
): Token<K> {
    return { ...token, type }
}
function splitToken<K1 extends string, K2 extends string>(
    token: Token<any>, type1: K1, type2: K2, pos: number
): [Token<K1>, Token<K2>] {
    return [
        sliceToken(token, type1, 0, pos),
        sliceToken(token, type2, pos, getTokenLength(token))
    ]
}
function trimToken<K extends string>(token: Token<K>): Token<K> {
    const [a, b] = splitWhitespace(getTokenContents(token));
    return sliceToken(token, token.type, a.length, a.length + b.length);
}
function extractBeginning<K extends string, K1 extends string>(
    tok: Token<K>, regex: RegExp, type: K1 | ((match: RegExpMatchArray) => K1)
): [Token<K1>, Token<K>] | null {
    const match = getTokenContents(tok).match(regex);
    if (match === null) return null;

    const pos1 = match.index!;
    const pos2 = pos1 + match[0].length;

    const token = sliceToken(
        tok, typeof type === "function" ? type(match) : type,
        pos1, pos2
    );

    const rest = sliceToken(tok, tok.type, pos2, getTokenLength(tok));
    return [token, rest];
}

const opcodes = [
    "ldur", "stur", "movk", "movz",
    "add", "adds", "cmn", "sub", "subs", "cmp",
    "mvn", "orr", "eor", "ands", "tst", "lsl", "lsr", "ubfm", "asr",
    "b", "bl",
    "ret", "nop", "hlt",
] as const;

export type opcode = typeof opcodes[number]

export type ChARMToken = Token<
    "opcode" |
    "condition" |
    "registerGP" |
    "ZR" |
    "SP" |
    "imm" |
    "label" |
    "punct" |
    "comment" |
    "endl"
>;

const operandRegex = /([[\],]|LSL)|(\bX(?:[12]?\d|30)\b)|(\bSP\b)|(\bXZR\b)|(#-?(?:0x[\da-fA-F_]+|0b[10_]+|[\d_]+)\b)|(\.?\b\w+\b)/si;
function tokenizeInstructionOperands(tok: Token<"line">): ChARMToken[] {
    const result: ChARMToken[] = [];
    let match: [ChARMToken, Token<"line">] | null;
    while (match = extractBeginning(tok, operandRegex, match =>
        ([
            "punct",
            "registerGP",
            "SP",
            "ZR",
            "imm",
            "label"
        ] satisfies (ChARMToken["type"])[])[match
            .map((s, i) => [s, i - 1] as const)
            .filter(s => s[1] >= 0 && s[0] !== undefined)[0][1]
        ]
    )) {
        result.push(match[0]);
        tok = match[1];
    }

    return result;
}

function tokenizeInstruction(tok: Token<"line">): ChARMToken[] {
    if (getTokenLength(tok) === 0) return [];

    let [op] = getTokenContents(tok).split(/\s/, 1);
    const [opTok, rest] = splitToken(tok, "unknown", "line", op.length);

    if (op.match(/^\.?\w+:$/)) {
        return [relabelToken(opTok, "label")];
    }

    op = op.toLowerCase();

    if (
        op.substring(0, 2) === "b." &&
        conditions.includes(op.substring(2) as never)
    ) {
        return [
            ...splitToken(opTok, "opcode", "condition", 1),
            ...tokenizeInstructionOperands(rest)
        ];
    }

    if (opcodes.includes(op as never)) {
        return [
            relabelToken(opTok, "opcode"),
            ...tokenizeInstructionOperands(rest)
        ]
    }

    return [];
}

export function tokenize(src: string): readonly ChARMToken[] {
    const lines = src.split("\n").reduce<[Token<"line">[], number]>(
        ([res, idx], line, i) => (
            res.push({
                type: "line",
                line: line,
                lineNumber: i,
                lineRange: [0, line.length],
                originalRange: [idx, idx + line.length]
            }), [res, idx + line.length + 1]
        ),
        [[], 0]
    )[0].filter(i => i.line.length !== 0);

    const res: ChARMToken[] = [];
    for (const tok of lines) {
        const { line } = tok;

        if (line.indexOf("//") != -1) {
            const i = line.indexOf("//");
            const [rest, commentToken] = splitToken(tok, "line", "comment", i);

            res.push(...tokenizeInstruction(trimToken(rest)), commentToken);
        }
        else {
            res.push(...tokenizeInstruction(trimToken(tok)));
        }

        res.push(sliceToken(tok, "endl", tok.lineRange[1], tok.lineRange[1]));
    }

    return res;
}