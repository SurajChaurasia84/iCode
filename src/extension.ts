import * as vscode from 'vscode';
import { ICodeInlineCompletionProvider } from './provider';
import { SecretManager } from './secretManager';
import { StatusBarManager } from './statusBar';

export function activate(context: vscode.ExtensionContext) {
  console.log('iCode extension is now active!');

  const secretManager = new SecretManager(context);
  const statusBar = new StatusBarManager();
  const provider = new ICodeInlineCompletionProvider(secretManager, statusBar);

  // Check initial API key status
  secretManager.getApiKey().then((key) => {
    const config = vscode.workspace.getConfiguration('icode');
    const enabled = config.get<boolean>('enabled', true);

    if (!enabled) {
      statusBar.setState('disabled');
    } else if (!key) {
      statusBar.setState('noKey');
      vscode.window
        .showInformationMessage(
          'iCode is ready! Set your Google Gemini API Key to enable instant code completions.',
          'Set API Key',
          'Get Key (Free)'
        )
        .then((selection) => {
          if (selection === 'Set API Key') {
            vscode.commands.executeCommand('icode.setApiKey');
          } else if (selection === 'Get Key (Free)') {
            vscode.env.openExternal(
              vscode.Uri.parse('https://aistudio.google.com/app/apikey')
            );
          }
        });
    } else {
      statusBar.setState('ready');
    }
  });

  // Register Inline Completion Provider for all documents
  const completionProviderDisposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    provider
  );

  // Command: Set API Key
  const setApiKeyCmd = vscode.commands.registerCommand('icode.setApiKey', async () => {
    const currentKey = await secretManager.getApiKey();
    const apiKey = await vscode.window.showInputBox({
      title: 'iCode: Set Google Gemini API Key',
      prompt: 'Enter your Gemini API Key (from Google AI Studio)',
      password: true,
      value: currentKey || '',
      placeHolder: 'AIzaSy...'
    });

    if (apiKey !== undefined) {
      if (apiKey.trim().length === 0) {
        await secretManager.deleteApiKey();
        statusBar.setState('noKey');
        vscode.window.showInformationMessage('iCode: Gemini API Key removed.');
      } else {
        await secretManager.setApiKey(apiKey);
        statusBar.setState('ready');
        vscode.window.showInformationMessage('iCode: Gemini API Key securely saved!');
      }
    }
  });

  // Command: Remove API Key
  const removeApiKeyCmd = vscode.commands.registerCommand('icode.removeApiKey', async () => {
    await secretManager.deleteApiKey();
    statusBar.setState('noKey');
    vscode.window.showInformationMessage('iCode: Gemini API Key removed.');
  });

  // Command: Toggle
  const toggleCmd = vscode.commands.registerCommand('icode.toggle', async () => {
    const config = vscode.workspace.getConfiguration('icode');
    const current = config.get<boolean>('enabled', true);
    const updated = !current;
    await config.update('enabled', updated, vscode.ConfigurationTarget.Global);

    if (updated) {
      const key = await secretManager.getApiKey();
      statusBar.setState(key ? 'ready' : 'noKey');
      vscode.window.showInformationMessage('iCode: Auto completions enabled.');
    } else {
      statusBar.setState('disabled');
      vscode.window.showInformationMessage('iCode: Auto completions disabled.');
    }
  });

  // Command: Trigger Suggestion Manually
  const triggerCmd = vscode.commands.registerCommand('icode.triggerSuggestion', () => {
    vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
  });

  // Command: Clear Cache
  const clearCacheCmd = vscode.commands.registerCommand('icode.clearCache', () => {
    provider.clearCache();
    vscode.window.showInformationMessage('iCode: Suggestion cache cleared.');
  });

  // Command: Status Bar Quick Menu
  const showMenuCmd = vscode.commands.registerCommand('icode.showMenu', async () => {
    const config = vscode.workspace.getConfiguration('icode');
    const enabled = config.get<boolean>('enabled', true);
    const key = await secretManager.getApiKey();

    const items: vscode.QuickPickItem[] = [
      {
        label: enabled ? '$(circle-slash) Disable iCode' : '$(check) Enable iCode',
        description: enabled ? 'Turn off auto inline completions' : 'Turn on auto inline completions'
      },
      {
        label: '$(key) ' + (key ? 'Update Gemini API Key' : 'Set Gemini API Key'),
        description: key ? 'Change existing key' : 'Required to generate code suggestions'
      },
      {
        label: '$(refresh) Clear Suggestion Cache',
        description: 'Clear stored completions from memory'
      },
      {
        label: '$(gear) Open iCode Settings',
        description: 'Adjust debounce delay, temperature, models, etc.'
      },
      {
        label: '$(globe) Get Free Gemini API Key',
        description: 'Open Google AI Studio in browser'
      }
    ];

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: 'iCode - AI Code Completion Options'
    });

    if (!selection) {
      return;
    }

    if (selection.label.includes('Disable') || selection.label.includes('Enable')) {
      vscode.commands.executeCommand('icode.toggle');
    } else if (selection.label.includes('API Key')) {
      vscode.commands.executeCommand('icode.setApiKey');
    } else if (selection.label.includes('Clear Suggestion Cache')) {
      vscode.commands.executeCommand('icode.clearCache');
    } else if (selection.label.includes('Open iCode Settings')) {
      vscode.commands.executeCommand('workbench.action.openSettings', 'icode');
    } else if (selection.label.includes('Get Free Gemini API Key')) {
      vscode.env.openExternal(
        vscode.Uri.parse('https://aistudio.google.com/app/apikey')
      );
    }
  });

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('icode.enabled')) {
        const config = vscode.workspace.getConfiguration('icode');
        const enabled = config.get<boolean>('enabled', true);
        if (!enabled) {
          statusBar.setState('disabled');
        } else {
          const key = await secretManager.getApiKey();
          statusBar.setState(key ? 'ready' : 'noKey');
        }
      }
    })
  );

  context.subscriptions.push(
    completionProviderDisposable,
    setApiKeyCmd,
    removeApiKeyCmd,
    toggleCmd,
    triggerCmd,
    clearCacheCmd,
    showMenuCmd,
    statusBar
  );
}

export function deactivate() {}
