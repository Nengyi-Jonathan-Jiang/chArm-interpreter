import {
    isUint64N, isUint64C, isUint64Z,
    className,
    type FilterRecordValue as Filter
} from "../util/util";
import type { State, RegisterSP, RegisterZR, RegisterGP } from "./state";

type _Register = RegisterSP | RegisterZR;

export type Instruction = Readonly<
    LDUR | STUR | MOVK | MOVZ |
    ADD | ADDS | CMN | SUB | SUBS | CMP |
    MVN | ORR | EOR | ANDS | TST | LSL | LSR | UBFM | ASR |
    B | BL | RET |
    NOP | HLT
>;

export type InstructionType = Instruction["opcode"];

type Operand = bigint | _Register;

abstract class InstructionBase<
    O extends Record<string, Operand> = Record<string, Operand>
> {
    abstract readonly opcode: string;
    protected readonly operands: Readonly<O>;

    /** Dummy value with the type of the operands */
    // @ts-ignore
    readonly O: Readonly<O>;

    constructor(operands: Readonly<O>) {
        this.operands = Object.freeze(operands);
        this.checkOperands?.();
    }

    /**
     * Run the given instruction. If this returns true, do not increment the
     * instruction pointer
     */
    abstract applyTo(operands: this["O"], state: State): void | boolean;

    /** Check the validity of the arguments. This should be overridden */
    protected abstract checkOperands(): void;

    // Various helper methods for validation

    protected checkCondition<T>(
        x: T, condition: boolean | ((x: T) => boolean), name: string
    ): void {
        if (!(typeof condition === 'boolean' ? condition : condition(x))) {
            throw new Error(`Invalid ${name} for ${className(this)}: ${x}`);
        }
    }
    protected checkOperand<K extends keyof O>(
        op: K,
        condition: (x: O[K]) => boolean
    ) {
        this.checkCondition(this.operands[op], condition, op as string);
    }

    private checkRegisterIsGP(r: RegisterGP, name: string): void {
        this.checkCondition(
            r, 
            typeof r == "number" && r >= 0 && r <= 30,
            `register ${name}`
        );
    }

    protected checkRegisterGP(r: Filter<O, RegisterGP>): void {
        this.checkRegisterIsGP(this.operands[r] as RegisterGP, r);
    }
    protected checkRegisterSP(r: Filter<O, RegisterSP>): void {
        if (this.operands[r] === "SP") return;
        this.checkRegisterIsGP(this.operands[r] as RegisterGP, r);
    }
    protected checkRegisterZR(r: Filter<O, RegisterZR>): void {
        if (this.operands[r] === "ZR") return;
        this.checkRegisterIsGP(this.operands[r] as RegisterGP, r);
    }
    protected checkRegister(r: Filter<O, _Register>): void {
        if (this.operands[r] === "SP") return;
        if (this.operands[r] === "ZR") return;
        this.checkRegisterIsGP(this.operands[r] as RegisterGP, r);
    }
    /**
     * Check if a given BigInt has at most the given number of bits. If b is 
     * negative, the range is signed; otherwise it is unsigned.
     */
    protected checkOperandRange(op: Filter<O, bigint>, b: number) {
        const B = BigInt(b);
        const n = this.operands[op] as bigint;
        this.checkCondition(n,
            B < 0n
                ? n >= -(1n << ~B) && n < (1n << ~B)
                : n >= 0n && n < (1n << B),
            `${b < 0 ? 's' : ''}imm${Math.abs(b)} ${op}`
        )
    }
}

abstract class BinOpRR<
    dst extends _Register = RegisterGP,
    a extends _Register = RegisterGP,
    b extends _Register = RegisterGP,
> extends InstructionBase<{ dst: dst, a: a, b: b }> {
    applyTo({ dst, a, b }: typeof this["O"], state: State): void {
        state.setRegister(dst, this.doOperation(
            state.getRegister(a), state.getRegister(b), state
        ));
    }

    abstract doOperation(a: bigint, b: bigint, state: State): bigint;
}

abstract class BinOpRI<
    dst extends _Register = RegisterGP,
    a extends _Register = RegisterGP,
