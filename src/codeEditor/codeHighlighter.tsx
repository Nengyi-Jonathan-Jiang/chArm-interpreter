import type { ReactNode } from "react";

export function CodeHighlighter({children: input, rules}: {
    children: string,
    rules: { [_: string]: RegExp }
}): ReactNode {
    const elements: ReactNode[] = [];
    const rulesArr: [string, RegExp][] = [];
    for (const property of Object.getOwnPropertyNames(rules)) {
        rulesArr.push([property, rules[property]]);
    }

    let currentTokenIndex = 0;

    while (input.length) {
        let matchedClass: string | null = null;
        let bestLength: number = 0;
        for (const [rule, regex] of rulesArr) {
            const match = input.match(regex);
            if (!match) continue;

            const matchedLength = match[0].length;
            if (matchedLength > bestLength) {
                matchedClass = rule;
                bestLength = matchedLength;
            }
        }

        if (bestLength > 0 && matchedClass !== null) {
            elements.push(<span key={currentTokenIndex++} className={matchedClass}>{
                input.substring(0, bestLength)
            }</span>);
            input = input.substring(bestLength);
        } else {
            const skippedChar = input.charAt(0);
            const element = skippedChar.match(/^\s$/)
                ? skippedChar
                : <span key={currentTokenIndex++} className={'error-char'}>{skippedChar}</span>;
            elements.push(element)
            input = input.substring(1);
        }
    }

    return <pre>{elements}<span style={{fontSize: 0, userSelect: 'none'}}>-</span></pre>;
}