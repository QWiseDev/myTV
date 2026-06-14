const MPEG_TS_PACKET_SIZE = 188;
const MIN_SYNC_PACKETS = 3;

export function findMpegTsSyncOffset(bytes: Uint8Array): number {
  const maxOffset = Math.min(MPEG_TS_PACKET_SIZE, bytes.length);

  for (let offset = 0; offset < maxOffset; offset += 1) {
    let packets = 0;
    for (
      let position = offset;
      position < bytes.length && packets < MIN_SYNC_PACKETS;
      position += MPEG_TS_PACKET_SIZE
    ) {
      if (bytes[position] !== 0x47) {
        break;
      }
      packets += 1;
    }

    if (packets >= MIN_SYNC_PACKETS) {
      return offset;
    }
  }

  return -1;
}

export function stripMpegTsPrefix(data: unknown): unknown {
  let bytes: Uint8Array;

  if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else if (ArrayBuffer.isView(data)) {
    bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else {
    return data;
  }

  const syncOffset = findMpegTsSyncOffset(bytes);
  if (syncOffset <= 0) {
    return data;
  }

  const start = bytes.byteOffset + syncOffset;
  const end = bytes.byteOffset + bytes.byteLength;
  return bytes.buffer.slice(start, end);
}
