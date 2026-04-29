// Promise.try 폴리필 — V8 13+에서만 정식 지원되는데 Node 22.x 일부 버전엔 아직 없다.
// unpdf 내부가 Promise.try를 호출해 서버에서 TypeError로 터지는 걸 막는다.
// 이 모듈을 unpdf를 사용하는 진입점에서 사이드 이펙트 import로 한 번만 로드하면 충분.

// TypeScript의 내장 PromiseTry 시그니처와 미세하게 어긋나도 런타임 동작은 동일하므로
// 타입은 의도적으로 우회한다.
type PromiseWithTry = typeof Promise & {
  try?: (...args: unknown[]) => Promise<unknown>;
};

const P = Promise as PromiseWithTry;

if (typeof P.try !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (P as any).try = function tryPolyfill(
    fn: (...args: unknown[]) => unknown,
    ...args: unknown[]
  ): Promise<unknown> {
    return new Promise((resolve) => {
      resolve(fn(...args));
    });
  };
}

export {};
