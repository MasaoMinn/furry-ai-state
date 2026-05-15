import net from "node:net";
import * as vscode from "vscode";
import {
  parseCompanionStateEvent,
  type CompanionConnectionEvent,
  type CompanionStateEvent
} from "./protocol";

export class CompanionIpcClient implements vscode.Disposable {
  private socket: net.Socket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private disposed = false;
  private buffer = "";
  private reconnectAttempts = 0;

  private readonly stateEmitter =
    new vscode.EventEmitter<CompanionStateEvent>();
  private readonly connectionEmitter =
    new vscode.EventEmitter<CompanionConnectionEvent>();

  readonly onDidChangeState = this.stateEmitter.event;
  readonly onDidChangeConnection = this.connectionEmitter.event;

  constructor(
    private readonly ipcPath: string,
    private readonly reconnectDelayMs: number,
    private readonly output: vscode.OutputChannel
  ) {}

  start(): void {
    this.disposed = false;
    this.connect();
  }

  reconnect(): void {
    this.clearReconnectTimer();
    this.socket?.destroy();
    this.socket = null;
    this.buffer = "";
    this.reconnectAttempts = 0;
    this.connect();
  }

  private connect(): void {
    if (this.disposed || this.socket) {
      return;
    }

    this.connectionEmitter.fire({
      status: "connecting",
      detail: this.ipcPath
    });

    const socket = net.createConnection(this.ipcPath);
    this.socket = socket;

    socket.setEncoding("utf8");

    socket.on("connect", () => {
      this.reconnectAttempts = 0;
      this.output.appendLine(`Connected to AI Companion IPC: ${this.ipcPath}`);
      this.connectionEmitter.fire({
        status: "connected",
        detail: this.ipcPath
      });
    });

    socket.on("data", (chunk) => {
      this.handleChunk(String(chunk));
    });

    socket.on("error", (error) => {
      this.output.appendLine(`AI Companion IPC error: ${error.message}`);
    });

    socket.on("close", () => {
      if (this.socket === socket) {
        this.socket = null;
      }

      if (!this.disposed) {
        this.connectionEmitter.fire({
          status: "disconnected",
          detail: this.ipcPath
        });
        this.scheduleReconnect();
      }
    });
  }

  private handleChunk(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const event = parseCompanionStateEvent(JSON.parse(trimmed));
        if (event) {
          this.stateEmitter.fire(event);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.output.appendLine(`Invalid AI Companion IPC payload: ${message}`);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.disposed) {
      return;
    }

    const delay = Math.min(
      this.reconnectDelayMs * 2 ** this.reconnectAttempts,
      30000
    );
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clearReconnectTimer();
    this.socket?.destroy();
    this.socket = null;
    this.stateEmitter.dispose();
    this.connectionEmitter.dispose();
  }
}
