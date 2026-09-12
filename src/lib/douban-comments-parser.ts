import { load } from 'cheerio';

import type { DoubanComment } from './types';

// 参考 MoonTVPlus 的 DOM 解析方式，保留本项目的短评字段契约。
export function parseDoubanCommentsPage(html: string) {
  const $ = load(html);
  const comments: DoubanComment[] = [];
  $('.comment-item').each((_, element) => {
    const item = $(element);
    const content = item.find('.short').first();
    content.find('br').replaceWith('\n');
    const text = content.text().trim();
    if (!text) return;
    const user = item.find('.comment-info a').first();
    const avatar = item.find('.avatar');
    const userUrl = user.attr('href') || avatar.find('a').attr('href') || '';
    comments.push({
      id: item.attr('data-cid'),
      username:
        user.text().trim() || avatar.find('a').attr('title') || '豆瓣用户',
      user_id: userUrl.match(/\/people\/([^/]+)/)?.[1] || '',
      avatar: (avatar.find('img').attr('src') || '').replace(
        /^http:/,
        'https:',
      ),
      rating:
        Number(
          item
            .find('.rating')
            .attr('class')
            ?.match(/allstar([1-5])0/)?.[1],
        ) || 0,
      time:
        item.find('.comment-time').attr('title') ||
        item.find('.comment-time').text().trim(),
      location: item.find('.comment-location').text().trim(),
      content: text,
      useful_count: Number.parseInt(item.find('.vote-count').text(), 10) || 0,
    });
  });
  const nextHref = $('#paginator .next a, #paginator a.next, a.next')
    .first()
    .attr('href');
  const nextStart = nextHref
    ? Number(
        new URL(nextHref, 'https://movie.douban.com').searchParams.get('start'),
      )
    : null;
  return {
    comments,
    hasMore: !!nextHref && comments.length > 0,
    nextStart:
      nextStart !== null && Number.isSafeInteger(nextStart) && nextStart >= 0
        ? nextStart
        : null,
  };
}
