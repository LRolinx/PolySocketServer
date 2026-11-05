import axios from 'axios';
import pako from 'pako';
import { brotliDecompressSync } from 'zlib';

const textDecoder = new TextDecoder('utf-8');

type BilibiliPacket = {
    packetLen: number;
    headerLen: number;
    ver: number;
    op: number;
    seq: number;
    body: any;
};

type ParsedPacketStream = {
    packets: BilibiliPacket[];
    consumed: number;
};

const parseJsonMessages = (data: Buffer): any[] => {
    const messages: any[] = [];
    const text = textDecoder.decode(data);
    text.split(/[\x00-\x1f]+/).forEach((item) => {
        if (!item) return;
        try {
            messages.push(JSON.parse(item));
        } catch (error) {
            // Ignore non-JSON payload fragments.
        }
    });
    return messages;
};

const parsePacketStream = (buffer: Buffer, depth = 0): ParsedPacketStream => {
    if (depth > 8) return { packets: [], consumed: 0 };

    const packets: BilibiliPacket[] = [];
    let offset = 0;
    while (offset + 16 <= buffer.length) {
        const packetLen = buffer.readUInt32BE(offset);
        const headerLen = buffer.readUInt16BE(offset + 4);
        const ver = buffer.readUInt16BE(offset + 6);
        const op = buffer.readUInt32BE(offset + 8);
        const seq = buffer.readUInt32BE(offset + 12);

        if (headerLen < 16 || packetLen < headerLen || offset + packetLen > buffer.length) break;

        const payload = buffer.subarray(offset + headerLen, offset + packetLen);
        const packet: BilibiliPacket = { packetLen, headerLen, ver, op, seq, body: [] };

        if (op === 8) {
            try {
                packet.body = JSON.parse(textDecoder.decode(payload));
            } catch (error) {
                packet.body = null;
            }
            packets.push(packet);
        } else if (op === 5) {
            let data = payload;
            if (ver === 2) {
                data = Buffer.from(pako.inflate(payload));
            } else if (ver === 3) {
                data = brotliDecompressSync(payload);
            }

            if (ver === 2 || ver === 3) {
                const nested = parsePacketStream(data, depth + 1);
                if (nested.packets.length > 0 && nested.consumed === data.length) {
                    packets.push(...nested.packets);
                    offset += packetLen;
                    continue;
                }
            }
            packet.body = parseJsonMessages(data);
            packets.push(packet);
        } else {
            packets.push(packet);
        }

        offset += packetLen;
    }

    return { packets, consumed: offset };
};

/** Decode Bilibili live WebSocket packets, including zlib v2 and Brotli v3. */
const decode = (blob: any, call: (packet: BilibiliPacket) => void) => {
    const buffer = Buffer.from(blob);
    const parsed = parsePacketStream(buffer);
    parsed.packets.forEach(call);
};

/** Build an authentication packet for joining a Bilibili live room. */
const getCertification = (json: string): Buffer => {
    const body = Buffer.from(json, 'utf8');
    const packet = Buffer.alloc(body.length + 16);
    packet.writeUInt32BE(packet.length, 0);
    packet.writeUInt16BE(16, 4);
    packet.writeUInt16BE(1, 6);
    packet.writeUInt32BE(7, 8);
    packet.writeUInt32BE(1, 12);
    body.copy(packet, 16);
    return packet;
};

/** Download a Bilibili user avatar. */
const savebilibiliheadImg = async (uid: any, url: any) => {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return response.status === 200;
};

export { getCertification, decode, savebilibiliheadImg }
