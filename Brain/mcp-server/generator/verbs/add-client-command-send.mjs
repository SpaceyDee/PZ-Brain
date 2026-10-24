export const name = "add-client-command-send";
export const compatibleArchetypes = ["network-mp", "timed-action"];
export const schema = { required: ["command"] };
export const requires = ["add-module-id-constant"];

export function emit(verbSpec, ctx) {
  const command = String(verbSpec.command);
  const ident = ctx.luaIdent;
  const snippet = [
    `local function send${command}(args)`,
    `    sendClientCommand(${ident}.MODULE_ID, "${command}", args or {})`,
    `end`,
    ``,
  ].join("\n");
  return [{ file: "lua-client", insertPoint: "helpers", snippet }];
}
