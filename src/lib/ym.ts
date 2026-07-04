export const YM_COUNTER_ID = 109023773;

/** Fire a Yandex Metrika goal from client code. No-op when Metrika is blocked or not loaded. */
export function ymGoal(goal: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).ym?.(YM_COUNTER_ID, "reachGoal", goal, params);
}
