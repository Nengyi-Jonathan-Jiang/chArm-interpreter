import { type ReactNode, useState } from "react";
import { CodeEditor } from "./codeEditor/codeEditor";
import type { Register, RegisterGP, State } from "./chArm/state";

import "./inputsEditor.css";
import { cast, getAndDelete, getCached } from "./util/util.ts";

export function InputsEditor (
    { setFunc: _setFunc }: { setFunc: (f: (s: State) => any) => any },
): ReactNode {
    const [ inputsCode, setInputsCode ] = useState(`
        // Inputs go here! For example
        i16 264 i16 0b01001100001111
        x0 21
        x1 ptr
        i32 0xdeadbeef
        ptr: i8 34 i8 0 i8 0 i8 0
        i32 0xdeadbeef
    `.trim().replaceAll(/\s*\n\s*/g, '\n'));

    // Tokenize input
    type IntSize = 8n | 16n | 32n | 64n;
    type Token = { type: string, s: string, error?: boolean } & (
        { type: "reg", register: RegisterGP } |
        { type: "size", size: IntSize } |
        { type: "value", value: bigint } |
        { type: "labelDec", value: string } |
        { type: "labelRef", value: string } |
        { type: "comment" } |
        { type: "whitespace" } |
        { type: "error" }
        );
    const tokens: Token[] = [];
    for (let line of inputsCode.split(/(?<=\n)/g)) {
        if (line.match(/^ *\/\//)) {
            tokens.push({ type: "comment", s: line });
            continue;
        }
        while (true) {
            const whiteSpace = line.match(/^\s*/)?.[0] ?? "";
            if (whiteSpace) {
                line = line.substring(whiteSpace.length);
                tokens.push({ type: "whitespace", s: whiteSpace });
            }
            const s = line.match(/^\S+/)?.[0];
            if (!s) break;
            line       = line.substring(s.length);
            const word = s.toLowerCase();

            let currToken: Token;
            let m: RegExpMatchArray | null;
            if (m = word.match(/^x(?:([12]?\d|30)|(sp|zr))$/)) {
                currToken = {
                    type:     'reg', s,
                    register: (m[1] ? +m[1] : m[2]) as never,
                };
            }
            else if (m = word.match(/^i(8|16|32|64)$/)) {
                currToken = { type: "size", s, size: cast(+m![1]) };
            }
            else if (m = word.match(/^(-?)([\d_]+|0b[01_]+|0x[\da-f_]+)$/)) {
                currToken = {
                    type: "value", s, value:
                          (m[1] ? -1n : 1n) * BigInt(m[2]),
                };
            }
            else if (m = word.match(/^(\.?[a-z_]\w*):$/)) {
                currToken = { type: "labelDec", s, value: m[1] };
            }
            else if (m = word.match(/^(\.?[a-z_]\w*)$/)) {
                currToken = { type: "labelRef", s, value: m[1] };
            }
            else {
                currToken = { type: "error", s };
            }
            tokens.push(currToken);
        }
    }

    type Action = { type: "reg", register: Register, value: bigint } | {
        type: "mem",
        size: bigint,
        value: bigint
    };
    const labelUses                            = new Map<string, Action[]>;
    const labelPositions                       = new Map<string, bigint>;
    const actions: Action[]                    = [];
    let currOffset: bigint                     = 0n;
    let currState: null | IntSize | RegisterGP = null;
    let lastToken: Token | null                = null;
    for (const token of tokens) {
        switch (token.type) {
            case "value":
                if (currState === null) {
                    token.error = true;
                    break;
                }
                token.value &= (1n << (typeof currState === "bigint"
                                       ? currState
                                       : 64n)) - 1n;
                if (typeof currState === "bigint") {
                    actions.push({
                        type:  "mem",
                        size:  currState,
                        value: token.value,
                    });
                    currOffset += currState;
                }
                else {
                    actions.push({
                        type:     "reg",
                        register: currState,
                        value:    token.value,
                    });
                }
                currState = null;
                lastToken = token;
                break;
            case "labelRef":
                if (currState === null) {
                    token.error = true;
                    break;
                }
                if (typeof currState === "bigint") {
                    actions.push({
                        type:  "mem",
                        size:  currState,
                        value: 0n,
                    });
                    currOffset += currState;
                }
                else {
                    actions.push({
                        type:     "reg",
                        register: currState,
                        value:    0n,
                    });
                }
                getCached(labelUses, token.value, (): [] => [])
                    .push(actions[actions.length - 1]);
                currState = null;
                lastToken = token;
                break;
            case "reg":
                if (lastToken && currState !== null) lastToken.error = true;
                currState = token.register;
                lastToken = token;
                break;
            case "size":
                if (lastToken && currState !== null) lastToken.error = true;
                currState = token.size;
                lastToken = token;
                break;
            case "labelDec":
                if (lastToken && currState !== null) lastToken.error = true;
                labelPositions.set(token.value, currOffset);
                getCached(labelUses, token.value, (): [] => []);
                lastToken = token;
                break;
        }
    }
    if (lastToken && currState !== null) {
        lastToken.error = true;
    }

    [ ...labelPositions ].forEach(
        ([ label, loc ]) => getAndDelete(labelUses, label)!.forEach(
            a => a.value = loc,
        ),
    );

    return <CodeEditor
        value={ inputsCode }
        setValue={ setInputsCode }
        Highlighter={ () => <pre>
            { tokens.map((t, i) => {
                const { type, s } = t;
                return type === "whitespace"
                       ? s
                       : <span className={ type + (t.error ? ' error' : '') }
                               key={ i }>{ s }</span>;
            }) }
        </pre> }
        placeholder={
            `
            // Inputs go here! For example
            // i16 264 i16 0b01001100001111
            // x0 21
            // x1 ptr
            // i32 0xdeadbeef
            // ptr: i8 34 i8 0 i8 0 i8 0
            // i32 0xdeadbeef
            `.trim().split('\n').map(i => i.trim()).join('\n')
        }
    />;
}