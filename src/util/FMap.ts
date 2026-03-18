export class FMap<K, V> implements Map<K, V> {
    private readonly _map: Map<any, [ K, V ]>;
    private readonly _f: (key: K) => any;

    constructor (func: (key: K) => any, entries: Iterable<[ K, V ]> = []) {
        this._f   = func;
        this._map = new Map(
            [ ...entries ].map(([ k, v ]) => [ func(k), [ k, v ] ]),
        );
    }

    [Symbol.toStringTag] = 'FMap';

    get size (): number {
        return this._map.size;
    }

    clear () {
        this._map.clear();
    }

    delete (key: K): boolean {
        return this._map.delete(this._f(key));
    }

    // @ts-ignore
    forEach<U> (callbackfn: (
        this: U, key: K, value: V, map: FMap<K, V>) => void, thisArg?: U) {
        [ ...this ].forEach(([ k, v ]) => {
            callbackfn.call(thisArg!, k, v, this);
        });
    }

    has (key: K): boolean {
        return this._map.has(this._f(key));
    }

    get (key: K): V | undefined {
        return this._map.get(this._f(key))?.[1];
    }

    set (key: K, value: V): this {
        this._map.set(this._f(key), [ key, value ]);
        return this;
    }

    keys (): MapIterator<K> {
        return this.entries().map(([ k ]) => k);
    }

    values (): MapIterator<V> {
        return this.entries().map(([ _, v ]) => v);
    }

    entries (): MapIterator<[ K, V ]> {
        return this._map.values();
    }

    [Symbol.iterator] (): MapIterator<[ K, V ]> {
        return this.entries();
    }
}

export class FSet<V> implements Set<V> {
    private readonly _map: Map<any, V>;
    private readonly _f: (value: V) => any;

    constructor (func: (value: V) => any, entries: Iterable<V> = []) {
        this._f   = func;
        this._map = new Map(
            [ ...entries ].map((V) => [ func(V), V ]),
        );
    }

    [Symbol.toStringTag] = 'FSet';

    get size (): number {
        return this._map.size;
    }

    [Symbol.iterator] (): MapIterator<V> {
        return this._map.values();
    }

    clear () {
        this._map.clear();
    }

    add (value: V): this {
        this._map.set(this._f(value), value);
        return this;
    }

    delete (value: V): boolean {
        return this._map.delete(this._f(value));
    }

    entries (): MapIterator<[ V, V ]> {
        return this._map.values().map(v => [ v, v ]);
    }

    // @ts-ignore
    forEach<U> (
        callbackfn: (this: U, key: V, value: V, set: FSet<V>) => void,
        thisArg?: U,
    ) {
        [ ...this._map.values() ].forEach((v) => {
            callbackfn.call(thisArg!, v, v, this);
        });
    }

    has (value: V): boolean {
        return this._map.has(this._f(value));
    }

    keys (): MapIterator<V> {
        return this[Symbol.iterator]();
    }

    values (): MapIterator<V> {
        return this[Symbol.iterator]();
    }
}

export class SMap<K, V> extends FMap<K, V> {
    constructor (entries: Iterable<[ K, V ]> = []) {
        super(
            i => typeof i === 'object' && i !== null ? i.toString() : i,
            entries,
        );
    }
}

export class SSet<V> extends FSet<V> {
    constructor (entries: Iterable<V> = []) {
        super(
            i => typeof i === 'object' && i !== null ? i.toString() : i,
            entries,
        );
    }
}