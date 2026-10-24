export const name = "add-module-id-constant";
export const compatibleArchetypes = ["sandbox-qol", "network-mp", "timed-action"];
export const schema = { required: [] };

export function emit(_verbSpec, ctx) {
  const ident = ctx.luaIdent;
  const snippet = `${ident}.MODULE_ID = "${ctx.modId}"\n`;
  const files = ctx.luaSides.map((side) => ({
    file: `lua-${side}`,
    insertPoint: "constants",
    snippet,
  }));
  return files;
}
