export const name = "add-inert-item-stub";
export const compatibleArchetypes = ["script-only", "sandbox-qol", "network-mp", "timed-action"];
export const schema = {
  required: ["module", "itemId"],
};

export function emit(verbSpec) {
  const moduleId = String(verbSpec.module);
  const itemId = String(verbSpec.itemId);
  const displayName = String(verbSpec.displayName ?? `Removed ${itemId}`);
  const icon = String(verbSpec.icon ?? "Question_On");
  const weight = verbSpec.weight == null ? "0.1" : String(verbSpec.weight);
  const category = String(verbSpec.displayCategory ?? "Junk");
  const file = String(verbSpec.file ?? "generated_item_stubs.txt");
  const snippet = [
    `module ${moduleId}`,
    `{`,
    `    item ${itemId}`,
    `    {`,
    `        DisplayName = ${displayName},`,
    `        DisplayCategory = ${category},`,
    `        ItemType = base:normal,`,
    `        Icon = ${icon},`,
    `        Weight = ${weight},`,
    `    }`,
    `}`,
    ``,
  ].join("\n");
  return [{ file: `scripts:${file}`, insertPoint: "eof", snippet }];
}
