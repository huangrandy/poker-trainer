import type { CSSProperties } from "react";

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
                    <span className="table-card__rank" style={{ fontSize: `${2.1 * scale}rem` }}>
                        {rank}
                    </span>
                    <span className="table-card__suit" style={{ fontSize: `${1.7 * scale}rem` }}>
                        {getSuitSymbol(suit)}
                    </span>
                </span>
                <span className="table-card__face table-card__face--back" aria-hidden="true" />
            </span>
        </span>
    );
}
