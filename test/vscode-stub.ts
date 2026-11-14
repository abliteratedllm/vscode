// The parts of the "vscode" module that src/convert.ts uses at runtime, with the same shapes and
// enum values as @types/vscode.

export class LanguageModelTextPart {
  value: string;
  constructor(value: string) {
    this.value = value;
  }
}

export class LanguageModelToolCallPart {
  callId: string;
  name: string;
  input: object;
  constructor(callId: string, name: string, input: object) {
    this.callId = callId;
    this.name = name;
    this.input = input;
  }
}

export class LanguageModelToolResultPart {
  callId: string;
  content: unknown[];
  constructor(callId: string, content: unknown[]) {
    this.callId = callId;
    this.content = content;
  }
}

export class LanguageModelPromptTsxPart {
  value: unknown;
  constructor(value: unknown) {
    this.value = value;
  }
}

export const LanguageModelChatMessageRole = { User: 1, Assistant: 2 } as const;
export const LanguageModelChatToolMode = { Auto: 1, Required: 2 } as const;
