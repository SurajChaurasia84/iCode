import { CompletionContextData, ICodeConfig } from './types';

const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiClient {
  public async getCompletion(
    apiKey: string,
    context: CompletionContextData,
    config: ICodeConfig,
    signal?: AbortSignal
  ): Promise<string> {
    const model = config.model || 'gemini-2.0-flash';
    const url = `${API_BASE_URL}/${model}:generateContent?key=${apiKey}`;

    const systemInstruction = `You are iCode, a high-performance inline code completion engine in VS Code (similar to GitHub Copilot).
Your task is to predict the code that belongs directly at the cursor, between <PREFIX> and <SUFFIX>.

CRITICAL INSTRUCTIONS:
1. Output ONLY the code that should be inserted directly at the cursor.
2. NEVER output markdown code blocks, backticks, or language tags (do NOT output \`\`\` or \`\`\`${context.languageId}).
3. NEVER provide explanations, comments, or conversational greetings.
4. DO NOT re-type code already present in <PREFIX> or <SUFFIX>.
5. Match the indentation and style of the surrounding code.
6. If the cursor is inside a statement or function, complete it naturally and cleanly.
7. If no completion is appropriate or needed, return nothing.`;

    const prompt = `<FILE_INFO>
File: ${context.fileName}
Language: ${context.languageId}
</FILE_INFO>

<PREFIX>
${context.prefix}
</PREFIX>
<CURSOR>
<SUFFIX>
${context.suffix}
</SUFFIX>`;

    const requestBody = {
      system_instruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
        candidateCount: 1,
        stopSequences: ['</CURSOR>', '<SUFFIX>', '<PREFIX>']
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Gemini API returned status ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error && errorJson.error.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        // use default error message
      }
      throw new Error(errorMessage);
    }

    const data: any = await response.json();
    const candidate = data.candidates?.[0];
    const rawText: string = candidate?.content?.parts?.[0]?.text || '';

    return this.cleanCompletion(rawText, context, config);
  }

  private cleanCompletion(rawText: string, context: CompletionContextData, config: ICodeConfig): string {
    if (!rawText) {
      return '';
    }

    let cleaned = rawText;

    // 1. Remove markdown fences if model mistakenly wrapped response
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\r?\n/, '');
    cleaned = cleaned.replace(/\r?\n```\s*$/, '');
    cleaned = cleaned.replace(/^```/, '');
    cleaned = cleaned.replace(/```$/, '');

    // 2. If single-line mode requested, keep only the first line
    if (!config.multiline) {
      const firstNewline = cleaned.indexOf('\n');
      if (firstNewline !== -1) {
        cleaned = cleaned.substring(0, firstNewline);
      }
    }

    // 3. Remove leading duplicate from current line prefix if model echoed it
    const trimmedLinePrefix = context.linePrefix.trimEnd();
    if (trimmedLinePrefix.length > 0 && cleaned.startsWith(trimmedLinePrefix)) {
      cleaned = cleaned.substring(trimmedLinePrefix.length);
    } else {
      const fullyTrimmedPrefix = context.linePrefix.trim();
      if (fullyTrimmedPrefix.length > 2 && cleaned.startsWith(fullyTrimmedPrefix)) {
        cleaned = cleaned.substring(fullyTrimmedPrefix.length);
      }
    }

    // 4. Remove duplicate closing symbols if suffix immediately starts with them
    const trimmedSuffix = context.suffix.trimStart();
    if (trimmedSuffix.length > 0) {
      // Check common closing brackets / parentheses
      const closings = [')', '}', ']', ';', '>', '"/>', '`', '"', "'"];
      for (const char of closings) {
        if (trimmedSuffix.startsWith(char) && cleaned.endsWith(char)) {
          // If cleaned has the closing char but suffix also starts with it and wasn't opened in cleaned
          const openChar = char === ')' ? '(' : char === '}' ? '{' : char === ']' ? '[' : null;
          if (openChar && !cleaned.includes(openChar)) {
            cleaned = cleaned.slice(0, -char.length);
          }
        }
      }
    }

    return cleaned;
  }
}
