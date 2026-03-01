/**
 * LTTB (Largest-Triangle-Three-Buckets) 降采样算法
 * 比简单的每N个取一个采样保留更好的视觉形状
 *
 * 对于多线条图表，使用所有非null值的平均值作为代表Y值进行三角计算
 */
export function lttbDownsample<T extends { time: number; [key: string]: any }>(
  data: T[],
  targetPoints: number,
  valueKeys: string[]
): T[] {
  const len = data.length;
  if (targetPoints >= len || targetPoints <= 2) return data;

  const result: T[] = [data[0]]; // 始终保留第一个点
  const bucketSize = (len - 2) / (targetPoints - 2);

  let prevIndex = 0;

  for (let i = 0; i < targetPoints - 2; i++) {
    // 当前桶范围
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(
      Math.floor((i + 2) * bucketSize) + 1,
      len - 1
    );

    // 下一个桶的平均值 (用于三角计算)
    const nextBucketStart = Math.floor((i + 2) * bucketSize) + 1;
    const nextBucketEnd = Math.min(
      Math.floor((i + 3) * bucketSize) + 1,
      len - 1
    );

    let avgX = 0;
    let avgY = 0;
    let avgCount = 0;
    for (let j = nextBucketStart; j < nextBucketEnd && j < len; j++) {
      avgX += data[j].time;
      avgY += getAvgValue(data[j], valueKeys);
      avgCount++;
    }
    if (avgCount === 0) {
      // 最后一个桶可能为空，使用最后一个点
      avgX = data[len - 1].time;
      avgY = getAvgValue(data[len - 1], valueKeys);
    } else {
      avgX /= avgCount;
      avgY /= avgCount;
    }

    // 在当前桶中找到使三角面积最大的点
    const prevX = data[prevIndex].time;
    const prevY = getAvgValue(data[prevIndex], valueKeys);

    let maxArea = -1;
    let maxAreaIndex = bucketStart;

    for (let j = bucketStart; j < bucketEnd && j < len; j++) {
      const pointX = data[j].time;
      const pointY = getAvgValue(data[j], valueKeys);

      // 三角面积公式 (叉积的绝对值 / 2)
      const area = Math.abs(
        (prevX - avgX) * (pointY - prevY) -
          (prevX - pointX) * (avgY - prevY)
      );

      if (area > maxArea) {
        maxArea = area;
        maxAreaIndex = j;
      }
    }

    result.push(data[maxAreaIndex]);
    prevIndex = maxAreaIndex;
  }

  result.push(data[len - 1]); // 始终保留最后一个点
  return result;
}

/**
 * 计算数据行中所有值键的平均值 (忽略 null/undefined)
 */
function getAvgValue(row: { [key: string]: any }, keys: string[]): number {
  let sum = 0;
  let count = 0;
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * 根据数据量和线条数自动计算最佳降采样目标点数
 * 返回 0 表示不需要降采样
 */
export function calculateAutoMaxPoints(
  dataLength: number,
  lineCount: number
): number {
  if (dataLength <= 0 || lineCount <= 0) return 0;

  const totalCells = dataLength * lineCount;

  // 小数据集不需要降采样
  if (totalCells < 50_000) return 0;

  // 中等数据集
  if (totalCells < 200_000) {
    return Math.min(dataLength, 1500);
  }

  // 大数据集: 基于线条数动态计算
  const target = Math.max(
    300,
    Math.floor(2000 / Math.sqrt(lineCount))
  );

  return Math.min(dataLength, target);
}
