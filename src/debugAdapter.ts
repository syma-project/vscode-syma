import {
  DebugSession,
  InitializedEvent,
  TerminatedEvent,
  StoppedEvent,
  OutputEvent,
  Thread,
  StackFrame,
  Source,
  Scope,
  Variable,
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import { ChildProcess, spawn } from 'child_process';
import * as readline from 'readline';

interface SymaLaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  program: string;
  symaPath?: string;
  args?: string[];
}

// Messages sent to the syma debug process
interface SetBreakpointsCmd {
  command: 'setBreakpoints';
  breakpoints: { line: number }[];
}

interface SimpleCommand {
  command: 'continue' | 'next' | 'stepIn' | 'stepOut' | 'stop' | 'getVariables';
}

interface EvaluateCmd {
  command: 'evaluate';
  expression: string;
}

type ClientCommand = SetBreakpointsCmd | SimpleCommand | EvaluateCmd;

// Messages received from the syma debug process
interface SymaStoppedEvent {
  event: 'stopped';
  reason: string;
  line: number;
}

interface SymaTerminatedEvent {
  event: 'terminated';
}

interface SymaVariablesEvent {
  event: 'variables';
  variables: { name: string; value: string; type: string }[];
}

interface SymaEvaluateResultEvent {
  event: 'evaluateResult';
  result: string;
  type: string;
}

interface SymaOutputEvent {
  event: 'output';
  category: string;
  output: string;
}

interface SymaErrorEvent {
  event: 'error';
  message: string;
}

interface SymaInitializedEvent {
  event: 'initialized';
}

type SymaEvent =
  | SymaStoppedEvent
  | SymaTerminatedEvent
  | SymaVariablesEvent
  | SymaEvaluateResultEvent
  | SymaOutputEvent
  | SymaErrorEvent
  | SymaInitializedEvent;

export class SymaDebugSession extends DebugSession {
  private static THREAD_ID = 1;
  private process: ChildProcess | undefined;
  private currentLine = 1;
  private pendingVariableResolve: ((vars: Variable[]) => void) | undefined;
  private pendingEvaluateResolve:
    | ((result: { result: string; type: string }) => void)
    | undefined;

  public constructor() {
    super();
    this.setDebuggerLinesStartAt1(true);
    this.setDebuggerColumnsStartAt1(true);
  }

  protected initializeRequest(
    response: DebugProtocol.InitializeResponse,
  ): void {
    response.body = {
      supportsConfigurationDoneRequest: false,
      supportsEvaluateForHovers: false,
      supportsStepBack: false,
      supportsSetVariable: false,
      supportsRestartRequest: false,
      supportsGotoTargetsRequest: false,
      supportsStepInTargetsRequest: false,
      supportsCompletionsRequest: false,
      supportsModulesRequest: false,
      supportsRestartFrame: false,
      supportsValueFormattingOptions: false,
      supportsExceptionInfoRequest: false,
      supportTerminateDebuggee: true,
      supportSuspendDebuggee: false,
      supportsDelayedStackTraceLoading: false,
      supportsLogPoints: false,
      supportsConditionalBreakpoints: false,
      supportsHitConditionalBreakpoints: false,
      supportsFunctionBreakpoints: false,
      supportsExceptionOptions: false,
    };
    this.sendResponse(response);
    this.sendEvent(new InitializedEvent());
  }

