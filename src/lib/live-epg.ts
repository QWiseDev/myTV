import { parseCustomTimeFormat } from '@/lib/time';

/**
 * EPG（电子节目单）数据清洗函数。
 *
 * - 只保留今日节目：节目开始时间或结束时间落在今天，或节目跨越今天（跨天节目）均算今日节目；
 * - 去除时间上相互重叠的节目：同一时段发生重叠时，保留时长较短的节目；
 * - 结果按节目开始时间先后排序。
 *
 * 直播页多个 EPG 源可能给出重叠条目，此函数为其统一兜底清洗逻辑，
 * 行为与直播页原有实现保持逐字一致，请勿调整容错分支。
 *
 * @param programs 原始节目单数组；为空时原样返回
 * @returns 清洗后的节目单数组
 */
export function cleanEpgData(
  programs: Array<{ start: string; end: string; title: string }>
) {
  if (!programs || programs.length === 0) return programs;

  // 获取今日日期（只考虑年月日，忽略时间）
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const todayEnd = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1
  );

  // 首先过滤出今日的节目（包括跨天节目）
  const todayPrograms = programs.filter((program) => {
    const programStart = parseCustomTimeFormat(program.start);
    const programEnd = parseCustomTimeFormat(program.end);

    // 获取节目的日期范围
    const programStartDate = new Date(
      programStart.getFullYear(),
      programStart.getMonth(),
      programStart.getDate()
    );
    const programEndDate = new Date(
      programEnd.getFullYear(),
      programEnd.getMonth(),
      programEnd.getDate()
    );

    // 如果节目的开始时间或结束时间在今天，或者节目跨越今天，都算作今天的节目
    return (
      (programStartDate >= todayStart && programStartDate < todayEnd) || // 开始时间在今天
      (programEndDate >= todayStart && programEndDate < todayEnd) || // 结束时间在今天
      (programStartDate < todayStart && programEndDate >= todayEnd) // 节目跨越今天（跨天节目）
    );
  });

  // 按开始时间排序
  const sortedPrograms = [...todayPrograms].sort((a, b) => {
    const startA = parseCustomTimeFormat(a.start).getTime();
    const startB = parseCustomTimeFormat(b.start).getTime();
    return startA - startB;
  });

  const cleanedPrograms: Array<{
    start: string;
    end: string;
    title: string;
  }> = [];

  for (let i = 0; i < sortedPrograms.length; i++) {
    const currentProgram = sortedPrograms[i];
    const currentStart = parseCustomTimeFormat(currentProgram.start);
    const currentEnd = parseCustomTimeFormat(currentProgram.end);

    // 检查是否与已添加的节目重叠
    let hasOverlap = false;

    for (const existingProgram of cleanedPrograms) {
      const existingStart = parseCustomTimeFormat(existingProgram.start);
      const existingEnd = parseCustomTimeFormat(existingProgram.end);

      // 检查时间重叠（考虑完整的日期和时间）
      if (
        (currentStart >= existingStart && currentStart < existingEnd) || // 当前节目开始时间在已存在节目时间段内
        (currentEnd > existingStart && currentEnd <= existingEnd) || // 当前节目结束时间在已存在节目时间段内
        (currentStart <= existingStart && currentEnd >= existingEnd) // 当前节目完全包含已存在节目
      ) {
        hasOverlap = true;
        break;
      }
    }

    // 如果没有重叠，则添加该节目
    if (!hasOverlap) {
      cleanedPrograms.push(currentProgram);
    } else {
      // 如果有重叠，检查是否需要替换已存在的节目
      for (let j = 0; j < cleanedPrograms.length; j++) {
        const existingProgram = cleanedPrograms[j];
        const existingStart = parseCustomTimeFormat(existingProgram.start);
        const existingEnd = parseCustomTimeFormat(existingProgram.end);

        // 检查是否与当前节目重叠（考虑完整的日期和时间）
        if (
          (currentStart >= existingStart && currentStart < existingEnd) ||
          (currentEnd > existingStart && currentEnd <= existingEnd) ||
          (currentStart <= existingStart && currentEnd >= existingEnd)
        ) {
          // 计算节目时长
          const currentDuration = currentEnd.getTime() - currentStart.getTime();
          const existingDuration =
            existingEnd.getTime() - existingStart.getTime();

          // 如果当前节目时间更短，则替换已存在的节目
          if (currentDuration < existingDuration) {
            cleanedPrograms[j] = currentProgram;
          }
          break;
        }
      }
    }
  }

  return cleanedPrograms;
}
