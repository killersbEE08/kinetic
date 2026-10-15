import { describe, expect, it } from "vitest";
import { injectSlideXml, shapeIds, timingXml, transitionXml, uniqueShapeIds, type Effect } from "./timing";

/** Minimal well-formedness check: every tag closes in order (no XML parser in the node test env). */
function balanced(xml: string): boolean {
  const stack: string[] = [];
  for (const m of xml.matchAll(/<(\/?)([A-Za-z][\w:.-]*)[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m;
    if (self) continue;
    if (close) {
      if (stack.pop() !== name) return false;
    } else stack.push(name);
  }
  return stack.length === 0;
}

const fx = (spid: number, preset: Effect["preset"], step: number, delayMs: number, kind: Effect["shape"]["kind"] = "sp"): Effect => ({ shape: { spid, kind }, preset, step, delayMs, durationMs: 400 });

describe("PowerPoint timing XML", () => {
  it("is empty when nothing animates", () => {
    expect(timingXml([])).toBe("");
    expect(timingXml([fx(2, "none", 0, 0)])).toBe("");
  });

  it("starts step 0 automatically and later steps on click", () => {
    const xml = timingXml([fx(2, "maskReveal", 0, 0), fx(3, "fadeUp", 0, 280), fx(4, "fadeUp", 1, 0)]);
    expect(balanced(xml)).toBe(true);
    expect(xml.match(/evt="onBegin"/g)?.length).toBe(1);
    expect(xml).toContain('nodeType="afterEffect"');
    expect(xml).toContain('nodeType="clickEffect"');
    expect(xml).toContain('<p:cond delay="280"/>');
    expect(xml).toContain('filter="wipe(left)"');
    // Every time node id is unique.
    const ids = [...xml.matchAll(/<p:cTn id="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    // Each animated shape is referenced.
    for (const spid of [2, 3, 4]) expect(xml).toContain(`<p:spTgt spid="${spid}"/>`);
  });

  it("only clicks when the first build is on click", () => {
    const xml = timingXml([fx(5, "fadeUp", 1, 0)]);
    expect(xml).not.toContain("onBegin");
    expect(xml).toContain('nodeType="clickEffect"');
  });

  it("types headlines on word by word and builds charts as one object", () => {
    const xml = timingXml([fx(2, "typeOn", 0, 0), fx(7, "grow", 0, 300, "chart"), fx(9, "kenBurns", 0, 0, "pic")]);
    expect(balanced(xml)).toBe(true);
    expect(xml).toContain('<p:iterate type="wd">');
    expect(xml).toContain('<p:bldGraphic spid="7" grpId="0"><p:bldAsOne/></p:bldGraphic>');
    expect(xml).not.toContain('spid="9" grpId'); // pictures need no build entry
  });

  it("writes transitions, with a fade fallback for Morph", () => {
    expect(transitionXml("fade", true)).toBe("");
    expect(transitionXml("cut", false)).toBe("");
    expect(transitionXml("fade", false)).toContain("<p:fade/>");
    const morph = transitionXml("morph", false);
    expect(balanced(morph)).toBe(true);
    expect(morph).toContain('p159:morph option="byObject"');
    expect(morph).toContain("<mc:Fallback>");
  });

  it("injects before the closing tag and reads shape ids", () => {
    const slide = '<p:sld><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="!!title"/></p:nvSpPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="k2">' +
      "</p:cNvPr></p:nvSpPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>";
    expect(shapeIds(slide)).toEqual(new Map([["!!title", 2], ["k2", 3]]));
    const out = injectSlideXml(slide, transitionXml("fade", false), timingXml([fx(2, "fadeUp", 0, 0)]));
    expect(out.indexOf("<p:transition")).toBeGreaterThan(out.indexOf("</p:clrMapOvr>"));
    expect(out.indexOf("<p:timing>")).toBeGreaterThan(out.indexOf("<p:transition"));
    expect(out.endsWith("</p:sld>")).toBe(true);
    expect(balanced(out)).toBe(true);
  });

  it("renumbers duplicate shape ids (pptxgenjs tables can collide with other shapes)", () => {
    const xml = '<p:cNvPr id="1" name=""/><p:cNvPr id="2" name="k1"/><p:cNvPr id="3" name="k2"/><p:cNvPr id="2" name="k3"/>';
    const out = uniqueShapeIds(xml);
    const ids = [...out.matchAll(/<p:cNvPr id="(\d+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["1", "2", "3", "4"]);
    expect(shapeIds(out).get("k3")).toBe(4);
  });
});
