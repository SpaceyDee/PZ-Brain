export const name = "add-command-handler";
export const compatibleArchetypes = ["network-mp", "timed-action"];
export const schema = { required: ["side", "commands"] };
export const requires = ["add-module-id-constant"];

export function emit(verbSpec, ctx) {
  const side = String(verbSpec.side);
  const commands = Array.isArray(verbSpec.commands) ? verbSpec.commands.map(String) : [];
  if (!commands.length) {
    throw Object.assign(new Error("commands must be a non-empty array"), { code: "verb_spec_invalid" });
  }
  const ident = ctx.luaIdent;
  const event = side === "server" ? "OnClientCommand" : "OnServerCommand";
  const extraPlayer = side === "server" ? ", player" : "";
  const playerGuard = side === "server" ? `    if not player then return end\n` : "";
  const branches = commands
    .map(
      (cmd) =>
        `    if command == "${cmd}" then\n` +
        `        -- ${cmd}\n` +
        `        return\n` +
        `    end`,
    )
    .join("\n");
  const snippet = [
    `local function on${side === "server" ? "Client" : "Server"}Command(module, command${extraPlayer}, args)`,
    `    if module ~= ${ident}.MODULE_ID then return end`,
    playerGuard + `    args = args or {}`,
    branches,
    `end`,
    `Events.${event}.Add(on${side === "server" ? "Client" : "Server"}Command)`,
    ``,
  ].join("\n");
  return [{ file: `lua-${side}`, insertPoint: "registrations", snippet }];
}
