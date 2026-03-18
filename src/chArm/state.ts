import {
    cloneArray, type IntRange, randUnsignedBigint, toHexString, wrapUndef,
} from "../util/util";

export type Register = RegisterSP | RegisterZR;
export type RegisterSP = RegisterGP | SP;
export type RegisterZR = RegisterGP | ZR;
export type SP = "SP";
export type ZR = "ZR";
export type RegisterGP = IntRange<31>;

export class State {
    /** Should always be accessed in a big-endian way */
    private readonly registers: State.Registers;
    /**
     * Represents the contents of memory, backward. Thus, endianness should be
     * flipped (little-endian read/writes correspond to big-endian read/writes
     * and vice versa)
     */
    private mem: Uint8Array;
    /** A random offset to memory addresses */
    readonly memOffset: bigint;
    /** A random offset to the program counter */
    readonly pcOffset: bigint;
    /** N/Z/C/V flags */
    private flags: bigint          = 0n;
    /** Program counter */
    private programCounter: bigint = 0n;
    /** Total bytes of memory used */
    private memSize: bigint        = 0n;

    protected constructor (state: State);
    protected constructor (dataBytes?: Uint8Array);
    protected constructor (arg?: Uint8Array | State) {
        if (arg instanceof State) {
            this.registers      = cloneArray(arg.registers);
            this.mem            = cloneArray(arg.mem);
            this.memOffset      = arg.memOffset;
            this.pcOffset       = arg.pcOffset;
            this.flags          = arg.flags;
            this.programCounter = arg.programCounter;
            this.memSize        = arg.programCounter;
        }
        else {
            this.registers = new BigUint64Array(32) as State.Registers;
            this.mem       = new Uint8Array;

            // Generates a random value from 01000...000 to 010111...1110000
            // aligned to 16 bytes for the memory offset
            this.memOffset = (randUnsignedBigint(59) + (1n << 58n)) << 4n;

            // Generate a random value from 000...000 to 000111...11100
            // aligned to 4 bytes for the program counter offset
            this.pcOffset = randUnsignedBigint(60) << 2n;

            this.reset(arg);
        }
    }

    new (dataBytes?: Uint8Array) {
        return new State(dataBytes);
    }

    clone (): State {
        return new State(this);
    }

    reset (dataBytes?: Uint8Array) {
        // Figure out how many extra bytes of memory we need to reserve at the 
        // beginning for data
        dataBytes ??= new Uint8Array;
        const numDataBytes       = dataBytes.length;
        const numDataBytesPadded = numDataBytes
                                   ? numDataBytes + (Number(
            randUnsignedBigint(4)) << 4)
                                   : 0;

        // Generate random register values
        this.registers.set(new BigUint64Array(32).map(
            () => randUnsignedBigint(64),
        ));

        // Start with a bunch of memory
        this.mem     = new Uint8Array(65536 + numDataBytesPadded);
        this.memSize = BigInt(dataBytes.length);
        // Remember that mem is reversed, so we need to put dataBytes in
        // reverse  order
        for (let i = 0 ; i < numDataBytes ; i++) {
            this.mem[numDataBytes - i - 1] = dataBytes[i];
        }

        this.programCounter = this.pcOffset;
        // Set stack pointer
        this.setRegister("SP", this.memOffset - BigInt(numDataBytesPadded));

        // Generate random nzcv
        this.flags = randUnsignedBigint(4);
    }

    /**
     * Returns an 8-byte Big Endian DataView representing the contents of the
     * regsiter
     */
    rawRegister (register: Register): DataView {
        if (register === "ZR") return new DataView(new ArrayBuffer(8));
        return new DataView(
            this.registers.buffer,
            (register == "SP" ? 31 : register) << 3,
            8,
        );
    }

    /** Get the 64-bit unsigned integer value of the given register */
    getRegister (register: Register): bigint {
        return this.rawRegister(register).getBigUint64(0);
    }

    /** Set the 64-bit unsigned integer value of the given register */
    setRegister (register: Register, value: bigint): void {
        this.rawRegister(register).setBigUint64(0, value);
    }

    /**
     * Returns an 8-byte Big Endian DataView representing the contents of
     * memory at register + offset.
     */
    rawMemory (register: Register, offset: bigint): DataView {
        const effectiveAddress = this.getRegister(register) + offset;

        const startIndex = -8n - (effectiveAddress - this.memOffset);
        if (startIndex < 0) {
            throw new MemoryError(
                "Out of bounds memory access",
                effectiveAddress, startIndex,
            );
        }

        try {
            this.ensureHasMemory(startIndex + 8n);
        }
        catch (e) {
            if (e instanceof Error) {
                throw new MemoryError(
                    e.message,
                    effectiveAddress, startIndex,
                    e.cause,
                );
            }
            throw e;
        }

        if (startIndex + 8n > this.memSize) this.memSize = startIndex + 8n;

        return new DataView(this.mem.buffer, Number(startIndex), 8);
    }

