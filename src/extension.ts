import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { SymaDebugSession } from './debugAdapter';
import { SymaDebugConfigurationProvider } from './debugConfigProvider';

let client: LanguageClient | undefined;
let terminal: vscode.Terminal | undefined;

class SymaDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(_session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(new SymaDebugSession());
  }
}

// ── CodeLens Provider ──────────────────────────────────────────────────────
class SymaCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const text = document.getText();
    if (!text.trim()) return [];

    // Single "Run" lens at the top of the file — the command always runs the
    // entire file, so one button is sufficient.
    const firstLine = document.lineAt(0);
    return [new vscode.CodeLens(firstLine.range, {
      title: 'Run',
      command: 'syma.runFile',
      tooltip: 'Run this file in the Syma interpreter',
    })];
  }
}

// ── Document Link Provider ─────────────────────────────────────────────────
class SymaDocumentLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    const text = document.getText();
    const docDir = path.dirname(document.uri.fsPath);

    // Match: `import ModuleName`, `import ModuleName.Submodule`, `import ModuleName.{symbols}`, `import ModuleName as Alias`
    const importRegex = /^[\s]*import\s+([\w.]+)(?:\s*\.{[^}]*})?(?:\s+as\s+\w+)?/gm;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(text)) !== null) {
      const modulePath = match[1].replace(/\./g, '/');
      const moduleName = match[1];
      const matchModuleIndex = match[0].indexOf(moduleName);
      const startPos = document.positionAt(match.index + matchModuleIndex);
      const endPos = document.positionAt(match.index + matchModuleIndex + moduleName.length);

      const linkRange = new vscode.Range(startPos, endPos);
      const targetPath = path.join(docDir, `${modulePath}.syma`);
      if (!fs.existsSync(targetPath)) continue;
      links.push(new vscode.DocumentLink(linkRange, vscode.Uri.file(targetPath)));
    }

    return links;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  // ── Commands ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('syma.runFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'syma') {
        vscode.window.showWarningMessage('Open a .syma file first');
        return;
      }
      const symaPath = vscode.workspace.getConfiguration('syma')
        .get<string>('server.path', 'syma') || 'syma';
      if (!terminal || terminal.exitStatus !== undefined) {
        terminal = vscode.window.createTerminal('Syma Run');
      }
      const escapedPath = editor.document.uri.fsPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const escapedSymaPath = symaPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      terminal.sendText(`"${escapedSymaPath}" "${escapedPath}"`);
      terminal.show();
    })
  );

  // ── CodeLens ───────────────────────────────────────────────────────────────
  const codeLensProvider = new SymaCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider('syma', codeLensProvider)
  );
  context.subscriptions.push(codeLensProvider);
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.languageId === 'syma') codeLensProvider.refresh();
    })
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((e) => {
      if (e?.document.languageId === 'syma') codeLensProvider.refresh();
    })
  );

  // ── Document Links ─────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider('syma', new SymaDocumentLinkProvider())
  );

  // ── Language Server ──────────────────────────────────────────────────────
  const serverModule = context.asAbsolutePath(path.join('out', 'server.js'));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'syma' },
                       { scheme: 'untitled', language: 'syma' }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(
          vscode.workspace.workspaceFolders?.[0] ?? '',
          '**/*.syma'
        )
      ),
    },
  };

  client = new LanguageClient(
    'symaLanguageServer',
    'Syma Language Server',
    serverOptions,
    clientOptions
  );

  client.start();

  // ── Debug Adapter ────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('syma', new SymaDebugAdapterDescriptorFactory())
  );
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('syma', new SymaDebugConfigurationProvider())
  );
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) return undefined;
  return client.stop();
}
