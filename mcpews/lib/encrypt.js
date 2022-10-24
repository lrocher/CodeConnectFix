const crypto = require("crypto");

const ecdhCurve = "secp384r1";
const blockSize = 16;
const cipherAlgorithm = "aes-256-cfb8";
const hashAlgorithm = "sha256";

const asn1Header = Buffer.from("3076301006072a8648ce3d020106052b81040022036200", "hex");
function asOpenSSLPubKey(pubKeyBuffer) {
    return Buffer.concat([asn1Header, pubKeyBuffer]);
}
function asNodejsPubKey(pubKeyBuffer) {
    return pubKeyBuffer.slice(asn1Header.length);
}

function hashBuffer(algorithm, buffer) {
    const hash = crypto.createHash(algorithm);
    hash.update(buffer);
    return hash.digest();
}

class Encryption {
    constructor() {
        this.ecdh = crypto.createECDH(ecdhCurve);
        this.pubKey = this.ecdh.generateKeys();
    }

    initializeCipher(secretKey, salt) {
        const key = hashBuffer(hashAlgorithm, Buffer.concat([salt, secretKey]));
        const initialVector = key.slice(0, blockSize);
        this.cipher = crypto.createCipheriv(cipherAlgorithm, key, initialVector);
        this.decipher = crypto.createDecipheriv(cipherAlgorithm, key, initialVector);
        this.cipher.setAutoPadding(false);
        this.decipher.setAutoPadding(false);
    }

    encrypt(str) {
        return this.cipher.update(str, "utf8");
    }

    decrypt(buffer) {
        return this.decipher.update(buffer).toString("utf8");
    }
}

class ServerEncryption extends Encryption {
    beginKeyExchange() {
        this.salt = crypto.randomBytes(blockSize);
        return {
            publicKey: asOpenSSLPubKey(this.pubKey).toString("base64"),
            salt: this.salt.toString("base64")
        };
    }

    completeKeyExchange(clientPubKeyStr) {
        const clientPubKey = asNodejsPubKey(Buffer.from(clientPubKeyStr, "base64"));
        this.initializeCipher(this.ecdh.computeSecret(clientPubKey), this.salt);
    }
}

class ClientEncryption extends Encryption {
    beginKeyExchange() {
        return {
            publicKey: asOpenSSLPubKey(this.pubKey).toString("base64")
        };
    }

    completeKeyExchange(serverPubKeyStr, saltStr) {
        const serverPubKey = asNodejsPubKey(Buffer.from(serverPubKeyStr, "base64"));
        const salt = Buffer.from(saltStr, "base64");
        this.initializeCipher(this.ecdh.computeSecret(serverPubKey), salt);
    }
}

module.exports = {
    implementName: "com.microsoft.minecraft.wsencrypt",
    ServerEncryption,
    ClientEncryption
};
