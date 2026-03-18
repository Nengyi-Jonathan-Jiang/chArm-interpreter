import {
    ADD, ADDS, ANDS, ASR, B, BL, CMN, CMP, EOR, HLT, type Instruction, LDUR,
    LSL, LSR, MOVK, MOVZ, MVN, NOP, ORR, RET, STUR, SUB, SUBS, TST, UBFM,
} from "./instructions";
import type { RegisterGP } from "./state";
import { type ChARMToken, type opcode } from "./tokenizer";
import { getTokenContents, type Token } from "../parsing/parsing";

const instructionMap = {
    ldur: LDUR, stur: STUR, movk: MOVK, movz: MOVZ,
    add:  ADD, adds: ADDS, cmn: CMN,
    sub:  SUB, subs: SUBS, cmp: CMP,
    mvn:  MVN, orr: ORR, eor: EOR, ands: ANDS, tst: TST,
    lsl:  LSL, lsr: LSR, ubfm: UBFM, asr: ASR,
    b:    B, bl: BL, ret: RET,
    nop:  NOP, hlt: HLT,
} as const;

export function assembleChARM (
    tokens: readonly ChARMToken[], startLabel?: string): [
    Instruction[], number[], Map<number, string[]>?
] {
    const errors: Map<number, string[]> = new Map;
    let lineNumber: number              = 0;

    // Split into lines
    let lines: ChARMToken[][] = [ [] ];
    for (const token of tokens) {
        if (token.type === "comment") continue;

        if (token.type === "endl") {
            lines.push([]);
        }
        else {
            lines[lines.length - 1].push(token);
        }
    }
    // Remove empty lines
    lines = lines.filter(i => i.length !== 0);

    let pc         = 0n;
    const labelMap = new Map<string | Token<"opcode">, [ bigint, ChARMToken[] ]>;

    if (startLabel !== undefined) {
        labelMap.set(startLabel, [
            0n, [
                {
                    type:          "label",
                    line:          "",
                    lineNumber:    -1,
                    lineRange:     [ 0, 0 ],
                    originalRange: [ 0, 0 ],
                },
            ],
        ]);
    }

    for (const [ firstToken, ...rest ] of lines) {
        lineNumber = firstToken.lineNumber;
        switch (firstToken.type) {
            case "opcode":
                labelMap.set(
                    firstToken as Token<"opcode">, [ pc, [ firstToken ] ]);
                pc += 4n;
                break;
            case "label": {
                let labelName = getTokenContents(firstToken);
                labelName     = labelName.substring(0, labelName.length - 1);
                if (labelMap.has(labelName)) {
                    labelMap.get(labelName)![1].push(firstToken);
                }
                else {
                    labelMap.set(labelName, [ pc, [ firstToken ] ]);
                }
                error(null, ...rest);
                break;
            }
            default:
                error('Malformed instruction', firstToken, ...rest);
        }
    }

    for (const [ label, [ , toks ] ] of labelMap) {
        if (toks.length > 1) {
            error(
                `Duplicate label "${ label }" (lines ${ toks.map(
                    i => i.lineNumber + 6).join(', ')
                })`,
                ...toks,
            );
        }
    }

    lines = lines.filter(i => i[0].type === "opcode");

    const res: Instruction[]    = [];
    const lineNumbers: number[] = [];

    for (const [ firstToken, ...rest ] of lines) {
        lineNumber = firstToken.lineNumber;
        lineNumbers.push(lineNumber);

        // Parse instruction
        const opcode       = getTokenContents(firstToken)
            .toLowerCase() as opcode;
        const oldLen       = res.length;
        const oldNumErrors = errors.get(lineNumber)?.length ?? 0;
        try {
            switch (opcode) {
                case "ldur": {
                    const dst = expectReg(rest);
                    if (dst === null) break;
                    if (!expectPunct(rest, ",")) break;
                    if (!expectPunct(rest, "[")) break;
                    const src_b = expectReg(rest);
                    if (src_b === null) break;
                    if (!expectPunct(rest, ",")) break;
                    const offset = expectImm(rest);
                    if (offset === null) break;
                    if (!expectPunct(rest, "]")) break;
                    res.push(new LDUR({ dst, src_b, offset }));
                    break;
                }
                case "stur": {
                    const src = expectReg(rest);
                    if (src === null) break;
                    if (!expectPunct(rest, ",")) break;
                    if (!expectPunct(rest, "[")) break;
                    const dst_b = expectReg(rest);
                    if (dst_b === null) break;
                    if (!expectPunct(rest, ",")) break;
                    const offset = expectImm(rest);
                    if (offset === null) break;
                    if (!expectPunct(rest, "]")) break;
                    res.push(new STUR({ dst_b, src, offset }));
                    break;
                }
                case "movk":
                case "movz": {
                    const dst = expectReg(rest);
                    if (dst === null) break;
                    if (!expectPunct(rest, ",")) break;
                    const value = expectImm(rest);
                    if (value === null) break;
                    let shift: bigint | null = 0n;
                    if (expectPunct(rest, ",", false)) {
                        if (!expectPunct(rest, "LSL")) break;
                        shift = expectImm(rest);
                    }
                    if (shift === null) break;

                    res.push(
                        new (instructionMap[opcode])({ dst, value, shift }));
                    break;
                }
                case "adds":
                case "subs":
                case "ands":
                case "orr":
                case "eor": {
                    const dst = expectReg(rest);
                    if (dst === null) break;
                    if (!expectPunct(rest, ",")) break;
                    const a = expectReg(rest);
                    if (a === null) break;
                    if (!expectPunct(rest, ",")) break;
                    const b = expectReg(rest);
                    if (b === null) break;
                    res.push(new (instructionMap[opcode])({ dst, a, b }));
                    break;
                }

                case "mvn": {
                    const dst = expectReg(rest);
                    if (dst === null) break;
                    if (!expectPunct(rest, ",")) break;
                    const a = expectReg(rest);
                    if (a === null) break;
                    res.push(new MVN({ dst, a }));
                    break;
                }

                case "cmn":
                case "cmp":
                case "tst": {
                    const a = expectReg(rest);
                    if (a === null) break;
                    if (!expectPunct(rest, ",")) break;
                    const b = expectReg(rest);
                    if (b === null) break;
                    res.push(new (instructionMap[opcode])({ a, b }));
                    break;
                }

                case "lsl":
                case "lsr": {
                    const dst = expectReg(rest);
                    if (dst === null) break;
                    if (!expectPunct(rest, ",")) break;
                    const a = expectReg(rest);
                    if (a === null) break;
                    if (!expectPunct(rest, ",")) break;
                    const b = expectRegOrImm(rest);
                    if (b === null) break;
                    res.push(new (instructionMap[opcode])({ dst, a, b }));
                    break;
                }

                case "add":
                case "sub":
                case "asr": {
                    const dst = expectReg(rest);
                    if (dst === null) break;
                    if (!expectPunct(rest, ",")) break;
                    const a = expectReg(rest);
                    if (a === null) break;
                    if (!expectPunct(rest, ",")) break;
                    const b = expectImm(rest);
                    if (b === null) break;
                    res.push(new (instructionMap[opcode])({ dst, a, b }));
                    break;
                }

                case "ubfm": {
                    const dst = expectReg(rest);
                    if (dst === null) break;
                    if (!expectPunct(rest, ",")) break;
                    const a = expectReg(rest);
                    if (a === null) break;
                    if (!expectPunct(rest, ",")) break;
                    const r = expectImm(rest);
                    if (r === null) break;
                    if (!expectPunct(rest, ",")) break;
                    const s = expectImm(rest);
                    if (s === null) break;

                    res.push(new UBFM({ dst, a, r, s }));
                    break;
                }

                case "b": {
                    const cond  = expectCond(rest);
                    const label = expectLabel(rest);
                    if (!label) break;
                    const pc = labelMap.get(label);
                    if (pc === undefined) {
                        throw new Error(`Unknown label ${ label }`);
                    }
                    const dst = pc[0];
                    res.push(new B({ dst, cond }));
                    break;
                }

                case "bl": {
                    const label = expectLabel(rest);
                    if (!label) break;
                    const pc = labelMap.get(label);
                    if (pc === undefined) {
                        throw new Error(`Unknown label ${ label }`);
                    }
                    const dst = pc[0];
                    res.push(new BL({ dst }));
                    break;
                }

                case "ret": {
                    // Manual
                    let dst: RegisterGP = 30;
                    if (rest[0]?.type === "registerGP") {
                        dst = +getTokenContents(
                            rest.shift()!,
                        ).substring(1) as RegisterGP;
                    }
                    res.push(new RET({ dst }));
                    break;
                }

                case "hlt":
                    res.push(new HLT({}));
                    break;
                case "nop":
                    res.push(new NOP({}));
                    break;
            }
        }
        catch (e) {
            errorLine(
                (e as any)?.message ?? "Unknown error",
            );
        }
        if (res.length === oldLen) {
            if ((errors.get(lineNumber)?.length ?? 0) == oldNumErrors) {
                errorLine('Malformed instruction');
            }
            res.push(new NOP({})); // Can't skip an instruction due to labels
        }
        error(null, ...rest);
    }

    return [
        res, lineNumbers, ...(errors.size ? [ errors ] as const : [] as const),
    ];

    function errorLine (message: string, line?: number) {
        line ??= lineNumber;
        if (!errors.has(line)) errors.set(line, []);
        const e = errors.get(line)!;
        if (!e.includes(message)) e.push(message);
    }

    function error (message: string | null, ...toks: ChARMToken[]) {
        for (const tok of toks) {
            tok.isError = true;
            if (message) errorLine(message, tok.lineNumber);
        }
        if (toks.length === 0 && message) {
            errorLine(message);
        }
    }

    function expectPunct (
        rest: ChARMToken[], s: string, require: boolean = true,
    ): boolean {
        if (rest[0]?.type === "punct" && getTokenContents(rest[0]) === s) {
            rest.shift();
            return true;
        }
        if (require) error(`Expected "${ s }"`, ...rest);
        return false;
    }

    function expectCond (rest: ChARMToken[]): B.cond | undefined {
        if (rest[0]?.type === "condition") {
            return getTokenContents(rest.shift()!).substring(1) as B.cond;
        }
        // No error if not present
        return undefined;
    }

    function expectImm (rest: ChARMToken[]): bigint | null {
        if (rest[0]?.type === "imm") {
            const num = getTokenContents(rest.shift()!)
                .replaceAll("_", "");
            return (num[1] === '-' ? -1n : 1n) *
                BigInt(num.substring(num[1] === '-' ? 2 : 1));
        }
        error('Expected immediate', ...rest);
        return null;
    }

    function expectLabel (rest: ChARMToken[]): string | null {
        if (rest[0]?.type === "label") {
            return getTokenContents(rest.shift()!);
        }
        error('Expected label', ...rest);
        return null;
    }

    function expectReg (rest: ChARMToken[]): RegisterGP | null {
        if (rest[0]?.type === "registerGP") {
            return +getTokenContents(
                rest.shift()!,
            ).substring(1) as RegisterGP;
        }
        if (rest[0]?.type === "ZR") {
            return rest.shift(), "ZR" as unknown as RegisterGP;
        }
        if (rest[0]?.type === "SP") {
            return rest.shift(), "SP" as unknown as RegisterGP;
        }
        error('Expected register', ...rest);
        return null;
    }

    function expectRegOrImm (rest: ChARMToken[]): RegisterGP | bigint | null {
        if (rest[0]?.type === "imm") {
            const num = getTokenContents(rest.shift()!)
                .replaceAll("_", "");
            return (num[1] === '-' ? -1n : 1n) *
                BigInt(num.substring(num[1] === '-' ? 2 : 1));
        }
        if (rest[0]?.type === "registerGP") {
            return +getTokenContents(
                rest.shift()!,
            ).substring(1) as RegisterGP;
        }
        if (rest[0]?.type === "ZR") {
            return rest.shift(), "ZR" as unknown as RegisterGP;
        }
        if (rest[0]?.type === "SP") {
            return rest.shift(), "SP" as unknown as RegisterGP;
        }
        error('Expected register or immediate', ...rest);
        return null;
    }
}
