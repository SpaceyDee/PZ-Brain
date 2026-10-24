import * as addInertItemStub from "./add-inert-item-stub.mjs";
import * as addInertEntityStub from "./add-inert-entity-stub.mjs";
import * as addTrHelper from "./add-tr-helper.mjs";
import * as addModuleIdConstant from "./add-module-id-constant.mjs";
import * as addSandboxOption from "./add-sandbox-option.mjs";
import * as addEventHook from "./add-event-hook.mjs";
import * as addContextMenuOption from "./add-context-menu-option.mjs";
import * as addCommandHandler from "./add-command-handler.mjs";
import * as addServerCommandSend from "./add-server-command-send.mjs";
import * as addClientCommandSend from "./add-client-command-send.mjs";
import * as addIsadminCheck from "./add-isadmin-check.mjs";
import * as addTimedAction from "./add-timed-action.mjs";
import * as addCraftRecipe from "./add-craft-recipe.mjs";

const ALL = [
  addInertItemStub,
  addInertEntityStub,
  addTrHelper,
  addModuleIdConstant,
  addSandboxOption,
  addEventHook,
  addContextMenuOption,
  addCommandHandler,
  addServerCommandSend,
  addClientCommandSend,
  addIsadminCheck,
  addTimedAction,
  addCraftRecipe,
];

export const verbsByName = Object.fromEntries(ALL.map((v) => [v.name, v]));
export const verbNames = Object.keys(verbsByName);
