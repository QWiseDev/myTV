import '@testing-library/jest-dom';

// Next 15 的 compiled edge-runtime primitives 依赖较新的 Web API 全局
// （structuredClone / TextEncoderStream 等）。jest 27 的 jsdom/node 沙箱
// 都不会拷贝这些新全局，这里从宿主 realm（vm.runInThisContext）桥接补齐。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const vm = require('node:vm');
const hostGlobal = vm.runInThisContext('globalThis');

for (const key of [
  'structuredClone',
  'TextEncoder',
  'TextDecoder',
  'TextEncoderStream',
  'TextDecoderStream',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  // fetch API 三件套：lib/auth 的 requireUser 顶层引入 next/server（NextRequest 继承 Request），
  // jsdom 沙箱没有这些全局，会导致所有间接依赖 lib/auth 的测试套件加载失败
  'Request',
  'Response',
  'Headers',
]) {
  if (
    typeof globalThis[key] === 'undefined' &&
    typeof hostGlobal[key] !== 'undefined'
  ) {
    globalThis[key] = hostGlobal[key];
  }
}

if (
  !globalThis.crypto?.subtle &&
  typeof hostGlobal.crypto?.subtle !== 'undefined'
) {
  Object.defineProperty(globalThis, 'crypto', {
    value: hostGlobal.crypto,
    configurable: true,
    writable: true,
  });
}

// Allow router mocks.
// eslint-disable-next-line no-undef
jest.mock('next/router', () => require('next-router-mock'));
