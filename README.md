# CodeConnectFix

Allow use 'Code Connection for Minecraft' v1.50 with Minecraft Bedrock v1.19.x
It's a 'Man In The Middle' WebSocketSerwer for simulate a compatible version of Minecraft Bedrock to 'Code Connection for Minecraft'.

## Install

### Windows Executable - Easy Way -

Download [CodeConnectFix.exe](https://github.com/lrocher/CodeConnectFix/releases/download/v1.0.0/CodeConnectFix.exe) and copy file on your Desktop.

### From Source - Developper Way -

Requirement : Install Node.Js v16 LTS (https://nodejs.org/en/download/)

1) Download Source and extract archive in a directory (or Git clone project) 
2) Open a shell (cmd.exe) an navigate to project directory
3) Executable 'npm install' for download dependencies
4) Executable 'npm start' or 'node index.js' for run server
5) Executable 'npm run build' for generate executable
		
## Usage

On same computer :

1) Start 'Code Connection for Minecraft'.
2) Start 'CodeConnectFix' by run executable or execute server with NPM/Node.
   Note: First execution, require to add a firewall rule with an administrative account.
3) Start 'Minecraft Bedrock'.
   1) Create a new world, Activate Cheat Mode, Start game.
   2) In game, open chat (Press Enter or / key).
   3) Execute command '/connect localhost:19135' and check confirmation message.
   4) Put your game in pause (Press Escape).
4) Switch to 'Code Connection for Minecraft' and choose an editor.

On different computers, you need to adjust computer address.

	CodeConnectFix [address:port] [port]

- [address:port] : Value copied from 'Code Connection for Minecraft' after \connect. (Default: localhost:19131)
- [port] : Value for 'CodeConnectFix' (Default: 19135)
	
## Credits

This tools use a modified version of 'mcpews' v3.0.1 (A library that supports MCPE Websocket Protocol) made by XeroAlpha.

  - https://github.com/XeroAlpha/mcpews
