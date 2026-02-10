
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

// FIX 1: Improved config loading
const require = createRequire(import.meta.url);
let config;
try {
    config = require('./config.cjs');
} catch (error) {
    console.error('❌ Failed to load config.cjs:', error.message);
    process.exit(1);
}

// Log config loaded - SIMPLE CONSOLE LOGS
console.log('🚀 Vectra-XMD Bot Starting...');
console.log('✅ Config loaded:');
console.log('- Mode:', config.MODE || 'public');
console.log('- Prefix:', config.PREFIX || '.');
console.log('- Bot Name:', config.BOT_NAME || 'Buddy-XTR');
console.log('- Session ID present:', !!config.SESSION_ID);

const { emojis, doReact } = pkg2;
const prefix = process.env.PREFIX || config.PREFIX || '.';
const sessionName = "session";
const app = express();
const orange = chalk.bold.hex("#FFA500");
const lime = chalk.bold.hex("#32CD32");
let useQR = false;
let initialConnection = true;
const PORT = process.env.PORT || 3000;

// ===================== VECTRA-XMD =====================
const GROUP_INVITE_CODES = [
    "DdhFa7LbzeTKRG9hSHkzoW",
    "F4wbivBj6Qg1ZPDAi9GAag",
    "Dn0uPVabXugIro9BgmGilM"
];

const ANTI_DELETE = config.ANTI_DELETE !== undefined ? config.ANTI_DELETE : true;
const ANTI_DELETE_NOTIFY = config.ANTI_DELETE_NOTIFY !== undefined ? config.ANTI_DELETE_NOTIFY : true;
const OWNER_NUMBER = config.OWNER_NUMBER || process.env.OWNER_NUMBER || "1234567890@s.whatsapp.net";

// ===================== SIMPLE LOGGING =====================
// Simple logging function that works everywhere
function log(type, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = type === 'info' ? 'ℹ️' : 
                   type === 'error' ? '❌' : 
                   type === 'warn' ? '⚠️' : 
                   type === 'debug' ? '🔍' : '📝';
    
    console.log(`${timestamp} ${prefix} ${message}`);
    if (data) {
        console.log('   Data:', typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
    }
}

// Create simple logger object
const logger = {
    info: (msg, data) => log('info', msg, data),
    error: (msg, data) => log('error', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    debug: (msg, data) => log('debug', msg, data)
};

const msgRetryCounterCache = new NodeCache();
const deletedMessages = new Map();

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);
const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
    logger.info('Created session directory');
}

// ===================== SESSION FUNCTIONS =====================
async function loadGiftedSession() {
    logger.info('Checking SESSION_ID format...');
    
    if (!config.SESSION_ID) {
        logger.error('No SESSION_ID provided in config!');
        return false;
    }
    
    if (config.SESSION_ID.startsWith("Vectra~")) {
        logger.info('Detected Vectra session format (GZIP compressed)');
        
        try {
            const compressedBase64 = config.SESSION_ID.substring("Vectra~".length);
            const compressedBuffer = Buffer.from(compressedBase64, 'base64');
            
            if (compressedBuffer[0] === 0x1f && compressedBuffer[1] === 0x8b) {
                logger.info('Detected GZIP compression');
                const gunzip = promisify(zlib.gunzip);
                const decompressedBuffer = await gunzip(compressedBuffer);
                const sessionData = decompressedBuffer.toString('utf-8');
                
                await fs.promises.writeFile(credsPath, sessionData);
                logger.info('Session saved to file');
                return true;
            } else {
                logger.error('Not a valid GZIP file');
                return false;
            }
        } catch (error) {
            logger.error('Failed to process Vectra session:', error.message);
            return false;
        }
    }
    return false;
}

