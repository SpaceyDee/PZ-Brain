export const name = "add-tr-helper";
export const compatibleArchetypes = ["sandbox-qol", "network-mp", "timed-action"];
export const schema = { required: [] };

export function emit(_verbSpec, ctx) {
  const ident = ctx.luaIdent;
  const snippet = [
    `-- Player-facing strings go through ${ident}.tr so misses never show raw keys.`,
    `function ${ident}.tr(key, fallback, ...)`,
    `    local args = { ... }`,
    `    if type(getText) == "function" and key and key ~= "" then`,
    `        local s`,
    `        if #args > 0 then`,
    `            s = getText(key, unpack(args))`,
    `        else`,
    `            s = getText(key)`,
    `        end`,
    `        if type(s) == "string" and s ~= "" and s ~= key then return s end`,
    `    end`,
    `    if type(fallback) == "string" and #args > 0 then`,
    `        local out = fallback`,
    `        local i = 1`,
    `        while i <= #args do`,
    `            out = string.gsub(out, "%%" .. i, tostring(args[i]))`,
    `            i = i + 1`,
    `        end`,
    `        return out`,
    `    end`,
    `    return fallback or key`,
    `end`,
    ``,
  ].join("\n");
  return [{ file: "lua-shared", insertPoint: "helpers", snippet }];
}
