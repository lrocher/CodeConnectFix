# MCPEWS

A library that supports MCPE Websocket Protocol.

## Usage

Server-side:
```javascript
const { WSServer, Version }  = require("mcpews");
const server = new WSServer(19134); // port

server.on("client", session => {
    // someone type "/connect <ip address>:19134" in the game console

    // execute a command
    session.sendCommand("say Connected!");

    // execute a command and receive the response
    session.sendCommand("list", ({ body }) => {
        console.log("currentPlayerCount = " + body.currentPlayerCount);
    });

    // subscribe a event
    session.subscribe("PlayerMessage", (event) => {
        // when event triggered
        const { body, version } = event;
        let message, messageType;
        if (version === Version.V2) {
            message = body.message;
            messageType = body.type;
        } else {
            message = body.properties.Message;
            messageType = body.properties.MessageType;
        }
        if (message === "close") {
            // disconnect from the game
            session.disconnect();
        } else if (messageType === "chat") {
            session.sendCommand("say You just said " + message);
        }
    });

    // enable encrypted connection
    session.enableEncryption();
});
```

Client-side:
```javascript
const { WSClient }  = require("mcpews");
const client = new WSClient("ws://127.0.0.1:19134"); // address

process.stdin.on("data", buffer => {
    // trigger a event (will be ignored if not subscribed)
    client.emitEvent("input", {
        data: buffer.toString()
    });
});

client.on("command", (event) => {
    const { requestId, commandLine } = event;

    // pass encryption handshake to client itself
    if (event.handleEncryptionHandshake()) return;

    // command received
    console.log("command: " + commandLine);

    // respond the command, must be called after handling
    event.respondCommand({
        length: commandLine.length
    });
});
```

WSApp, optimized for async/await:
```javascript
const { WSApp } = require("mcpews");

const app = new WSApp(19134);
app.on("session", async (session) => {
    const playerNames = (await session.command("testfor @a")).body.victim;
    const names = await Promise.all(playerNames.map(async (playerName) => {
        await session.command(`tell ${playerName} What's your name?`);
        try {
            const name = (await session.waitForEvent(
                "PlayerMessage",
                30000,
                (ev) => ev.body.sender === playerName
            )).body.message;
            await session.command(`tell ${playerName} Your name is ${name}`);
            return name;
        } catch (err) {
            return playerName;
        }
    }));
    console.log(names);
    session.disconnect();
});
```

REPL:
```
mcpews [<custom port>]
```

MITM:
```
mcpewsmitm <destination address> [<listen port>]
```