> extends InstructionBase<{ dst: dst, a: a, b: bigint }> {
    applyTo({ dst, a, b }: typeof this["O"], state: State): void {
        state.setRegister(dst, this.doOperation(
            state.getRegister(a), b, state
        ));
    }

    abstract doOperation(a: bigint, b: bigint, state: State): bigint;
}

abstract class BinOpRX<
    dst extends _Register = RegisterGP,
    a extends _Register = RegisterGP,
    b extends _Register = RegisterGP,
> extends InstructionBase<{ dst: dst, a: a, b: b | bigint }> {
    readonly isI: boolean;

    constructor({ dst, a, b }: { dst: dst, a: a, b: b | bigint }) {
        super({ dst, a, b });
        this.isI = (typeof b === "bigint") as never;
    }

    applyTo({ dst, a, b }: typeof this["O"], state: State): void {
        state.setRegister(dst, this.doOperation(
            state.getRegister(a),
            this.isI ? b as bigint : state.getRegister(b as b),
            state
        ));
    }

    abstract doOperation(a: bigint, b: bigint, state: State): bigint;
}

export class LDUR extends InstructionBase<{
    src_b: RegisterSP, dst: RegisterGP, offset: bigint
}> {
    readonly opcode = "LDUR";

    protected checkOperands(): void {
        this.checkRegisterSP("src_b");
        this.checkRegisterGP("dst");
        this.checkOperandRange("offset", -9);
    }

    applyTo({ src_b, offset, dst }: this["O"], state: State): void {
        const value = state.getMemory(src_b, offset);
        state.setRegister(dst, value);
    }
}

export class STUR extends InstructionBase<{
    src: RegisterGP; dst_b: RegisterSP; offset: bigint;
}> {
    readonly opcode = "STUR";

    checkOperands() {
        this.checkRegisterGP("src");
        this.checkRegisterSP("dst_b");
        this.checkOperandRange("offset", -9);
    }

    applyTo({ src, dst_b, offset }: this["O"], state: State): void {
        const value = state.getRegister(src);
        state.setMemory(dst_b, offset, value);
    }
}

abstract class MOV$ extends InstructionBase<{
    dst: RegisterGP; value: bigint; shift: bigint;
}> {
    abstract readonly zero: boolean;

    protected checkOperands(): void {
        this.checkRegisterGP("dst");
        this.checkOperandRange("value", 16);
        this.checkOperand("shift", x => [0n, 16n, 32n, 48n].includes(x));
    }

    applyTo({ dst, value, shift }: this["O"], state: State): void {
        const register = state.rawRegister(dst);
        if (this.zero) register.setBigUint64(0, 0n);
        // Remember registers are big-endian
        register.setUint16(6 - Number(shift >> 3n), Number(value));
    }
}

export class MOVK extends MOV$ {
    readonly opcode = "MOVK";
    readonly zero = false;
}

export class MOVZ extends MOV$ {
    readonly opcode = "MOVK";
    readonly zero = true;
}

export class ADRP extends InstructionBase<{ dst: RegisterGP, offset: bigint }> {
    readonly opcode = "ADRP";

    protected checkOperands(): void {
        this.checkOperandRange("offset", -13);
    }

    applyTo({ dst, offset }: this["O"], state: State): void {
        // According to documentation, we store (PC + (offset << 12)) with the 
        // low 12 bits discarded
        state.setRegister(dst, ((state.PC >> 12n) + offset) << 12n);
    }
}

export class ADD extends BinOpRI<RegisterSP, RegisterSP> {
    readonly opcode = "ADD";

    protected checkOperands(): void {
        this.checkRegisterSP("dst");
        this.checkRegisterSP("a");
        this.checkOperandRange("b", 12);
    }

    doOperation(a: bigint, b: bigint, _: State): bigint {
        return a + b;
    }
}

export class ADDS extends BinOpRR {
    readonly opcode = "ADDS";

    protected checkOperands(): void {
        this.checkRegisterGP("dst");
        this.checkRegisterGP("a");
        this.checkRegisterGP("b");
    }

    doOperation(a: bigint, b: bigint, state: State): bigint {
        const res = a + b;

        state.n = isUint64N(res);
        state.z = isUint64Z(res);
        state.c = isUint64C(res);
        state.v = isUint64N(a) != state.n && isUint64N(b) != state.n;

        return res;
    }
}

export class CMN extends BinOpRR<"ZR"> {
    readonly opcode = "CMN";

