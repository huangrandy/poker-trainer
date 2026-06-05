"use client";

import type { CSSProperties, RefObject } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
    Card,
    HandRevealPlayerResult,
    PlayerState,
} from "../features/game-engine/types";

type StreetRevealState = {
    active: boolean;
    fromIndex: number;
};

type PokerTableSceneProps = {
    players: PlayerState[];
    board: Card[];
    potLabel: string;
    potAmount: number;
    showVillainHoleCards: boolean;
    showHandRevealResult: boolean;
    visibleActionByPlayerId: Map<string, string>;
    seatRoleBadgesByPlayerId: Map<string, Array<{
        label: "D" | "SB" | "BB";
        tone: "dealer" | "smallBlind" | "bigBlind";
    }>>;
    handResultByPlayerId: Map<string, HandRevealPlayerResult>;
    highlightedCardKeys: Set<string>;
    streetReveal: StreetRevealState;
    currentActorSeatIndex: number | null;
};

type SeatLayout = {
    kind: "center" | "side";
    flipX: boolean;
    flipY: boolean;
    actionNudgeY?: number;
};

type SeatSlot = {
    id: string;
    angle: number;
    label: string;
    layout: SeatLayout;
};

const DESIGN = {
    width: 1600,
    height: 980,
    centerX: 800,
    centerY: 490,
    tableWidth: 1380,
    tableHeight: 760,
    seatRadiusX: 708,
    seatRadiusY: 392,
    seatUnitWidth: 380,
    seatUnitHeight: 220,
    seatWidth: 328,
    seatHeight: 132,
    cardWidth: 100,
    cardHeight: 134,
    cardGap: 16,
    communityCardGap: 20,
} as const;

const SEATS: SeatSlot[] = [
    {
        id: "seat-1",
        angle: 90,
        label: "Seat 1",
        layout: { kind: "center", flipX: false, flipY: false },
    },
    {
        id: "seat-2",
        angle: 30,
        label: "Seat 2",
        layout: { kind: "side", flipX: true, flipY: true },
    },
    {
        id: "seat-3",
        angle: 330,
        label: "Seat 3",
        layout: { kind: "side", flipX: true, flipY: false },
    },
    {
        id: "seat-4",
        angle: 270,
        label: "Seat 4",
        layout: { kind: "center", flipX: false, flipY: true, actionNudgeY: -112 },
    },
    {
        id: "seat-5",
        angle: 210,
        label: "Seat 5",
        layout: { kind: "side", flipX: false, flipY: false },
    },
    {
        id: "seat-6",
        angle: 150,
        label: "Seat 6",
        layout: { kind: "side", flipX: false, flipY: true },
    },
];

const seatLocalRects = {
    center: {
        banner: { left: 22, top: 64, width: 336, height: 132 },
        cards: { left: 100, top: 0, width: 180, height: 118 },
        action: { left: 122, top: 230, width: 136, height: 40 },
    },
    side: {
        banner: { left: 20, top: 64, width: 340, height: 132 },
        cards: { left: 8, top: 6, width: 180, height: 118 },
        action: { left: 375, top: 50, width: 136, height: 40 },
    },
} as const;

function useMeasuredScale(containerRef: RefObject<HTMLElement | null>) {
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const node = containerRef.current;

        if (!node) {
            return;
        }

        const updateScale = () => {
            const availableWidth = Math.max(0, node.clientWidth);
            const availableHeight = Math.max(0, node.clientHeight);
            const widthScale = availableWidth / DESIGN.width;
            const heightScale = availableHeight / DESIGN.height;

            setScale(Math.min(1, widthScale, heightScale));
        };

        updateScale();

        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", updateScale);

            return () => window.removeEventListener("resize", updateScale);
        }

        const observer = new ResizeObserver(updateScale);
        observer.observe(node);

        return () => observer.disconnect();
    }, [containerRef]);

    return scale;
}

function pointOnEllipse(angle: number, radiusX: number, radiusY: number) {
    const radians = (angle * Math.PI) / 180;

    return {
        x: DESIGN.centerX + Math.cos(radians) * radiusX,
        y: DESIGN.centerY - Math.sin(radians) * radiusY,
    };
}

function scaledPoint(point: { x: number; y: number }, scale: number) {
    return {
        x: point.x * scale,
        y: point.y * scale,
    };
}

