import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoCartItem } from "./checkout";
import { createProject, createTextLayer } from "./editor/domain";

test("demo adapter rejects empty/invalid projects and never produces payment state", () => {
  const project = createProject();
  assert.throws(() => createDemoCartItem(project));
  project.design.layers.push(createTextLayer(project.design));
  const item = createDemoCartItem(project);
  assert.equal(item.mode, "demo");
  assert.equal(item.price, null);
  assert.equal(item.id, project.id);
  project.design.background = "#ffffff";
  assert.notEqual(item.project.design.background, project.design.background);
});
