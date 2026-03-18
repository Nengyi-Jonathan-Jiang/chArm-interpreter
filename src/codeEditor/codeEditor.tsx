import { type ReactNode, useRef } from "react";

import "./codeEditor.css";
import { clamp } from "../util/util";

function getLinesRange (
    s: string, left: number, right: number,
): { left: number, right: number, s: string } {
    [ left, right ] = [
        s.lastIndexOf("\n", left - 1) + 1, s.indexOf("\n", right),
    ];
    if (left === -1) left = 0;
    if (right === -1) right = s.length;
    return { left, right, s: s.substring(left, right) };
}

function sortRange (
    a: number, b: number,
): [ number, number, "forward" | "backward" ] {
    return a > b ? [ b, a, "backward" ] : [ a, b, "forward" ];
}

function fixScroll (i: HTMLTextAreaElement): void;
function fixScroll (
    i: HTMLTextAreaElement, mode: "start" | "end" | "best",
    margin?: readonly [ number, number ],
): void;
function fixScroll (
    i: HTMLTextAreaElement,
    mode: "auto" | "start" | "end" | "best" = "auto",
    margin: readonly [ number, number ]     = [ 0, 0 ],
) {
    const {
              selectionStart:     oldLeft,
              selectionEnd:       oldRight,
              selectionDirection: direction,
          } = i;

    const oldEnd       = direction === "backward" ? oldLeft : oldRight;
    const scrollParent = i.parentElement!.parentElement!;

    if (mode === "auto") {
        i.setSelectionRange(oldEnd, oldEnd); // this only works when collapsed
        i.blur();
        i.focus();
        i.setSelectionRange(oldLeft, oldRight, direction); // restore
        return;
    }

    const { left } = getLinesRange(i.value, oldEnd, oldEnd);

    const scrollMin = 19.5 + (margin[0] + oldEnd - left) * 7.2
        - scrollParent.clientWidth
        - scrollParent.scrollLeft;
    const scrollMax = 0.5 + (-margin[1] + oldEnd - left) * 7.2
        - scrollParent.scrollLeft;

    if (scrollMin <= 0 && scrollMax >= 0) return;

    scrollParent.scrollLeft += {
        start: scrollMax,
        end:   scrollMin,
        best:  clamp(0, scrollMin, scrollMax),
    }[mode];
}

export function CodeEditor ({
    value,
    setValue,
    errors,
    placeholder,
    Highlighter,
}: {
    value: string;
    setValue: (code: string) => void;
    errors?: Map<number, string[]>,
    placeholder?: string,
    Highlighter: (props: {
        value: string,
        errors: Map<number, string[]>
    }) => ReactNode
}) {
    errors ??= new Map;

    const textareRef = useRef<HTMLTextAreaElement>(null);

    return <div className="code-editor">
        <textarea className="code-input"
                  ref={ textareRef }
                  spellCheck="false"
                  placeholder={ placeholder }
                  value={ value }
                  onChange={ e => {
                      setValue(e.target.value);
                  } }
                  onKeyDown={ e => {
                      const {
                                currentTarget: i,
                                key,
                                shiftKey:      shift,
                                ctrlKey:       ctrl,
                            }            = e;
                      const {
                                selectionStart:     oldLeft,
                                selectionEnd:       oldRight,
                                selectionDirection: direction,
                                value,
                            }            = i;
                      const wasCollapsed = oldLeft === oldRight;
                      const oldStart     = direction === "backward"
                                           ? oldRight
                                           : oldLeft;
                      const oldEnd       = direction === "backward"
                                           ? oldLeft
                                           : oldRight;

                      const scrollParent = i.parentElement!.parentElement!;

                      if (key === 'Tab') {
                          e.preventDefault();

                          const { left, right, s } = getLinesRange(
                              value, oldLeft, oldRight,
                          );

                          // Insert tab
                          if (!shift && wasCollapsed) {
                              document.execCommand(
                                  "insertText", false, " ".repeat(
                                      4 - ((i.selectionStart - left) & 3),
                                  ));
                              return;
                          }
                          // Indent/dedent
                          i.setSelectionRange(left, right);
                          const replacement = shift ?
                                              s.replaceAll(
                                                  /(^( {4})*) {1,4}/gm, "$1") :
                                              s.replaceAll(
                                                  /(^( {4})*) {0,3}/gm,
                                                  "$1    ",
                                              );
                          document.execCommand(
                              "insertText", false, replacement);
                          i.setSelectionRange(
                              left, left + replacement.length,
                              direction,
                          );
                          return;
                      }
                      if ((key === '/' || key === '?') && ctrl) {
                          e.preventDefault();

                          const { left, right, s } = getLinesRange(
                              i.value, oldLeft, oldRight,
                          );

                          const commentedStates = new Set(s
                              .split('\n')
                              .map(i => !!i.match(/^ *\/\//)),
                          );
                          const doUncomment     = commentedStates.size == 2
                                                  ? shift // If mixed,
                                                          // disambiguate by
                                                          // shift key
                                                  : [ ...commentedStates ][0];

                          i.setSelectionRange(left, right);
                          const replacement = doUncomment ?
                                              s.replaceAll(
                                                  /(^ *)\/\/ ?/gm, "$1") :
                                              s.replaceAll(
                                                  /(^ *)(?! *\/\/)/gm, "$1// ");
                          document.execCommand(
                              "insertText", false, replacement);
                          i.setSelectionRange(
                              left, left + replacement.length,
                              direction,
                          );
                          return;
                      }
                      if (key === 'Home') {
                          e.preventDefault();

                          const { left, s } = getLinesRange(
                              i.value, oldEnd, oldEnd,
                          );

                          let target = left + s.match(/^ */)![0].length;
                          if (oldEnd === target) {
                              target = left;
                          }
                          i.setSelectionRange(
                              ...sortRange(shift ? oldStart : target, target),
                          );
                          scrollParent.scrollLeft = 0;
                          fixScroll(i, "start");
                          return;
                      }
                      if (key === 'End') {
                          e.preventDefault();

                          const { right, s } = getLinesRange(
                              i.value, oldEnd, oldEnd,
                          );

                          let target = right - s.match(/ *$/)![0].length;
                          if (oldEnd === target) {
                              target = right;
                          }
                          i.setSelectionRange(
                              ...sortRange(shift ? oldStart : target, target),
                          );
                          fixScroll(i, "end");
                          return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                          const { left, s }        = getLinesRange(
                              i.value, i.selectionStart, i.selectionStart,
                          );
                          const trailingWhitespace = s.substring(
                              oldRight - left,
                          ).match(/^ */)?.[0]?.length ?? 0;

                          e.preventDefault();
                          document.execCommand("insertText", false, "\n");

                          // Smart indent

                          // Double-check that the selection is now collapsed
                          i.selectionStart = oldStart + 1;
                          i.selectionEnd   = oldStart + 1 + trailingWhitespace;

                          const match = s.match(/^( +(?:\/\/ *)?)/)?.[0];

                          if (match) document.execCommand(
                              "insertText", false, match);
                      }
                  } }
        />
        <div className="code-overlay">
            <Highlighter errors={ errors } value={ value }/>
        </div>
    </div>;
}