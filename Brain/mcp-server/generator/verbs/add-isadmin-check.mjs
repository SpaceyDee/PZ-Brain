export const name = "add-isadmin-check";
export const compatibleArchetypes = ["network-mp", "timed-action"];
export const schema = { required: [] };
export const requires = ["add-module-id-constant"];

export function emit(_verbSpec, ctx) {
  const ident = ctx.luaIdent;
  // Literal rank strings (both cases) are required by space_audit_isadmin_completeness.
  const snippet = [
    `function ${ident}.isAdminPlayer(player)`,
    `    if not player or not player.getAccessLevel then return false end`,
    `    local level = player:getAccessLevel()`,
    `    if level == nil then return false end`,
    `    local s = tostring(level)`,
    `    return s == "admin" or s == "Admin"`,
    `        or s == "moderator" or s == "Moderator"`,
    `        or s == "overseer" or s == "Overseer"`,
    `        or s == "gm" or s == "Gm"`,
    `        or s == "observer" or s == "Observer"`,
    `end`,
    ``,
  ].join("\n");
  return [{ file: "lua-server", insertPoint: "helpers", snippet }];
}
