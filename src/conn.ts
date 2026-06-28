import dgram, { type RemoteInfo } from "node:dgram";
import {
  STREAM_BATCH,
  STREAM_REALTIME,
  TYPE_ACK,
  TYPE_DATA,
  TYPE_NACK,
  MAX_PACKET,
  type ARQConfig,
  type StreamType,
} from "./constants.js";
import { ARQEngine } from "./arq.js";
import { acquireBuf, marshalInto, releaseBuf, unmarshal } from "./packet.js";

export class QCPConn {
  private socket: dgram.Socket;
  private remote: { host: string; port: number };
  private replyHost: string;
  private arq = new ARQEngine();
  private seqId = 0;
  private stream: StreamType = STREAM_BATCH;
  private lastRealtime = 0;
  private recvQueue: Uint8Array[] = [];
  private sendBuf = acquireBuf();
  private connected = true;
  private recvWaiters: Array<(data: Uint8Array | null) => void> = [];

  private constructor(
    socket: dgram.Socket,
    remote: { host: string; port: number }
  ) {
    this.socket = socket;
    this.remote = remote;
    this.replyHost = remote.host;
    this.socket.on("message", (msg, rinfo) => this.onMessage(msg, rinfo));
    setInterval(() => {
      for (const raw of this.arq.retransmits()) {
        this.socket.send(raw, this.remote.port, this.remote.host);
      }
    }, 10);
  }

  static async dial(host: string, port: number): Promise<QCPConn> {
    const socket = dgram.createSocket("udp4");
    await new Promise<void>((resolve) => socket.bind(0, resolve));
    return new QCPConn(socket, { host, port });
  }

  static async listen(port = 0): Promise<{
    port: number;
    accept: () => Promise<QCPConn>;
    close: () => void;
  }> {
    const server = dgram.createSocket("udp4");
    await new Promise<void>((resolve) => server.bind(port, resolve));
    const boundPort = (server.address() as { port: number }).port;
    return {
      port: boundPort,
      accept: () =>
        new Promise((resolve) => {
          server.once("message", (msg, rinfo) => {
            const client = dgram.createSocket("udp4");
            client.bind(0, () => {
              const conn = new QCPConn(client, {
                host: rinfo.address,
                port: rinfo.port,
              });
              conn.deliverFirst(msg);
              resolve(conn);
            });
          });
        }),
      close: () => server.close(),
    };
  }

  configureARQ(cfg: ARQConfig): void {
    this.stream = STREAM_BATCH;
    this.arq.configure(cfg);
  }

  setStream(stream: StreamType): void {
    this.stream = stream;
  }

  send(data: Uint8Array): void {
    if (this.stream === STREAM_REALTIME) {
      const buf = acquireBuf();
      const size = marshalInto(
        {
          type: TYPE_DATA,
          stream: this.stream,
          seqId: this.seqId++ & 0xffff,
          pathId: 0,
          priority: 1,
          payload: data,
        },
        buf
      );
      this.socket.send(buf.subarray(0, size), this.remote.port, this.remote.host);
      releaseBuf(buf);
      return;
    }
    const seq = this.arq.nextSendSeq();
    const buf = acquireBuf();
    const size = marshalInto(
      {
        type: TYPE_DATA,
        stream: this.stream,
        seqId: seq,
        pathId: 0,
        priority: 1,
        payload: data,
      },
      buf
    );
    const raw = buf.subarray(0, size);
    if (this.arq.trackSent(seq, raw)) {
      this.socket.send(raw, this.remote.port, this.remote.host);
    }
    releaseBuf(buf);
  }

  async recvWait(timeoutMs = 2000): Promise<Uint8Array | null> {
    const existing = this.recvQueue.shift();
    if (existing) return existing;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.recvWaiters.indexOf(wrapped);
        if (idx >= 0) this.recvWaiters.splice(idx, 1);
        resolve(null);
      }, timeoutMs);
      const wrapped = (data: Uint8Array | null) => {
        clearTimeout(timer);
        resolve(data);
      };
      this.recvWaiters.push(wrapped);
    });
  }

  close(): void {
    this.connected = false;
    this.arq.release();
    this.socket.close();
  }

  /** Deliver first packet consumed by Listener.accept(). */
  deliverFirst(msg: Buffer): void {
    this.onMessage(msg);
  }

  private onMessage(msg: Buffer, rinfo?: RemoteInfo): void {
    if (rinfo && rinfo.address === this.replyHost) {
      this.remote = { host: rinfo.address, port: rinfo.port };
    }
    const pkt = unmarshal(new Uint8Array(msg.buffer, msg.byteOffset, msg.length));
    if (!pkt) return;
    if (pkt.type === TYPE_ACK) {
      this.arq.onACK(pkt.seqId);
      return;
    }
    if (pkt.type === TYPE_NACK) {
      const raw = this.arq.retransmitSeq(pkt.seqId);
      if (raw) this.socket.send(raw, this.remote.port, this.remote.host);
      return;
    }
    if (pkt.type !== TYPE_DATA) return;

    if (pkt.stream === STREAM_REALTIME) {
      if (pkt.seqId >= this.lastRealtime) {
        this.lastRealtime = pkt.seqId;
        this.enqueue(pkt.payload);
      }
      return;
    }

    const { ordered, nacks } = this.arq.onRecv(pkt.seqId, pkt.payload);
    this.sendControl(TYPE_ACK, pkt.seqId);
    for (const seq of nacks) this.sendControl(TYPE_NACK, seq);
    for (const p of ordered) this.enqueue(p);
  }

  private sendControl(type: number, seqId: number): void {
    const size = marshalInto(
      {
        type,
        stream: 0,
        seqId,
        pathId: 0,
        priority: 0,
        payload: new Uint8Array(0),
      },
      this.sendBuf
    );
    this.socket.send(
      this.sendBuf.subarray(0, size),
      this.remote.port,
      this.remote.host
    );
  }

  private enqueue(payload: Uint8Array): void {
    const cp = acquireBuf(payload.length);
    cp.set(payload);
    if (this.recvWaiters.length > 0) {
      const w = this.recvWaiters.shift()!;
      w(cp);
    } else {
      this.recvQueue.push(cp);
    }
  }
}

export { STREAM_REALTIME, STREAM_BATCH, STREAM_CRITICAL } from "./constants.js";
export type { ARQConfig, NetProfile } from "./constants.js";
