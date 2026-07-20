import { IpcError } from "../ipc/client";

export function errorMessage(error: unknown): string {
  if (error instanceof IpcError) {
    return error.payload.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "发生未知错误。";
}
