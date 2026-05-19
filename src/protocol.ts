export const agentStates = [
  "idle",
  "thinking",
  "planning",
  "coding",
  "testing",
  "debugging",
  "success",
  "error"
] as const;

export type AgentState = (typeof agentStates)[number];

export interface CompanionStateEvent {
  type: "state";
  state: AgentState;
  message?: string;
  file?: string;
}

export type CompanionConnectionStatus =
  | "disabled"
  | "connecting"
  | "connected"
  | "disconnected";

export interface CompanionConnectionEvent {
  status: CompanionConnectionStatus;
  detail?: string;
}

export function isAgentState(value: unknown): value is AgentState {
  return typeof value === "string" && agentStates.includes(value as AgentState);
}

export function parseCompanionStateEvent(value: unknown): CompanionStateEvent | null {
  if (
    value &&
    typeof value === "object" &&
    "type" in value &&
    "state" in value &&
    value.type === "state" &&
    isAgentState(value.state)
  ) {
    const message = optionalText(value, "message");
    const file = optionalText(value, "file");

    return {
      type: "state",
      state: value.state,
      ...(message ? { message } : {}),
      ...(file ? { file } : {})
    };
  }

  return null;
}

function optionalText(
  value: object,
  key: "message" | "file"
): string | undefined {
  if (!(key in value)) {
    return undefined;
  }

  const nextValue = (value as Record<string, unknown>)[key];
  if (typeof nextValue !== "string") {
    return undefined;
  }

  const trimmed = nextValue.trim();
  return trimmed || undefined;
}
