import { findMpegTsSyncOffset, stripMpegTsPrefix } from './mpegTs';

function makePacket(syncByte = 0x47) {
  const packet = new Uint8Array(188);
  packet[0] = syncByte;
  return packet;
}

describe('mpegTs', () => {
  test('findMpegTsSyncOffset finds three aligned sync packets', () => {
    const data = new Uint8Array(3 + 188 * 3);
    data.set(makePacket(), 3);
    data.set(makePacket(), 3 + 188);
    data.set(makePacket(), 3 + 188 * 2);

    expect(findMpegTsSyncOffset(data)).toBe(3);
  });

  test('findMpegTsSyncOffset returns -1 when sync packets are not aligned', () => {
    const data = new Uint8Array(188 * 3);
    data[0] = 0x47;
    data[187] = 0x47;
    data[376] = 0x47;

    expect(findMpegTsSyncOffset(data)).toBe(-1);
  });

  test('stripMpegTsPrefix removes leading bytes before TS sync offset', () => {
    const data = new Uint8Array(5 + 188 * 3);
    data.set(makePacket(), 5);
    data.set(makePacket(), 5 + 188);
    data.set(makePacket(), 5 + 188 * 2);

    const result = stripMpegTsPrefix(data.buffer) as ArrayBuffer;
    const bytes = new Uint8Array(result);

    expect(bytes.byteLength).toBe(188 * 3);
    expect(bytes[0]).toBe(0x47);
  });

  test('stripMpegTsPrefix keeps unsupported data unchanged', () => {
    const input = 'not-bytes';

    expect(stripMpegTsPrefix(input)).toBe(input);
  });
});
