import '@testing-library/jest-dom';

// Next 15 的 compiled edge-runtime primitives 依赖较新的 Web API 全局
// （structuredClone / TextEncoderStream 等）。jest 27 的 jsdom/node 沙箱
// 都不会拷贝这些新全局，这里从宿主 realm（vm.runInThisContext）桥接补齐。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const vm = require('node:vm');
const hostGlobal = vm.runInThisContext('globalThis');

for (const key of [
  'structuredClone',
  'TextEncoderStream',
  'TextDecoderStream',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
]) {
  if (typeof globalThis[key] === 'undefined' && typeof hostGlobal[key] !== 'undefined') {
    globalThis[key] = hostGlobal[key];
  }
}

// Allow router mocks.
// eslint-disable-next-line no-undef
jest.mock('next/router', () => require('next-router-mock'));
