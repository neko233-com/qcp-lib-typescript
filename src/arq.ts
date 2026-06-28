import type { ARQConfig } from "./constants.js";
import { acquireBuf, releaseBuf } from "./packet.js";

interface Pending {
  raw: Uint8Array;
  sentAt: number;
  retries: number;
}

/** ARQ + Fast NACK — mirrors Go reference implementation. */
export class ARQEngine {
  private sendNext = 0;
  private recvNext = 0;
  private pending = new Map<number, Pending>();
  private recvBuf = new Map<number, Uint8Array>();
  private dupAck = new Map<number, number>();
  private rto = 200;
  private minRTO = 10;
  private fastResend = 2;
  private sndWnd = 128;
  private noDelay = false;

  configure(cfg: ARQConfig): void {
    if (cfg.noDelay) {
      this.rto = 30;
      this.minRTO = 10;
      this.noDelay = true;
    }
    if (cfg.fastResend) this.fastResend = cfg.fastResend;
    if (cfg.sendWnd) this.sndWnd = cfg.sendWnd;
  }

  nextSendSeq(): number {
    return this.sendNext++ & 0xffff;
  }

  trackSent(seq: number, raw: Uint8Array): boolean {
    if (this.pending.size >= this.sndWnd) return false;
    const cp = acquireBuf(raw.length);
    cp.set(raw);
    this.pending.set(seq, { raw: cp, sentAt: Date.now(), retries: 0 });
    return true;
  }

  onACK(seq: number): void {
    this.pending.delete(seq);
    this.dupAck.delete(seq);
    for (const s of this.pending.keys()) {
      if (s <= seq) this.pending.delete(s);
    }
  }

  onRecv(
    seq: number,
    payload: Uint8Array
  ): { ordered: Uint8Array[]; nacks: number[] } {
    const nacks: number[] = [];
    if (seq > this.recvNext) {
      for (let s = this.recvNext; s < seq; s++) nacks.push(s);
    }
    if (seq < this.recvNext) {
      const d = (this.dupAck.get(seq) ?? 0) + 1;
      this.dupAck.set(seq, d);
      if (d >= this.fastResend) nacks.push(seq);
      return { ordered: [], nacks };
    }
    if (seq > this.recvNext) {
      const cp = acquireBuf(payload.length);
      cp.set(payload);
      this.recvBuf.set(seq, cp);
      return { ordered: [], nacks };
    }
    const cp = acquireBuf(payload.length);
    cp.set(payload);
    const ordered: Uint8Array[] = [cp];
    this.recvNext = (seq + 1) & 0xffff;
    while (this.recvBuf.has(this.recvNext)) {
      ordered.push(this.recvBuf.get(this.recvNext)!);
      this.recvBuf.delete(this.recvNext);
      this.recvNext = (this.recvNext + 1) & 0xffff;
    }
    return { ordered, nacks };
  }

  retransmitSeq(seq: number): Uint8Array | null {
    const p = this.pending.get(seq);
    if (!p) return null;
    p.sentAt = Date.now();
    p.retries++;
    return p.raw;
  }

  effectiveRTO(retries: number): number {
    let rto = this.noDelay ? this.minRTO : this.rto;
    for (let i = 0; i < retries; i++) {
      rto *= 2;
      if (rto > 2000) return 2000;
    }
    return Math.max(rto, this.minRTO);
  }

  retransmits(): Uint8Array[] {
    const now = Date.now();
    const out: Uint8Array[] = [];
    for (const p of this.pending.values()) {
      if (now - p.sentAt >= this.effectiveRTO(p.retries)) {
        p.sentAt = now;
        p.retries++;
        out.push(p.raw);
      }
    }
    return out;
  }

  release(): void {
    for (const p of this.pending.values()) releaseBuf(p.raw);
    for (const b of this.recvBuf.values()) releaseBuf(b);
    this.pending.clear();
    this.recvBuf.clear();
  }
}
