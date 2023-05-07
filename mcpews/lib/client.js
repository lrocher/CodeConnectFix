const EventEmitter = require("events");
const WebSocket = require("ws");
const { ClientEncryption } = require("./encrypt");
const { V1, V2 } = require("./version");

function handleEncryptionHandshake() {
    return this.client.handleEncryptionHandshake(this.requestId, this.body.commandLine);
}

function respondCommandRequest(body) {
    return this.client.respondCommand(this.requestId, body);
}

function respondCommandAgentRequest(body) {
    return this.client.respondCommandAgent(this.requestId, this.actionName, body);
}

function onMessage(messageData) {
    let decryptedMessageData;
    if (this.encryption) {
        decryptedMessageData = this.encryption.decrypt(messageData);
    } else {
        decryptedMessageData = messageData;
    }
    const message = JSON.parse(decryptedMessageData);
	if (this.debug)
		console.log("Client receiveMessage : ", message);
    const { header, body } = message;
    const { messagePurpose: purpose, version } = header;
    const frameBase = {
        client: this,
        message,
        header,
        body,
        purpose,
        version
    };
    switch (purpose) {
        case "subscribe":
        case "unsubscribe": {
            const { eventName } = body;
            const isEventListening = this.eventListenMap.get(eventName);
            if (purpose === "subscribe" && !isEventListening) {
                this.emit("subscribe", {
                    ...frameBase,
                    eventName
                });
                this.eventListenMap.set(eventName, true);
            } else if (purpose === "unsubscribe" && isEventListening) {
                this.emit("unsubscribe", {
                    ...frameBase,
                    eventName
                });
                this.eventListenMap.set(eventName, false);
            }
            break;
        }
        case "action:agent":
            if (body.commandLine) {
                this.emit("commandAgent", {
                    ...frameBase,
                    requestId: header.requestId,
                    commandLine: body.commandLine,
                    respond: respondCommandAgentRequest,
                    handleEncryptionHandshake
                });
            } else {
                frameBase.purpose = header.messagePurpose = 'commandRequest';
                this.emit("commandLegacy", {
                    ...frameBase,
                    requestId: header.requestId,
                    commandName: body.name,
                    overload: body.overload,
                    input: body.input,
                    respond: respondCommandRequest
                });
            }
            break;
        case "commandRequest":
            if (body.commandLine) {
                this.emit("command", {
                    ...frameBase,
                    requestId: header.requestId,
                    commandLine: body.commandLine,
                    respond: respondCommandRequest,
                    handleEncryptionHandshake
                });
            } else {
                this.emit("commandLegacy", {
                    ...frameBase,
                    requestId: header.requestId,
                    commandName: body.name,
                    overload: body.overload,
                    input: body.input,
                    respond: respondCommandRequest
                });
            }
            break;
        default:
            this.emit("customFrame", frameBase);
    }
    this.emit("message", frameBase);
}

function onClose() {
    this.emit("disconnect", this);
}

function buildHeader(purpose, requestId, version, extraProperties) {
    return {
        version,
        requestId: requestId || "00000000-0000-0000-0000-000000000000",
        messagePurpose: purpose,
        ...extraProperties
    };
}

class WSClient extends EventEmitter {
    constructor(address, version) {
        super();
        this.socket = new WebSocket(address);
        this.eventListenMap = new Map();
        this.version = version || V1;
		this.debug = false;
        this.socket.on("message", onMessage.bind(this)).on("close", onClose.bind(this));
    }

    handleEncryptionHandshake(requestId, commandLine) {
        if (commandLine.startsWith("enableencryption ")) {
            const encryption = new ClientEncryption();
            const keyExchangeParams = encryption.beginKeyExchange();
            const args = commandLine.split(" ");
            encryption.completeKeyExchange(JSON.parse(args[1]), JSON.parse(args[2]));
            this.respondCommand(requestId, {
                publicKey: keyExchangeParams.publicKey,
                statusCode: 0
            });
            this.encryption = encryption;
            this.emit("encryptionEnabled", { client: this });
            return true;
        }
        return false;
    }

    isEncrypted() {
        return this.encryption != null;
    }

    sendMessage(message) {
		if (this.debug)
			console.log("Client sendMessage : ", message);
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

    sendError(statusCode, statusMessage, requestId) {
        this.sendFrame("error", {
            statusCode,
            statusMessage
        }, requestId);
    }

    sendEvent(eventName, body) {
        if (this.version === V2) {
            this.sendFrame("event", body, null, { eventName });
        } else {
            this.sendFrame("event", {
                ...body,
                eventName
            });
        }
    }

    publishEvent(eventName, body) {
        const isEventListening = this.eventListenMap.get(eventName);
        if (isEventListening) {
            this.sendEvent(eventName, body);
        }
    }

    respondCommand(requestId, body) {
        this.sendFrame("commandResponse", body, requestId);
    }

    respondCommandAgent(requestId, actionName, body) {
        this.sendFrame("action:agent", body, requestId, { actionName, action : actionIdFromactionName[actionName] });
    }

    disconnect() {
        this.socket.close();
    }
}

const actionIdFromactionName = {
    'attack' : 1,
    'collect' : 2,
    'destroy' : 3,
    'detectRedstone' : 4,
    'detectObstacle' : 5,
    'drop' : 6,
    'dropAll' : 7,
    'inspect' : 8,
    'inspectItemCount' : 10,
    'inspectItemDetail' : 11,
    'inspectItemSpace' : 12,
    'interact' : 13,
    'move' : 14,
    'placeBlock' : 15,
    'till' : 16,
    'transferItemTo' : 17,
    'turn' : 18
};

module.exports = WSClient;
