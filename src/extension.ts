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

export function activate(context: vscode.ExtensionContext): void {
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
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.syma'),
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
