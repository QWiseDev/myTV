import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { navigateVideoCardPlayUrl } from '@/lib/video-card-utils';

import RecommendationsSection from './RecommendationsSection';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (
    props: Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
      fill?: boolean;
      src: string | { src: string };
      unoptimized?: boolean;
    },
  ) => {
    const { src, ...imageProps } = props;
    delete imageProps.fill;
    delete imageProps.unoptimized;

    return React.createElement('img', {
      ...imageProps,
      src: typeof src === 'string' ? src : src.src,
    });
  },
}));

jest.mock('@/lib/video-card-utils', () => ({
  navigateVideoCardPlayUrl: jest.fn(),
}));

describe('RecommendationsSection', () => {
  test('uses document navigation when opening another play item', () => {
    render(
      <RecommendationsSection
        recommendations={[
          {
            id: '123',
            title: '推荐影片',
            poster: 'https://example.com/poster.jpg',
            rate: '8.8',
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByText('推荐影片'));

    expect(navigateVideoCardPlayUrl).toHaveBeenCalledWith(
      '/play?title=%E6%8E%A8%E8%8D%90%E5%BD%B1%E7%89%87&douban_id=123&prefer=true',
    );
  });
});
