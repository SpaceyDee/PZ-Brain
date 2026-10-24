export const name = "add-context-menu-option";
export const compatibleArchetypes = ["sandbox-qol", "network-mp", "timed-action"];
export const schema = { required: ["label"] };
export const requires = ["add-tr-helper"];

export function emit(verbSpec, ctx) {
  const ident = ctx.luaIdent;
  const label = String(verbSpec.label);
  const key = String(verbSpec.translationKey ?? `ContextMenu_${ident}_${label.replace(/[^A-Za-z0-9]/g, "")}`);
  const command = verbSpec.command ? String(verbSpec.command) : null;
  const call = command
    ? `        sendClientCommand(${ident}.MODULE_ID, "${command}", {})`
    : `        -- caller fills in the action`;
  const handler = String(verbSpec.handler ?? "onFillInventoryObjectContextMenu");
  const snippet = [
    `local function ${handler}(playerNum, context, items)`,
    `    if not context or not context.addOption then return end`,
    `    context:addOption(${ident}.tr("${key}", "${label.replace(/"/g, '\\"')}"), nil, function()`,
    call,
    `    end)`,
    `end`,
    `Events.OnFillInventoryObjectContextMenu.Add(${handler})`,
    ``,
  ].join("\n");
  const json = `    "${key}": ${JSON.stringify(label)},\n`;
  return [
    { file: "lua-client", insertPoint: "registrations", snippet },
    { file: "translate-contextmenu", insertPoint: "eof", snippet: json },
  ];
}
