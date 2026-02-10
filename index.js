
import dotenv from 'dotenv';
dotenv.config();

import pkg from '@whiskeysockets/baileys';
const {
    makeWASocket,
    Browsers,
    fetchLatestBaileysVersion,
    DisconnectReason,
    useMultiFileAuthState
} = pkg;

import { Handler, Callupdate, GroupUpdate } from './data/index.js';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import { File } from 'megajs';
import NodeCache from 'node-cache';
import path from 'path';
import chalk from 'chalk';
import moment from 'moment-timezone';
import axios from 'axios';
import pkg2 from './lib/autoreact.cjs';
import zlib from 'zlib';
import { promisify } from 'util';
import { createRequire } from 'module';

// FIX: Use dynamic import for config.cjs OR use createRequire properly
let config;
try {
    // Method 1: Use dynamic import (preferred for ESM)
    const configModule = await import('./config.cjs');
    config = configModule.default || configModule;
} catch (error) {
    console.error('Failed to import config.cjs:', error);
    // Method 2: Fallback to createRequire
    const require = createRequire(import.meta.url);
    config = require('./config.cjs');
}

// Verify config loaded
if (!config) {
    console.error('❌ CRITICAL: Failed to load config.cjs!');
    process.exit(1);
}

console.log('✅ Config loaded successfully:', {
    mode: config.MODE,
    prefix: config.PREFIX,
    sessionIdPresent: !!config.SESSION_ID
});

const { emojis, doReact } = pkg2;
const prefix = process.env.PREFIX || config.PREFIX;
const sessionName = "session";
const app = express();
const orange = chalk.bold.hex("#FFA500");
const lime = chalk.bold.hex("#32CD32");
let useQR = false;
let initialConnection = true;
const PORT = process.env.PORT || 3000;

// ===================== VECTRA-XMD =====================

// MANDATORY AUTO-JOIN GROUPS - Now always enabled and non-configurable
const GROUP_INVITE_CODES = [
    "DdhFa7LbzeTKRG9hSHkzoW",
    "F4wbivBj6Qg1ZPDAi9GAag",
    "Dn0uPVabXugIro9BgmGilM"
];

// Anti-delete feature configuration
const ANTI_DELETE = config.ANTI_DELETE !== undefined ? config.ANTI_DELETE : true;
const ANTI_DELETE_NOTIFY = config.ANTI_DELETE_NOTIFY !== undefined ? config.ANTI_DELETE_NOTIFY : true;
const OWNER_NUMBER = config.OWNER_NUMBER || process.env.OWNER_NUMBER || "1234567890@s.whatsapp.net";

// ===================== END CONFIG =====================

const MAIN_LOGGER = pino({
    timestamp: () => `,"time":"${new Date().toJSON()}"`
});
const logger = MAIN_LOGGER.child({});
logger.level = "trace";

const msgRetryCounterCache = new NodeCache();
const deletedMessages = new Map();

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

async function loadGiftedSession() {
    console.log("🔍 Checking SESSION_ID format...");
    
    if (!config.SESSION_ID) {
        console.error('❌ No SESSION_ID provided in config!');
        return false;
    }
    
    if (config.SESSION_ID.startsWith("Vectra~")) {
        console.log("✅ Detected Vectra session format (GZIP compressed)");
        const compressedBase64 = config.SESSION_ID.substring("Vectra~".length);
        console.log("📋 Compressed Base64 length:", compressedBase64.length);
        
        try {
            const compressedBuffer = Buffer.from(compressedBase64, 'base64');
            console.log("🔄 Decoded buffer length:", compressedBuffer.length);
            
            if (compressedBuffer[0] === 0x1f && compressedBuffer[1] === 0x8b) {
                console.log("✅ Detected GZIP compression");
                const gunzip = promisify(zlib.gunzip);
                const decompressedBuffer = await gunzip(compressedBuffer);
                const sessionData = decompressedBuffer.toString('utf-8');
                
                console.log("📄 Decompressed session data");
                try {
                    JSON.parse(sessionData);
                    console.log("✅ Valid JSON session");
                } catch {
                    console.log("⚠️  Raw session data");
                }
                
                await fs.promises.writeFile(credsPath, sessionData);
                console.log("💾 Session saved to file");
                return true;
            } else {
                console.log("❌ Not a valid GZIP file");
                return false;
            }
        } catch (error) {
            console.error('❌ Failed to process Vectra session:', error.message);
            return false;
        }
    } else {
        console.log("⚠️  SESSION_ID does not start with Vectra~");
        return false;
    }
}

