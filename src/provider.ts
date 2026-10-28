import * as vscode from 'vscode';
import { CompletionCache } from './cache';
import { GeminiClient } from './gemini';
import { SecretManager } from './secretManager';
import { StatusBarManager } from './statusBar';
import { CompletionContextData, ICodeConfig } from './types';

export class ICodeInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private geminiClient: GeminiClient;
  private cache: CompletionCache;
  private secretManager: SecretManager;
  private statusBar: StatusBarManager;
  private debounceTimer: NodeJS.Timeout | undefined;
  private activeAbortController: AbortController | undefined;

  constructor(
    secretManager: SecretManager,
    statusBar: StatusBarManager
  ) {
    this.geminiClient = new GeminiClient();
    this.cache = new CompletionCache(150, 5 * 60 * 1000); // 150 items, 5 min TTL
    this.secretManager = secretManager;
    this.statusBar = statusBar;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionList | vscode.InlineCompletionItem[] | undefined> {
    const config = this.getConfig();

    if (!config.enabled) {
      this.statusBar.setState('disabled');
      return undefined;
    }

    const apiKey = await this.secretManager.getApiKey();
    if (!apiKey) {
      this.statusBar.setState('noKey');
      return undefined;
    }

    // Skip git commits, outputs, scminput
    if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled') {
      return undefined;
    }

    // Check cancellation before debounce
    if (token.isCancellationRequested) {
      return undefined;
    }

    // Debounce wait
    const debounced = await this.waitForDebounce(config.debounceDelay, token);
    if (!debounced || token.isCancellationRequested) {
      return undefined;
    }

    // Build context
    const contextData = this.buildContext(document, position, config);
    if (!contextData.prefix && !contextData.suffix) {
      return undefined;
    }

    // Check cache
    const cacheKey = CompletionCache.generateKey(
      document.uri.fsPath,
      contextData.prefix,
      contextData.suffix
    );
    const cachedCompletion = this.cache.get(cacheKey);
    if (cachedCompletion) {
      return [new vscode.InlineCompletionItem(cachedCompletion, new vscode.Range(position, position))];
    }

    // Cancel previous request if still running
    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
    const abortController = new AbortController();
    this.activeAbortController = abortController;

    const cancelListener = token.onCancellationRequested(() => {
      abortController.abort();
    });

    try {
      this.statusBar.setState('loading');

      const completion = await this.geminiClient.getCompletion(
        apiKey,
        contextData,
        config,
        abortController.signal
      );

      if (token.isCancellationRequested || !completion || completion.trim().length === 0) {
        this.statusBar.setState('ready');
        return undefined;
      }

      // Store in cache
      this.cache.set(cacheKey, completion);
      this.statusBar.setState('ready');

      const item = new vscode.InlineCompletionItem(
        completion,
        new vscode.Range(position, position)
      );

      return [item];
    } catch (err: any) {
      if (err.name === 'AbortError' || token.isCancellationRequested) {
        // Normal cancellation
        return undefined;
      }

      console.error('iCode Gemini Error:', err);
      const message = err.message || 'Unknown error';

      if (message.includes('API_KEY_INVALID') || message.includes('API key not valid')) {
        this.statusBar.setState('noKey');
        vscode.window.showErrorMessage(
          'iCode: Invalid Google Gemini API Key. Please update it using the "iCode: Set Gemini API Key" command.',
          'Set API Key'
        ).then(selection => {
          if (selection === 'Set API Key') {
            vscode.commands.executeCommand('icode.setApiKey');
          }
        });
      } else if (message.includes('RESOURCE_EXHAUSTED') || message.includes('quota')) {
        this.statusBar.setState('error', 'Gemini Quota Exceeded');
      } else {
        this.statusBar.setState('error', message);
      }

      return undefined;
    } finally {
      cancelListener.dispose();
      if (this.activeAbortController === abortController) {
        this.activeAbortController = undefined;
      }
    }
  }

  private waitForDebounce(delayMs: number, token: vscode.CancellationToken): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        resolve(!token.isCancellationRequested);
      }, delayMs);

      token.onCancellationRequested(() => {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        resolve(false);
      });
    });
  }

  private buildContext(
    document: vscode.TextDocument,
    position: vscode.Position,
    config: ICodeConfig
  ): CompletionContextData {
    const currentLine = document.lineAt(position.line);
    const linePrefix = currentLine.text.substring(0, position.character);

    // Calculate prefix bounds
    const startLine = Math.max(0, position.line - config.maxPrefixLines);
    const prefixRange = new vscode.Range(new vscode.Position(startLine, 0), position);
    const prefix = document.getText(prefixRange);

    // Calculate suffix bounds
    const endLine = Math.min(document.lineCount - 1, position.line + config.maxSuffixLines);
    const suffixEndChar = document.lineAt(endLine).range.end.character;
    const suffixRange = new vscode.Range(position, new vscode.Position(endLine, suffixEndChar));
    const suffix = document.getText(suffixRange);

    const fileName = document.fileName.split(/[\\/]/).pop() || 'untitled';

    return {
      prefix,
      suffix,
      languageId: document.languageId,
      fileName,
      linePrefix,
      currentLineText: currentLine.text
    };
  }

  private getConfig(): ICodeConfig {
    const vsConfig = vscode.workspace.getConfiguration('icode');
    return {
      enabled: vsConfig.get<boolean>('enabled', true),
      model: vsConfig.get<string>('model', 'gemini-2.0-flash'),
      debounceDelay: vsConfig.get<number>('debounceDelay', 300),
      maxTokens: vsConfig.get<number>('maxTokens', 128),
      temperature: vsConfig.get<number>('temperature', 0.2),
      multiline: vsConfig.get<boolean>('multiline', true),
      maxPrefixLines: vsConfig.get<number>('maxPrefixLines', 60),
      maxSuffixLines: vsConfig.get<number>('maxSuffixLines', 30)
    };
  }
}
