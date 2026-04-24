import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export function activate(context: ExtensionContext): void {
  // Path to the server module
  const serverModule = context.asAbsolutePath(path.join('out', 'server.js'));

  // Server options: run the server as a Node.js process
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  // Client options: which documents to sync
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'syma' },
                       { scheme: 'untitled', language: 'syma' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.syma'),
    },
  };

  // Create and start the client
  client = new LanguageClient(
    'symaLanguageServer',
    'Syma Language Server',
    serverOptions,
    clientOptions
  );

  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) return undefined;
  return client.stop();
}