    /** Get the 64-bit unsigned integer value of the given register */
    getMemory (register: Register, offset: bigint): bigint {
        return this.rawMemory(register, offset).getBigUint64(0);
    }

    /** Set the 64-bit unsigned integer value of the given register */
    setMemory (register: Register, offset: bigint, value: bigint): void {
        this.rawMemory(register, offset).setBigUint64(0, value);
    }

    get n (): boolean {
        return !!(this.flags & 0b1000n);
    }

    set n (n: boolean) {
        this.flags = n ? this.flags | 0b1000n : this.flags & 0b0111n;
    }

    get z (): boolean {
        return !!(this.flags & 0b0100n);
    }

    set z (z: boolean) {
        this.flags = z ? this.flags | 0b0100n : this.flags & 0b1011n;
    }

    get c (): boolean {
        return !!(this.flags & 0b0010n);
    }

    set c (c: boolean) {
        this.flags = c ? this.flags | 0b0010n : this.flags & 0b1101n;
    }

    get v (): boolean {
        return !!(this.flags & 0b0001n);
    }

    set v (v: boolean) {
        this.flags = v ? this.flags | 0b0001n : this.flags & 0b1110n;
    }

    get PC () {
        return BigInt(this.programCounter);
    }

    get currInstructionIndex (): number {
        if (this.PC & 3n) {
            throw new Error("Unaligned program counter");
        }
        return Number((this.PC - this.pcOffset) >> 2n);
    }

    incPC () {
        this.programCounter += 4n;
    }

    branchPCrel (offset: bigint): void {
        this.programCounter += offset;
    }

    branchPCabs (addr: bigint): void {
        this.programCounter = addr;
    }

    printRegisters (binary: boolean = false, ...registers: Register[]) {
        if (registers.length === 0) {
            registers = [
                "SP",
                ...new Array(31).fill(0).map((_, i) => i as Register),
            ];
        }

        console.log(registers
            .map(i => [ i, this.getRegister(i) ] as const)
            .map(([ n, i ]) => `${ (
                    n.toString().padStart(2)
                ) }: 0x${ (
                    i.toString(16).padStart(16, '0')
                ) } = unsigned ${ (
                    i.toString().padStart(20)
                ) } = signed ${ (
                    BigInt.asIntN(64, i).toString().padStart(20)
                ) }` + (
                    binary ? ` = 0b ${ i.toString(2).padStart(64, '0') }` : ''
                ),
            ).join('\n'),
        );
    }

    printMemory (): void;
    printMemory (register: Register, offset: bigint): void;
    printMemory (register?: Register, offset?: bigint) {
        const view  = register === undefined
                      ? new DataView(this.mem.buffer)
                      : this.rawMemory(register, offset!);
        const bytes = [
            ...new Uint8Array(
                view.buffer,
                view.byteOffset,
                Number(this.memSize),
            ),
        ];
        bytes.push(...new Array(((-bytes.length) & 0xf)).fill(0));

        console.log(bytes.length == 0
                    ? 'Memory: \n[empty]'
                    : `Memory (starting at 0x${ toHexString(
                this.memOffset, 8) } - ${ (
                bytes.length
            ) }):\n...${ bytes.toReversed().map((b, i) => {
                return (i & 0xf ? ' ' : '\n') + toHexString(b, 1);
            }).join('') }\n...`,
        );
    }

    private ensureHasMemory (requiredSize: bigint) {
        let newMemorySize = BigInt(this.mem.length);
        if (requiredSize <= newMemorySize) return;

        let doublings = 0;
        while (requiredSize > newMemorySize) {
            newMemorySize <<= 1n;
            doublings++;
            if (newMemorySize > 16777216n) {
                throw new Error("Accessing too much memory");
            }
            if (doublings > 2) {
                // Something's probably wrong
                throw new Error("Memory size growing way too quickly");
            }
        }
        const newMemory = new Uint8Array(Number(newMemorySize));
        newMemory.set(this.mem);
        this.mem = newMemory;
    }
}

export class MemoryError extends Error {
    constructor (
        msg: string, ptr: bigint, startIndex: bigint, cause?: unknown) {
        super(
            `${ msg } (caused by pointer 0x${ (
                ptr.toString(16).padStart(16, '0')
            ) } = index [${ startIndex }:${ startIndex + 7n }])`,
            ...wrapUndef(cause, c => ({ cause: c })),
        );
    }
}

export namespace State {
    export type Registers = BigUint64Array & { length: 32; };
}

