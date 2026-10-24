export const name = "add-inert-entity-stub";
export const compatibleArchetypes = ["script-only", "sandbox-qol", "network-mp", "timed-action"];
export const schema = {
  required: ["entityId", "sprite"],
};

export function emit(verbSpec) {
  const entityId = String(verbSpec.entityId);
  const sprite = String(verbSpec.sprite);
  const file = String(verbSpec.file ?? `entity_${entityId}.txt`);
  const comment = verbSpec.comment
    ? `    /* ${String(verbSpec.comment).replace(/\*\//g, "* /")} */\n`
    : "";
  const snippet = [
    `module Base`,
    `{`,
    comment + `    entity ${entityId}`,
    `    {`,
    `        component SpriteConfig`,
    `        {`,
    `            face S`,
    `            {`,
    `                layer`,
    `                {`,
    `                    row = ${sprite},`,
    `                }`,
    `            }`,
    `        }`,
    `    }`,
    `}`,
    ``,
  ].join("\n");
  return [{ file: `scripts:${file}`, insertPoint: "eof", snippet }];
}
