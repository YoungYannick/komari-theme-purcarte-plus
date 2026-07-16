export const TRAFFIC_LIMIT_INFINITY_MIN = 1000 * 1024 ** 5;

export const isTrafficLimitInfinite = (limit?: number | null) =>
  Number(limit) >= TRAFFIC_LIMIT_INFINITY_MIN;
