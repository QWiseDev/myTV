import { render } from '@testing-library/react';
import { useEffect } from 'react';

import AnimatedCardGrid from './AnimatedCardGrid';

describe('AnimatedCardGrid', () => {
  it('preserves keyed cards when their order changes', () => {
    const mountCounts = new Map<string, number>();
    const unmountCounts = new Map<string, number>();

    function Card({ id }: { id: string }) {
      useEffect(() => {
        mountCounts.set(id, (mountCounts.get(id) ?? 0) + 1);

        return () => {
          unmountCounts.set(id, (unmountCounts.get(id) ?? 0) + 1);
        };
      }, [id]);

      return <div>{id}</div>;
    }

    const renderCards = (ids: string[]) =>
      ids.map((id) => <Card key={id} id={id} />);

    const { rerender } = render(
      <AnimatedCardGrid maxAnimatedItems={1}>
        {renderCards(['first', 'second'])}
      </AnimatedCardGrid>,
    );

    rerender(
      <AnimatedCardGrid maxAnimatedItems={1}>
        {renderCards(['second', 'first'])}
      </AnimatedCardGrid>,
    );

    expect(mountCounts).toEqual(
      new Map([
        ['first', 1],
        ['second', 1],
      ]),
    );
    expect(unmountCounts).toEqual(new Map());
  });
});
