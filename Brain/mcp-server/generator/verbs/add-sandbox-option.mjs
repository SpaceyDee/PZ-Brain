export const name = "add-sandbox-option";
export const compatibleArchetypes = ["sandbox-qol", "network-mp", "timed-action"];
export const schema = { required: ["id", "type", "default"] };
export const requires = ["add-tr-helper"];

export function emit(verbSpec, ctx) {
  const ns = ctx.sandboxNamespace;
  const id = String(verbSpec.id);
  const type = String(verbSpec.type);
  const optionKey = `${ns}.${id}`;
  const translation = `${ns}_${id}`;
  const lines = [
    `option ${optionKey}`,
    `{`,
    `    type = ${type},`,
  ];
  if (verbSpec.min != null) lines.push(`    min = ${verbSpec.min},`);
  lines.push(`    default = ${formatDefault(type, verbSpec.default)},`);
  if (verbSpec.max != null) lines.push(`    max = ${verbSpec.max},`);
  lines.push(`    page = ${ns},`);
  lines.push(`    translation = ${translation},`);
  lines.push(`}`);
  lines.push(``);

  const label = String(verbSpec.label ?? id);
  const tooltip = String(verbSpec.tooltip ?? label);
  const jsonSnippet = [
    `    "Sandbox_${translation}": ${JSON.stringify(label)},`,
    `    "Sandbox_${translation}_tooltip": ${JSON.stringify(tooltip)},`,
    ``,
  ].join("\n");

  return [
    { file: "sandbox-options", insertPoint: "eof", snippet: lines.join("\n") },
    { file: "translate-sandbox", insertPoint: "eof", snippet: jsonSnippet },
  ];
}

function formatDefault(type, value) {
  if (type === "boolean") return value ? "true" : "false";
  if (type === "string") return JSON.stringify(String(value));
  return String(value);
}