  protected async launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: SymaLaunchRequestArguments,
  ): Promise<void> {
    const program = args.program;
    const symaPath = args.symaPath || 'syma';
    const extraArgs = args.args || [];

    const processArgs = ['--dap', program, ...extraArgs];

    try {
      this.process = spawn(symaPath, processArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
        this.sendErrorResponse(response, 0, 'Failed to start syma process');
        return;
      }

      // Handle stdout (debug protocol messages)
      const rl = readline.createInterface({ input: this.process.stdout });
      rl.on('line', (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const event: SymaEvent = JSON.parse(trimmed);
          this.handleSymaEvent(event);
        } catch {
          // Non-JSON output — treat as stdout
          this.sendEvent(
            new OutputEvent(trimmed + '\n', 'stdout'),
          );
        }
      });

      // Forward stderr to Debug Console
      const errRl = readline.createInterface({ input: this.process.stderr });
      errRl.on('line', (line: string) => {
        this.sendEvent(new OutputEvent(line + '\n', 'stderr'));
      });

      this.process.on('exit', () => {
        this.sendEvent(new TerminatedEvent());
      });

      this.process.on('error', (err) => {
        this.sendErrorResponse(response, 0, `Failed to start syma: ${err.message}`);
      });

      this.sendResponse(response);
    } catch (err: any) {
      this.sendErrorResponse(response, 0, `Failed to start syma: ${err.message}`);
    }
  }

  protected async setBreakpointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments,
  ): Promise<void> {
    const breakpoints = args.breakpoints || [];
    const lines = breakpoints.map((bp) => bp.line);

    this.sendCommand({
      command: 'setBreakpoints',
      breakpoints: lines.map((line) => ({ line })),
    });

    response.body = {
      breakpoints: breakpoints.map((bp) => ({
        verified: true,
        line: bp.line,
      })),
    };
    this.sendResponse(response);
  }

  protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = {
      threads: [new Thread(SymaDebugSession.THREAD_ID, 'Main')],
    };
    this.sendResponse(response);
  }

  protected async stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    _args: DebugProtocol.StackTraceArguments,
  ): Promise<void> {
    // Phase 1: single stack frame at current line
    response.body = {
      stackFrames: [
        new StackFrame(0, 'Current', new Source('program'), this.currentLine),
      ],
      totalFrames: 1,
    };
    this.sendResponse(response);
  }

  protected scopesRequest(
    response: DebugProtocol.ScopesResponse,
    _args: DebugProtocol.ScopesArguments,
  ): void {
    response.body = {
      scopes: [new Scope('Local', 1, false)],
    };
    this.sendResponse(response);
  }

  protected async variablesRequest(
    response: DebugProtocol.VariablesResponse,
    _args: DebugProtocol.VariablesArguments,
  ): Promise<void> {
    const variables = await this.getVariables();
    response.body = { variables };
    this.sendResponse(response);
  }

  protected continueRequest(
    response: DebugProtocol.ContinueResponse,
    _args: DebugProtocol.ContinueArguments,
  ): void {
    this.sendCommand({ command: 'continue' });
    this.sendResponse(response);
  }

  protected nextRequest(
    response: DebugProtocol.NextResponse,
    _args: DebugProtocol.NextArguments,
  ): void {
    this.sendCommand({ command: 'next' });
    this.sendResponse(response);
  }

  protected stepInRequest(
    response: DebugProtocol.StepInResponse,
    _args: DebugProtocol.StepInArguments,
  ): void {
    this.sendCommand({ command: 'stepIn' });
    this.sendResponse(response);
  }

  protected stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    _args: DebugProtocol.StepOutArguments,
  ): void {
    this.sendCommand({ command: 'stepOut' });
    this.sendResponse(response);
  }

  protected async evaluateRequest(
    response: DebugProtocol.EvaluateResponse,
    args: DebugProtocol.EvaluateArguments,
  ): Promise<void> {
    const result = await this.evaluateExpression(args.expression);
    response.body = {
      result: result.result,
      type: result.type,
      variablesReference: 0,
    };
    this.sendResponse(response);
  }

  protected disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    _args: DebugProtocol.DisconnectArguments,
  ): void {
    this.sendCommand({ command: 'stop' });
    if (this.process) {
      this.process.kill();
    }
    this.sendResponse(response);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private handleSymaEvent(event: SymaEvent): void {
    switch (event.event) {
      case 'stopped':
        this.currentLine = event.line;
        this.sendEvent(
          new StoppedEvent(event.reason, SymaDebugSession.THREAD_ID),
        );
        break;
      case 'terminated':
        this.sendEvent(new TerminatedEvent());
        break;
      case 'variables':
        if (this.pendingVariableResolve) {
          const vars = event.variables.map(
            (v) =>
              new Variable(v.name, v.value, 0),
          );
          this.pendingVariableResolve(vars);
          this.pendingVariableResolve = undefined;
        }
        break;
      case 'evaluateResult':
        if (this.pendingEvaluateResolve) {
          this.pendingEvaluateResolve({
            result: event.result,
            type: event.type,
          });
          this.pendingEvaluateResolve = undefined;
        }
        break;
      case 'output':
        this.sendEvent(new OutputEvent(event.output, event.category));
        break;
      case 'error':
        this.sendEvent(new OutputEvent(event.message + '\n', 'stderr'));
        break;
      case 'initialized':
        // Debug session initialized
        break;
    }
  }

  private sendCommand(cmd: ClientCommand): void {
    if (this.process?.stdin) {
      this.process.stdin.write(JSON.stringify(cmd) + '\n');
    }
  }

  private getVariables(): Promise<Variable[]> {
    return new Promise((resolve) => {
      this.pendingVariableResolve = resolve;
      this.sendCommand({ command: 'getVariables' });
      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingVariableResolve === resolve) {
          this.pendingVariableResolve = undefined;
          resolve([]);
        }
      }, 5000);
    });
  }

  private evaluateExpression(
    expression: string,
  ): Promise<{ result: string; type: string }> {
    return new Promise((resolve) => {
      this.pendingEvaluateResolve = resolve;
      this.sendCommand({ command: 'evaluate', expression });
      setTimeout(() => {
        if (this.pendingEvaluateResolve === resolve) {
          this.pendingEvaluateResolve = undefined;
          resolve({ result: 'Timeout', type: 'error' });
        }
      }, 5000);
    });
  }
}
