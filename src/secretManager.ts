import * as vscode from 'vscode';

const SECRET_KEY = 'icode.geminiApiKey';

export class SecretManager {
  private secrets: vscode.SecretStorage;

  constructor(context: vscode.ExtensionContext) {
    this.secrets = context.secrets;
  }

  public async getApiKey(): Promise<string | undefined> {
    // 1. Check SecretStorage (securest method)
    const secretKey = await this.secrets.get(SECRET_KEY);
    if (secretKey && secretKey.trim().length > 0) {
      return secretKey.trim();
    }

    // 2. Check environment variable
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0) {
      return process.env.GEMINI_API_KEY.trim();
    }

    return undefined;
  }

  public async setApiKey(apiKey: string): Promise<void> {
    await this.secrets.store(SECRET_KEY, apiKey.trim());
  }

  public async deleteApiKey(): Promise<void> {
    await this.secrets.delete(SECRET_KEY);
  }
}
