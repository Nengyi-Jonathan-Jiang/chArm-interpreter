import { useState, type ReactNode } from "react";
import { CodeEditor } from "./codeEditor/codeEditor";

export function InputsEditor(
    { }
): ReactNode {
    const [inputsCode, setInputsCode] = useState("");

    return <CodeEditor
        value={inputsCode}
        setValue={setInputsCode}
        Highlighter={
            ({ value, errors: _ }) => {
                return <pre>
                    {value}
                </pre>
            }
        }
        placeholder={
            `
            // Inputs go here! For example
            // i16 264 i16 0b01001100001111
            // reg x0 i64 21
            // reg x1 ptr
            // i32 0xdeadbeef
            // ptr: i8 34 i8 0 i8 0 i8 0
            // i32 0xdeadbeef
            `.trim().split('\n').map(i => i.trim()).join('\n')
        }
    />
}