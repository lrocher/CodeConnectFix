import { IncomingMessage } from "http";
import { WebSocket } from "ws";

export enum Version {
    V1 = 1,
    V2 = 16842752
}

declare class Encryption {
    constructor();
    encrypt(str: string): Buffer;
    decrypt(buf: Buffer): string;
}

export class ServerEncryption extends Encryption {
    beginKeyExchange(): {
        publicKey: string;
        salt: string;
    };
    completeKeyExchange(clientPublicKey: string): void;
}

export class ClientEncryption extends Encryption {
    beginKeyExchange(): {
        publicKey: string;
    };
    completeKeyExchange(serverPublicKey: string, salt: string): void;
}

declare class TypedEventEmitter<EventMap> {
    on<E extends keyof EventMap>(event: E, listener: EventMap[E]): this;
    once<E extends keyof EventMap>(event: E, listener: EventMap[E]): this;
    off<E extends keyof EventMap>(event: E, listener: EventMap[E]): this;
    addListener(eventName: string | symbol, listener: (...args: any[]) => void): this;
    removeListener<E extends keyof EventMap>(event: E, listener: EventMap[E]): this;
    removeAllListeners<E extends keyof EventMap>(event: E): this;
    listeners<E extends keyof EventMap>(event: E): EventMap[E][];
    rawListeners<E extends keyof EventMap>(event: E): EventMap[E][];
    emit<E extends keyof EventMap>(event: E, ...args: any[]): boolean;
    listenerCount<E extends keyof EventMap>(event: E): number;
    prependListener<E extends keyof EventMap>(event: E, listener: EventMap[E]): this;
    prependOnceListener<E extends keyof EventMap>(event: E, listener: EventMap[E]): this;
    eventNames(): (keyof EventMap)[];
}

declare namespace ServerSessionEvent {
    interface Base {
        session: Session;
        server: WSServer;
    }

    interface EncryptionEnabled extends Base {
        encryption: Encryption;
    }

    interface Disconnect extends Base {}

    interface Message extends Base {
        message: any;
    }

    interface Frame extends Message {
        purpose: string;
        header: any;
        message: any;
        version: Version;
    }

    interface Event extends Frame {
        purpose: "event" | "chat";
        eventName: string;
        body: any;
    }

    interface CommandResponse extends Frame {
        purpose: "commandResponse";
        requestId: string;
        body: any;
    }

    interface MCError extends Frame {
        purpose: "error";
        statusCode?: number;
        statusMessage?: number;
        body: any;
    }

    interface Map {
        encryptionEnabled: (event: EncryptionEnabled) => void;
        error: (event: Error) => void;
        event: (event: Event) => void;
        commandResponse: (event: CommandResponse) => void;
        mcError: (event: MCError) => void;
        customFrame: (event: Frame) => void;
        message: (event: Frame) => void;
        disconnect: (event: Disconnect) => void;
    }

    type EncryptionEnabledCallback = Map["encryptionEnabled"];
    type EventCallback = Map["event"];
    type CommandCallback = Map["commandResponse"];
}

declare class Session extends TypedEventEmitter<ServerSessionEvent.Map> {
    readonly server: WSServer;
    encryption?: Encryption;

    constructor(server: WSServer, socket: WebSocket);
    enableEncryption(callback?: ServerSessionEvent.EncryptionEnabledCallback): void;
    isEncrypted(): boolean;
    sendMessage(message: any): void;
    sendFrame(messagePurpose: string, body: any, requestId: string, extraHeaders: any): void;
    subscribeRaw(event: string): void;
    subscribe(event: string, callback: ServerSessionEvent.EventCallback): void;
    unsubscribeRaw(event: string): void;
    unsubscribe(event: string, callback: ServerSessionEvent.EventCallback): void;
    sendCommandRaw(requestId: string, command: string): void;
    sendCommand(command: string | string[], callback?: ServerSessionEvent.CommandCallback): void;
    sendCommandLegacyRaw(requestId: string, commandName: string, overload: string, input: any): void;
    sendCommandLegacy(
        commandName: string,
        overload: string,
        input: any,
        callback?: ServerSessionEvent.CommandCallback
    ): void;
    disconnect(force?: boolean): void;
}

declare namespace ServerEvent {
    interface Client {
        server: WSServer;
        session: Session;
        request: IncomingMessage;
    }

    interface Map {
        client: (event: Client) => void;
    }

    type ClientCallback = Map["client"];
}

export declare class WSServer extends TypedEventEmitter<ServerEvent.Map> {
    readonly sessions: Set<Session>;