function mirrorRect(
    rect: { left: number; top: number; width: number; height: number },
    boxWidth: number,
    boxHeight: number,
    flipX: boolean,
    flipY: boolean
) {
    return {
        left: flipX ? boxWidth - rect.left - rect.width : rect.left,
        top: flipY ? boxHeight - rect.top - rect.height : rect.top,
        width: rect.width,
        height: rect.height,
    };
}

function getSuitSymbol(suit: string) {
    const suitSymbols: Record<string, string> = {
        clubs: "♣",
        diamonds: "♦",
        hearts: "♥",
        spades: "♠",
    };

    return suitSymbols[suit] ?? suit;
}

function getSuitTone(suit: string) {
    if (suit === "diamonds" || suit === "hearts") {
        return "red";
    }

    return "black";
}

function formatCardLabel(rank: string, suit: string) {
    return `${rank}${getSuitSymbol(suit)}`;
}

function getCardKey(card: Card) {
    return `${card.rank}:${card.suit}`;
}

function TableCard({
    rank,
    suit,
    style,
    cardRadius,
    scale = 1,
    isFaceDown = false,
    isHighlighted = false,
    isMuted = false,
}: {
    rank: string;
    suit: string;
    style?: CSSProperties;
    cardRadius: number;
    scale?: number;
    isFaceDown?: boolean;
    isHighlighted?: boolean;
    isMuted?: boolean;
}) {
    return (
        <span
            aria-label={formatCardLabel(rank, suit)}
            className={[
                "table-card",
                `table-card--${getSuitTone(suit)}`,
                isFaceDown ? "table-card--face-down" : "",
                isHighlighted ? "table-card--highlighted" : "",
                isMuted ? "table-card--muted" : "",
            ]
                .filter(Boolean)
                .join(" ")}
            style={{ ...style, "--card-radius": `${cardRadius}px` } as CSSProperties}
        >
            <span className="table-card__inner">
                <span className="table-card__face table-card__face--front">
                    <span className="table-card__rank" style={{ fontSize: `${1.9 * scale}rem` }}>
                        {rank}
                    </span>
                    <span className="table-card__suit" style={{ fontSize: `${1.6 * scale}rem` }}>
                        {getSuitSymbol(suit)}
                    </span>
                </span>
                <span className="table-card__face table-card__face--back" aria-hidden="true" />
            </span>
        </span>
    );
}

function buildSeatOccupants(players: PlayerState[]) {
    const hero = players.find((player) => player.isHero) ?? players[0] ?? null;
    const remainingPlayers = players.filter((player) => player.id !== hero?.id);
    const seatOrder = ["seat-4", "seat-1", "seat-2", "seat-3", "seat-5", "seat-6"];
    const occupants = new Map<string, PlayerState | null>();

    seatOrder.forEach((seatId, index) => {
        if (index === 0) {
            occupants.set(seatId, hero);
            return;
        }

        occupants.set(seatId, remainingPlayers[index - 1] ?? null);
    });

    return occupants;
}

const EMPTY_SEAT_BANNER_BACKGROUND = "rgba(15, 23, 42, 0.82)";
const EMPTY_SEAT_BANNER_BORDER = "rgba(148, 163, 184, 0.22)";
const EMPTY_SEAT_AVATAR_BACKGROUND = "rgba(148, 163, 184, 0.12)";
const EMPTY_SEAT_AVATAR_BORDER = "rgba(148, 163, 184, 0.2)";
const CURRENT_SEAT_BANNER_BACKGROUND =
    "linear-gradient(180deg, rgba(44, 35, 7, 0.98), rgba(18, 14, 4, 0.98))";
const MAX_TABLE_SCENE_WIDTH = 1100;

