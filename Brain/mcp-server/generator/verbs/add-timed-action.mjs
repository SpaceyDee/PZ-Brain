export const name = "add-timed-action";
export const compatibleArchetypes = ["timed-action"];
export const schema = { required: ["actionName"] };
export const requires = ["add-module-id-constant"];

export function emit(verbSpec, ctx) {
  const actionName = String(verbSpec.actionName);
  const duration = Number(verbSpec.duration ?? 50);
  const ident = ctx.luaIdent;
  // Pattern origin: truth b42-nettimedaction-new-introspection — :new param
  // names must match stored fields; getDuration + adjustMaxTime are the
  // MP-safe overrides. Do not wrap a vanilla :new.
  const snippet = [
    `require "TimedActions/ISBaseTimedAction"`,
    ``,
    `${actionName} = ISBaseTimedAction:derive("${actionName}")`,
    ``,
    `function ${actionName}:isValid()`,
    `    return self.character ~= nil`,
    `end`,
    ``,
    `function ${actionName}:waitToStart()`,
    `    return false`,
    `end`,
    ``,
    `function ${actionName}:update()`,
    `end`,
    ``,
    `function ${actionName}:start()`,
    `end`,
    ``,
    `function ${actionName}:stop()`,
    `    ISBaseTimedAction.stop(self)`,
    `end`,
    ``,
    `function ${actionName}:perform()`,
    `    ISBaseTimedAction.perform(self)`,
    `end`,
    ``,
    `function ${actionName}:complete()`,
    `    return true`,
    `end`,
    ``,
    `function ${actionName}:getDuration()`,
    `    return self.maxTime`,
    `end`,
    ``,
    `function ${actionName}:adjustMaxTime(maxTime)`,
    `    return maxTime`,
    `end`,
    ``,
    `function ${actionName}:new(character)`,
    `    local o = ISBaseTimedAction.new(self, character)`,
    `    o.maxTime = ${duration}`,
    `    o.stopOnWalk = true`,
    `    o.stopOnRun = true`,
    `    o.modId = ${ident}.MODULE_ID`,
    `    return o`,
    `end`,
    ``,
  ].join("\n");
  return [{ file: "lua-shared", insertPoint: "helpers", snippet }];
}
