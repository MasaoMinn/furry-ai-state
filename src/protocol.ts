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
    return {
      type: "state",
      state: value.state
    };
  }

  return null;
}
