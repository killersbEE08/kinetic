import { describe, expect, it } from "vitest";
import { importKind, parseCsv, tableToText } from "./import";
import { niceName } from "./assets";
import { sniffImage } from "@/lib/server/sniff";
import { parseColor } from "@/lib/export/scene";

describe("file import helpers", () => {
  it("recognises supported files", () => {
    expect(importKind("Board deck.PPTX")).toBe("pptx");
    expect(importKind("memo.docx")).toBe("docx");
    expect(importKind("q3.xlsx")).toBe("xlsx");
    expect(importKind("notes.md")).toBe("text");
    expect(importKind("old.doc")).toBeNull();
    expect(importKind("photo.jpg")).toBeNull();
  });

  it("parses CSV with quotes, commas and semicolons", () => {
    expect(parseCsv('Region,Revenue\n"North, East",1200\nSouth,"9""50"\n')).toEqual([["Region", "Revenue"], ["North, East", "1200"], ["South", '9"50']]);
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("turns tables into label: value points the outline can chart", () => {
    const text = tableToText("Q3 results", [["Metric", "Value"], ["Revenue", "$1.2M"], ["Active shops", "4812"], ["", ""]]);
    expect(text.split("\n")).toEqual(["Q3 results.", "- Revenue: $1.2M", "- Active shops: 4812"]);
    const wide = tableToText(undefined, [["Month", "Sales", "Returns"], ["Jan", "120", "4"]]);
    expect(wide).toBe("- Jan: Sales 120, Returns 4");
    expect(tableToText("Empty", [["", ""]])).toBe("");
  });

  it("names photos from file names", () => {
    expect(niceName("team_offsite-2026.jpg")).toBe("Team offsite 2026");
    expect(niceName("IMG_4821.JPG")).toBe("Photo");
  });
});

describe("upload checks", () => {
  it("identifies images by their bytes, not their name", () => {
    const pad = (a: number[]) => new Uint8Array([...a, ...new Array(16).fill(0)]);
    expect(sniffImage(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(pad([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(sniffImage(pad([0x47, 0x49, 0x46, 0x38]))).toBe("image/gif");
    expect(sniffImage(pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(sniffImage(new Uint8Array(4))).toBeNull();
  });
});

describe("export colour parsing", () => {
  it("reads the formats browsers return", () => {
    expect(parseColor("rgb(16, 17, 20)")).toEqual({ hex: "101114", alpha: 1 });
    expect(parseColor("rgba(6, 8, 12, 0.52)")).toEqual({ hex: "06080C", alpha: 0.52 });
    expect(parseColor("color(srgb 1 0.5 0 / 0.25)")).toEqual({ hex: "FF8000", alpha: 0.25 });
    expect(parseColor("rgba(0, 0, 0, 0)").alpha).toBe(0);
    expect(parseColor("transparent").alpha).toBe(0);
  });
});
