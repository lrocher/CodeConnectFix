#!/usr/bin/env node

const EventEmitter = require("events");
const os = require("os");
const readline = require("readline");
const repl = require("repl");
const vm = require("vm");
const util = require("util");
const { WSServer } = require("../lib");

function sessionEventListener(eventName, { body }) {
    this.emit("event", eventName, body);
}

class SingleSessionServer extends EventEmitter {
    constructor(port) {
        super();
        this.port = port;
        this.wsServer = new WSServer(port);
        this.eventListeners = new Map();
        this.session = null;
        this.timeout = 3000;
        this.wsServer.on("client", ({ session: newSession, request }) => {
            if (this.session) {
                newSession.disconnect();
                return;
            }
            const address = `${request.client.remoteAddress}:${request.client.remotePort}`;
            newSession.on("disconnect", () => {
                this.session = null;
                this.emit("offline", address);
            });
            this.session = newSession;
            newSession.setMaxListeners(Infinity);
            this.emit("online", address);
        });
    }

    isOnline() {
        return this.session != null;
    }

    getSession() {
        if (!this.session) throw new Error("Connection is not established.");
        return this.session;
    }

    withCatch(executor) {
        const session = this.getSession();
        return new Promise((resolve, reject) => {
            let errorFrameCallback;
            let errorCallback;
            let timeoutId;
            const callback = (success, valueOrError) => {
                session.off("mcError", errorFrameCallback);
                session.off("error", errorCallback);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                if (success) {
                    resolve(valueOrError);
                } else {
                    reject(valueOrError);
                }
            };
            errorCallback = (error) => callback(false, error);
            errorFrameCallback = (frame) => callback(false, new Error(frame.statusMessage));
            session.once("mcError", errorFrameCallback);
            session.once("error", reject);
            timeoutId = setTimeout(() => callback(false, new Error(`Timeout ${this.timeout} exceed.`)), this.timeout);
            try {
                executor.call(
                    this,
                    session,
                    (value) => callback(true, value),
                    (reason) => callback(false, reason)
                );
            } catch (err) {
                callback(false, err);
            }
        });
    }

    encrypt() {
        return this.withCatch((session, resolve) => {
            if (!session.enableEncryption(() => resolve(true))) {
                resolve(false);
            }
        });
    }

    disconnect(force) {
        this.getSession().disconnect(force);
    }

    disconnectAll() {
        this.wsServer.disconnectAll();
    }

    subscribe(eventName) {
        const session = this.getSession();
        let listener = this.eventListeners.get(eventName);
        if (!listener) {
            listener = sessionEventListener.bind(this, eventName);
            session.subscribe(eventName, listener);
            this.eventListeners.set(eventName, listener);
            return true;
        }
        return false;
    }

    unsubscribe(eventName) {
        const session = this.getSession();
        const listener = this.eventListeners.get(eventName);
        if (listener) {
            session.unsubscribe(eventName, listener);
            this.eventListeners.delete(eventName);
            return true;
        }
        return false;
    }

    sendCommand(cmd) {
        return this.withCatch((session, resolve) => {
            session.sendCommand(cmd, ({ body }) => resolve(body));
        });
    }

    sendCommandLegacy(commandName, overload, input) {
        return this.withCatch((session, resolve) => {
            session.sendCommandLegacy(commandName, overload, input, ({ body }) => resolve(body));
        });
    }

    allConnectCommands(externalOnly) {
        const interfaces = os.networkInterfaces();
        const ips = [];
        Object.values(interfaces).forEach((devInfos) => {
            let infoList = devInfos.filter((niInfo) => niInfo.family === "IPv4");
            if (externalOnly) {
                infoList = infoList.filter((niInfo) => !niInfo.internal && niInfo.address !== "127.0.0.1");
            }
            ips.push(...infoList.map((niInfo) => niInfo.address));
        });
        if (ips.length === 0) ips.push("0.0.0.0");
        return ips.map((ip) => `/connect ${ip}:${this.port}`);
    }

    connectCommand() {
        return this.allConnectCommands(true)[0];
    }
}

const OFFLINE_PROMPT = "[Offline] > ";
const ONLINE_PROMPT = "> ";
class CommandReplServer extends repl.REPLServer {
    constructor(port) {
        super({
            prompt: OFFLINE_PROMPT,
            eval: (cmd, context, file, callback) => {
                this.doEval(cmd, context, file, callback);
            }
        });
        this.server = new SingleSessionServer(port);
        this.acceptUserInput = true;
        this.defineDefaultCommands();
        this.on("reset", (context) => this.resetContextScope(context)).on("exit", () => this.server.disconnectAll());
        this.resetContextScope(this.context);
        this.server
            .on("online", (address) => {
                this.printLine(
                    `${OFFLINE_PROMPT}\nConnection established: ${address}.\nType ".help" for more information.`,
                    true
                );
                this.setPrompt(ONLINE_PROMPT);
                if (this.acceptUserInput) {
                    this.displayPrompt(true);
                }
            })
            .on("offline", (address) => {
                this.printLine(`Connection disconnected: ${address}.`, true);
                this.showOfflinePrompt(true);
                this.setPrompt(OFFLINE_PROMPT);
                if (this.acceptUserInput) {
                    this.displayPrompt(true);
                }
            })
            .on("event", (eventName, body) => {
                if (this.editorMode) return;
                this.printLine(util.format("[%s] %o", eventName, body), true);
            });
        this.showOfflinePrompt(true);
    }

