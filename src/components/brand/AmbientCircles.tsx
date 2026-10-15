import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

/** Soft light-theme ambient blobs for page / dialog backgrounds. */
export function AmbientCircles({ subtle = false, className }: { subtle?: boolean; className?: string }) {
  const reduced = useReducedMotion();

  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden="true"
    >
      <Blob
        className="left-[-8%] top-[-6%] h-[42vmin] w-[42vmin] bg-coral/10"
        reduced={Boolean(reduced)}
        duration={18}
        subtle={subtle}
      />
      <Blob
        className="right-[-10%] top-[12%] h-[36vmin] w-[36vmin] bg-blue/18"
        reduced={Boolean(reduced)}
        duration={22}
        delay={1.2}
        subtle={subtle}
      />
      <Blob
        className="bottom-[-12%] left-[18%] h-[48vmin] w-[48vmin] bg-plum/12"
        reduced={Boolean(reduced)}
        duration={26}
        delay={0.6}
        subtle={subtle}
      />
      {!subtle ? (
        <>
          <Dot className="left-[14%] top-[32%] bg-coral/25" reduced={Boolean(reduced)} duration={8} />
          <Dot className="right-[22%] top-[18%] bg-blue/30" reduced={Boolean(reduced)} duration={10} delay={1} />
        </>
      ) : null}
    </div>
  );
}

function Blob({
  className,
  reduced,
  duration,
  delay = 0,
  subtle,
}: {
  className: string;
  reduced: boolean;
  duration: number;
  delay?: number;
  subtle: boolean;
}) {
  return (
    <motion.div
      className={cn("absolute rounded-full blur-3xl", className)}
      style={{ opacity: subtle ? 0.55 : 0.85 }}
      animate={
        reduced
          ? undefined
          : {
              x: [0, 24, -12, 0],
              y: [0, -18, 14, 0],
              scale: [1, 1.06, 0.97, 1],
            }
      }
      transition={reduced ? undefined : { duration, delay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function Dot({
  className,
  reduced,
  duration,
  delay = 0,
}: {
  className: string;
  reduced: boolean;
  duration: number;
  delay?: number;
}) {
  return (
    <motion.span
      className={cn("absolute h-2 w-2 rounded-full", className)}
      animate={reduced ? undefined : { y: [0, -10, 0], opacity: [0.35, 0.75, 0.35] }}
      transition={reduced ? undefined : { duration, delay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}