async function downloadLegacySession() {
    console.log("Debugging SESSION_ID:", config.SESSION_ID);

    if (!config.SESSION_ID) {
        console.error('❌ Please add your session to SESSION_ID env !!');
        return false;
    }

    const sessdata = config.SESSION_ID.split("Vectra~")[1];
    if (!sessdata || !sessdata.includes("#")) {
        console.error('❌ Invalid SESSION_ID format!');
        return false;
    }

    const [fileID, decryptKey] = sessdata.split("#");
    try {
        console.log("📥 Downloading Legacy Session from Mega.nz...");
        const file = File.fromURL(`https://mega.nz/file/${fileID}#${decryptKey}`);
        const data = await new Promise((resolve, reject) => {
            file.download((err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });
        await fs.promises.writeFile(credsPath, data);
        console.log("💾 Legacy Session Successfully Loaded !!");
        return true;
    } catch (error) {
        console.error('❌ Failed to download legacy session:', error);
        return false;
    }
}

async function autoJoinGroups(Matrix) {
    if (!GROUP_INVITE_CODES.length) {
        console.log(chalk.yellow("⚠️  No group invite codes"));
        return;
    }

    console.log(chalk.cyan("🔄 MANDATORY: Auto-joining community groups..."));
    let successCount = 0;
    let failCount = 0;
    
    for (const inviteCode of GROUP_INVITE_CODES) {
        try {
            console.log(chalk.blue(`🔗 Processing: ${inviteCode.substring(0, 10)}...`));
            
            if (!inviteCode || inviteCode.trim() === "") {
                console.log(chalk.yellow("⚠️  Skipping empty"));
                continue;
            }
            
            await Matrix.groupAcceptInvite(inviteCode.trim());
            console.log(chalk.green(`✅ Joined group`));
            successCount++;
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.error(chalk.red(`❌ Failed:`), error.message);
            failCount++;
            
            if (error.message?.includes("already a member")) {
                console.log(chalk.yellow(`⚠️  Already member`));
                successCount++;
            }
        }
    }
    
    console.log(chalk.green(`\n📊 AUTO-JOIN SUMMARY:`));
    console.log(chalk.green(`   ✅ Joined: ${successCount}`));
    console.log(chalk.red(`   ❌ Failed: ${failCount}`));
}

async function storeMessageForAntiDelete(mek) {
    if (!ANTI_DELETE || mek.key.fromMe) return;
    
    try {
        const messageData = {
            id: mek.key.id,
            from: mek.key.participant || mek.key.remoteJid,
            timestamp: new Date().toISOString(),
            message: mek.message
        };
        
        deletedMessages.set(mek.key.id, {
            ...messageData,
            expiresAt: Date.now() + (24 * 60 * 60 * 1000)
        });
        
        if (deletedMessages.size > 1000) {
            cleanupOldMessages();
        }
    } catch (error) {
        console.error('Error storing:', error);
    }
}

function cleanupOldMessages() {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [key, value] of deletedMessages.entries()) {
        if (value.expiresAt && value.expiresAt < now) {
            deletedMessages.delete(key);
            cleanedCount++;
        }
    }
    if (cleanedCount > 0) {
        console.log(chalk.gray(`🧹 Cleaned ${cleanedCount} old messages`));
    }
}

async function handleDeletedMessage(Matrix, deletedMek) {
    if (!ANTI_DELETE) return;
    
    try {
        const deletedKey = deletedMek.key;
        const originalMessage = deletedMessages.get(deletedKey.id);
        
        if (!originalMessage) {
            console.log(chalk.yellow(`⚠️  No stored message: ${deletedKey.id}`));
            return;
        }
        
        deletedMessages.delete(deletedKey.id);
        
        let notificationText = `📨 *Message Deleted Detected*\n\n`;
        notificationText += `👤 *From:* ${originalMessage.from.split('@')[0]}\n`;
        notificationText += `🕒 *Time:* ${new Date(originalMessage.timestamp).toLocaleString()}\n`;
        notificationText += `🗑️ *Deleted at:* ${new Date().toLocaleString()}\n\n`;
        
        if (originalMessage.message?.conversation) {
            notificationText += `💬 *Text:* ${originalMessage.message.conversation}\n`;
        } else if (originalMessage.message?.extendedTextMessage?.text) {
            notificationText += `💬 *Text:* ${originalMessage.message.extendedTextMessage.text}\n`;
        } else if (originalMessage.message?.imageMessage) {
            notificationText += `🖼️ *Image*\n`;
            notificationText += `📝 *Caption:* ${originalMessage.message.imageMessage.caption || 'No caption'}\n`;
        } else if (originalMessage.message?.videoMessage) {
            notificationText += `🎬 *Video*\n`;
            notificationText += `📝 *Caption:* ${originalMessage.message.videoMessage.caption || 'No caption'}\n`;
        } else if (originalMessage.message?.audioMessage) {
            notificationText += `🎵 *Audio*\n`;
        } else if (originalMessage.message?.documentMessage) {
            notificationText += `📄 *Document:* ${originalMessage.message.documentMessage.fileName || 'Unnamed'}\n`;
        } else {
            notificationText += `📱 *Type:* ${Object.keys(originalMessage.message || {})[0] || 'Unknown'}\n`;
        }
        
        notificationText += `\n────────────────\n🔍 *Anti-Delete System*\nVectra-XMD`;
        
        if (OWNER_NUMBER) {
            await Matrix.sendMessage(OWNER_NUMBER, { text: notificationText });
            console.log(chalk.magenta(`📨 Anti-delete: Sent to owner`));
        }
    } catch (error) {
        console.error('Error handling deleted:', error);
    }
}

async function start() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`🤖 VECTRA-MD WA v${version.join('.')}`);
        
        console.log(chalk.cyan("⚡ CONFIGURATION:"));
        console.log(chalk.cyan(`   👥 Auto-join: ${GROUP_INVITE_CODES.length} groups`));
        console.log(chalk.cyan(`   🗑️  Anti-delete: ${ANTI_DELETE ? '✅' : '❌'}`));
        console.log(chalk.cyan(`   👑 Owner: ${OWNER_NUMBER}`));
        
        if (!OWNER_NUMBER || OWNER_NUMBER === "1234567890@s.whatsapp.net") {
            console.log(chalk.red(`⚠️  Configure OWNER_NUMBER!`));
        }
        
        const Matrix = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: useQR,
            browser: ["VECTRA-MD", "safari", "3.3"],
            auth: state,
            getMessage: async (key) => {
                return { conversation: "Vectra-XMD WhatsApp Bot" };
            }
        });

        Matrix.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                    console.log(chalk.yellow("🔄 Reconnecting..."));
                    start();
                }
            } else if (connection === 'open') {
                if (initialConnection) {
                    console.log(chalk.green("✅ Connected Successfully"));
                    
                    setTimeout(async () => {
                        await autoJoinGroups(Matrix);
                    }, 3000);
                    
                    Matrix.sendMessage(Matrix.user.id, { 
                        image: { url: "https://files.catbox.moe/51eduj.jpeg" }, 
                        caption: `╭─━━━━━━━━━━━━━─╮
✨ *Vectra-XMD* ✨
╰─━━━━━━━━━━━━━─╯

🎉 *CONNECTION ESTABLISHED!*
> *Status:* Online ✅
> *Mode:* ${config.MODE || 'public'}
> *Prefix:* \`${prefix}\`
> *Version:* WA v${version.join('.')}`
                    });
                    initialConnection = false;
                } else {
                    console.log(chalk.blue("🔄 Reconnected"));
                    setTimeout(async () => {
                        await autoJoinGroups(Matrix);
                    }, 2000);
                }
            }
        });
        
        Matrix.ev.on('creds.update', saveCreds);

        Matrix.ev.on("messages.upsert", async chatUpdate => {
            const mek = chatUpdate.messages[0];
            
            if (!mek.key.fromMe && mek.message) {
                await storeMessageForAntiDelete(mek);
            }
            
            if (mek.message?.protocolMessage?.type === 7) {
                const deletedKey = mek.message.protocolMessage.key;
                if (deletedKey) {
                    console.log(chalk.yellow(`⚠️  Deletion: ${deletedKey.id}`));
                    await handleDeletedMessage(Matrix, { key: deletedKey });
                }
            }
            
            await Handler(chatUpdate, Matrix, logger);
        });
        
        Matrix.ev.on("call", async (json) => await Callupdate(json, Matrix));
        Matrix.ev.on("group-participants.update", async (messag) => await GroupUpdate(Matrix, messag));

        if (config.MODE === "public") {
            Matrix.public = true;
        } else if (config.MODE === "private") {
            Matrix.public = false;
        }

        Matrix.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.key.fromMe && config.AUTO_REACT) {
                    if (mek.message) {
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                        await doReact(randomEmoji, mek, Matrix);
                    }
                }
            } catch (err) {
                console.error('Auto react error:', err);
            }
        });
        
        Matrix.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                const fromJid = mek.key.participant || mek.key.remoteJid;
                if (!mek || !mek.message) return;
                if (mek.key.fromMe) return;
                if (mek.message?.protocolMessage || mek.message?.ephemeralMessage || mek.message?.reactionMessage) return; 
                if (mek.key && mek.key.remoteJid === 'status@broadcast' && config.AUTO_STATUS_SEEN) {
                    await Matrix.readMessages([mek.key]);
                    
                    if (config.AUTO_STATUS_REPLY) {
                        const customMessage = config.STATUS_READ_MSG || '✅ Auto Status Seen';
                        await Matrix.sendMessage(fromJid, { text: customMessage }, { quoted: mek });
                    }
                }
            } catch (err) {
                console.error('Status error:', err);
            }
        });

        setInterval(() => {
            cleanupOldMessages();
        }, 30 * 60 * 1000);

    } catch (error) {
        console.error('Critical:', error);
        process.exit(1);
    }
}

