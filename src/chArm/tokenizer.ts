import { B_condMap as conditions } from "./instructions";
import {
    extractBeginning, getTokenContents, getTokenLength, relabelToken,
    sliceToken, splitToken, type Token, trimToken,
} from "../parsing/parsing";

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

const operandRegex = /([[\],]|LSL)|(\bX(?:[12]?\d|30)\b)|(\bSP\b)|(\bXZR\b)|(#-?(?:0x[\da-fA-F_]+|0b[10_]+|[\d_]+)\b)|(\.?\b[a-z_]\w*\b)/si;

function tokenizeInstructionOperands (tok: Token<"line">): ChARMToken[] {
    const result: ChARMToken[] = [];
    let match: [ ChARMToken, Token<"line"> ] | null;
    while (match = extractBeginning(tok, operandRegex, match =>
        ([
            "punct",
            "registerGP",
            "SP",
            "ZR",
            "imm",
            "label",
        ] satisfies (ChARMToken["type"])[])[match
            .map((s, i) => [ s, i - 1 ] as const)
            .filter(s => s[1] >= 0 && s[0] !== undefined)[0][1]
            ],
    )) {
        result.push(match[0]);
        tok = match[1];
    }

    return result;
}

function tokenizeInstruction (tok: Token<"line">): ChARMToken[] {
    if (getTokenLength(tok) === 0) return [];

    let [ op ]            = getTokenContents(tok).split(/\s/, 1);
    const [ opTok, rest ] = splitToken(tok, "unknown", "line", op.length);

    if (op.match(/^\.?[a-zA-Z_]\w*:$/)) {
        return [ relabelToken(opTok, "label") ];
    }

    op = op.toLowerCase();

    if (
        op.substring(0, 2) === "b." &&
        conditions.includes(op.substring(2) as never)
    ) {
        return [
            ...splitToken(opTok, "opcode", "condition", 1),
            ...tokenizeInstructionOperands(rest),
        ];
    }

    if (opcodes.includes(op as never)) {
        return [
            relabelToken(opTok, "opcode"),
            ...tokenizeInstructionOperands(rest),
        ];
    }

    return [];
}

export function tokenize (src: string): readonly ChARMToken[] {
    const lines = src.split("\n").reduce<[ Token<"line">[], number ]>(
        ([ res, idx ], line, i) => (
            res.push({
                type:          "line",
                line:          line,
                lineNumber:    i,
                lineRange:     [ 0, line.length ],
                originalRange: [ idx, idx + line.length ],
            }), [ res, idx + line.length + 1 ]
        ),
        [ [], 0 ],
    )[0];

    const res: ChARMToken[] = [];
    for (const tok of lines) {
        const { line } = tok;

        if (line.indexOf("//") != -1) {
            const i                      = line.indexOf("//");
            const [ rest, commentToken ] = splitToken(
                tok, "line", "comment", i);

            res.push(...tokenizeInstruction(trimToken(rest)), commentToken);
        }
        else {
            res.push(...tokenizeInstruction(trimToken(tok)));
        }

        res.push(sliceToken(tok, "endl", tok.lineRange[1], tok.lineRange[1]));
    }

    return res;
}