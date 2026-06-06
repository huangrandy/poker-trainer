import { useState, type ReactNode } from "react";
import { getLegalActions } from "../features/game-engine/engine";
import type { GameState } from "../features/game-engine/types";

type CoachMessage = {
    id: string;
    role: "user" | "assistant";
    text: string;
    summary?: string | null;
    recommendedAction?: string | null;
    confidence?: "low" | "medium" | "high" | null;
};

type CoachPanelProps = {
    gameState: GameState;
};

const COACH_SERVER_URL = import.meta.env.VITE_COACH_SERVER_URL ?? "http://127.0.0.1:8787";

function getDefaultPrompt(): string {
    return "What is the best play here?";
}

function createCoachRequest(gameState: GameState, prompt: string, sessionId: string | null) {
    const currentActor =
        gameState.players.find((player) => player.seatIndex === gameState.betting.currentActorSeatIndex) ?? null;
    const legalActions = currentActor ? getLegalActions(gameState, currentActor.id) : [];
    const heroPlayerId = gameState.players.find((player) => player.isHero)?.id ?? null;

    return {
        prompt,
        sessionId,
        snapshot: {
            handNumber: gameState.handNumber,
            street: gameState.street,
            heroPlayerId,
            legalActions,
            gameState,
        },
    };
}

function buildMessage(role: CoachMessage["role"], text: string, extras: Omit<CoachMessage, "id" | "role" | "text"> = {}) {
    return {
        id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role,
        text,
        ...extras,
    };
}

function SendIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="coach-panel__button-icon">
            <path d="M3.5 10l12.5-6-4.2 6 4.2 6-12.5-6z" fill="currentColor" />
        </svg>
    );
}

function ResetIcon() {
    return (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="coach-panel__button-icon">
            <path
                d="M10 4a6 6 0 1 1-4.24 10.24l1.1-1.1A4.5 4.5 0 1 0 10 5.5V8L6.5 4.5 10 1v3z"
                fill="currentColor"
            />
        </svg>
    );
}

function renderInlineMarkdown(text: string): ReactNode[] {
    const nodes: ReactNode[] = [];
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let lastIndex = 0;

    for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
        if (match.index > lastIndex) {
            nodes.push(text.slice(lastIndex, match.index));
        }

        const token = match[0];

        if (token.startsWith("**")) {
            nodes.push(
                <strong key={`${match.index}-bold`}>
                    {token.slice(2, -2)}
                </strong>
            );
        } else {
            nodes.push(
                <code key={`${match.index}-code`} className="coach-panel__inline-code">
                    {token.slice(1, -1)}
                </code>
            );
        }

        lastIndex = match.index + token.length;
    }

    if (lastIndex < text.length) {
        nodes.push(text.slice(lastIndex));
    }

    return nodes;
}

function renderMarkdownMessage(text: string): ReactNode {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const blocks: ReactNode[] = [];
    let paragraphLines: string[] = [];
    let listItems: string[] = [];

    function flushParagraph() {
        if (paragraphLines.length === 0) {
            return;
        }

        blocks.push(
            <p key={`coach-paragraph-${blocks.length}`} className="coach-panel__markdown-paragraph">
                {renderInlineMarkdown(paragraphLines.join(" "))}
            </p>
        );
        paragraphLines = [];
    }

    function flushList() {
        if (listItems.length === 0) {
            return;
        }

        blocks.push(
            <ul key={`coach-list-${blocks.length}`} className="coach-panel__markdown-list">
                {listItems.map((item, index) => (
                    <li key={`coach-list-item-${blocks.length}-${index}`}>
                        {renderInlineMarkdown(item)}
                    </li>
                ))}
            </ul>
        );
        listItems = [];
    }

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            flushParagraph();
            flushList();
            continue;
        }

        if (/^[-*]\s+/.test(line)) {
            flushParagraph();
            listItems.push(line.replace(/^[-*]\s+/, ""));
            continue;
        }

        if (/^[A-Za-z][A-Za-z0-9\s-]*:$/.test(line)) {
            flushParagraph();
            flushList();
            blocks.push(
                <p key={`coach-heading-${blocks.length}`} className="coach-panel__markdown-heading">
                    <strong>{renderInlineMarkdown(line)}</strong>
                </p>
            );
            continue;
        }

        flushList();
        paragraphLines.push(line);
    }

    flushParagraph();
    flushList();

    return <>{blocks}</>;
}

