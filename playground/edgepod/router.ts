import type * as functions from "./functions";

export type EdgePodRouter = {
  [K in keyof typeof functions]: {
    args: Parameters<(typeof functions)[K]> extends [any, infer P] ? P : undefined;
    returns: Awaited<ReturnType<(typeof functions)[K]>>;
  };
};
