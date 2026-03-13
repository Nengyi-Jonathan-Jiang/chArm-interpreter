import { memo, useEffect, useMemo, useState, type HTMLAttributes, type ReactNode } from 'react'
import './App.css'
import './chArm/parser'
import { CodeEditor } from './codeEditor/codeEditor'
import { CodeHighlighter } from './codeEditor/codeHighlighter'
import { HighlighterWithErrors } from './codeEditor/highlighterWithErrors'
import { HorizontalResizableDoublePane, VerticalResizableDoublePane } from './resizable/resizable'
import { useListenerOnWindow, useManualRerender } from './util/hooks'
import { tokenize } from './chArm/tokenizer'
import { assembleChARM } from './chArm/parser'
import { InputsEditor } from './inputsEditor'

function HL({ children, color, ...attributes }: {
    children: ReactNode,
    color: "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "medium",
} & Partial<HTMLAttributes<HTMLSpanElement>>): ReactNode {
    return <span style={{ color: `var(--color-${color})` }} {...attributes}>
        {children}
    </span>
}

const FuncNameInput = ({
    funcName,
    setFuncName
}: { funcName: string, setFuncName: (name: string) => any }) => {
    const [value, setValue] = useState(funcName);
    return <input
        id="function-name"
        placeholder={funcName}
        value={value}
        onKeyDown={e => {
            const { key } = e;
            if (!key.match(/^\w+$/)) { // Function name must be only word chars
                e.preventDefault();
            }
        }}
        onChange={e => {
            const name = e.target.value;
            setValue(name);
            if (name.length >= 1) {
                setFuncName(name);
            }
        }}
        spellCheck="false"
    />
}

const LineNumbers = memo(({ amount }: { amount: number }) => {
    const len = amount.toString().length;

    return <pre id="line-numbers">
        {
            new Array(amount).fill(0)
                .map((_, i) => i + 1)
                .map(i => `  ${i.toString().padStart(len, ' ')} `)
                .join('\n')
        }
    </pre>
})

function App() {
    const savedFuncName = localStorage.getItem("func") ?? "myfunc";
    const savedCode = localStorage.getItem("src") ?? "    ret";

    const [funcName, setFuncName] = useState(savedFuncName);
    const [code, setCode] = useState(savedCode);
    const rerender = useManualRerender();

    useEffect(() => {
        document.title = (
            savedCode === code && savedFuncName === funcName
                ? "" : "*"
        ) + "chArm-v5-interpreter";
    }, [code, funcName]);

    useListenerOnWindow({
        listenerType: "keydown", listener: e => {
            if (e.ctrlKey && e.key.toLowerCase() === 's') {
                localStorage.setItem("src", code);
                localStorage.setItem("func", funcName);
                document.title = "chArm-v5-interpreter";
                e.preventDefault();
                rerender();
            }
        }
    }, [code, funcName]);

    const tokenized = useMemo(() => tokenize(code), [code]);
    const [instructions, _lineNumbers, errors] = useMemo(
        () => assembleChARM(tokenized), [tokenized]
    );
    (window as any)['instructions'] = instructions;

    return <HorizontalResizableDoublePane left={
        <div id="asm-editor-outer">
            <LineNumbers amount={code.split('\n').length + 8} />
            <div id="asm-editor">
                <pre>
                    <HL color="blue" children={"    .align   "} />
                    <HL color="purple" children={"2\n"} />
                    <HL color="blue" children={"    .p2align "} />
                    <HL color="purple" children={"3"} />
                    <HL color="medium" children={",,"} />
                    <HL color="purple" children={"7\n"} />
                    <HL color="blue" children={"    .global  "} />
                    <HL color="green" children={`${funcName}\n`} />
                    <HL color="blue" children={"    .type    "} />
                    <HL color="green" children={`${funcName}`} />
                    <HL color="medium" children={","} />
                    <HL color="orange" children={" %function\n"} />
                    <FuncNameInput funcName={funcName} setFuncName={setFuncName} />
                    <HL color="green" children={":"} onClick={
                        ({ currentTarget: { previousElementSibling: i } }) => {
                            (i as HTMLInputElement).focus()
                        }} />
                </pre>
                <CodeEditor
                    value={code}
                    setValue={(code: string) => {
                        setCode(code);
                    }}
                    errors={errors}
                    Highlighter={({ value, errors }) => {
                        return <HighlighterWithErrors errors={errors}>
                            <CodeHighlighter value={value} tokens={tokenized} />
                        </HighlighterWithErrors>
                    }} />
                <pre>
                    <HL color="blue" children={"    .size    "} />
                    <HL color="green" children={`${funcName}`} />
                    <HL color="medium" children={", .-"} />
                    <HL color="green" children={`${funcName}`} />
                </pre>
            </div>
        </div>
    } right={
        <VerticalResizableDoublePane top={
            <div>
                <div id="run-controls">
                    
                </div>
            </div>
        } bottom={
            <div>
                <InputsEditor/>
            </div>
        } />
    } />

}

export default App