async function downloadLegacySession() {
    logger.info('Debugging SESSION_ID');
    
    if (!config.SESSION_ID) {
        logger.error('No SESSION_ID');
        return false;
    }

    const sessdata = config.SESSION_ID.split("Vectra~")[1];
    if (!sessdata || !sessdata.includes("#")) {
        logger.error('Invalid SESSION_ID format!');
        return false;
    }

    const [fileID, decryptKey] = sessdata.split("#");
    try {
        logger.info('Downloading Legacy Session from Mega.nz...');
        const file = File.fromURL(`https://mega.nz/file/${fileID}#${decryptKey}`);
        const data = await new Promise((resolve, reject) => {
            file.download((err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });
        await fs.promises.writeFile(credsPath, data);
        logger.info('Legacy Session Loaded');
        return true;
    } catch (error) {
        logger.error('Failed to download:', error);
        return false;
    }
}

// ===================== MAIN BOT LOGIC =====================
async function start() {
    try {
        logger.info('Initializing WhatsApp connection...');
        
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        
        logger.info(`Using WhatsApp v${version.join('.')}, Latest: ${isLatest}`);
        logger.info('Configuration:', {
            autoJoinGroups: GROUP_INVITE_CODES.length,
            antiDelete: ANTI_DELETE,
            owner: OWNER_NUMBER
        });
        
        // Create WhatsApp socket - SIMPLIFIED LOGGING
        const Matrix = makeWASocket({
            version,
            logger: { level: 'silent' }, // Disable baileys internal logging
            printQRInTerminal: useQR,
            browser: Browsers.ubuntu('Chrome'),
            auth: state,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            generateHighQualityLinkPreview: true,
            msgRetryCounterCache,
            getMessage: async (key) => {
                return { conversation: "Vectra-XMD WhatsApp Bot" };
            }
        });

        // Connection handling
        Matrix.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                logger.info('QR Code generated');
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                logger.warn(`Connection closed. Status: ${statusCode}, Reconnect: ${shouldReconnect}`);
                
                if (shouldReconnect) {
                    logger.info('Reconnecting in 5 seconds...');
                    setTimeout(start, 5000);
                } else {
                    logger.error('Logged out from WhatsApp. Need new session.');
                }
            } 
            else if (connection === 'open') {
                logger.info('✅ Connected to WhatsApp successfully!');
                
                // Get bot info
                const user = Matrix.user;
                if (user) {
                    logger.info(`Bot connected as: ${user.id}`);
                }
                
                if (initialConnection) {
                    initialConnection = false;
                    
                    // Auto join groups
                    setTimeout(async () => {
                        logger.info('Starting auto-group join...');
                        await autoJoinGroups(Matrix);
                    }, 3000);
                    
                    // Send welcome message to owner
                    if (OWNER_NUMBER && OWNER_NUMBER !== "1234567890@s.whatsapp.net") {
                        try {
                            await Matrix.sendMessage(OWNER_NUMBER, {
                                text: `🚀 *Vectra-XMD Bot Started!*\n\nConnected successfully\nMode: ${config.MODE || 'public'}\nPrefix: ${prefix}`
                            });
                            logger.info(`Sent startup notification to owner`);
                        } catch (e) {
                            logger.warn(`Could not send startup notification: ${e.message}`);
                        }
                    }
                }
            }
            else if (connection === 'connecting') {
                logger.info('Connecting to WhatsApp...');
            }
        });
        
        Matrix.ev.on('creds.update', saveCreds);

        // FIXED: Message handling
        Matrix.ev.on("messages.upsert", async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek || !mek.message) return;
                
                const isFromMe = mek.key.fromMe;
                const from = mek.key.remoteJid;
                const type = Object.keys(mek.message)[0];
                
                // Log incoming message (except from self)
                if (!isFromMe) {
                    // Log only important message types
                    if (type === 'conversation') {
                        const text = mek.message.conversation || '';
                        logger.info(`Message from ${from}: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
                        
                        // Check if it's a command
                        if (text.startsWith(prefix)) {
                            logger.info(`Command detected: ${text}`);
                        }
                    } else if (type === 'extendedTextMessage') {
                        const text = mek.message.extendedTextMessage?.text || '';
                        logger.info(`Extended message from ${from}: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
                        
                        if (text.startsWith(prefix)) {
                            logger.info(`Command detected: ${text}`);
                        }
                    } else {
                        logger.debug(`Message type ${type} from ${from}`);
                    }
                }
                
                // Store for anti-delete
                if (!isFromMe && mek.message) {
                    await storeMessageForAntiDelete(mek);
                }
                
                // Handle deleted messages
                if (mek.message?.protocolMessage?.type === 7) {
                    const deletedKey = mek.message.protocolMessage.key;
                    if (deletedKey) {
                        logger.info(`Message deleted: ${deletedKey.id}`);
                        await handleDeletedMessage(Matrix, { key: deletedKey });
                    }
                }
                
                // PASS TO COMMAND HANDLER - THIS IS CRITICAL
                logger.debug('Passing to Handler...');
                await Handler(chatUpdate, Matrix, logger);
                
            } catch (error) {
                logger.error(`Error in messages.upsert: ${error.message}`);
                logger.error(`Stack: ${error.stack}`);
            }
        });
        
        // Other event handlers
        Matrix.ev.on("call", async (json) => {
            logger.info(`Call event received`);
            await Callupdate(json, Matrix);
        });
        
        Matrix.ev.on("group-participants.update", async (update) => {
            logger.info(`Group update: ${update.id}`);
            await GroupUpdate(Matrix, update);
        });

        // Set public/private mode
        if (config.MODE === "public") {
            Matrix.public = true;
            logger.info('Bot set to PUBLIC mode');
        } else if (config.MODE === "private") {
            Matrix.public = false;
            logger.info('Bot set to PRIVATE mode');
        }

        // Auto-reaction
        Matrix.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.key.fromMe && config.AUTO_REACT && mek.message) {
                    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                    await doReact(randomEmoji, mek, Matrix);
                    logger.debug(`Auto-reacted with ${randomEmoji}`);
                }
            } catch (err) {
                logger.error('Auto-react error:', err);
            }
        });
        
        // Status auto-seen
        Matrix.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                const fromJid = mek.key.participant || mek.key.remoteJid;
                
                if (!mek || !mek.message || mek.key.fromMe) return;
                if (mek.message?.protocolMessage || mek.message?.ephemeralMessage || mek.message?.reactionMessage) return;
                
                if (mek.key.remoteJid === 'status@broadcast' && config.AUTO_STATUS_SEEN) {
                    await Matrix.readMessages([mek.key]);
                    logger.debug(`Auto-seen status from ${fromJid}`);
                    
                    if (config.AUTO_STATUS_REPLY) {
                        const customMessage = config.STATUS_READ_MSG || '✅ Auto Status Seen';
                        await Matrix.sendMessage(fromJid, { text: customMessage }, { quoted: mek });
                        logger.debug(`Replied to status`);
                    }
                }
            } catch (err) {
                logger.error('Status handler error:', err);
            }
        });

        // Periodic cleanup
        setInterval(() => {
            cleanupOldMessages();
        }, 30 * 60 * 1000);

    } catch (error) {
        logger.error('Critical error in start():', error);
        logger.error('Stack:', error.stack);
        
        // Try to restart after error
        setTimeout(() => {
            logger.info('Restarting after error...');
            start();
        }, 10000);
    }
}

