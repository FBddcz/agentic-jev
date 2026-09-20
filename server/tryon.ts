const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const tryOnModel = "FASHN VTON 1.5";
export function tryOnEndpoint(
  value = process.env.TRYON_BASE_URL || "http://127.0.0.1:8789",
) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("试衣服务仅支持本机 HTTP 地址。");
  return url.origin;
}
export function validateTryOnImage(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_IMAGE_BYTES * 1.4)
    throw new Error("图片过大或格式无效。");
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error("请使用 JPG、PNG 或 WebP 图片。");
  const bytes = Buffer.from(match[2], "base64");
  const valid =
    match[1] === "png"
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : match[1] === "jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP";
  if (
    !valid ||
    bytes.length > MAX_IMAGE_BYTES ||
    bytes.toString("base64") !== match[2]
  )
    throw new Error("图片内容无效或过大。");
  return value;
}
export function validateTryOnInput(data: any) {
  if (
    !data ||
    !["tops", "bottoms", "one-pieces"].includes(data.category) ||
    !["flat-lay", "model"].includes(data.garmentPhotoType)
  )
    throw new Error("请选择衣服类别和图片类型。");
  return {
    personImage: validateTryOnImage(data.personImage),
    garmentImage: validateTryOnImage(data.garmentImage),
    category: data.category,
    garmentPhotoType: data.garmentPhotoType,
  };
}
export async function tryOnStatus(fetcher: typeof fetch = fetch) {
  try {
    const response = await fetcher(`${tryOnEndpoint()}/health`, {
      signal: AbortSignal.timeout(1500),
      redirect: "error",
    });
    const data = await response.json();
    return {
      ready: response.ok && data.ready === true && data.model === tryOnModel,
      model: tryOnModel,
    };
  } catch {
    return { ready: false, model: tryOnModel };
  }
}
export async function runTryOn(input: unknown, fetcher: typeof fetch = fetch) {
  const data = validateTryOnInput(input);
  const begin = performance.now();
  let response: Response;
  try {
    response = await fetcher(`${tryOnEndpoint()}/try-on`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(120000),
      redirect: "error",
    });
  } catch {
    throw new Error("试衣服务未连接或超过 120 秒，请检查本机推理服务。");
  }
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? "试衣服务正忙，请稍后重试。"
        : "试衣生成失败，请检查推理服务；当前照片已保留。",
    );
  // Bound the output before parsing; never relay provider HTML or arbitrary URLs to the page.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("试衣服务返回了无效结果。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > 6 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("试衣结果过大。");
    }
    chunks.push(chunk.value);
  }
  const result = JSON.parse(Buffer.concat(chunks).toString());
  if (
    result.model !== tryOnModel ||
    typeof result.inferenceMs !== "number" ||
    !Number.isFinite(result.inferenceMs) ||
    result.inferenceMs < 0
  )
    throw new Error("试衣服务返回了无效结果。");
  return {
    image: validateTryOnImage(result.image),
    model: tryOnModel,
    inferenceMs: result.inferenceMs,
    elapsedMs: performance.now() - begin,
  };
}
