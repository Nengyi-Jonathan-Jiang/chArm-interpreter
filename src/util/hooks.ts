import {
    type DependencyList, type Ref, type RefObject, useEffect, useMemo, useRef,
    useState,
} from "react";

function createRefList<T> (amount: number): RefObject<T | null>[] {
    return new Array<null>(amount).fill(null).map(() => ({ current: null }));
}

export function useRefs<T> (amount: number): RefObject<T | null>[] {
    const [ refList, setRefList ] = useState(() => createRefList<T>(amount));
    if (amount !== refList.length) {
        setRefList(createRefList(amount));
    }
    return refList;
}


/**
 * A custom react hook. Returns a function `rerender()` which forces the
 * component to update
 */
export function useManualRerender (): () => void {
    const [ dummy, setDummy ] = useState(0);
    return () => setDummy(dummy + 1);
}


export type Listener<T extends Event | keyof WindowEventMap | keyof HTMLElementEventMap> =
    T extends Event ? (e: T) => void :
    T extends keyof HTMLElementEventMap ? (e: HTMLElementEventMap[T]) => void :
    T extends keyof WindowEventMap ? (e: WindowEventMap[T]) => void :
    never;

export function useListenerOnWindow<K extends keyof WindowEventMap> (
    { listenerType, listener, passive }: {
        listenerType: K | K[],
        listener: (this: Window, ev: WindowEventMap[K]) => any,
        passive?: boolean
    },
    dependencies?: DependencyList,
): void {
    useEffect(() => {
        const listenerTypes = Array.isArray(listenerType)
                              ? listenerType
                              : [ listenerType ];
        if (globalThis["window"]) {
            const window: Window = globalThis["window"];

            // Remove existing instances of listener if they exist
            for (const listenerType of listenerTypes) {
                window.removeEventListener(listenerType, listener);
            }
            // Add listeners
            for (const listenerType of listenerTypes) {
                window.addEventListener(
                    listenerType, listener,
                    (passive && { passive }) ?? undefined,
                );
            }
            return (): undefined => {
                for (const listenerType of listenerTypes) {
                    window.removeEventListener(listenerType, listener);
                }
            };
        }
    }, dependencies ?? []);
}

export function useListenerOnElement<K extends keyof HTMLElementEventMap> (
    element: HTMLElement | RefObject<HTMLElement | null>,
    { listenerType, listener, passive }: {
        listenerType: K | K[],
        listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
        passive?: boolean
    }, dependencies?: DependencyList,
): void {
    useEffect(() => {
        const el: HTMLElement | null = element instanceof HTMLElement
                                       ? element
                                       : element.current;
        const listenerTypes          = Array.isArray(listenerType)
                                       ? listenerType
                                       : [ listenerType ];
        if (el) {
            // Remove existing instances of listener if they exist
            for (const listenerType of listenerTypes) {
                el.removeEventListener(listenerType, listener);
            }
            // Add listeners
            for (const listenerType of listenerTypes) {
                el.addEventListener(
                    listenerType, listener,
                    (passive && { passive }) ?? undefined,
                );
            }
            return (): undefined => {
                for (const listenerType of listenerTypes) {
                    el.removeEventListener(listenerType, listener);
                }
            };
        }
    }, [ element, ...(dependencies ?? []) ]);
}


export function useOnResize (
    element: HTMLElement | RefObject<HTMLElement | null>,
    callback: () => void,
) {
    const [ observer ] = useState(new ResizeObserver(() => {
        callback();
    }));
    const _element     = element instanceof HTMLElement
                         ? element
                         : element.current;
    useEffect(() => {
        if (_element) {
            observer.observe(_element);
            return () => observer.unobserve(_element);
        }
    }, [ _element ]);
}

type IntersectCallback<T extends Element = Element> =
    (intersects: boolean, el: T) => any;

export function useIntersectionObserver (options?: {
    root: HTMLElement | null,
    rootMargin?: string,
    threshold?: number
}): <T extends Element>(callback: IntersectCallback<T>) => Ref<T> {
    const observer = useMemo<{
        current: IntersectionObserver | null
    }>(() => ({ current: null }), []);

    const callbacks = useMemo(() => new Map<Element, IntersectCallback>, []);

    useEffect(() => {
        if (observer.current) observer.current.disconnect();

        observer.current = new IntersectionObserver((entries) => {
            entries.forEach(({ target: element, isIntersecting }) => {
                const callBack = callbacks.get(element);
                if (callBack) {
                    callBack(isIntersecting, element);
                }
            });
        }, options);

        for (const [ el ] of callbacks) {
            observer.current.observe(el);
        }

    }, [ options?.root, options?.threshold, options?.rootMargin ]);

    return useMemo(
        () => <T extends Element> (callback: IntersectCallback<T>) => el => {
            if (el === null) return;

            callbacks.set(el, callback as never);
            observer.current?.observe(el);

            return () => {
                observer.current?.unobserve(el);
                callbacks.delete(el);
            };
        }, [],
    );
}


let isCurrentlyAnimating = false;
let animations           = new Set<(t: DOMHighResTimeStamp) => any>;

function startAnimatingIfNotAnimating () {
    if (isCurrentlyAnimating) return;
    isCurrentlyAnimating = true;

    requestAnimationFrame(function f (t) {
        if (animations.size > 0) {
            animations.forEach(callback => callback.call(null, t));
            requestAnimationFrame(f);
        }
        else {
            isCurrentlyAnimating = false;
        }
    });
}

export function useAnimation (callback: (
    currTime: number, deltaTime: number) => any) {
    useEffect(() => {
        let lastFrameTime: number | undefined = undefined;

        const f = (time: DOMHighResTimeStamp) => {
            const currTime = time / 1000;
            const deltaTime = currTime - (lastFrameTime ?? currTime);
            lastFrameTime = currTime;

            callback.call(null, currTime, deltaTime);
        };

        animations.add(f);
        startAnimatingIfNotAnimating();

        return () => {
            animations.delete(f);
        };
    }, []);
}

export function useMonitor<T> (
    func: () => T,
    callback: (value: T, prev: T | null) => any,
) {
    const cached = useRef<T>(null);

    useAnimation(() => {
        const value = func();
        if (value != cached.current) {
            callback(value, cached.current);
            cached.current = value;
        }
    });
}