import { useState, type ReactNode } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import './chArm/interpreter'
import { CodeEditor } from './codeEditor/codeEditor'
import { CodeHighlighter } from './codeEditor/codeHighlighter'
import { HighlighterWithErrors } from './codeEditor/highlighterWithErrors'

function App() {
    const [value, setValue] = useState("");

    return (
        <div>
            <CodeEditor value={value} setValue={function (code: string): void {
                setValue(code);
            }} Highlighter={({ value, errors }) => {
                return <HighlighterWithErrors errors={errors}>
                    {value}
                </HighlighterWithErrors>
            }}/>
        </div>
    )
}

export default App
