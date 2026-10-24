import { fail } from "../errors.mjs";

export const name = "add-event-hook";
export const compatibleArchetypes = ["sandbox-qol", "network-mp", "timed-action"];
export const schema = { required: ["event", "target", "handler"] };

export function emit(verbSpec) {
  const event = String(verbSpec.event);
  const target = String(verbSpec.target);
  const handler = String(verbSpec.handler);
  if (!["client", "server", "shared"].includes(target)) {
    fail("verb_spec_invalid", `invalid event target: ${target}`, { verb: name, path: "target", detail: target });
  }
  const snippet = [
    `local function ${handler}(...)`,
    `end`,
    `Events.${event}.Add(${handler})`,
    ``,
  ].join("\n");
  return [{ file: `lua-${target}`, insertPoint: "registrations", snippet }];
}