    constructor({ a, b }: { a: RegisterGP, b: RegisterGP }) {
        super({ dst: "ZR", a, b });
    }

    protected checkOperands(): void {
        this.checkRegisterGP("a");
        this.checkRegisterZR("b" as never);
    }
    doOperation = ADDS.prototype.doOperation;
}

export class SUB extends BinOpRI<RegisterSP, RegisterSP> {
    readonly opcode = "SUB";

    protected checkOperands(): void {
        this.checkRegisterSP("dst");
        this.checkRegisterSP("a");
        this.checkOperandRange("b", 12);
    }

    doOperation(a: bigint, b: bigint, _: State): bigint {
        return a - b;
    }
}

export class SUBS extends BinOpRR {
    readonly opcode = "SUBS";

    protected checkOperands(): void {
        this.checkRegisterGP("dst");
        this.checkRegisterGP("a");
        this.checkRegisterGP("b");
    }

    doOperation(a: bigint, b: bigint, state: State): bigint {
        const res = a - b;

        state.n = isUint64N(res);
        state.z = isUint64Z(res);
        state.c = isUint64C(res);
        state.v = isUint64N(a) != state.n && isUint64N(b) != state.n;

        return res;
    }
}

export class CMP extends BinOpRR<"ZR"> {
    readonly opcode = "CMP";

    constructor({ a, b }: { a: RegisterGP, b: RegisterGP }) {
        super({ dst: "ZR", a, b });
    }

    protected checkOperands(): void {
        this.checkRegisterGP("a");
        this.checkRegisterZR("b" as never);
    }

    doOperation = SUBS.prototype.doOperation;
}

export class MVN extends InstructionBase<{ dst: RegisterGP, a: RegisterGP }> {
    readonly opcode = "MVN";

    protected checkOperands(): void {
        this.checkRegisterGP("dst");
        this.checkRegisterGP("a");
    }

    applyTo({ dst, a }: this["O"], state: State): void {
        state.setRegister(dst, ~state.getRegister(a));
    }
}

export class ORR extends BinOpRR {
    readonly opcode = "ORR";

    protected checkOperands(): void {
        this.checkRegisterGP("dst");
        this.checkRegisterGP("a");
        this.checkRegisterGP("b");
    }

    doOperation(a: bigint, b: bigint, _: State): bigint {
        return a | b;
    }
}

export class EOR extends BinOpRR {
    readonly opcode = "EOR";

    protected checkOperands(): void {
        this.checkRegisterGP("dst");
        this.checkRegisterGP("a");
        this.checkRegisterGP("b");
    }

    doOperation(a: bigint, b: bigint, _: State): bigint {
        return a ^ b;
    }
}

export class ANDS extends BinOpRR {
    readonly opcode = "ANDS";

    protected checkOperands(): void {
        this.checkRegisterGP("dst");
        this.checkRegisterGP("a");
        this.checkRegisterGP("b");
    }

    doOperation(a: bigint, b: bigint, state: State): bigint {
        const res = a & b;

        state.n = isUint64N(res);
        state.z = isUint64Z(res);
        // Apparently most implementations clear this flag because ANDS has 
        // optional operands that shift the second argument, in which case a 
        // carry becomes possible. Even though that isn't possible here, we 
        // probably still need to update the flag.
        state.c = false;
        // Don't update the v flag

        return res;
    }
}

export class TST extends BinOpRR<"ZR"> {
    readonly opcode = "TST";

    constructor({ a, b }: { a: RegisterGP, b: RegisterGP }) {
        super({ dst: "ZR", a, b });
    }

    protected checkOperands(): void {
        this.checkRegisterGP("a");
        this.checkRegisterZR("b");
    }

    doOperation = ANDS.prototype.doOperation;
}

export class LSL extends BinOpRX {
    readonly opcode = "LSL";

    protected checkOperands(): void {
        this.checkRegisterGP("dst");
        this.checkRegisterGP("a");
        if (typeof this.operands.b !== "bigint")
            this.checkRegister("b" as never);
        else this.checkOperandRange("b" as never, 6);
    }

    doOperation(a: bigint, b: bigint, _: State): bigint {
        return a << (b & 63n);
    }
}

export class LSR extends BinOpRX {
    readonly opcode = "LSR";

