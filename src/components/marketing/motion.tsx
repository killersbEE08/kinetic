"use client";

// Motion building blocks for the landing page (motion/react). Rules from docs/06 §4: motion
// happens on entrance, on scroll, or on interaction, never on idle; headlines are readable on
// first paint (they move into place, they don't fade in); reduced motion turns all of it off.
import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";

export const EASE = [0.2, 0, 0, 1] as const;
export const SPRING = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } as const;

/** Headline words that settle into place on load. Visible from the first frame. */
export function RiseWords({ text, accent, className = "" }: { text: string; accent?: string; className?: string }) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((w, i) => {
        const isAccent = accent && w.replace(/[^\w]/g, "") === accent;
        const inner = isAccent ? <span className="m-accent">{w}</span> : w;
        return (
          <span key={i} className="inline-block whitespace-pre">
            {reduce ? (
              inner
            ) : (
              <motion.span className="inline-block" initial={{ y: "0.42em", rotate: 2 }} animate={{ y: 0, rotate: 0 }} transition={{ ...SPRING, delay: 0.04 * i }}>
                {inner}
              </motion.span>
            )}
            {i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </span>
  );
}

/** Fades and rises once when it first scrolls into view. Use for one thing per section. */
export function Reveal({ children, className = "", delay = 0, as = "div" }: { children: ReactNode; className?: string; delay?: number; as?: "div" | "li" | "section" }) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  if (reduce) return <Tag className={className}>{children}</Tag>;
  return (
    <Tag className={className} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -12% 0px" }} transition={{ duration: 0.7, ease: EASE, delay }}>
      {children}
    </Tag>
  );
}

/** Children enter one after another (cards in a grid). */
export function Stagger({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: "0px 0px -10% 0px" }} variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}>
      {children}
    </motion.div>
  );
}
export const staggerItem = { hidden: { opacity: 0, y: 24, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: EASE } } };

/** A product window that lies back in 3D and stands up as you scroll to it. */
export function ScrollTilt({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center 55%"] });
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.6 });
  const rotateX = useTransform(p, [0, 1], [24, 0]);
  const scale = useTransform(p, [0, 1], [0.86, 1]);
  const y = useTransform(p, [0, 1], [40, 0]);
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <div ref={ref} className={className} style={{ perspective: 1400 }}>
      <motion.div style={{ rotateX, scale, y, transformOrigin: "50% 0%" }}>{children}</motion.div>
    </div>
  );
}

/** Follows the pointer with a small 3D tilt (interaction only; flat at rest). */
export function TiltCard({ children, className = "", max = 5 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(0, { stiffness: 220, damping: 22 });
  const ry = useSpring(0, { stiffness: 220, damping: 22 });
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <div style={{ perspective: 900 }} className={className}>
      <motion.div
        ref={ref}
        className="h-full"
        style={{ rotateX: rx, rotateY: ry }}
        whileHover={{ y: -4 }}
        transition={SPRING}
        onPointerMove={(e) => {
          const r = ref.current?.getBoundingClientRect();
          if (!r || e.pointerType !== "mouse") return;
          ry.set(((e.clientX - r.left) / r.width - 0.5) * 2 * max);
          rx.set(-((e.clientY - r.top) / r.height - 0.5) * 2 * max);
        }}
        onPointerLeave={() => {
          rx.set(0);
          ry.set(0);
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * A row of cards that keeps gliding sideways in a seamless loop. Pauses on hover and keyboard
 * focus; with reduced motion it becomes a normal sideways-scrollable row instead.
 */
export function ScrollRow({ children, direction = 1, seconds = 70, className = "" }: { children: ReactNode; direction?: 1 | -1; seconds?: number; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <div className={`overflow-x-auto overscroll-x-contain ${className}`}>
        <div className="flex w-max gap-5 px-6">{children}</div>
      </div>
    );
  }
  return (
    <div className={`m-marquee-wrap overflow-hidden ${className}`}>
      <div className="m-marquee" data-dir={direction} style={{ animationDuration: `${seconds}s` }}>
        <div className="flex flex-none gap-5 pr-5">{children}</div>
        {/* Second copy makes the loop seamless; hidden from screen readers and tab order. */}
        <div className="flex flex-none gap-5 pr-5" aria-hidden="true" inert>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Maps a progress value to 0..1 inside [from, to]. */
export function useSegment(p: MotionValue<number>, from: number, to: number) {
  return useTransform(p, [from, to], [0, 1], { clamp: true });
}