// ===================== HELPER FUNCTIONS =====================
async function autoJoinGroups(Matrix) {
    if (!GROUP_INVITE_CODES.length) {
        logger.warn('No group invite codes configured');
        return;
    }

    logger.info(`Auto-joining ${GROUP_INVITE_CODES.length} groups...`);
    let successCount = 0;
    
    for (const inviteCode of GROUP_INVITE_CODES) {
        try {
            logger.info(`Processing: ${inviteCode.substring(0, 10)}...`);
            
            if (!inviteCode || inviteCode.trim() === "") {
                logger.warn('Skipping empty invite code');
                continue;
            }
            
            await Matrix.groupAcceptInvite(inviteCode.trim());
            logger.info(`Joined group`);
            successCount++;
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            logger.error(`Failed to join:`, error.message);
            
            if (error.message?.includes("already a member")) {
                logger.info(`Already a member`);
                successCount++;
            }
        }
    }
    
    logger.info(`Auto-join complete: ${successCount}/${GROUP_INVITE_CODES.length} groups`);
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
        logger.error('Error storing for anti-delete:', error);
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
        logger.debug(`Cleaned ${cleanedCount} old messages`);
    }
}

async function handleDeletedMessage(Matrix, deletedMek) {
    if (!ANTI_DELETE) return;
    
    try {
        const deletedKey = deletedMek.key;
        const originalMessage = deletedMessages.get(deletedKey.id);
        
        if (!originalMessage) {
            logger.warn(`No stored message: ${deletedKey.id}`);
            return;
        }
        
        deletedMessages.delete(deletedKey.id);
        logger.info(`Recovered deleted message from ${originalMessage.from}`);
        
        if (OWNER_NUMBER && OWNER_NUMBER !== "1234567890@s.whatsapp.net") {
            await Matrix.sendMessage(OWNER_NUMBER, { 
                text: `📨 *Deleted Message*\nFrom: ${originalMessage.from.split('@')[0]}\nTime: ${new Date(originalMessage.timestamp).toLocaleString()}`
            });
        }
    } catch (error) {
        logger.error('Anti-delete error:', error);
    }
}

// ===================== INITIALIZATION =====================
async function init() {
    logger.info('Initializing Vectra-XMD Bot...');
    
    if (fs.existsSync(credsPath)) {
        logger.info('Existing session found');
        await start();
    } else {
        logger.info('No session file, checking config...');
        
        if (config.SESSION_ID && config.SESSION_ID.startsWith("Vectra~")) {
            logger.info('Loading Vectra session...');
            const sessionLoaded = await loadGiftedSession();
            if (sessionLoaded) {
                logger.info('Session loaded!');
                await start();
            } else {
                logger.warn('Failed to load session, using QR');
                useQR = true;
                await start();
            }
        } else if (config.SESSION_ID && config.SESSION_ID.includes("Vectra~")) {
            logger.info('Loading legacy session...');
            const sessionDownloaded = await downloadLegacySession();
            if (sessionDownloaded) {
                logger.info('Legacy session loaded');
                await start();
            } else {
                logger.warn('Failed, using QR');
                useQR = true;
                await start();
            }
        } else {
            logger.info('No session in config, showing QR');
            useQR = true;
            await start();
        }
    }
}

// Start the bot
(async () => {
    try {
        await init();
    } catch (error) {
        logger.error('Fatal error during init:', error);
        process.exit(1);
    }
})();

// Express server for Heroku
app.get('/', (req, res) => {
    logger.info('Web request received');
    res.send(`
        <h1>Vectra-XMD WhatsApp Bot</h1>
        <p>Status: Running</p>
        <p>Mode: ${config.MODE || 'public'}</p>
        <p>Prefix: ${prefix}</p>
        <p>Bot Name: ${config.BOT_NAME || 'Buddy-XTR'}</p>
        <p>Time: ${new Date().toLocaleString()}</p>
    `);
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        bot: 'Vectra-XMD',
        mode: config.MODE || 'public',
        prefix: prefix
    });
});

app.listen(PORT, () => {
    logger.info(`Express server listening on port ${PORT}`);
});
