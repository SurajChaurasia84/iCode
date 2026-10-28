import * as vscode from 'vscode';

export type StatusBarState = 'ready' | 'loading' | 'disabled' | 'noKey' | 'error';

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'icode.showMenu';
    this.setState('ready');
    this.statusBarItem.show();
  }

  public setState(state: StatusBarState, message?: string): void {
    switch (state) {
      case 'ready':
        this.statusBarItem.text = '$(sparkle) iCode';
        this.statusBarItem.tooltip = 'iCode: Ready (Click for menu)';
        this.statusBarItem.backgroundColor = undefined;
        break;

      case 'loading':
        this.statusBarItem.text = '$(sync~spin) iCode';
        this.statusBarItem.tooltip = 'iCode: Generating code suggestion...';
        this.statusBarItem.backgroundColor = undefined;
        break;

      case 'disabled':
        this.statusBarItem.text = '$(circle-slash) iCode (Off)';
        this.statusBarItem.tooltip = 'iCode: Suggestions disabled (Click to enable)';
        this.statusBarItem.backgroundColor = undefined;
        break;

      case 'noKey':
        this.statusBarItem.text = '$(key) iCode (No Key)';
        this.statusBarItem.tooltip = 'iCode: Google Gemini API key required. Click to set.';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground'
        );
        break;

      case 'error':
        this.statusBarItem.text = '$(error) iCode (Error)';
        this.statusBarItem.tooltip = message || 'iCode encountered an error. Click for options.';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.errorBackground'
        );
        break;
    }
  }

  public dispose(): void {
    this.statusBarItem.dispose();
  }
}