    protected checkOperands(): void {
        this.checkRegisterGP("dst");
        this.checkRegisterGP("a");
        if (typeof this.operands.b !== "bigint")
            this.checkRegister("b" as never);
        else this.checkOperandRange("b" as never, 6);
    }

    doOperation(a: bigint, b: bigint, _: State): bigint {
        return a >> (b & 63n);
    }
}

export class ASR extends BinOpRI {
    readonly opcode = "ASR";

    protected checkOperands(): void {
        this.checkRegisterGP("dst");
        this.checkRegisterGP("a");
        this.checkOperandRange("b", 6);
    }

    doOperation(a: bigint, b: bigint, _: State): bigint {
        return BigInt.asIntN(64, a) >> b;
    }
}

export class UBFM extends InstructionBase<{
    dst: RegisterGP, a: RegisterGP, r: bigint, s: bigint
}> {
    readonly opcode = "UBFM";

    protected checkOperands(): void {
        this.checkRegisterGP("dst");
        this.checkRegisterGP("a");
        this.checkOperandRange("r", 6);
        this.checkOperandRange("s", 6);
    }

    applyTo({ dst, a, r, s }: this["O"], state: State): void {
        state.setRegister(dst, UBFM.doOperation(state.getRegister(a), r, s));
    }

    static doOperation(src: bigint, r: bigint, s: bigint): bigint {
        const mask = (2n << s) - 1n;
        return r <= s ? (src >> r) & mask : (src & mask) << (64n - r);
    }
}

export const B_condMap = [ // DO NOT CHANGE ORDER
    "eq", "ne", "cs", "hs", "cc", "lo", "mi", "pl", "vs",
    "vc", "hi", "ls", "ge", "lt", "gt", "le", "al", "nv"
] as const;


export namespace B {
    export type cond = typeof B_condMap[number];
}

export class B extends InstructionBase<{ dst: bigint, cond: bigint }> {
    readonly opcode: "B" | `B.${B.cond}`;
    readonly isUnconditional: boolean;

    private static readonly conditions: readonly ((s: State) => boolean)[] = [
        s => s.z,
        s => !s.z,
        s => s.c,
        s => !s.c,
        s => s.n,
        s => !s.n,
        s => s.v,
        s => !s.v,
        s => s.c && !s.z,
        s => !s.c || s.z,
        s => s.n == s.v,
        s => s.n != s.v,
        s => !s.z && s.n == s.v,
        s => s.z || s.n != s.v,
        _ => true,
        _ => false
    ] as const;

    constructor({ dst, cond }: { dst: bigint, cond: B.cond | undefined }) {
        super({ dst, cond: BigInt(B_condMap.indexOf(cond ?? "al")) });
        this.isUnconditional = cond === undefined;
        this.opcode = cond === undefined ? "B" : `B.${cond}`;
    }

    protected checkOperands(): void {
        this.checkOperandRange("dst", this.isUnconditional ? -26 : -19);
        this.checkOperandRange("cond", 4);
    }

    applyTo({ dst, cond }: this["O"], state: State): void | boolean {
        if (B.conditions[Number(cond)](state)) {
            state.branchPCrel(dst << 2n);
            return true; // Prevent incrementing SP
        }
        return false;
    }
}

export class BL extends InstructionBase<{ dst: bigint }> {
    readonly opcode = "BL";

    protected checkOperands(): void {
        this.checkOperandRange("dst", -26);
    }

    applyTo({ dst }: this["O"], state: State): void | boolean {
        state.setRegister(30, state.PC + 4n);
        state.branchPCrel(dst << 2n);
        return true;
    }
}

export class RET extends InstructionBase<{ dst: RegisterGP }> {
    readonly opcode = "RET";

    constructor({ dst = 30 }: { dst: RegisterGP }) {
        super({ dst });
    }

    protected checkOperands(): void {
        this.checkRegisterGP("dst");
    }

    applyTo({ dst }: this["O"], state: State): void | boolean {
        state.branchPCabs(state.getRegister(dst));
    }
}

export class NOP extends InstructionBase<{}> {
    readonly opcode = "NOP";
    protected checkOperands(): void { }
    applyTo(): void { }
}

export class HLT extends InstructionBase<{}> {
    readonly opcode = "HLT";
    protected checkOperands(): void { }
    applyTo(): void { }
}