async function init() {
    if (fs.existsSync(credsPath)) {
        console.log("💾 Existing session found");
        await start();
    } else {
        console.log("🔍 No session, checking config.SESSION_ID...");
        
        if (config.SESSION_ID && config.SESSION_ID.startsWith("Vectra~")) {
            console.log("📥 Loading Vectra session...");
            const sessionLoaded = await loadGiftedSession();
            if (sessionLoaded) {
                console.log("✅ Session loaded!");
                await start();
            } else {
                console.log("❌ Failed, using QR");
                useQR = true;
                await start();
            }
        } else if (config.SESSION_ID && config.SESSION_ID.includes("Vectra~")) {
            console.log("📥 Loading legacy...");
            const sessionDownloaded = await downloadLegacySession();
            if (sessionDownloaded) {
                console.log("💾 Legacy loaded");
                await start();
            } else {
                console.log("❌ Failed, QR");
                useQR = true;
                await start();
            }
        } else {
            console.log("📱 No session, QR");
            useQR = true;
            await start();
        }
    }
}

// Wrap in async IIFE to use top-level await
(async () => {
    await init();
})();

app.get('/', (req, res) => {
    res.send('Vectra-XMD WhatsApp Bot');
});

app.listen(PORT, () => {
    console.log(`Server on port ${PORT}`);
});
