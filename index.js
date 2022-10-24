#!/usr/bin/env node
/* eslint-disable no-console */

const { WSServer, WSClient, Version } = require("./mcpews");

const ip = Object.values(require('os').networkInterfaces()).flat().find(i => i.family == 'IPv4' && !i.internal);
const localhost = ( ip != null ? ip.address : 'localhost');

function main(destAddress, sourcePort) {
    const wss = new WSServer(sourcePort);
    let clientCounter = 1;
    
	console.log(`Enter '/connect ${localhost}:${sourcePort}' to establish a connection.`);
    console.log(`If connection established, CodeConnectFix will connect to ${destAddress} and forward messages`);
	
    wss.on("client", ({ session }) => {
        const client = new WSClient(`ws://${destAddress}`, Version.V2);
        const clientNo = clientCounter;
        clientCounter += 1;
    
		const Requests = {};
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
                console.log(`-> [${clientNo}] command: ${requestId} ${commandLine}`);
				// Kept track of geteduclientinfo request
				if (commandLine === 'geteduclientinfo') {
					Requests[requestId] = commandLine;
				}
                session.sendCommandRaw(requestId, commandLine);

            }
        });
		
        client.on("commandLegacy", ({
            requestId, commandName, overload, input
        }) => {
            console.log(`-> [${clientNo}] commandLegacy: ${requestId} ${commandName}`);
			// Not allow commandLegacy => It's force MakeCode to use V2 protocol
			client.sendError(2, "Error commandLegacy", requestId);
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
            console.log(`<- [${clientNo}] error: ${statusMessage}`);
            client.sendError(statusCode, statusMessage);
        });
        session.on("event", ({ purpose, eventName, body }) => {
			console.log(`<- [${clientNo}] ${purpose}: ${eventName}`);
            client.publishEvent(eventName, body);
        });
        session.on("commandResponse", ({ requestId, body }) => {
            console.log(`<- [${clientNo}] commandResponse: ${requestId} ${body.statusCode}`);
			// Request is tracked ?
			let commandLine = Requests[requestId];
			if ( commandLine ) {
				// If response of geteduclientinfo => Fake Code Connexion with companionProtocolVersion to v4
				// Last version of minecraft bedrock return his version number (16973824)
				if ( commandLine === 'geteduclientinfo' )
					body.companionProtocolVersion = 4;
				delete Requests[requestId]
			}
            client.respondCommand(requestId, body);
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
    main(process.argv[2] || 'localhost:19131', process.argv[3] || 19135);
} else {
    module.exports = { main };
}
