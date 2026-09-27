import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';

import { useSyncedRef } from './useSyncedRef';

describe('useSyncedRef', () => {
  it('初始即为传入值', () => {
    const { result } = renderHook(() => useSyncedRef('initial'));

    expect(result.current.current).toBe('initial');
  });

  it('值变化后在提交后同步到 ref.current', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useSyncedRef(value),
      { initialProps: { value: 1 } },
    );

    rerender({ value: 2 });
    expect(result.current.current).toBe(2);

    rerender({ value: 3 });
    expect(result.current.current).toBe(3);
  });

  it('与 useState 组合时保持镜像同步', () => {
    const { result } = renderHook(() => {
      const [value, setValue] = useState(10);
      const mirrored = useSyncedRef(value);
      return { mirrored, setValue };
    });

    act(() => {
      result.current.setValue(42);
    });
    expect(result.current.mirrored.current).toBe(42);
  });
});
