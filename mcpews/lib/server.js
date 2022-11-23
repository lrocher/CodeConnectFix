const EventEmitter = require("events");
const WebSocket = require("ws");
const randomUUID = require("uuid").v4;
const { implementName, ServerEncryption } = require("./encrypt");
const { V1, V2 } = require("./version");

function onMessage(messageData) {
    let decryptedMessageData;
    if (this.encryption) {
        decryptedMessageData = this.encryption.decrypt(messageData);
    } else {
        decryptedMessageData = messageData;
    }
    const message = JSON.parse(decryptedMessageData);
	//console.log("Server receiveMessage : ", message);
    const { header, body } = message;
    const { messagePurpose: purpose, version } = header;
    const frameBase = {
        server: this.server,
        session: this,
        message,
        header,
        body,
        purpose,
        version
    };
    switch (purpose) {
        case "event":
        case "chat":
            if (version >= V2) {
                this.publishEvent(header.eventName, {
                    ...frameBase,
                    eventName: header.eventName
                });
            } else {
                this.publishEvent(body.eventName, {
                    ...frameBase,
                    eventName: body.eventName
                });
            }
            break;
        case "action:agent":
            this.respondCommandAgent(header.requestId, {
                ...frameBase,
                requestId: header.requestId,
                actionName: header.actionName
            });
            break;
        case "commandResponse":
            this.respondCommand(header.requestId, {
                ...frameBase,
                requestId: header.requestId
            });
            break;
        case "error":
            this.emit("mcError", {
                ...frameBase,
                requestId: header.requestId,
                statusCode: body.statusCode,
                statusMessage: body.statusMessage
            });
            break;
        default:
            this.emit("customFrame", frameBase);
    }
    this.emit("message", frameBase);
}

function buildHeader(purpose, requestId, version, extraProperties) {
    return {
        version,
        requestId: requestId || "00000000-0000-0000-0000-000000000000",
        messagePurpose: purpose,
        messageType: "commandRequest",
        ...extraProperties
    };
}

class Session extends EventEmitter {
    constructor(server, socket) {
        super();
        this.server = server;
        this.socket = socket;
        this.version = V1;
        this.eventListeners = new Map();
        this.responsors = new Map();
        socket.on("message", onMessage.bind(this));
    }

    enableEncryption(callback) {
        if (this.exchangingKey || this.encryption) {
            return false;
        }
        const encryption = new ServerEncryption();
        const keyExchangeParams = encryption.beginKeyExchange();
        this.exchangingKey = true;
        this.sendCommand(
            ["enableencryption", JSON.stringify(keyExchangeParams.publicKey), JSON.stringify(keyExchangeParams.salt)],
            (event) => {
                this.exchangingKey = false;
                encryption.completeKeyExchange(event.body.publicKey);
                this.encryption = encryption;
                const successEvent = { server: this.server, session: this, encryption };
                if (callback) callback.call(this, successEvent);
                this.emit("encryptionEnabled", successEvent);
            }
        );
        return true;
    }

    isEncrypted() {
        return this.encryption != null;
    }

    sendMessage(message) {
		//console.log("Server sendMessage : ", message);
        let messageData = JSON.stringify(message);
        if (this.encryption) {
            messageData = this.encryption.encrypt(messageData);
        }
        this.socket.send(messageData);
    }

    sendFrame(messagePurpose, body, requestId, extraHeaders) {
        this.sendMessage({
            header: buildHeader(messagePurpose, requestId, this.version, extraHeaders),
            body
        });
    }

    subscribeRaw(event) {
        this.sendFrame("subscribe", {
            eventName: event
        });
    }

    subscribe(event, callback) {
        let listeners = this.eventListeners.get(event);
        if (!listeners) {
            listeners = new Set();
            this.eventListeners.set(event, listeners);
            this.subscribeRaw(event);
        }
        listeners.add(callback);
    }

    unsubscribeRaw(event) {
        this.sendFrame("unsubscribe", {
            eventName: event
        });
    }

    unsubscribe(event, callback) {
        const listeners = this.eventListeners.get(event);
        if (!listeners) {
            return;
        }
        listeners.delete(callback);
        if (listeners.size === 0) {
            this.eventListeners.delete(event);
            this.unsubscribeRaw(event);
        }
    }

