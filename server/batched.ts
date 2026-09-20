import type { Decider, DecisionResult } from "./engine";

/** Keep each provider request bounded while scoring the entire recalled set. */
export function batchDecider(wrapped: Decider, size = 24): Decider {
  if (!Number.isSafeInteger(size) || size < 1)
    throw new Error("模型批次大小需为正整数。");

  return async (...args: Parameters<Decider>): Promise<DecisionResult> => {
    const [config, items, lexical, mission, feedback] = args;
    if (items.length <= size) return wrapped(...args);

    const evidence: DecisionResult["evidence"] = [];
    const batches: {
      candidateIds: string[];
      model: string;
      calls: number;
      latency: number;
      usage: DecisionResult["usage"];
      rawAnswers: unknown;
    }[] = [];
    let model: string | undefined;
    let calls = 0;
    let latency = 0;
    let usage: DecisionResult["usage"] = {
      input_tokens: 0,
      output_tokens: 0,
    };

    for (let start = 0; start < items.length; start += size) {
      const candidates = items.slice(start, start + size);
      const result = await wrapped(
        config,
        candidates,
        lexical,
        mission,
        feedback,
      );
      if (model !== undefined && result.model !== model)
        throw new Error("不同批次返回了不同模型版本，已停止生成，请重试。");
      const candidateIds = candidates.map((p) => p.id);
      if (
        result.evidence.length !== candidateIds.length ||
        new Set(result.evidence.map((e) => e.id)).size !==
          candidateIds.length ||
        result.evidence.some((e) => !candidateIds.includes(e.id))
      )
        throw new Error("模型批次未返回完整候选评分，已停止生成。");

      model = result.model;
      calls += result.calls;
      latency += result.latency;
      // Missing usage in any batch makes the total unknown, not a partial sum.
      usage =
        usage && result.usage
          ? {
              input_tokens: usage.input_tokens + result.usage.input_tokens,
              output_tokens: usage.output_tokens + result.usage.output_tokens,
            }
          : null;
      evidence.push(...result.evidence);
      batches.push({
        candidateIds,
        model: result.model,
        calls: result.calls,
        latency: result.latency,
        usage: result.usage,
        rawAnswers: result.rawAnswers,
      });
    }

    return {
      evidence,
      model: model!,
      calls,
      latency,
      usage,
      rawAnswers: { batched: true, batchSize: size, batches },
    };
  };
}
