import * as path from 'path';
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

class SymaDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(_session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(new SymaDebugSession());
  }
}

// ── CodeLens Provider ──────────────────────────────────────────────────────
class SymaCodeLensProvider implements vscode.CodeLensProvider {
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

    // Match: `import ModuleName` or `import ModuleName.Submodule` or `import ModuleName as Alias`
    const importRegex = /^import\s+([\w.]+)(?:\s+as\s+\w+)?/gm;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(text)) !== null) {
      const modulePath = match[1].replace(/\./g, '/');
      const moduleName = match[1];
      const startPos = document.positionAt(match.index + match[0].indexOf(moduleName));
      const endPos = document.positionAt(match.index + match[0].indexOf(moduleName) + moduleName.length);

      const linkRange = new vscode.Range(startPos, endPos);
      const target = vscode.Uri.file(path.join(docDir, `${modulePath}.syma`));
      links.push(new vscode.DocumentLink(linkRange, target));
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
      const terminal = vscode.window.createTerminal('Syma Run');
      terminal.sendText(`"${symaPath}" "${editor.document.uri.fsPath}"`);
      terminal.show();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('syma.checkSyntax', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'syma') {
        vscode.window.showWarningMessage('Open a .syma file first');
        return;
      }
      await editor.document.save();
      vscode.window.showInformationMessage('Syma syntax check triggered');
    })
  );

  // ── CodeLens ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider('syma', new SymaCodeLensProvider())
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