    constructor(port: number, handleClient?: ServerEvent.ClientCallback);
    broadcastCommand(command: string, callback?: ServerSessionEvent.CommandCallback): void;
    broadcastSubscribe(event: string, callback: ServerSessionEvent.EventCallback): void;
    broadcastUnsubscribe(event: string, callback: ServerSessionEvent.EventCallback): void;
    disconnectAll(force?: boolean): void;
}

declare namespace ClientEvent {
    interface Base {
        client: WSClient;
    }

    interface EncryptionEnabled extends Base {
        encryption: Encryption;
    }

    interface Disconnect extends Base {}

    interface Message extends Base {
        message: any;
    }

    interface Frame extends Message {
        purpose: string;
        header: any;
        message: any;
        version: Version;
    }

    interface Subscribe extends Frame {
        purpose: "subscribe";
        eventName: string;
        body: any;
    }

    interface Unsubscribe extends Frame {
        purpose: "unsubscribe";
        eventName: string;
        body: any;
    }

    interface Command extends Frame {
        purpose: "command";
        requestId: string;
        commandLine: string;
        body: any;
        respond(body: any): void;
        handleEncryptionHandshake(): boolean;
    }

    interface LegacyCommand extends Frame {
        purpose: "command";
        requestId: string;
        commandName: string;
        overload: string;
        input: any;
        body: any;
        respond(body: any): void;
    }

    interface Map {
        encryptionEnabled: (event: EncryptionEnabled) => void;
        error: (error: Error) => void;
        subscribe: (event: Subscribe) => void;
        unsubscribe: (event: Unsubscribe) => void;
        command: (event: Command) => void;
        commandLegacy: (event: LegacyCommand) => void;
        customFrame: (event: Frame) => void;
        message: (event: Frame) => void;
        disconnect: (event: Disconnect) => void;
    }
}

export declare class WSClient extends TypedEventEmitter<ClientEvent.Map> {
    encryption?: Encryption;

    constructor(address: string);
    handleEncryptionHandshake(requestId: string, commandLine: string): boolean;
    isEncrypted(): boolean;
    sendMessage(message: any): void;
    sendFrame(messagePurpose: string, body: any, requestId: string, extraHeaders: any): void;
    sendError(statusCode: number, statusMessage: string): void;
    sendEvent(eventName: string, body: any): void;
    publishEvent(eventName: string, body: any): void;
    respondCommand(requestId: string, body: any): void;
    disconnect(): void;
}

interface AppEvent extends ServerSessionEvent.Event {
    eventName: string;
    body: any;
}

interface AppCommandResponse extends ServerSessionEvent.CommandResponse {
    requestId: string;
    body: any;
}

type AppEventListener = (event: AppEvent) => void;
type AppEventListenerNoData = () => void;

declare class AppSession {
    readonly app: WSApp;
    readonly internalSession: Session;

    constructor(app: WSApp, impl: Session);
    enableEncryption(): Promise<void>;
    isEncrypted(): boolean;
    on(eventName: "Disconnect", listener: AppEventListenerNoData): this;
    once(eventName: "Disconnect", listener: AppEventListenerNoData): this;
    off(eventName: "Disconnect", listener: AppEventListenerNoData): this;
    addListener(eventName: "Disconnect", listener: AppEventListenerNoData): this;
    removeListener(eventName: "Disconnect", listener: AppEventListenerNoData): this;
    waitForEvent(eventName: "Disconnect", timeout?: number): Promise<void>;
    on(eventName: string, listener: AppEventListener): this;
    once(eventName: string, listener: AppEventListener): this;
    off(eventName: string, listener: AppEventListener): this;
    addListener(eventName: string, listener: AppEventListener): this;
    removeListener(eventName: string, listener: AppEventListener): this;
    waitForEvent(eventName: string, timeout?: number): Promise<AppEvent>;
    command(command: string | string[], timeout?: number): Promise<AppCommandResponse>;
    commandLegacy(commandName: string, overload: string, input: any, timeout?: number): Promise<AppCommandResponse>;
    disconnect(timeout?: number): Promise<void>;
}

interface WSAppEventMap {
    session: (session: AppSession) => void;
}

export declare class WSApp extends TypedEventEmitter<WSAppEventMap> {
    readonly internalServer: WSServer;
    readonly sessions: AppSession[];

    constructor(port: number, handleSession?: (session: AppSession) => void);
    forEachSession(f: (session: AppSession, index: number, sessions: AppSession[]) => Promise<void>): Promise<void>;
    mapSession<T>(f: (session: AppSession, index: number, sessions: AppSession[]) => Promise<T>): Promise<T[]>;
    waitForSession(timeout?: number): Promise<AppSession>;
}
