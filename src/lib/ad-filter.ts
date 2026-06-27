type M3u8Section = {
  leadingDiscontinuity: string | null;
  lines: string[];
};

type M3u8SectionStats = {
  totalDuration: number;
  maxSegmentDuration: number;
  segmentCount: number;
  adUriCount: number;
  hasExplicitAdMarker: boolean;
};

type AdFilterOptions = {
  type?: string;
  customCode?: string;
  onCustomError?: (error: unknown) => void;
};

const AD_URI_PATTERN =
  /(^|[/?&#._=-])(ad|ads|advert|advertise|advertisement|commercial|preroll|pre-roll|midroll|mid-roll|postroll|post-roll|sponsor|vast|vmap)([/?&#._=-]|$)/i;

export const DEFAULT_CUSTOM_AD_FILTER_CODE = `function filterAdsFromM3U8(type: string, m3u8Content: string): string {
  if (!m3u8Content) return '';

  const adKeywords = [
    'sponsor',
    '/ad/',
    '/ads/',
    'advert',
    'advertisement',
    '/adjump',
    'redtraffic'
  ];

  const lines = m3u8Content.split('\\n');
  const filteredLines = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.includes('#EXT-X-DISCONTINUITY')) {
      i++;
      continue;
    }

    if (line.includes('#EXTINF:') && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const containsAdKeyword = adKeywords.some((keyword) =>
        nextLine.toLowerCase().includes(keyword.toLowerCase())
      );

      if (containsAdKeyword) {
        i += 2;
        continue;
      }
    }

    filteredLines.push(line);
    i++;
  }

  return filteredLines.join('\\n');
}`;

export function removeTypeAnnotations(code: string): string {
  return code
    .replace(
      /(\w+)\s*:\s*(string|number|boolean|any|void|never|unknown|object)\s*([,)])/g,
      '$1$3',
    )
    .replace(
      /\)\s*:\s*(string|number|boolean|any|void|never|unknown|object)\s*\{/g,
      ') {',
    )
    .replace(
      /(const|let|var)\s+(\w+)\s*:\s*(string|number|boolean|any|void|never|unknown|object)\s*=/g,
      '$1 $2 =',
    );
}

export function runCustomAdFilterCode(
  type: string,
  m3u8Content: string,
  customCode: string,
): string {
  const jsCode = removeTypeAnnotations(customCode);
  const customFunction = new Function(
    'type',
    'm3u8Content',
    `"use strict";\n${jsCode}\nreturn filterAdsFromM3U8(type, m3u8Content);`,
  );
  const result = customFunction(type, m3u8Content);

  if (typeof result !== 'string') {
    throw new Error('自定义去广告函数必须返回字符串');
  }

  return result;
}

export function validateCustomAdFilterCode(code: string): void {
  runCustomAdFilterCode(
    'test',
    ['#EXTM3U', '#EXTINF:10,', 'main.ts'].join('\n'),
    code,
  );
}

function splitM3u8ByDiscontinuity(lines: string[]): M3u8Section[] {
  const sections: M3u8Section[] = [
    {
      leadingDiscontinuity: null,
      lines: [],
    },
  ];

  lines.forEach((line) => {
    if (line.trim().toUpperCase() === '#EXT-X-DISCONTINUITY') {
      sections.push({
        leadingDiscontinuity: line,
        lines: [],
      });
      return;
    }

    sections[sections.length - 1].lines.push(line);
  });

  return sections;
}

function isExplicitAdMarker(line: string): boolean {
  const upper = line.toUpperCase();

  if (
    upper.includes('#EXT-X-CUE-OUT') ||
    upper.includes('#EXT-X-SPLICEPOINT-SCTE35') ||
    upper.includes('#EXT-OATCLS-SCTE35') ||
    upper.includes('SCTE35-OUT') ||
    upper.includes('SCTE35-CMD')
  ) {
    return true;
  }

  if (!upper.startsWith('#EXT-X-DATERANGE')) {
    return false;
  }

  return /(CLASS|ID|X-[A-Z0-9-]+)=["'][^"']*(AD|ADS|ADVERT|COMMERCIAL|SCTE|CUE|VAST|VMAP)[^"']*["']/i.test(
    line,
  );
}

function getM3u8SectionStats(lines: string[]): M3u8SectionStats {
  let pendingDuration: number | null = null;
  let totalDuration = 0;
  let maxSegmentDuration = 0;
  let segmentCount = 0;
  let adUriCount = 0;
  let hasExplicitAdMarker = false;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (isExplicitAdMarker(trimmed)) {
      hasExplicitAdMarker = true;
    }

    const extInfMatch = trimmed.match(/^#EXTINF:([\d.]+)/i);
    if (extInfMatch) {
      const duration = Number(extInfMatch[1]);
      pendingDuration = Number.isFinite(duration) ? duration : null;
      return;
    }

    if (trimmed.startsWith('#')) return;

    segmentCount += 1;
    if (AD_URI_PATTERN.test(trimmed)) {
      adUriCount += 1;
    }

    const segmentDuration = pendingDuration ?? 0;
    totalDuration += segmentDuration;
    maxSegmentDuration = Math.max(maxSegmentDuration, segmentDuration);
    pendingDuration = null;
  });

  return {
    totalDuration,
    maxSegmentDuration,
    segmentCount,
    adUriCount,
    hasExplicitAdMarker,
  };
}

function shouldDropM3u8Section(
  section: M3u8Section,
  index: number,
  sections: M3u8Section[],
): boolean {
  const stats = getM3u8SectionStats(section.lines);
  if (stats.segmentCount === 0) return false;

  if (stats.hasExplicitAdMarker) {
    return true;
  }

  const isDiscontinuityBounded =
    section.leadingDiscontinuity !== null && index < sections.length - 1;
  const isShortIsland =
    stats.totalDuration > 0 &&
    stats.totalDuration <= 45 &&
    stats.segmentCount <= 8 &&
    stats.maxSegmentDuration <= 15;
  const hasMostlyAdUris =
    stats.adUriCount > 0 && stats.adUriCount / stats.segmentCount >= 0.5;

  return isDiscontinuityBounded && isShortIsland && hasMostlyAdUris;
}

function filterAdsFromM3U8Default(m3u8Content: string): string {
  if (!m3u8Content) return '';

  const hadTrailingNewline = m3u8Content.endsWith('\n');
  const lines = m3u8Content.split('\n');
  const sections = splitM3u8ByDiscontinuity(lines);
  let droppedAnySection = false;

  const filteredLines: string[] = [];
  sections.forEach((section, index) => {
    if (shouldDropM3u8Section(section, index, sections)) {
      droppedAnySection = true;
      return;
    }

    if (section.leadingDiscontinuity !== null) {
      filteredLines.push(section.leadingDiscontinuity);
    }
    filteredLines.push(...section.lines);
  });

  if (!droppedAnySection) {
    return m3u8Content;
  }

  const filteredContent = filteredLines.join('\n');
  return hadTrailingNewline && !filteredContent.endsWith('\n')
    ? `${filteredContent}\n`
    : filteredContent;
}

export function filterAdsFromM3U8(
  m3u8Content: string,
  options: AdFilterOptions = {},
): string {
  const customCode = options.customCode?.trim();
  if (customCode) {
    try {
      return runCustomAdFilterCode(options.type || '', m3u8Content, customCode);
    } catch (error) {
      options.onCustomError?.(error);
    }
  }

  return filterAdsFromM3U8Default(m3u8Content);
}
