// PowerPoint animation and transition XML (ECMA-376 PresentationML <p:timing>, <p:transition>).
// pptxgenjs doesn't write animations, so the exporter adds these to each slide after it builds
// the file. Pure string builders so they can be unit-tested.
import type { Motion, Slide } from "@/lib/deck/schema";

export interface AnimShape {
  spid: number;
  kind: "sp" | "pic" | "chart";
}

export interface Effect {
  shape: AnimShape;
  preset: Motion["preset"];
  /** Build step (0 = starts automatically when the slide appears). */
  step: number;
  delayMs: number;
  durationMs: number;
  /** Full-bleed photo: slow zoom ("Ken Burns") is safe because the slide edge clips it. */
  fullBleed?: boolean;
}

interface Preset {
  id: number;
  subtype: number;
  behaviors: (spid: number, dur: number, next: () => number) => string;
  iterateWords?: boolean;
}

const tgt = (spid: number) => `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`;

const show = (spid: number, next: () => number) =>
  `<p:set><p:cBhvr><p:cTn id="${next()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${tgt(spid)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`;

const effect = (spid: number, dur: number, filter: string, next: () => number) =>
  `<p:animEffect transition="in" filter="${filter}"><p:cBhvr><p:cTn id="${next()}" dur="${dur}"/>${tgt(spid)}</p:cBhvr></p:animEffect>`;

const prop = (spid: number, dur: number, attr: string, from: string, to: string, next: () => number) =>
  `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${next()}" dur="${dur}" fill="hold"/>${tgt(spid)}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${from}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${to}"/></p:val></p:tav></p:tavLst></p:anim>`;

const FADE: Preset = { id: 10, subtype: 0, behaviors: (s, d, n) => show(s, n) + effect(s, d, "fade", n) };
// "Ascend": fade in while moving up a little.
const fadeUp = (dist: number): Preset => ({ id: 42, subtype: 0, behaviors: (s, d, n) => show(s, n) + effect(s, d, "fade", n) + prop(s, d, "ppt_x", "#ppt_x", "#ppt_x", n) + prop(s, d, "ppt_y", `#ppt_y+${dist}`, "#ppt_y", n) });
const wipe = (subtype: number, dir: string): Preset => ({ id: 22, subtype, behaviors: (s, d, n) => show(s, n) + effect(s, d, `wipe(${dir})`, n) });
const zoom = (from: number): Preset => ({
  id: 53,
  subtype: 16,
  behaviors: (s, d, n) => show(s, n) + prop(s, d, "ppt_w", `#ppt_w*${from}`, "#ppt_w", n) + prop(s, d, "ppt_h", `#ppt_h*${from}`, "#ppt_h", n) + effect(s, Math.min(d, 500), "fade", n),
});

function presetFor(e: Effect): Preset | null {
  switch (e.preset) {
    case "none":
      return null;
    case "fadeUp":
      return fadeUp(0.03);
    case "rise":
      return fadeUp(0.08);
    case "maskReveal":
    case "draw":
      return wipe(8, "left");
    case "grow":
      return wipe(4, "down");
    case "scaleIn":
    case "focus":
      return zoom(0.96);
    case "typeOn":
      return { ...FADE, iterateWords: true };
    case "kenBurns":
      return e.fullBleed ? zoom(1.12) : FADE;
    case "countUp":
    default:
      return FADE;
  }
}

/** <p:timing> for one slide. Returns "" when nothing animates. */
export function timingXml(effects: Effect[]): string {
  const live = effects.map((e) => ({ e, p: presetFor(e) })).filter((x): x is { e: Effect; p: Preset } => !!x.p);
  if (!live.length) return "";
  let id = 2;
  const next = () => ++id;
  const steps = [...new Set(live.map((x) => x.e.step))].sort((a, b) => a - b);

  const groups = steps.map((step, gi) => {
    const inStep = live.filter((x) => x.e.step === step).sort((a, b) => a.e.delayMs - b.e.delayMs);
    const auto = gi === 0 && step === 0;
    const outerId = next();
    const innerId = next();
    const pars = inStep
      .map(({ e, p }, k) => {
        const dur = Math.max(80, Math.round(e.durationMs));
        const nodeType = k === 0 ? (auto ? "afterEffect" : "clickEffect") : "withEffect";
        const ctnId = next();
        // Words appear one after another: 40 ms apart, like the web player's type-on.
        const iterate = p.iterateWords ? `<p:iterate type="wd"><p:tmAbs val="40"/></p:iterate>` : "";
        return `<p:par><p:cTn id="${ctnId}" presetID="${p.id}" presetClass="entr" presetSubtype="${p.subtype}" fill="hold" grpId="0" nodeType="${nodeType}"><p:stCondLst><p:cond delay="${Math.max(0, Math.round(e.delayMs))}"/></p:stCondLst>${iterate}<p:childTnLst>${p.behaviors(e.shape.spid, dur, next)}</p:childTnLst></p:cTn></p:par>`;
      })
      .join("");
    const start = auto ? `<p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>` : `<p:cond delay="indefinite"/>`;
    return `<p:par><p:cTn id="${outerId}" fill="hold"><p:stCondLst>${start}</p:stCondLst><p:childTnLst><p:par><p:cTn id="${innerId}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${pars}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
  });

  const seen = new Set<number>();
  const bld = live
    .filter(({ e }) => e.shape.kind !== "pic" && !seen.has(e.shape.spid) && seen.add(e.shape.spid))
    .map(({ e }) => (e.shape.kind === "chart" ? `<p:bldGraphic spid="${e.shape.spid}" grpId="0"><p:bldAsOne/></p:bldGraphic>` : `<p:bldP spid="${e.shape.spid}" grpId="0" animBg="1"/>`))
    .join("");

  return (
    `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>` +
    `<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${groups.join("")}</p:childTnLst></p:cTn>` +
    `<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>` +
    `<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>` +
    `</p:childTnLst></p:cTn></p:par></p:tnLst>${bld ? `<p:bldLst>${bld}</p:bldLst>` : ""}</p:timing>`
  );
}

/** <p:transition> into a slide. Morph needs PowerPoint 2019 / 365; older versions fall back to a fade. */
export function transitionXml(t: Slide["transition"], first: boolean): string {
  if (first || t === "cut") return "";
  if (t === "fade") return `<p:transition spd="med"><p:fade/></p:transition>`;
  if (t === "push") return `<p:transition spd="med"><p:push dir="l"/></p:transition>`;
  return (
    `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">` +
    `<mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" Requires="p159"><p:transition spd="slow"><p159:morph option="byObject"/></p:transition></mc:Choice>` +
    `<mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`
  );
}

/** Adds transition + timing to a slide XML produced by pptxgenjs. */
export function injectSlideXml(slideXml: string, transition: string, timing: string): string {
  if (!transition && !timing) return slideXml;
  const i = slideXml.lastIndexOf("</p:sld>");
  if (i < 0) return slideXml;
  return slideXml.slice(0, i) + transition + timing + slideXml.slice(i);
}

/** Shape ids by object name, read from the slide XML. */
export function shapeIds(slideXml: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of slideXml.matchAll(/<p:cNvPr id="(\d+)" name="([^"]*)"/g)) out.set(m[2], Number(m[1]));
  return out;
}
