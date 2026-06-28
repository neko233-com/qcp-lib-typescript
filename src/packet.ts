import { CRC_SIZE, HEADER_SIZE, MAX_PACKET } from "./constants.js";

/** Preallocated buffer pool — hot path zero alloc. */
const pool: Uint8Array[] = [];

export function acquireBuf(size = MAX_PACKET): Uint8Array {
  const b = pool.pop();
  if (b && b.length >= size) return b.subarray(0, size);
  return new Uint8Array(size);
}

export function releaseBuf(buf: Uint8Array): void {
  if (buf.buffer.byteLength >= MAX_PACKET && pool.length < 256) {
    pool.push(new Uint8Array(buf.buffer));
  }
}

export interface Packet {
  type: number;
  stream: number;
  seqId: number;
  pathId: number;
  priority: number;
  payload: Uint8Array;
}

export function marshalInto(p: Packet, buf: Uint8Array): number {
  const payloadOffset = HEADER_SIZE + CRC_SIZE;
  const size = payloadOffset + p.payload.length;
  buf[0] = p.type | (p.stream << 4);
  buf[1] = p.seqId & 0xff;
  buf[2] = (p.seqId >> 8) & 0xff;
  buf[3] = p.pathId;
  buf[4] = p.priority;
  buf.set(p.payload, payloadOffset);
  const crc = crc32(buf.subarray(payloadOffset, size));
  buf[5] = crc & 0xff;
  buf[6] = (crc >> 8) & 0xff;
  buf[7] = (crc >> 16) & 0xff;
  buf[8] = (crc >> 24) & 0xff;
  return size;
}

export function unmarshal(data: Uint8Array): Packet | null {
  if (data.length < HEADER_SIZE + CRC_SIZE) return null;
  const payloadOffset = HEADER_SIZE + CRC_SIZE;
  const stored =
    (data[5] | (data[6] << 8) | (data[7] << 16) | (data[8] << 24)) >>> 0;
  const payload = data.subarray(payloadOffset);
  const actual = crc32(payload);
  if (stored !== (actual >>> 0)) return null;
  return {
    type: data[0] & 0x0f,
    stream: (data[0] >> 4) & 0x0f,
    seqId: data[1] | (data[2] << 8),
    pathId: data[3],
    priority: data[4],
    payload,
  };
}

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c >>> 0;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
