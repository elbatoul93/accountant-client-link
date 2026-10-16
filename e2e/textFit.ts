import type { Page } from "@playwright/test";

export type TextFitIssue = {
  kind: "touches-border" | "overflows" | "clipped" | "scrolls-sideways";
  tag: string;
  cls: string;
  text: string;
  detail: string;
};

/**
 * Scans what is on screen for text that touches or crosses the border of its own box: buttons, inputs, tabs,
 * badges, cards and anything else with a visible border or background. Text must keep a few pixels of room to
 * a visible left/right border (measured on the physical box, so RTL is covered too), must not stick out of the
 * box that holds it or be cut off by an ancestor that hides overflow, and a page or dialog must not scroll sideways.
 * Vertical gaps are not judged on glyph boxes (Arabic fonts have tall boxes); a box whose content is taller than
 * the box itself (by more than a few pixels of font-fallback jitter) is reported instead.
 */
export async function scanTextFit(page: Page): Promise<TextFitIssue[]> {
  return page.evaluate(() => {
    const MIN_X = 5; // px between text and a visible left/right border
    type Issue = { kind: "touches-border" | "overflows" | "clipped" | "scrolls-sideways"; tag: string; cls: string; text: string; detail: string };
    const out: Issue[] = [];
    const seen = new Set<string>();
    const n1 = (v: number) => Math.round(v * 10) / 10;

    const visibleColor = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return false;
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return p.length < 4 || p[3] > 0.05;
    };
    const sideLine = (cs: CSSStyleDeclaration, side: "left" | "right" | "top" | "bottom") =>
      parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0 &&
      cs.getPropertyValue(`border-${side}-style`) !== "none" &&
      visibleColor(cs.getPropertyValue(`border-${side}-color`));
    const classOf = (el: Element) => (el.getAttribute("class") ?? "").replace(/\s+/g, " ").slice(0, 120);
    const labelOf = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 50);
    const report = (kind: Issue["kind"], el: Element, detail: string) => {
      const r = el.getBoundingClientRect();
      const key = `${kind}|${el.tagName}|${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}|${labelOf(el).slice(0, 20)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ kind, tag: el.tagName, cls: classOf(el), text: labelOf(el), detail });
    };

    const hiddenByAncestor = (el: Element) => {
      for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return true;
        if (e.hasAttribute("data-radix-focus-guard")) return true;
      }
      return false;
    };
    const isDecor = (el: Element) => !!el.closest("[aria-hidden=true]") && !el.closest("[role=dialog]");

    // Boxes that are visible to the eye: a border or a background (text-gradient clips are not boxes).
    const boxes: Element[] = [];
    const boxSet = new Set<Element>();
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (el.closest("svg") || el.closest("[data-sonner-toaster]") || el.closest("style, script") || ["STYLE", "SCRIPT", "BR"].includes(el.tagName)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8 || hiddenByAncestor(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.backgroundClip === "text" || (cs as unknown as Record<string, string>).webkitBackgroundClip === "text") continue;
      const isField = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      const line = (["left", "right", "top", "bottom"] as const).some((s) => sideLine(cs, s));
      const bg = visibleColor(cs.backgroundColor) || cs.backgroundImage !== "none";
      if (isField || line || bg) { boxes.push(el); boxSet.add(el); }
    }
    const ownerOf = (n: Node) => {
      for (let e = n.parentElement; e; e = e.parentElement) if (boxSet.has(e)) return e;
      return null;
    };

    // Text rectangles per owning box.
    const textRects = new Map<Element, DOMRect[]>();
    const textNodes: { node: Text; rects: DOMRect[] }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!p || !(n.textContent ?? "").trim() || p.closest("style, script, svg") || hiddenByAncestor(p) || isDecor(p)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
      if (!rects.length) continue;
      textNodes.push({ node: n as Text, rects });
      const owner = ownerOf(n);
      if (!owner) continue;
      // Text inside a box that clips or scrolls (truncate, overflow-x-auto tables) counts only as far as that box shows it.
      let shown = rects;
      for (let e: Element | null = p; e && e !== owner; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (/auto|scroll/.test(cs.overflowX)) { shown = []; break; } // meant to scroll: not judged against the outer box
        if (cs.overflowX !== "visible") {
          const c = e.getBoundingClientRect();
          shown = rects.map((r) => new DOMRect(Math.max(r.left, c.left), r.top, Math.max(0, Math.min(r.right, c.right) - Math.max(r.left, c.left)), r.height));
          break;
        }
      }
      if (shown.length) textRects.set(owner, [...(textRects.get(owner) ?? []), ...shown]);
    }
    for (const svg of Array.from(document.body.querySelectorAll("svg"))) {
      if (hiddenByAncestor(svg) || isDecor(svg)) continue;
      const r = svg.getBoundingClientRect();
      const owner = ownerOf(svg);
      if (owner && r.width > 0) textRects.set(owner, [...(textRects.get(owner) ?? []), r]);
    }

    for (const el of boxes) {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const scrollsX = cs.overflowX !== "visible";

      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (!(el.value || el.placeholder) || ["checkbox", "radio", "file", "hidden", "range", "color"].includes((el as HTMLInputElement).type)) continue;
        const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight);
        if (padL < MIN_X || padR < MIN_X) report("touches-border", el, `padding left ${padL}px, right ${padR}px`);
        continue;
      }

      const rects = textRects.get(el);
      const hasText = (el.textContent ?? "").trim().length > 0;
      if (rects && hasText && !scrollsX) {
        const l = Math.min(...rects.map((r) => r.left)), r = Math.max(...rects.map((x) => x.right));
        const bl = sideLine(cs, "left") ? parseFloat(cs.borderLeftWidth) : 0;
        const br = sideLine(cs, "right") ? parseFloat(cs.borderRightWidth) : 0;
        const gapL = l - rect.left - bl, gapR = rect.right - r - br;
        const fullWidth = rect.width >= window.innerWidth - 1; // bands that run to the screen edge have no side edge to touch
        const visibleSides = cs.backgroundImage !== "none" || visibleColor(cs.backgroundColor) || sideLine(cs, "left") || sideLine(cs, "right");
        const note = `gap left ${n1(gapL)}px, right ${n1(gapR)}px in a ${Math.round(rect.width)}px box`;
        if (gapL < -0.5 || gapR < -0.5) report("overflows", el, `text sticks out: ${note}`);
        else if (!fullWidth && visibleSides && (gapL < MIN_X || gapR < MIN_X)) report("touches-border", el, note);
      }
      if (hasText && cs.overflowY === "visible" && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 6) {
        report("overflows", el, `content is ${el.scrollHeight}px tall in a ${el.clientHeight}px box`);
      }
    }

    // Text cut off by an ancestor that hides overflow.
    for (const { node, rects } of textNodes) {
      const l = Math.min(...rects.map((r) => r.left)), r = Math.max(...rects.map((x) => x.right));
      const t = Math.min(...rects.map((x) => x.top)), b = Math.max(...rects.map((x) => x.bottom));
      for (let e = node.parentElement; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (/auto|scroll/.test(cs.overflowX + cs.overflowY) || e.classList.contains("sr-only")) break;
        if (!/hidden|clip/.test(cs.overflowX + cs.overflowY) || cs.textOverflow === "ellipsis" || /line-clamp|-webkit-box/.test(cs.display + cs.webkitLineClamp)) continue;
        const er = e.getBoundingClientRect();
        const clipX = /hidden|clip/.test(cs.overflowX) && (l < er.left - 1 || r > er.right + 1);
        const clipY = /hidden|clip/.test(cs.overflowY) && (t < er.top - 1 && b < er.top + 2 ? true : b > er.bottom + 1 && t > er.bottom - 2 ? true : false);
        if (clipX || clipY) report("clipped", e, `text "${(node.textContent ?? "").trim().slice(0, 30)}" is cut off by this box (${Math.round(er.width)}x${Math.round(er.height)})`);
        break;
      }
    }

    // The page and dialogs must not scroll sideways; name the innermost element that sticks out.
    const deepestOutside = (root: Element, minX: number, maxX: number) => {
      const found: Element[] = [];
      for (const el of Array.from(root.querySelectorAll("*"))) {
        const r = el.getBoundingClientRect();
        if (!r.width || (r.left >= minX - 1 && r.right <= maxX + 1) || hiddenByAncestor(el) || isDecor(el) || el.closest("svg, [data-radix-popper-content-wrapper]")) continue;
        let clipped = false;
        for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
          if (getComputedStyle(p).overflowX !== "visible") { clipped = true; break; }
        }
        if (!clipped && getComputedStyle(el).position !== "fixed") found.push(el);
      }
      return found.filter((a) => !found.some((b) => b !== a && a.contains(b))).slice(0, 3);
    };
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) {
      for (const el of deepestOutside(document.body, 0, window.innerWidth)) {
        report("scrolls-sideways", el, `page is ${doc.scrollWidth}px wide in a ${window.innerWidth}px window; this element runs ${n1(el.getBoundingClientRect().left)}..${n1(el.getBoundingClientRect().right)}`);
      }
    }
    for (const dlg of Array.from(document.querySelectorAll("[role=dialog]"))) {
      if (hiddenByAncestor(dlg) || dlg.scrollWidth <= dlg.clientWidth + 1) continue;
      const dr = dlg.getBoundingClientRect();
      for (const el of deepestOutside(dlg, dr.left, dr.right)) {
        report("scrolls-sideways", el, `dialog scrolls sideways (${dlg.scrollWidth}px in ${dlg.clientWidth}px)`);
      }
    }
    return out;
  });
}
