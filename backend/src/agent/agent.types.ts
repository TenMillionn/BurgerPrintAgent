import { ConversationTurn, Language } from '../session/session.types';

/** Chunk phát ra từ AgentRuntime.run() → map sang SSE event (data-model: AgentChunk). */
export type AgentChunkType =
  | 'token'
  | 'thinking'
  | 'tool'
  | 'action'
  | 'buttons'
  | 'upload_card'
  | 'error'
  | 'done';

export interface AgentTokenChunk {
  type: 'token';
  text: string;
}
/** Suy luận của model (reasoning) — hiển thị trong timeline "thinking", không lưu vào reply. */
export interface AgentThinkingChunk {
  type: 'thinking';
  text: string;
}
export interface AgentToolResultItem {
  title: string;
  meta?: string; // thông tin phụ hiển thị bên phải (giá, màu/size, domain...)
}
export interface AgentToolChunk {
  type: 'tool';
  id?: string; // toolCallId để FE khớp start/end (tool có thể chạy song song)
  name: string;
  status: 'running' | 'done';
  count?: number; // tổng số kết quả tool trả về
  results?: AgentToolResultItem[]; // vài kết quả đầu để show trong timeline
}
export interface AgentErrorChunk {
  type: 'error';
  message: string;
  code: string;
}
export interface AgentDoneChunk {
  type: 'done';
  finishReason: string;
}
/**
 * UI action signal for the frontend (e.g. open the login modal or the API-key
 * settings panel). Emitted when an order-flow gate is blocked. Transient — not
 * persisted as part of the assistant reply.
 */
export interface AgentActionChunk {
  type: 'action';
  action: 'login_required' | 'apikey_required';
  message?: string;
}
/** A clickable button rendered in the chat. */
export interface AgentButton {
  label: string;
  /** message = clicking sends `value` back as a chat message; link = opens `value` in a new tab. */
  action: 'message' | 'link';
  value: string;
}
/** Render inline buttons attached to the current agent turn (e.g. "Open dashboard"). */
export interface AgentButtonsChunk {
  type: 'buttons';
  buttons: AgentButton[];
}
/** Render an in-chat print-file upload card for a side, attached to the current turn. */
export interface AgentUploadCardChunk {
  type: 'upload_card';
  side: 'front' | 'back';
  ref: string; // upload-<sessionId>-<turn>-<side>
}

export type AgentChunk =
  | AgentTokenChunk
  | AgentThinkingChunk
  | AgentToolChunk
  | AgentActionChunk
  | AgentButtonsChunk
  | AgentUploadCardChunk
  | AgentErrorChunk
  | AgentDoneChunk;

/** Đầu vào một lượt cho runtime. */
export interface AgentRunInput {
  sessionId: string;
  message: string;
  language: Language | null;
  history: ConversationTurn[];
  /** System prompt custom do seller chỉnh (rỗng → dùng mặc định). */
  systemPrompt?: string;
  /** Model id override cho phiên (rỗng → dùng LLM_MODEL trong env). */
  model?: string;
  /** Authenticated seller id (auth path). Undefined for guests. */
  userId?: string;
  /** True on the guest (ephemeral, login-free) chat path. */
  isGuest?: boolean;
}
