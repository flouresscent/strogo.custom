import test from "node:test";
import assert from "node:assert/strict";
import {
  SIZE_OPTIONS,
  createProject,
  createImageLayer,
  createTextLayer,
  layerHeight,
  pointToSource,
  hitTest,
  getEffectiveDpi,
  compositePixel,
  fitImage,
  resizeDesign,
  layerExceedsBounds,
  screenToDocument,
  createHistory,
  commitHistory,
  undoHistory,
  redoHistory,
  validateProject,
} from "./domain";
import { detectImageFormat, readImageDimensions } from "./upload";

const source = {
  src: "data:image/png;base64,aGVsbG8=",
  name: "test.png",
  naturalWidth: 1800,
  naturalHeight: 800,
};

test("physical formats maintain intended ratios", () => {
  assert.equal(SIZE_OPTIONS.wide.width / SIZE_OPTIONS.wide.height, 2.25);
  assert.equal(
    SIZE_OPTIONS.compact.width / SIZE_OPTIONS.compact.height,
    490 / 420,
  );
});
test("contain and cover preserve source aspect with centered placement", () => {
  const design = { ...createProject().design, size: "compact" as const };
  const layer = createImageLayer(source, design);
  assert.equal(layer.width, 490);
  assert.equal(layer.x, 245);
  assert.equal(layer.y, 210);
  assert.equal(layer.width / layerHeight(layer), 2.25);
  const cover = fitImage(layer, design, "cover");
  assert.equal(layerHeight(cover), 420);
  assert.equal(cover.width, 945);
  assert.equal(layerExceedsBounds(cover, design), true);
});
test("repeated size switches preserve model space without cumulative drift", () => {
  const initial = createProject().design;
  initial.layers.push({
    ...createImageLayer(source, initial),
    x: 333.25,
    y: 155.1,
    rotation: 47,
    width: 742.42,
  });
  let design = initial;
  for (let i = 0; i < 25; i++) {
    design = resizeDesign(design, "compact");
    design = resizeDesign(design, "wide");
  }
  assert.deepEqual(design, initial);
});
test("inverse source mapping handles rotation and scale around centre", () => {
  const layer = {
    ...createImageLayer(source, createProject().design),
    x: 100,
    y: 200,
    rotation: 90,
    width: 900,
  };
  assert.deepEqual(pointToSource(layer, { x: 100, y: 200 }), {
    x: 900,
    y: 400,
  });
  assert.deepEqual(pointToSource(layer, { x: 100, y: 425 }), {
    x: 1350,
    y: 400,
  });
  assert.equal(pointToSource(layer, { x: 600, y: 200 }), null);
  assert.equal(hitTest(layer, { x: 100, y: 500 }), true);
  assert.equal(hitTest(layer, { x: 500, y: 200 }), false);
});
test("viewport conversion uses CSS scale and ignores DPR", () => {
  assert.deepEqual(
    screenToDocument({ x: 290, y: 130 }, { left: 20, top: 10, scale: 0.3 }),
    { x: 900, y: 400 },
  );
});
test("DPI decreases with physical scale, independent from canvas zoom", () => {
  const layer = createImageLayer(source, createProject().design);
  assert.equal(getEffectiveDpi(layer), 50.8);
  assert.equal(getEffectiveDpi({ ...layer, width: layer.width / 2 }), 101.6);
});
test("eyedropper alpha uses an explicit background and rejects transparent pixels", () => {
  assert.equal(compositePixel([255, 0, 0, 255], "#ffffff"), "#ff0000");
  assert.equal(compositePixel([255, 0, 0, 128], "#000000"), "#800000");
  assert.equal(compositePixel([255, 0, 0, 128], "#ffffff"), "#ff7f7f");
  assert.equal(compositePixel([255, 0, 0, 0], "#ffffff"), null);
});
test("multiline text bounds match the renderer line spacing", () => {
  const text = {
    ...createTextLayer(createProject().design),
    text: "ONE\nTWO\nTHREE",
    fontSize: 20,
  };
  assert.equal(layerHeight(text), 75);
  assert.equal(hitTest(text, { x: text.x, y: text.y + 35 }), true);
  assert.equal(hitTest(text, { x: text.x, y: text.y + 40 }), false);
});
test("scene transformations never change the print document", () => {
  const project = createProject();
  project.design.layers.push(createImageLayer(source, project.design));
  const printed = JSON.stringify(project.design);
  project.tableScene.rug = { x: 150, y: 95, rotation: 73 };
  project.tableScene.keyboard.x += 200;
  assert.equal(JSON.stringify(project.design), printed);
});
test("history undo/redo restores exact design and branching drops future", () => {
  const first = createProject();
  const second = {
    ...first,
    design: { ...first.design, background: "#ffffff" },
  };
  const history = commitHistory(createHistory(first), second);
  assert.deepEqual(undoHistory(history).present, first);
  assert.deepEqual(redoHistory(undoHistory(history)).present, second);
  const branched = commitHistory(undoHistory(history), {
    ...first,
    design: { ...first.design, background: "#eeeeee" },
  });
  assert.equal(branched.future.length, 0);
});
test("history compares shared upload data without serializing it", () => {
  const asset = {
    src: "data:image/png;base64," + "A".repeat(1_000_000),
    toJSON() {
      throw new Error("History must not serialize upload bytes");
    },
  };
  const first = { position: { x: 1, y: 2 }, asset };
  const history = createHistory(first);
  assert.equal(
    commitHistory(history, { ...first, position: { x: 1, y: 2 } }),
    history,
  );
  const changed = commitHistory(history, {
    ...first,
    position: { x: 3, y: 2 },
  });
  assert.equal(changed.past.length, 1);
  assert.equal(changed.present.asset, asset);
  const distinctKeys = commitHistory(
    createHistory<Record<string, unknown>>({ x: undefined }),
    { y: undefined },
  );
  assert.equal(distinctKeys.past.length, 1);
  assert.equal(
    commitHistory(createHistory(new Array(1)), new Array(2)).past.length,
    1,
  );
});
test("long natural text widths remain savable while absurd bounds are rejected", () => {
  const project = createProject();
  const text = {
    ...createTextLayer(project.design),
    text: "W".repeat(300),
    fontSize: 500,
    width: 150_000,
  };
  project.design.layers = [text];
  assert.equal(validateProject(project), true);
  project.design.layers = [{ ...text, width: 200_001 }];
  assert.equal(validateProject(project), false);
  project.design.layers = [
    { ...createImageLayer(source, project.design), width: 20_001 },
  ];
  assert.equal(validateProject(project), false);
});
test("serialization validates allowed inputs and rejects corrupt or remote projects", () => {
  const project = createProject();
  project.design.layers.push(
    createImageLayer(source, project.design),
    createTextLayer(project.design),
  );
  assert.equal(validateProject(JSON.parse(JSON.stringify(project))), true);
  assert.equal(validateProject({ ...project, schemaVersion: 99 }), false);
  assert.equal(
    validateProject({
      ...project,
      design: {
        ...project.design,
        layers: [{ ...project.design.layers[0], x: NaN }],
      },
    }),
    false,
  );
  assert.equal(
    validateProject({
      ...project,
      design: {
        ...project.design,
        layers: [
          { ...project.design.layers[0], src: "https://example.com/art.png" },
        ],
      },
    }),
    false,
  );
  assert.equal(
    validateProject({
      ...project,
      design: {
        ...project.design,
        layers: [
          {
            ...project.design.layers[0],
            src: "data:image/svg+xml;base64,c2NyaXB0",
          },
        ],
      },
    }),
    false,
  );
  assert.equal(
    validateProject({
      ...project,
      design: {
        ...project.design,
        layers: [project.design.layers[0], project.design.layers[0]],
      },
    }),
    false,
  );
  assert.equal(
    validateProject({ ...project, tableScene: { rug: null } }),
    false,
  );
});
test("upload checks binary signature instead of trusting names/MIME", () => {
  assert.equal(
    detectImageFormat(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])),
    "png",
  );
  assert.equal(detectImageFormat(new Uint8Array([255, 216, 255, 224])), "jpeg");
  assert.equal(
    detectImageFormat(new TextEncoder().encode("RIFF1234WEBP")),
    "webp",
  );
  assert.equal(
    detectImageFormat(new TextEncoder().encode('<svg onload="alert(1)">')),
    null,
  );
});
test("upload parses dimensions before allocating decoded bitmap", () => {
  const png = new Uint8Array(24);
  new DataView(png.buffer).setUint32(16, 20000);
  new DataView(png.buffer).setUint32(20, 30000);
  assert.deepEqual(readImageDimensions(png, "png"), {
    width: 20000,
    height: 30000,
  });
  const jpeg = new Uint8Array([
    255, 216, 255, 192, 0, 17, 8, 1, 144, 3, 132, 3, 1, 17, 0, 2, 17, 0, 3, 17,
    0,
  ]);
  assert.deepEqual(readImageDimensions(jpeg, "jpeg"), {
    width: 900,
    height: 400,
  });
  assert.equal(
    readImageDimensions(new Uint8Array([255, 216, 255]), "jpeg"),
    null,
  );
});
