import type { ReactNode } from "react";
import { getTokenContents, type Token } from "../parsing/parsing";
import { splitWhitespace } from "../util/util";

function decorateIndented (
    s: string, isBlank: boolean, isStart: boolean, key: string): ReactNode[] {
    const nl = s.indexOf("\n");

    if (!isStart && nl === -1) return [ s ];
    const before = s.substring(0, nl + 1);
    const rest   = s.substring(nl + 1);

    const spaceAmount = rest.match(/^ */)?.[0]?.length ?? 0;

    const tabsAmount = (spaceAmount - +!isBlank) & ~3;

    const res: ReactNode[] = [ before ];
    let remainingSpace     = tabsAmount;
    if (remainingSpace >= 0) {
        res.push(<span className="tab-line"
                       key={ key + "|" + remainingSpace }/>);
    }
    for (; remainingSpace >= 4 ; remainingSpace -= 4) {
        res.push("    ");
        res.push(<span className="tab-line"
                       key={ key + "|" + (remainingSpace - 4) }/>);
    }

    res.push(rest.substring(tabsAmount));

    if (isStart && nl === 0) {
        res.unshift(<span className="tab-line" key={ key + "|START_TAB" }/>);
    }

    return res;
}

function createErrorToken (
    str: string, start: number, end: number, key: string,
): ReactNode[] {
    const [ a, b, c ] = splitWhitespace(str.substring(start, end));
    const isAEndBlank = (str[start + a.length] ?? "\n") === "\n";
    const isCEndBlank = (str[start + c.length] ?? "\n") === "\n";
    return [
        ...(!a ? [] : decorateIndented(a, isAEndBlank, start === 0, key)),
        ...(!b ? [] : [ <span className="error" key={ key }>{ b }</span> ]),
        ...(!c ? [] : decorateIndented(c, isCEndBlank, false, key)),
    ];
}

export function CodeHighlighter ({ value, tokens }: {
    value: string,
    tokens: readonly Token[]
}): ReactNode {
    if (value.length === 0) {
        return <pre>
            <span className="tab-line"/>
            <span style={ { fontSize: 0, userSelect: 'none' } }>
                { ' ' }
            </span>
        </pre>;
    }

    const elements: ReactNode[] = [];

    let currentIndex = 0;
    let currentToken = 0;
    for (const token of tokens) {
        elements.push(...createErrorToken(
            value, currentIndex, token.originalRange[0],
            `${ currentToken }|${ elements.length }`,
        ));

        currentIndex = token.originalRange[1];

        elements.push(
            <span className={
                token.type + (token.isError ? " error" : "") }
                  key={ currentToken++ }
            >
                { getTokenContents(token) }
            </span>,
        );
    }
    elements.push(...createErrorToken(
        value, currentIndex, value.length,
        'END',
    ));

    return <pre>
        { elements }
        <span style={ { fontSize: 0, userSelect: 'none' } }>
            { ' ' }
        </span>
    </pre>;
}