    printLine(str, rewriteLine) {
        if (rewriteLine) {
            readline.cursorTo(this.output, 0);
            readline.clearLine(this.output, 0);
        }
        this.output.write(`${str}\n`);
        if (this.acceptUserInput) {
            this.displayPrompt(true);
        }
    }

    showOfflinePrompt(singleLine) {
        if (singleLine) {
            this.printLine(`Type "${this.server.connectCommand()}" in the game console to connect.`, true);
        } else {
            this.printLine(
                `Type one of following commands in the game console to connect:\n${this.server
                    .allConnectCommands()
                    .join("\n")}`,
                true
            );
        }
    }

    resetContextScope(context) {
        Object.defineProperties(context, {
            wss: {
                configurable: true,
                writable: false,
                value: this.server.wsServer
            },
            session: {
                configurable: true,
                get: () => this.server.getSession()
            },
            encrypt: {
                configurable: true,
                value: () => this.server.encrypt()
            },
            disconnect: {
                configurable: true,
                value: () => this.server.disconnect()
            },
            subscribe: {
                configurable: true,
                value: (eventName) => this.server.subscribe(eventName)
            },
            unsubscribe: {
                configurable: true,
                value: (eventName) => this.server.unsubscribe(eventName)
            },
            command: {
                configurable: true,
                value: (commandLine) => this.server.sendCommand(commandLine)
            },
            commandLegacy: {
                configurable: true,
                value: (commandName, overload, input) => this.server.sendCommandLegacy(commandName, overload, input)
            }
        });
    }

    defineDefaultCommands() {
        this.defineCommand("subscribe", {
            help: "Subscribe a event",
            action: (eventName) => {
                if (this.server.isOnline()) {
                    if (this.server.subscribe(eventName)) {
                        this.printLine(`Subscribed ${eventName}.`);
                    } else {
                        this.printLine(`Event ${eventName} is already subscribed.`);
                    }
                } else {
                    this.printLine("Connection is not established.");
                }
            }
        });
        this.defineCommand("unsubscribe", {
            help: "Unsubscribe a event",
            action: (eventName) => {
                if (this.server.isOnline()) {
                    if (this.server.unsubscribe(eventName)) {
                        this.printLine(`Unsubscribed ${eventName}.`);
                    } else {
                        this.printLine(`Event ${eventName} is not subscribed.`);
                    }
                } else {
                    this.printLine("Connection is not established.");
                }
            }
        });
        this.defineCommand("disconnect", {
            help: "Disconnect from all the clients",
            action: (arg) => {
                if (this.server.isOnline()) {
                    if (arg === "force") {
                        this.server.disconnect(true);
                    } else {
                        let disconnected = false;
                        const timeout = setTimeout(() => {
                            if (disconnected) return;
                            this.printLine("Connection close request timeout.");
                            this.server.disconnect(true);
                        }, 10000);
                        this.server.once("offline", () => {
                            disconnected = true;
                            clearTimeout(timeout);
                        });
                        this.server.disconnect(false);
                    }
                } else {
                    this.printLine("Connection is not established.");
                }
            }
        });
        this.defineCommand("encrypt", {
            help: "Encrypt the connection",
            action: () => {
                if (this.server.isOnline()) {
                    this.server.encrypt().then(() => {
                        this.printLine("Connection is encrypted.", true);
                    });
                } else {
                    this.printLine("Connection is not established.");
                }
            }
        });
    }

    doEval(cmd, context, file, callback) {
        let result;
        this.acceptUserInput = false;
        try {
            const trimmedCmd = cmd.trim();
            if (trimmedCmd.startsWith("/") && !trimmedCmd.includes("\n")) {
                if (!this.server.isOnline() && trimmedCmd.startsWith("/connect")) {
                    this.showOfflinePrompt();
                    this.acceptUserInput = true;
                    callback(null);
                    return;
                }
                result = this.server.sendCommand(trimmedCmd.slice(1));
            } else if (trimmedCmd.length > 0) {
                result = vm.runInContext(cmd, context, {
                    filename: file
                });
            } else {
                this.acceptUserInput = true;
                callback(null);
                return;
            }
            if (result && result.then) {
                result
                    .then(
                        (res) => callback(null, res),
                        (err) => callback(err)
                    )
                    .finally(() => {
                        this.acceptUserInput = true;
                    });
            } else {
                callback(null, result);
                this.acceptUserInput = true;
            }
        } catch (err) {
            callback(err);
            this.acceptUserInput = true;
        }
    }
}

function main(port) {
    const replServer = new CommandReplServer(port);
    replServer.on("exit", () => {
        process.exit(0);
    });
}

if (require.main === module) {
    main(Number(process.argv[2]) || 19134);
} else {
    module.exports = { CommandReplServer, main };
}