    publishEvent(eventName, frame) {
        const listeners = this.eventListeners.get(eventName);
        if (listeners) {
            const listenersCopy = new Set(listeners);
            listenersCopy.forEach((e) => {
                try {
                    e.call(this, frame);
                } catch (err) {
                    this.emit("error", err);
                }
            });
        } else {
            this.emit("event", frame);
        }
    }

    sendCommandRaw(requestId, command) {
        this.sendFrame(
            "commandRequest",
            {
                version: 1,
                commandLine: command,
                origin: {
                    type: "player"
                }
            },
            requestId
        );
    }

    sendCommand(command, callback) {
        const requestId = randomUUID();
        this.responsors.set(requestId, callback);
        this.sendCommandRaw(requestId, Array.isArray(command) ? command.join(" ") : command);
        return requestId;
    }

    sendCommandAgentRaw(requestId, command) {
        this.sendFrame(
            "action:agent",
            {
                version: 1,
                commandLine: command,
            },
            requestId
        );
    }

    sendCommandAgent(command, callback) {
        const requestId = randomUUID();
        this.responsors.set(requestId, callback);
        this.sendCommandAgentRaw(requestId, Array.isArray(command) ? command.join(" ") : command);
        return requestId;
    }

    sendCommandLegacyRaw(requestId, commandName, overload, input) {
        this.sendFrame(
            "commandRequest",
            {
                version: 1,
                name: commandName,
                overload,
                input,
                origin: { type: "player" }
            },
            requestId
        );
    }

    sendCommandLegacy(commandName, overload, input, callback) {
        const requestId = randomUUID();
        this.responsors.set(requestId, callback);
        this.sendCommandLegacyRaw(requestId, commandName, overload, input);
        return requestId;
    }

    respondCommand(requestId, frame) {
        const callback = this.responsors.get(requestId);
        this.responsors.delete(requestId);
        if (callback) {
            try {
                callback.call(this, frame);
            } catch (err) {
                this.emit("error", err);
            }
        } else {
            this.emit("commandResponse", frame);
        }
    }

    respondCommandAgent(requestId, frame) {
        const callback = this.responsors.get(requestId);
        this.responsors.delete(requestId);
        if (callback) {
            try {
                callback.call(this, frame);
            } catch (err) {
                this.emit("error", err);
            }
        } else {
            this.emit("commandAgentResponse", frame);
        }
    }

    disconnect(force) {
        if (force) {
            this.socket.close();
        } else {
            this.sendCommand("closewebsocket", null);
        }
    }
}

function onConnection(socket, request) {
    const session = new Session(this, socket);
    this.sessions.add(session);
    this.emit("client", { server: this, session, request });
    socket.on("close", () => {
        this.sessions.delete(this);
        session.emit("disconnect", { server: this.server, session: this });
    });
}

const kSecWebsocketKey = Symbol("sec-websocket-key");

class WSServer extends WebSocket.Server {
    constructor(port, handleClient) {
        super({
            port,
            handleProtocols: (protocols) => protocols.find((protocol) => protocol === implementName)
        });
        this.sessions = new Set();
        this.on("connection", onConnection);
        if (handleClient) {
            this.on("client", handleClient);
        }
    }

    // overwrite handleUpgrade to skip sec-websocket-key format test
    // minecraft pe pre-1.2 use a shorter version of sec-websocket-key
    handleUpgrade(req, socket, head, cb) {
        const key = req.headers["sec-websocket-key"];
        if (key && /^[+/0-9A-Za-z]{11}=$/.test(key)) {
            req.headers["sec-websocket-key"] = `skipkeytest${key}=`;
            req[kSecWebsocketKey] = key;
        }
        super.handleUpgrade(req, socket, head, cb);
    }

    // same reason as above
    completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        super.completeUpgrade(extensions, req[kSecWebsocketKey] || key, protocols, req, socket, head, cb);
    }

    broadcastCommand(command, callback) {
        this.sessions.forEach((e) => {
            e.sendCommand(command, callback);
        });
    }

    broadcastCommandAgent(command, callback) {
        this.sessions.forEach((e) => {
            e.sendCommandAgent(command, callback);
        });
    }

    broadcastSubscribe(event, callback) {
        this.sessions.forEach((e) => {
            e.subscribe(event, callback);
        });
    }

    broadcastUnsubscribe(event, callback) {
        this.sessions.forEach((e) => {
            e.unsubscribe(event, callback);
        });
    }

    disconnectAll(force) {
        this.sessions.forEach((e) => {
            e.disconnect(force);
        });
    }
}

module.exports = WSServer;