export function CoachPanel({ gameState }: CoachPanelProps) {
    const [prompt, setPrompt] = useState(getDefaultPrompt);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<CoachMessage[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleAskCoach() {
        const trimmedPrompt = prompt.trim();

        if (!trimmedPrompt || isSending) {
            return;
        }

        const userMessage = buildMessage("user", trimmedPrompt);
        setMessages((previous) => [...previous, userMessage]);
        setIsSending(true);
        setError(null);

        try {
            const response = await fetch(`${COACH_SERVER_URL}/api/coach`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify(createCoachRequest(gameState, trimmedPrompt, sessionId)),
            });

            const payload = (await response.json()) as
                | {
                      ok: true;
                      sessionId: string | null;
                      text: string;
                      summary: string;
                      recommendedAction: string | null;
                      confidence: "low" | "medium" | "high" | null;
                  }
                | {
                      ok: false;
                      error: string;
                  };

            if (!response.ok || !payload.ok) {
                throw new Error("error" in payload ? payload.error : "Coach request failed.");
            }

            setSessionId(payload.sessionId);
            setMessages((previous) => [
                ...previous,
                buildMessage("assistant", payload.text, {
                    summary: payload.summary,
                    recommendedAction: payload.recommendedAction,
                    confidence: payload.confidence,
                }),
            ]);
        } catch (requestError) {
            const message = requestError instanceof Error ? requestError.message : "Coach request failed.";
            setError(message);
        } finally {
            setIsSending(false);
        }
    }

    function handleResetCoach() {
        setSessionId(null);
        setMessages([]);
        setError(null);
    }

    return (
        <article className="panel coach-panel" aria-label="Coach panel">
            {/* <div className="panel__header">
                <h2>Coach</h2>
                <span>{sessionId ? `Thread ${sessionId.slice(0, 12)}` : "New session"}</span>
            </div> */}

            <div className="coach-panel__messages" aria-live="polite">
                {messages.length > 0 ? (
                    messages.map((message) => (
                        <article
                            key={message.id}
                            className={`coach-panel__message coach-panel__message--${message.role}`}
                        >
                            <div className="coach-panel__message-header">
                                <strong>{message.role === "user" ? "You" : "Coach"}</strong>
                                {message.role === "assistant" && message.confidence ? (
                                    <span>{message.confidence} confidence</span>
                                ) : null}
                            </div>
                            {message.role === "assistant" ? (
                                <div className="coach-panel__message-body">{renderMarkdownMessage(message.text)}</div>
                            ) : (
                                <p className="coach-panel__message-text">{message.text}</p>
                            )}
                            {message.summary ? <small>{message.summary}</small> : null}
                            {message.recommendedAction ? (
                                <small>Recommended action: {message.recommendedAction}</small>
                            ) : null}
                        </article>
                    ))
                ) : ""}
            </div>

            <div className="coach-panel__composer">
                <label className="coach-panel__prompt">
                    <span>Prompt</span>
                    <textarea
                        value={prompt}
                        rows={4}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder="Ask for a line, range note, or exploitative adjustment"
                    />
                </label>

                <div className="coach-panel__actions">
                    <button
                        className="coach-panel__icon-button coach-panel__icon-button--ghost"
                        type="button"
                        onClick={handleResetCoach}
                        aria-label="Reset coach"
                        title="Reset coach"
                    >
                        <ResetIcon />
                    </button>
                    <button
                        className="coach-panel__icon-button coach-panel__icon-button--primary"
                        type="button"
                        onClick={handleAskCoach}
                        disabled={isSending}
                        aria-label={isSending ? "Asking coach" : "Ask coach"}
                        title={isSending ? "Asking coach" : "Ask coach"}
                    >
                        {isSending ? <span className="coach-panel__spinner" aria-hidden="true" /> : <SendIcon />}
                    </button>
                </div>

                {error ? <p className="coach-panel__error">{error}</p> : null}
            </div>
        </article>
    );
}
