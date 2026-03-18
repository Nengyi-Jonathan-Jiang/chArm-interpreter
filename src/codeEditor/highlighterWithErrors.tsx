import { type ReactNode, useMemo, useRef } from "react";
import "./highlighterWithErrors.css";
import { useIntersectionObserver, useMonitor } from "../util/hooks";

export function HighlighterWithErrors ({ children, errors }: {
    errors?: Map<number, string[]>,
    children: ReactNode
}): ReactNode {
    errors ??= new Map;

    let numLines = Math.max(...errors.keys()) + 1;
    if (!Number.isFinite(numLines)) {
        numLines = 1;
    }

    const ref = useIntersectionObserver({
        root:       null,
        rootMargin: "-50% 0px 0px 0px",
    })((i: boolean, el: HTMLDivElement) => {
        if (i) el.classList.add('up');
        else el.classList.remove('up');
    });

    const editorContainerRef = useRef<HTMLDivElement>(null);

    const resizeObserver = useMemo(() => new ResizeObserver(() => {
        const { current } = editorContainerRef;
        if (!current) return;

        current.style.setProperty('--width', `${
            document.getElementById("asm-editor")!.clientWidth
        }px`);
    }), []);
    useMonitor(() => document.getElementById("asm-editor"), (e, prev) => {
        if (prev) resizeObserver.unobserve(prev);
        if (e) {
            resizeObserver.observe(e);
        }
    });

    return <div className="code-highlighter-container"
                ref={ editorContainerRef }>
        { children }
        <div className="code-highlighter-errors">
            {
                new Array(numLines).fill(null).map((_, i) => {
                    const lineErrors = errors.get(i);
                    if (!lineErrors) {
                        return <span className="error-line" key={ i }/>;
                    }

                    return <span className="error-line" key={ i }>
                        <div ref={ ref }>
                            <div className="errors">
                                {
                                    lineErrors.map((message, i) =>
                                        <span key={ i }>{ message }</span>,
                                    )
                                }
                            </div>
                        </div>
                    </span>;
                })
            }
        </div>
    </div>;
}