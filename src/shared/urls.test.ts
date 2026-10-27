import { test } from "node:test";
import assert from "node:assert/strict";
import { createSiteUrls } from "./urls";

test("root deployment retains existing URLs and routes", () => {
  const urls = createSiteUrls("/");
  assert.equal(urls.appUrl("/custom/create"), "/custom/create");
  assert.equal(urls.assetUrl("/assets/contour.svg"), "/assets/contour.svg");
  assert.equal(urls.getAppPathname("/custom/create/"), "/custom/create/");
});
test("project Pages deployment prefixes URLs once and normalizes direct routes", () => {
  const urls = createSiteUrls("/strogo.custom/");
  assert.equal(urls.appUrl("/"), "/strogo.custom/");
  assert.equal(urls.appUrl("/custom"), "/strogo.custom/custom");
  assert.equal(urls.appUrl("/custom/create"), "/strogo.custom/custom/create");
  assert.equal(urls.appUrl("/strogo.custom/custom"), "/strogo.custom/custom");
  assert.equal(
    urls.assetUrl("/assets/contour.svg"),
    "/strogo.custom/assets/contour.svg",
  );
  assert.equal(
    urls.getAppPathname("/strogo.custom/custom/create/"),
    "/custom/create/",
  );
  assert.equal(urls.getAppPathname("/strogo.custom/"), "/");
  assert.equal(urls.getAppPathname("/strogo.custom"), "/");
  assert.equal(
    urls.getAppPathname("/strogo.custom-other/custom/create"),
    "/strogo.custom-other/custom/create",
  );
});
test("deployment adapters preserve uploaded data, external links and canonical sources", () => {
  const urls = createSiteUrls("/strogo.custom");
  for (const source of [
    "data:image/png;base64,AAAA",
    "blob:https://example.org/id",
    "https://strogo.shop/",
    "#sizes",
  ]) {
    assert.equal(urls.assetUrl(source), source);
    assert.equal(urls.appUrl(source), source);
  }
  const layer = { src: "/assets/contour.svg" };
  urls.assetUrl(layer.src);
  assert.equal(layer.src, "/assets/contour.svg");
  assert.throws(() => createSiteUrls("https://example.com/"));
  assert.throws(() => createSiteUrls("//example.com/"));
});
