import {
    motion,
    type MotionStyle,
    useAnimationControls,
    useMotionValue,
    useReducedMotion,
    useSpring,
    useTransform,
} from "framer-motion";
import type { CSSProperties, MouseEvent, PointerEvent } from "react";

export type TableCardProps = {
    rank: string;
    suit: string;
    style?: CSSProperties;
    cardRadius?: number;
    scale?: number;
    isFaceDown?: boolean;
    isHighlighted?: boolean;
    isMuted?: boolean;
};

type FlickTuning = {
    force: number;
    snapBack: number;
    damping: number;
    cornerBias: number;
};

const defaultFlickTuning: FlickTuning = {
    force: 1.05,
    snapBack: 320,
    damping: 16,
    cornerBias: 1.15,
};

function getSuitSymbol(suit: string) {
    const suitSymbols: Record<string, string> = {
        clubs: "♣",
        diamonds: "♦",
        hearts: "♥",
        spades: "♠",
    };

    return suitSymbols[suit] ?? suit;
}

function formatCardLabel(rank: string, suit: string) {
    return `${rank}${getSuitSymbol(suit)}`;
}

function getNeonPalette(suit: string) {
    switch (suit) {
        case "hearts":
            return {
                tone: "pink",
                textColor: "#ff4d8d",
                glowColor: "rgba(255, 93, 155, 0.4)",
                softGlowColor: "rgba(255, 93, 155, 0.48)",
            };
        case "diamonds":
            return {
                tone: "purple",
                textColor: "#4a3f7a",
                glowColor: "rgba(184, 140, 255, 0.95)",
                softGlowColor: "rgba(184, 140, 255, 0.45)",
            };
        case "spades":
            return {
                tone: "teal",
                textColor: "#15b3a7",
                glowColor: "rgba(21, 179, 167, 0.6)",
                softGlowColor: "rgba(21, 179, 167, 0.46)",
            };
        case "clubs":
            return {
                tone: "neon-green",
                textColor: "#8cbd0b",
                glowColor: "rgba(140, 189, 11, 0.92)",
                softGlowColor: "rgba(140, 189, 11, 0.44)",
            };
        default:
            return {
                tone: "purple",
                textColor: "#b57cff",
                glowColor: "rgba(181, 124, 255, 0.95)",
                softGlowColor: "rgba(181, 124, 255, 0.45)",
            };
    }
}

export function TableCard({
    rank,
    suit,
    style,
    cardRadius = 16,
    scale = 1,
    isFaceDown = false,
    isHighlighted = false,
    isMuted = false,
}: TableCardProps) {
    const prefersReducedMotion = useReducedMotion();
    const flickControls = useAnimationControls();
    const neon = getNeonPalette(suit);
    const xPercent = useMotionValue(0);
    const yPercent = useMotionValue(0);
    const hoverScale = useSpring(1, { stiffness: 260, damping: 24 });

    const hoverTilt = prefersReducedMotion ? 0 : 8;
    const rotateX = useTransform(
        yPercent,
        [-0.5, 0.5],
        [`${hoverTilt}deg`, `-${hoverTilt}deg`]
    );
    const rotateY = useTransform(
        xPercent,
        [-0.5, 0.5],
        [`-${hoverTilt}deg`, `${hoverTilt}deg`]
    );

    const updatePointer = (event: PointerEvent<HTMLSpanElement>) => {
        if (prefersReducedMotion) {
            return;
        }

        const { width, height, left, top } = event.currentTarget.getBoundingClientRect();
        const currentX = event.clientX - left;
        const currentY = event.clientY - top;

        xPercent.set(currentX / width - 0.5);
        yPercent.set(currentY / height - 0.5);
    };

    const resetPointer = () => {
        xPercent.set(0);
        yPercent.set(0);
        hoverScale.set(1);
    };

    const triggerFlick = async (event: MouseEvent<HTMLSpanElement>) => {
        if (prefersReducedMotion) {
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const hasPointerCoords = event.clientX !== 0 || event.clientY !== 0;
        const currentX = hasPointerCoords ? event.clientX - rect.left : rect.width / 2;
        const currentY = hasPointerCoords ? event.clientY - rect.top : rect.height / 2;
        const xRatio = currentX / rect.width - 0.5;
        const yRatio = currentY / rect.height - 0.5;
        const cornerWeight = 0.85 + defaultFlickTuning.cornerBias * 0.55;
        const pushRotateX = Math.max(
            -18,
            Math.min(18, -yRatio * 28 * defaultFlickTuning.force * cornerWeight)
        );
        const pushRotateY = Math.max(
            -18,
            Math.min(18, xRatio * 28 * defaultFlickTuning.force * cornerWeight)
        );

        await flickControls.start({
            rotateX: pushRotateX,
            rotateY: pushRotateY,
            y: 0,
            scale: 1,
            transition: {
                duration: 0.035,
                ease: "easeOut",
            },
        });

        await flickControls.start({
            rotateX: 0,
            rotateY: 0,
            y: 0,
            scale: 1,
            transition: {
                type: "spring",
                stiffness: defaultFlickTuning.snapBack,
                damping: defaultFlickTuning.damping,
                mass: 0.82,
            },
        });
    };

    return (
        <motion.span
            aria-label={formatCardLabel(rank, suit)}
            className={[
                "table-card",
                `table-card--${neon.tone}`,
                isFaceDown ? "table-card--face-down" : "",
                isHighlighted ? "table-card--highlighted" : "",
                isMuted ? "table-card--muted" : "",
            ]
                .filter(Boolean)
                .join(" ")}
            onPointerEnter={(event) => {
                updatePointer(event);

                if (!prefersReducedMotion) {
                    hoverScale.set(1.035);
                }
            }}
            onPointerMove={updatePointer}
            onPointerLeave={resetPointer}
            onClick={triggerFlick}
            style={
                {
                    ...style,
                    "--card-radius": `${cardRadius}px`,
                    perspective: "1000px",
                    transformStyle: "preserve-3d",
                    rotateX,
                    rotateY,
                    scale: hoverScale,
                } as MotionStyle
            }
        >
            <motion.div
                animate={flickControls}
                initial={false}
                style={{
                    position: "absolute",
                    inset: 0,
                    transformOrigin: "50% 50%",
                    transformStyle: "preserve-3d",
                }}
            >
                <span className="table-card__inner">
                    <span className="table-card__face table-card__face--front">
                        <span
                            className="table-card__rank"
                            style={{
                                fontSize: `${2.1 * scale}rem`,
                                color: neon.textColor,
                                textShadow: `0 0 2px rgba(255,255,255,0.9), 0 0 10px ${neon.softGlowColor}, 0 0 22px ${neon.glowColor}`,
                            }}
                        >
                            {rank}
                        </span>
                        <span
                            className="table-card__suit"
                            style={{
                                fontSize: `${1.7 * scale}rem`,
                                color: neon.textColor,
                                textShadow: `0 0 2px rgba(255,255,255,0.9), 0 0 10px ${neon.softGlowColor}, 0 0 22px ${neon.glowColor}`,
                            }}
                        >
                            {getSuitSymbol(suit)}
                        </span>
                    </span>
                    <span className="table-card__face table-card__face--back" aria-hidden="true" />
                </span>
            </motion.div>
        </motion.span>
    );
}
