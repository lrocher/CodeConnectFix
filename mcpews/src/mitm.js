#!/usr/bin/env node
/* eslint-disable no-console */

const { WSServer, WSClient } = require("../lib");

function main(destAddress, sourcePort) {
    const wss = new WSServer(sourcePort);
    let clientCounter = 1;
    console.log(`Enter '/connect <ip address>:${sourcePort}' to establish a connection.`);
    console.log(`If connection established, mitm will connect to ${destAddress} and forward messages`);
    wss.on("client", ({ session }) => {
        const client = new WSClient(`ws://${destAddress}`);
        const clientNo = clientCounter;
        clientCounter += 1;
        let serverVersion = NaN;
        let clientVersion = NaN;
        console.log(`<- [${clientNo}] connected`);
        client.on("command", (event) => {
            if (event.handleEncryptionHandshake()) {
                console.log(`-> [${clientNo}] keyExchange: ${event.requestId}`);
                session.enableEncryption(() => {
                    console.log(`<- [${clientNo}] completeEncryption`);
                });
            } else {
                const { requestId, commandLine } = event;
                session.sendCommandRaw(requestId, commandLine);
                console.log(`-> [${clientNo}] command: ${requestId} ${commandLine}`);
            }
        });
        client.on("commandLegacy", ({
            requestId, commandName, overload, input
        }) => {
            session.sendCommandLegacyRaw(requestId, commandName, overload, input);
            console.log(`-> [${clientNo}] commandLegacy: ${requestId} ${commandName} ${overload}`, input);
        });
        client.on("subscribe", ({ eventName }) => {
            session.subscribeRaw(eventName);
            console.log(`-> [${clientNo}] subscribe: ${eventName}`);
        });
        client.on("unsubscribe", ({ eventName }) => {
            session.unsubscribeRaw(eventName);
            console.log(`-> [${clientNo}] unsubscribe: ${eventName}`);
        });
        client.on("message", ({ version }) => {
            if (version !== clientVersion) {
                clientVersion = version;
                console.log(`-> [${clientNo}] version: ${clientVersion}`);
            }
        });
        client.on("disconnect", () => {
            console.log(`-> [${clientNo}] disconnected from client`);
            session.disconnect(true);
        });
        session.on("mcError", ({ statusCode, statusMessage }) => {
            client.sendError(statusCode, statusMessage);
            console.log(`<- [${clientNo}] error: ${statusMessage}`);
        });
        session.on("event", ({ purpose, eventName, body }) => {
            client.publishEvent(eventName, body);
            console.log(`<- [${clientNo}] ${purpose}: ${eventName}`, body);
        });
        session.on("commandResponse", ({ requestId, body }) => {
            client.respondCommand(requestId, body);
            console.log(`<- [${clientNo}] commandResponse: ${requestId}`, body);
        });
        session.on("message", ({ version }) => {
            if (version !== serverVersion) {
                serverVersion = version;
                console.log(`<- [${clientNo}] version: ${serverVersion}`);
            }
        });
        session.on("disconnect", () => {
            console.log(`<- [${clientNo}] disconnected from server`);
            client.disconnect();
        });
    });
}

if (require.main === module) {
    main(process.argv[2], process.argv[3] || 19135);
} else {
    module.exports = { main };
}
