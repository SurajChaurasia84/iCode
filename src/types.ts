export interface ICodeConfig {
  enabled: boolean;
  model: string;
  debounceDelay: number;
  maxTokens: number;
  temperature: number;
  multiline: boolean;
  maxPrefixLines: number;
  maxSuffixLines: number;
}

export interface CompletionContextData {
  prefix: string;
  suffix: string;
  languageId: string;
  fileName: string;
  linePrefix: string;
  currentLineText: string;
}
