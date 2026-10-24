import { fail } from "../errors.mjs";

export const name = "add-craft-recipe";
export const compatibleArchetypes = ["script-only", "sandbox-qol", "network-mp", "timed-action"];
export const schema = {
  required: ["module", "recipeId"],
};

function formatInput(input, index, total) {
  const qty = input.qty == null ? 1 : Number(input.qty);
  const mode = input.mode ? ` mode:${input.mode}` : "";
  const flags = input.flags ? ` flags[${input.flags}]` : "";
  if (input.wildcard === true || input.spec === "[*]") {
    if (index !== total - 1) {
      fail("spec_invalid", "wildcard input [*] must be the last craftRecipe input line");
    }
    return `            item ${qty} [*]` + (input.mode ? ` mode:${input.mode}` : " mode:keep") + flags + ",";
  }
  if (input.tags) {
    return `            item ${qty} tags[${input.tags}]${mode}${flags},`;
  }
  const spec = String(input.spec ?? input.item ?? "");
  if (!spec) fail("spec_invalid", "craftRecipe input needs spec, tags, or wildcard");
  return `            item ${qty} [${spec}]${mode}${flags},`;
}

export function emit(verbSpec) {
  const moduleId = String(verbSpec.module);
  const recipeId = String(verbSpec.recipeId);
  let tags = String(verbSpec.tags ?? "InHandCraft;CanBeDoneFromFloor");
  if (/\bInHandCraft\b/.test(tags) && !/\bCanBeDoneFromFloor\b/.test(tags) && !/\bAnySurfaceCraft\b/.test(tags)) {
    tags = `${tags};CanBeDoneFromFloor`;
  }
  const category = String(verbSpec.category ?? "Miscellaneous");
  const time = verbSpec.time == null ? 100 : verbSpec.time;
  const timedAction = String(verbSpec.timedAction ?? "CraftWeapon1H");
  const onTest = verbSpec.onTest ? `\n        OnTest = ${verbSpec.onTest},` : "";
  const onCreate = verbSpec.onCreate ? `\n        OnCreate = ${verbSpec.onCreate},` : "";
  const inputs = Array.isArray(verbSpec.inputs) ? verbSpec.inputs : [];
  const outputs = Array.isArray(verbSpec.outputs) ? verbSpec.outputs : [];
  const file = String(verbSpec.file ?? "generated_recipes.txt");
  const inputLines = inputs.map((input, i) => formatInput(input, i, inputs.length));
  const outputLines = outputs.map((out) => {
    const qty = out.qty == null ? 1 : Number(out.qty);
    return `            item ${qty} ${out.item},`;
  });
  const snippet = [
    `module ${moduleId}`,
    `{`,
    `    craftRecipe ${recipeId}`,
    `    {`,
    `        time = ${time},`,
    `        timedAction = ${timedAction},`,
    `        Tags = ${tags},`,
    `        category = ${category},`,
    `        AllowBatchCraft = false,${onTest}${onCreate}`,
    `        inputs`,
    `        {`,
    ...(inputLines.length ? inputLines : ["            /* no inputs */"]),
    `        }`,
    `        outputs`,
    `        {`,
    ...outputLines,
    `        }`,
    `    }`,
    `}`,
    ``,
  ].join("\n");
  return [{ file: `scripts:${file}`, insertPoint: "eof", snippet }];
}
