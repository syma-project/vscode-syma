import * as vscode from 'vscode';

export class SymaDebugConfigurationProvider
  implements vscode.DebugConfigurationProvider
{
  /**
   * Provide default debug configurations when none exist.
   */
  provideDebugConfigurations(
    _folder: vscode.WorkspaceFolder | undefined,
    _token?: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.DebugConfiguration[]> {
    return [
      {
        type: 'syma',
        request: 'launch',
        name: 'Run Syma File',
        program: '${file}',
      },
    ];
  }

  /**
   * Resolve a debug configuration by filling in missing fields.
   */
  resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.DebugConfiguration> {
    // If no program specified, use the active editor file
    if (!config.program) {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'syma') {
        config.program = editor.document.uri.fsPath;
      }
    }

    // Default syma path
    if (!config.symaPath) {
      config.symaPath = 'syma';
    }

    return config;
  }
}
