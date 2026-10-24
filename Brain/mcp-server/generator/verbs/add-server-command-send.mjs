export const name = "add-server-command-send";
export const compatibleArchetypes = ["network-mp", "timed-action"];
export const schema = { required: ["command"] };
export const requires = ["add-module-id-constant"];

export function emit(verbSpec, ctx) {
  const command = String(verbSpec.command);
  const ident = ctx.luaIdent;
  const snippet = [
    `local function send${command}(player, args)`,
    `    if not player then return end`,
    `    sendServerCommand(player, ${ident}.MODULE_ID, "${command}", args or {})`,
    `end`,
    ``,
  ].join("\n");
  return [{ file: "lua-server", insertPoint: "helpers", snippet }];
}