export function PokerTableScene({
    players,
    board,
    potLabel,
    potAmount,
    showVillainHoleCards,
    showHandRevealResult,
    visibleActionByPlayerId,
    seatRoleBadgesByPlayerId,
    handResultByPlayerId,
    highlightedCardKeys,
    streetReveal,
    currentActorSeatIndex,
}: PokerTableSceneProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const potRef = useRef<HTMLDivElement>(null);
    const scale = useMeasuredScale(containerRef);
    const [measuredPotHeight, setMeasuredPotHeight] = useState(0);
    const boardWidth = DESIGN.width * scale;
    const boardHeight = DESIGN.height * scale;
    const tableWidth = DESIGN.tableWidth * scale;
    const tableHeight = DESIGN.tableHeight * scale;
    const playerBySeatId = useMemo(() => buildSeatOccupants(players), [players]);

    useLayoutEffect(() => {
        const node = potRef.current;

        if (!node) {
            return;
        }

        setMeasuredPotHeight(node.getBoundingClientRect().height);
    }, [potAmount, potLabel, scale]);

    const seatPlacements = useMemo(() => {
        return SEATS.map((seat) => {
            const point = scaledPoint(
                pointOnEllipse(seat.angle, DESIGN.seatRadiusX, DESIGN.seatRadiusY),
                scale
            );

            return {
                ...seat,
                left: point.x,
                top: point.y,
            };
        });
    }, [scale]);

    const boardSlots = 5;
    const boardCardsWidth =
        boardSlots * DESIGN.cardWidth + (boardSlots - 1) * DESIGN.communityCardGap;
    const centerStackGap = 20 * scale;
    const cardRadius = 14 * scale;

    return (
        <div
            ref={containerRef}
            className="poker-table-scene"
            style={{
                position: "relative",
                width: `min(100%, ${MAX_TABLE_SCENE_WIDTH}px)`,
                aspectRatio: `${DESIGN.width} / ${DESIGN.height}`,
                height: "auto",
                display: "grid",
                placeItems: "center",
                overflow: "visible",
            }}
        >
            <div
                className=""
                style={{
                    position: "relative",
                    width: boardWidth,
                    height: boardHeight,
                }}
            >
                <div
                    style={{
                        ...styles.tableRim,
                        left: (boardWidth - tableWidth) / 2,
                        top: (boardHeight - tableHeight) / 2,
                        width: tableWidth,
                        height: tableHeight,
                        zIndex: 0,
                    }}
                >
                    <div style={styles.tableSurface} />
                </div>

                <div
                    className="poker-table-scene__center-stack"
                    style={{
                        ...styles.centerStack,
                        left: "50%",
                        top: boardHeight / 2,
                    }}
                >
                    <div
                        className="poker-table-scene__community"
                        style={{
                            ...styles.communityRow,
                            gap: 18 * scale,
                            width: boardCardsWidth * scale,
                        }}
                    >
                        {Array.from({ length: boardSlots }).map((_, index) => {
                            const card = board[index];
                            const isFaceDown = streetReveal.active && index >= streetReveal.fromIndex;
                            const isHighlighted =
                                card && showHandRevealResult ? highlightedCardKeys.has(getCardKey(card)) : false;
                            const isMuted = Boolean(
                                card &&
                                showHandRevealResult &&
                                showVillainHoleCards &&
                                highlightedCardKeys.size > 0 &&
                                !isHighlighted
                            );

                            return card ? (
                                <TableCard
                                    key={`${card.rank}-${card.suit}-${index}`}
                                    rank={card.rank}
                                    suit={card.suit}
                                    isFaceDown={isFaceDown}
                                    isHighlighted={isHighlighted}
                                    isMuted={isMuted}
                                    style={{
                                        width: DESIGN.cardWidth * scale,
                                        height: DESIGN.cardHeight * scale,
                                    }}
                                    cardRadius={cardRadius}
                                    scale={scale}
                                />
                            ) : (
                                <div
                                    key={`community-empty-${index}`}
                                    style={{
                                        ...styles.communityCard,
                                        width: DESIGN.cardWidth * scale,
                                        height: DESIGN.cardHeight * scale,
                                        borderRadius: `${cardRadius}px`,
                                    }}
                                />
                            );
                        })}
                    </div>

                    <div
                        ref={potRef}
                        className="poker-table-scene__pot"
                        style={{
                            ...styles.pot,
                            left: "50%",
                            transform: "translateX(-50%)",
                            top: -(measuredPotHeight || 85 * scale) - centerStackGap,
                            minWidth: 72 * scale,
                            padding: `${14 * scale}px ${26 * scale}px`,
                        }}
                    >
                        <span style={{ ...styles.potLabel, fontSize: `${11 * scale}px` }}>
                            {potLabel}
                        </span>
                        <span style={{ ...styles.potValue, fontSize: `${44 * scale}px` }}>
                            ${potAmount}
                        </span>
                    </div>
                </div>

                {seatPlacements.map((seat) => {
                    const player = playerBySeatId.get(seat.id) ?? null;
                    const isCurrentActor = player?.seatIndex === currentActorSeatIndex;
                    const revealResult = player ? handResultByPlayerId.get(player.id) ?? null : null;
                    const showRevealResult = Boolean(showVillainHoleCards && revealResult && showHandRevealResult);
                    const showCardsFaceUp = player?.isHero || showVillainHoleCards;
                    const shouldDimFoldedCards = Boolean(player && !showVillainHoleCards && player.status === "folded");
                    const localRects = seatLocalRects[seat.layout.kind];
                    const bannerRect = mirrorRect(
                        localRects.banner,
                        DESIGN.seatUnitWidth,
                        DESIGN.seatUnitHeight,
                        seat.layout.flipX,
                        seat.layout.flipY
                    );
                    const holeCardWidth = DESIGN.cardWidth;
                    const holeCardHeight = DESIGN.cardHeight;
                    const cardsWidth = holeCardWidth * 2 + DESIGN.cardGap;
                    const cardsRect = {
                        left: bannerRect.left + (bannerRect.width - cardsWidth) / 2,
                        top: bannerRect.top - holeCardHeight + 28,
                        width: cardsWidth,
                        height: holeCardHeight,
                    };
                    const actionRect = mirrorRect(
                        localRects.action,
                        DESIGN.seatUnitWidth,
                        DESIGN.seatUnitHeight,
                        seat.layout.flipX,
                        seat.layout.flipY
                    );
                    const actionLabel = player ? visibleActionByPlayerId.get(player.id) ?? null : null;
                    const seatRoleBadges = player ? seatRoleBadgesByPlayerId.get(player.id) ?? [] : [];
                    const seatOutcomeClass = showRevealResult
                        ? revealResult?.isWinner
                            ? "poker-table-scene__banner--winner"
                            : "poker-table-scene__banner--loser"
                        : "";

                    return (
                        <article
                            key={seat.id}
                            className="poker-table-scene__seat"
                            data-player-id={player?.id ?? undefined}
                            style={{
                                position: "absolute",
                                left: seat.left,
                                top: seat.top,
                                width: DESIGN.seatUnitWidth * scale,
                                height: DESIGN.seatUnitHeight * scale,
                                transform: "translate(-50%, -50%)",
                                overflow: "visible",
                                padding: 0,
                                background: "transparent",
                                border: "none",
                                boxShadow: "none",
                                minWidth: 0,
                                zIndex: 3,
                            }}
                        >
                            {player?.holeCards.length ? (
                                <div
                                    className="poker-table-scene__hole-cards"
                                    style={{
                                        position: "absolute",
                                        left: cardsRect.left * scale,
                                        top: cardsRect.top * scale,
                                        width: cardsRect.width * scale,
                                        display: "flex",
                                        gap: DESIGN.cardGap * scale,
                                        zIndex: 2,
                                    }}
                                >
                                    {player.holeCards.map((card, index) => (
                                        <TableCard
                                            key={`${player.id}-${card.rank}-${card.suit}-${index}`}
                                            rank={card.rank}
                                            suit={card.suit}
                                            isFaceDown={!showCardsFaceUp}
                                            isHighlighted={showRevealResult ? highlightedCardKeys.has(getCardKey(card)) : false}
                                            isMuted={
                                                showRevealResult
                                                    ? !highlightedCardKeys.has(getCardKey(card))
                                                    : shouldDimFoldedCards
                                            }
                                            style={{
                                                width: holeCardWidth * scale,
                                                height: holeCardHeight * scale,
                                            }}
                                            cardRadius={cardRadius}
                                            scale={scale}
                                        />
                                    ))}
                                </div>
                            ) : null}

                            {actionLabel ? (
                                <div
                                    className="poker-table-scene__action"
                                    style={{
                                        ...styles.actionTag,
                                        left: (actionRect.left + actionRect.width / 2) * scale,
                                        top:
                                            (actionRect.top + (seat.layout.actionNudgeY ?? 0)) * scale,
                                        transform: "translateX(-50%)",
                                        minHeight: actionRect.height * scale,
                                        zIndex: 3,
                                        fontSize: `${20 * scale}px`,
                                    }}
                                >
                                    {actionLabel}
                                </div>
                            ) : null}

                            <div
                                className={[
                                    "poker-table-scene__banner",
                                    isCurrentActor ? "poker-table-scene__banner--current" : "",
                                    seatOutcomeClass,
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                                style={{
                                    ...styles.seat,
                                    left: bannerRect.left * scale,
                                    top: bannerRect.top * scale,
                                    width: DESIGN.seatWidth * scale,
                                    height: DESIGN.seatHeight * scale,
                                    gap: 14 * scale,
                                    padding: 14 * scale,
                                    zIndex: 4,
                                    background: player
                                        ? isCurrentActor
                                            ? CURRENT_SEAT_BANNER_BACKGROUND
                                            : styles.seat.background
                                        : "linear-gradient(180deg, rgba(30, 41, 59, 0.92), rgba(15, 23, 42, 0.88))",
                                    borderColor: player ? styles.seat.border : EMPTY_SEAT_BANNER_BORDER,
                                    opacity: player
                                        ? showRevealResult && revealResult && !revealResult.isWinner
                                            ? 0.76
                                            : 1
                                        : 0.55,
                                    filter: player
                                        ? showRevealResult && revealResult && !revealResult.isWinner
                                            ? "grayscale(0.42) brightness(0.78)"
                                            : "none"
                                        : "grayscale(0.35) brightness(0.82)",
                                    boxShadow: player
                                        ? showRevealResult && revealResult?.isWinner
                                            ? "0 0 18px rgba(34, 197, 94, 0.34), 0 0 36px rgba(34, 197, 94, 0.18), 0 0 56px rgba(14, 165, 233, 0.22), 0 24px 48px rgba(34, 197, 94, 0.1)"
                                            : isCurrentActor
                                                ? "0 0 22px rgba(250, 204, 21, 0.34), 0 0 44px rgba(250, 204, 21, 0.18), 0 0 66px rgba(14, 165, 233, 0.14)"
                                                : "none"
                                        : "none",
                                    transform: isCurrentActor ? "translateY(-1px)" : "none",
                                }}
                            >
                                <div
                                    style={{
                                        ...styles.avatar,
                                        width: 74 * scale,
                                        height: 74 * scale,
                                        background: player
                                            ? styles.avatar.background
                                            : EMPTY_SEAT_AVATAR_BACKGROUND,
                                        borderColor: player ? styles.avatar.border : EMPTY_SEAT_AVATAR_BORDER,
                                    }}
                                />
                                <div style={styles.seatText}>
                                    {seatRoleBadges.length > 0 ? (
                                        <div
                                            className="poker-table-scene__seat-role-badges"
                                            style={{
                                                display: "flex",
                                                flexWrap: "wrap",
                                                gap: 6 * scale,
                                            }}
                                        >
                                            {seatRoleBadges.map((badge) => (
                                                <span
                                                    key={badge.label}
                                                    className={[
                                                        "poker-table-scene__seat-role-badge",
                                                        `poker-table-scene__seat-role-badge--${badge.tone}`,
                                                    ].join(" ")}
                                                    style={{
                                                        fontSize: `${11 * scale}px`,
                                                        padding: `${4 * scale}px ${8 * scale}px`,
                                                    }}
                                                >
                                                    {badge.label}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                    <div
                                        style={{
                                            ...styles.seatLabel,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8 * scale,
                                            flexWrap: "wrap",
                                            fontSize: `${30 * scale}px`,
                                        }}
                                    >
                                        <span>{player?.name ?? seat.label}</span>
                                        {isCurrentActor ? (
                                            <span
                                                className="poker-table-scene__current-badge"
                                                style={{
                                                    ...styles.currentBadge,
                                                    fontSize: `${15 * scale}px`,
                                                }}
                                            >
                                                Current
                                            </span>
                                        ) : null}
                                    </div>
                                    <div
                                        style={{
                                            ...styles.seatStack,
                                            fontSize: `${24 * scale}px`,
                                        }}
                                    >
                                        {player ? `$${player.stack}` : "Empty seat"}
                                    </div>
                                </div>
                                {showRevealResult && revealResult ? (
                                    <div
                                        className="poker-table-scene__hand-tooltip"
                                        tabIndex={0}
                                        aria-label={`${player?.name ?? seat.label} hand: ${revealResult.handLabel}`}
                                        style={{
                                            top: 10 * scale,
                                            right: 10 * scale,
                                            fontSize: `${11 * scale}px`,
                                        }}
                                    >
                                        <span className="poker-table-scene__hand-tooltip-label">
                                            {revealResult.handLabel}
                                        </span>
                                        <div
                                            className="poker-table-scene__hand-tooltip-content"
                                            style={{
                                                width: 176 * scale,
                                                fontSize: `${11 * scale}px`,
                                            }}
                                        >
                                            {player?.name ?? seat.label}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}

const styles = {
    tableRim: {
        position: "absolute" as const,
        borderRadius: "9999px",
        background: "#2e2e2e",
        boxShadow: "none",
        padding: "14px",
        zIndex: 1,
    },
    tableSurface: {
        position: "relative" as const,
        width: "100%",
        height: "100%",
        borderRadius: "9999px",
        background:
            "radial-gradient(circle at 50% 44%, rgba(70, 154, 96, 0.24) 0%, rgba(27, 103, 56, 0.94) 50%, rgba(18, 74, 41, 0.99) 74%, rgba(10, 48, 26, 1) 100%), linear-gradient(180deg, rgba(78, 160, 101, 0.12), rgba(4, 30, 16, 0.08))",
        boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 -26px 60px rgba(4, 32, 18, 0.22)",
    },
    pot: {
        position: "absolute" as const,
        borderRadius: "18px",
        background: "rgba(0,0,0,0.22)",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "inline-grid",
        placeItems: "center",
        alignContent: "center",
        gap: "2px",
        zIndex: 2,
        width: "fit-content",
        minWidth: 0,
        boxSizing: "border-box" as const,
    },
    potLabel: {
        letterSpacing: "0.28em",
        textTransform: "uppercase" as const,
        color: "rgba(255,255,255,0.62)",
    },
    potValue: {
        fontWeight: 700,
        lineHeight: 1,
    },
    centerStack: {
        position: "absolute" as const,
        transform: "translate(-50%, -50%)",
        display: "inline-block",
        width: "fit-content",
        height: "fit-content",
        zIndex: 2,
        overflow: "visible",
    },
    communityRow: {
        display: "flex",
        padding: 0,
        minHeight: 0,
        alignItems: "center",
        justifyContent: "center",
    },
    communityCard: {
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.24)",
        background:
            "linear-gradient(180deg, rgba(15, 23, 42, 0.16), rgba(15, 23, 42, 0.08))",
        boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 0 0 2px rgba(255,255,255,0.03)",
    },
    actionTag: {
        position: "absolute" as const,
        borderRadius: "9999px",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(0,0,0,0.2)",
        color: "rgba(255,255,255,0.82)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px 12px",
        boxSizing: "border-box" as const,
        lineHeight: 1,
        letterSpacing: "0.06em",
        textTransform: "uppercase" as const,
        whiteSpace: "nowrap",
    },
    seat: {
        position: "absolute" as const,
        borderRadius: "18px",
        background: "linear-gradient(180deg, rgba(14, 17, 24, 0.98), rgba(7, 8, 12, 0.98))",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "none",
        display: "flex",
        alignItems: "center",
    },
    avatar: {
        flex: "0 0 auto",
        borderRadius: "9999px",
        background: "rgba(255,255,255,0.1)",
        border: "1px solid rgba(255,255,255,0.12)",
    },
    seatText: {
        display: "grid",
        gap: "4px",
        minWidth: 0,
    },
    seatLabel: {
        fontWeight: 600,
        letterSpacing: "-0.02em",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    seatStack: {
        color: "rgba(255,255,255,0.8)",
    },
    currentBadge: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4px 10px",
        borderRadius: "9999px",
        background: "rgba(250, 204, 21, 0.14)",
        border: "1px solid rgba(250, 204, 21, 0.3)",
        color: "rgba(253, 224, 71, 0.95)",
        letterSpacing: "0.08em",
        textTransform: "uppercase" as const,
        whiteSpace: "nowrap",
        lineHeight: 1,
    },
} satisfies Record<string, CSSProperties>;
