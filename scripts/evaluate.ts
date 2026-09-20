import { evaluate } from "../server/evaluation";
import { createJevDecider } from "../server/jev";
import { batchDecider } from "../server/batched";
const real = process.argv.includes("--jev");
if (real && !process.env.TYPESAFE_API_KEY)
  throw new Error("Set TYPESAFE_API_KEY to evaluate Jev.");
const result = await evaluate(
  real ? "jev" : "baseline",
  42,
  real
    ? batchDecider(
        createJevDecider(process.env.TYPESAFE_API_KEY!, process.env.JEV_MODEL),
      )
    : undefined,
);
console.log(JSON.stringify(result, null, 2));
