/** @jest-environment node */

import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

import tailwindConfig from '../../tailwind.config';

describe('首页卡片 Tailwind 样式', () => {
  it('生成固定卡片宽度和收藏网格规则', async () => {
    const result = await postcss([tailwindcss(tailwindConfig)]).process(
      '@tailwind utilities;',
      { from: undefined },
    );

    expect(result.css).toContain('.w-\\[7\\.5rem\\]');
    expect(result.css).toContain('.min-w-\\[7\\.5rem\\]');
    expect(result.css).toContain('.sm\\:w-\\[11rem\\]');
    expect(result.css).toContain('.sm\\:min-w-\\[11rem\\]');
    expect(result.css).toContain('.md\\:w-\\[12\\.5rem\\]');
    expect(result.css).toContain('.md\\:min-w-\\[12\\.5rem\\]');
    expect(result.css).toContain('.lg\\:w-\\[13\\.75rem\\]');
    expect(result.css).toContain('.lg\\:min-w-\\[13\\.75rem\\]');
    expect(result.css).toContain(
      'grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr))',
    );
  });
});
