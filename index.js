// index.js - Vectra-XMD WhatsApp Bot (Fixed command processing)
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

// FIX: Improved config loading
const require = createRequire(import.meta.url);
let config;
try {
    config = require('./config.cjs');
} catch (error) {
    console.error('❌ Failed to load config.cjs:', error.message);
    process.exit(1);
}

// Simple console logging for our own logs
function log(type, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = type === 'info' ? 'ℹ️' : 
                   type === 'error' ? '❌' : 
                   type === 'warn' ? '⚠️' : 
                   type === 'debug' ? '🔍' : '📝';
    
    const logMsg = `${timestamp} ${prefix} ${message}`;
    
    // Colorize for better readability in Heroku
    if (type === 'info') {
        console.log('\x1b[36m%s\x1b[0m', logMsg); // Cyan
    } else if (type === 'error') {
        console.log('\x1b[31m%s\x1b[0m', logMsg); // Red
    } else if (type === 'warn') {
        console.log('\x1b[33m%s\x1b[0m', logMsg); // Yellow
    } else {
        console.log(logMsg);
    }
    
    if (data && typeof data === 'object') {
        console.log('\x1b[35m%s\x1b[0m', '   Data:', JSON.stringify(data, null, 2)); // Magenta
    } else if (data) {
        console.log('\x1b[35m%s\x1b[0m', `   Data: ${data}`); // Magenta
    }
}

// Create console logger for our app
const consoleLogger = {
    info: (msg, data) => log('info', msg, data),
    error: (msg, data) => log('error', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    debug: (msg, data) => log('debug', msg, data)
};

consoleLogger.info('🚀 VECTRA-XMD BOT STARTING...');
consoleLogger.info('✅ CONFIG LOADED:', {
    mode: config.MODE || 'public',
    prefix: config.PREFIX || '.',
    botName: config.BOT_NAME || 'Vectra',
    hasSession: !!config.SESSION_ID,
    owner: config.OWNER_NUMBER || 'Not configured'
});

const { emojis, doReact } = pkg2;
const prefix = process.env.PREFIX || config.PREFIX || '.';
const sessionName = "session";
const app = express();
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

// ===================== LOGGING =====================
// Create a simple pino logger for baileys (no transport)
const baileysLogger = pino({
    level: 'warn', // Reduce noise from baileys
    timestamp: pino.stdTimeFunctions.isoTime
});

// We'll use our console logger for our own logs
const logger = consoleLogger;

const msgRetryCounterCache = new NodeCache();
const deletedMessages = new Map();

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);
const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
    logger.info('📁 Created session directory');
}

// ===================== SESSION FUNCTIONS =====================
async function loadGiftedSession() {
    logger.info('🔍 Checking SESSION_ID format...');
    
    if (!config.SESSION_ID) {
        logger.error('❌ No SESSION_ID provided in config!');
        return false;
    }
    
    if (config.SESSION_ID.startsWith("Vectra~")) {
        logger.info('✅ Detected Vectra session format (GZIP compressed)');
        
        try {
            const compressedBase64 = config.SESSION_ID.substring("Vectra~".length);
            const compressedBuffer = Buffer.from(compressedBase64, 'base64');
            
            if (compressedBuffer[0] === 0x1f && compressedBuffer[1] === 0x8b) {
                logger.info('✅ Detected GZIP compression');
                const gunzip = promisify(zlib.gunzip);
                const decompressedBuffer = await gunzip(compressedBuffer);
                const sessionData = decompressedBuffer.toString('utf-8');
                
                await fs.promises.writeFile(credsPath, sessionData);
                logger.info('💾 Session saved to file');
                return true;
            } else {
                logger.error('❌ Not a valid GZIP file');
                return false;
            }
        } catch (error) {
            logger.error('❌ Failed to process Vectra session:', error.message);
            return false;
        }
    }
    return false;
}

async function downloadLegacySession() {
    logger.info('🔍 Debugging SESSION_ID...');
    
    if (!config.SESSION_ID) {
        logger.error('❌ No SESSION_ID');
        return false;
    }

    const sessdata = config.SESSION_ID.split("Vectra~")[1];
    if (!sessdata || !sessdata.includes("#")) {
        logger.error('❌ Invalid SESSION_ID format!');
        return false;
    }

    const [fileID, decryptKey] = sessdata.split("#");
    try {
        logger.info('📥 Downloading Legacy Session from Mega.nz...');
        const file = File.fromURL(`https://mega.nz/file/${fileID}#${decryptKey}`);
        const data = await new Promise((resolve, reject) => {
            file.download((err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });
        await fs.promises.writeFile(credsPath, data);
        logger.info('💾 Legacy Session Loaded');
        return true;
    } catch (error) {
        logger.error('❌ Failed to download:', error);
        return false;
    }
}

// ===================== MAIN BOT LOGIC =====================
async function start() {
    try {
        logger.info('🔧 Initializing WhatsApp connection...');
        
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        
        logger.info(`🤖 Using WhatsApp v${version.join('.')}, Latest: ${isLatest}`);
        logger.info('⚡ CONFIGURATION:');
        logger.info(`   👥 Auto-join groups: ${GROUP_INVITE_CODES.length}`);
        logger.info(`   🗑️  Anti-delete: ${ANTI_DELETE ? '✅' : '❌'}`);
        logger.info(`   👑 Owner: ${OWNER_NUMBER}`);
        logger.info(`   🎯 Prefix: ${prefix}`);
        logger.info(`   🌐 Mode: ${config.MODE || 'public'}`);
        
        // Create WhatsApp socket with minimal logging
        const Matrix = makeWASocket({
            version,
            logger: baileysLogger,
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

        // Track connection state
        Matrix.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                logger.info('📱 QR Code generated - scan with WhatsApp');
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                logger.warn(`🔌 Connection closed. Status: ${statusCode}, Reconnect: ${shouldReconnect}`);
                
                if (shouldReconnect) {
                    logger.info('🔄 Reconnecting in 5 seconds...');
                    setTimeout(start, 5000);
                } else {
                    logger.error('❌ Logged out from WhatsApp. Need new session.');
                }
            } 
            else if (connection === 'open') {
                logger.info('✅ CONNECTED TO WHATSAPP SUCCESSFULLY!');
                
                // Get bot info
                const user = Matrix.user;
                if (user) {
                    logger.info(`🤖 Bot connected as: ${user.id}`);
                    logger.info(`📛 Pushname: ${user.name || 'Unknown'}`);
                }
                
                if (initialConnection) {
                    initialConnection = false;
                    
                    // Auto join groups after connection
                    setTimeout(async () => {
                        logger.info('👥 Starting auto-group join...');
                        await autoJoinGroups(Matrix);
                    }, 3000);
                    
                    // Send startup notification
                    if (OWNER_NUMBER && OWNER_NUMBER !== "1234567890@s.whatsapp.net") {
                        try {
                            await Matrix.sendMessage(OWNER_NUMBER, {
                                text: `🚀 *Vectra-XMD Bot Started!*\n\n✅ Connected successfully\n🎯 Prefix: ${prefix}\n🌐 Mode: ${config.MODE || 'public'}\n⏰ ${new Date().toLocaleString()}`
                            });
                            logger.info(`📨 Sent startup notification to owner`);
                        } catch (e) {
                            logger.warn(`⚠️ Could not send startup notification: ${e.message}`);
                        }
                    }
                } else {
                    logger.info('🔄 Connection reestablished!');
                }
            }
            else if (connection === 'connecting') {
                logger.info('🔄 Connecting to WhatsApp...');
            }
        });
        
        Matrix.ev.on('creds.update', saveCreds);

        // ===================== MESSAGE HANDLING =====================
        // CRITICAL: This is where messages are processed
        Matrix.ev.on("messages.upsert", async (chatUpdate) => {
            try {
                // Check if it's a new message
                if (chatUpdate.type !== 'notify') {
                    return;
                }
                
                const mek = chatUpdate.messages[0];
                if (!mek || !mek.message) {
                    return;
                }
                
                const isFromMe = mek.key.fromMe;
                const from = mek.key.remoteJid;
                const type = Object.keys(mek.message)[0];
                const sender = mek.key.participant || from;
                
                // Skip if message is from self
                if (isFromMe) {
                    return;
                }
                
                // Extract message text for logging
                let messageText = '';
                if (mek.message.conversation) {
                    messageText = mek.message.conversation;
                } else if (mek.message.extendedTextMessage?.text) {
                    messageText = mek.message.extendedTextMessage.text;
                } else if (mek.message.imageMessage?.caption) {
                    messageText = mek.message.imageMessage.caption;
                } else if (mek.message.videoMessage?.caption) {
                    messageText = mek.message.videoMessage.caption;
                }
                
                // Clean sender JID for display
                const cleanSender = sender.split('@')[0] || sender;
                
                // Log incoming message
                if (messageText) {
                    logger.info(`📩 FROM: ${cleanSender}`);
                    logger.info(`💬 MSG: ${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}`);
                    
                    // Check for command
                    if (messageText.startsWith(prefix)) {
                        logger.info(`🎯 COMMAND DETECTED: ${messageText}`);
                    }
                } else {
                    logger.info(`📩 FROM: ${cleanSender} | TYPE: ${type}`);
                }
                
                // Store for anti-delete
                await storeMessageForAntiDelete(mek);
                
                // Handle deleted messages
                if (mek.message?.protocolMessage?.type === 7) {
                    const deletedKey = mek.message.protocolMessage.key;
                    if (deletedKey) {
                        logger.info(`🗑️ Message deleted: ${deletedKey.id}`);
                        await handleDeletedMessage(Matrix, { key: deletedKey });
                    }
                }
                
                // ===================== PASS TO HANDLER =====================
                // This is where commands should be processed
                logger.debug('🔄 Passing to Handler...');
                try {
                    // Pass the logger that Handler expects (pino instance)
                    await Handler(chatUpdate, Matrix, baileysLogger);
                    logger.debug('✅ Handler executed');
                } catch (handlerError) {
                    logger.error('❌ Handler error:', handlerError.message);
                    logger.error('🔍 Stack:', handlerError.stack);
                    
                    // Try to send error to user
                    try {
                        if (messageText.startsWith(prefix)) {
                            await Matrix.sendMessage(from, {
                                text: `❌ Command error: ${handlerError.message}\n\nPlease try again or contact admin.`
                            });
                        }
                    } catch (sendError) {
                        logger.error('Failed to send error message:', sendError.message);
                    }
                }
                
            } catch (error) {
                logger.error('❌ Error in messages.upsert handler:', error.message);
                logger.error('🔍 Stack:', error.stack);
            }
        });
        
        // Handle calls
        Matrix.ev.on("call", async (json) => {
            logger.info(`📞 Incoming call`);
            await Callupdate(json, Matrix);
        });
        
        // Handle group updates
        Matrix.ev.on("group-participants.update", async (update) => {
            logger.info(`👥 Group update in: ${update.id}`);
            await GroupUpdate(Matrix, update);
        });

        // Set bot mode
        if (config.MODE === "public") {
            Matrix.public = true;
            logger.info('🌐 Bot set to PUBLIC mode');
        } else if (config.MODE === "private") {
            Matrix.public = false;
            logger.info('🔒 Bot set to PRIVATE mode');
        }

        // Auto-reaction feature
        Matrix.ev.on('messages.upsert', async (chatUpdate) => {
            if (chatUpdate.type !== 'notify') return;
            
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.key.fromMe && config.AUTO_REACT && mek.message) {
                    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                    await doReact(randomEmoji, mek, Matrix);
                    logger.debug(`😄 Auto-reacted with ${randomEmoji}`);
                }
            } catch (err) {
                logger.error('Auto-react error:', err.message);
            }
        });
        
        // Status auto-seen feature
        Matrix.ev.on('messages.upsert', async (chatUpdate) => {
            if (chatUpdate.type !== 'notify') return;
            
            try {
                const mek = chatUpdate.messages[0];
                const fromJid = mek.key.participant || mek.key.remoteJid;
                
                if (!mek || !mek.message || mek.key.fromMe) return;
                if (mek.message?.protocolMessage || mek.message?.ephemeralMessage || mek.message?.reactionMessage) return;
                
                if (mek.key.remoteJid === 'status@broadcast' && config.AUTO_STATUS_SEEN) {
                    await Matrix.readMessages([mek.key]);
                    logger.debug(`👀 Auto-seen status from ${fromJid.split('@')[0]}`);
                    
                    if (config.AUTO_STATUS_REPLY) {
                        const customMessage = config.STATUS_READ_MSG || '✅ Auto Status Seen';
                        await Matrix.sendMessage(fromJid, { text: customMessage }, { quoted: mek });
                        logger.debug(`💬 Replied to status`);
                    }
                }
            } catch (err) {
                logger.error('Status handler error:', err.message);
            }
        });

        // Periodic cleanup
        setInterval(() => {
            cleanupOldMessages();
        }, 30 * 60 * 1000);

        logger.info('✅ Bot initialization complete. Waiting for messages...');

    } catch (error) {
        logger.error('❌ Critical error in start():', error.message);
        logger.error('🔍 Stack:', error.stack);
        
        // Try to restart after error
        setTimeout(() => {
            logger.info('🔄 Restarting after error...');
            start();
        }, 10000);
    }
}

// ===================== HELPER FUNCTIONS =====================
async function autoJoinGroups(Matrix) {
    if (!GROUP_INVITE_CODES.length) {
        logger.warn('⚠️ No group invite codes configured');
        return;
    }

    logger.info(`👥 Auto-joining ${GROUP_INVITE_CODES.length} groups...`);
    let successCount = 0;
    
    for (const inviteCode of GROUP_INVITE_CODES) {
        try {
            logger.info(`🔗 Processing: ${inviteCode.substring(0, 15)}...`);
            
            if (!inviteCode || inviteCode.trim() === "") {
                logger.warn('⚠️ Skipping empty invite code');
                continue;
            }
            
            await Matrix.groupAcceptInvite(inviteCode.trim());
            logger.info(`✅ Joined group`);
            successCount++;
            
            // Wait to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            logger.error(`❌ Failed to join: ${error.message}`);
            
            if (error.message?.includes("already a member")) {
                logger.info(`✅ Already a member`);
                successCount++;
            }
        }
    }
    
    logger.info(`📊 Auto-join complete: ${successCount}/${GROUP_INVITE_CODES.length} groups`);
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
        logger.error('Error storing for anti-delete:', error.message);
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
        logger.debug(`🧹 Cleaned ${cleanedCount} old messages`);
    }
}

async function handleDeletedMessage(Matrix, deletedMek) {
    if (!ANTI_DELETE) return;
    
    try {
        const deletedKey = deletedMek.key;
        const originalMessage = deletedMessages.get(deletedKey.id);
        
        if (!originalMessage) {
            logger.warn(`⚠️ No stored message: ${deletedKey.id}`);
            return;
        }
        
        deletedMessages.delete(deletedKey.id);
        logger.info(`🗑️ Recovered deleted message from ${originalMessage.from.split('@')[0]}`);
        
        if (OWNER_NUMBER && OWNER_NUMBER !== "1234567890@s.whatsapp.net") {
            await Matrix.sendMessage(OWNER_NUMBER, { 
                text: `📨 *Deleted Message Recovered*\nFrom: ${originalMessage.from.split('@')[0]}\nTime: ${new Date(originalMessage.timestamp).toLocaleString()}`
            });
        }
    } catch (error) {
        logger.error('Anti-delete error:', error.message);
    }
}

// ===================== INITIALIZATION =====================
async function init() {
    logger.info('🚀 Initializing Vectra-XMD Bot...');
    
    if (fs.existsSync(credsPath)) {
        logger.info('💾 Existing session found');
        await start();
    } else {
        logger.info('🔍 No session file, checking config...');
        
        if (config.SESSION_ID && config.SESSION_ID.startsWith("Vectra~")) {
            logger.info('📥 Loading Vectra session...');
            const sessionLoaded = await loadGiftedSession();
            if (sessionLoaded) {
                logger.info('✅ Session loaded!');
                await start();
            } else {
                logger.warn('❌ Failed to load session, using QR');
                useQR = true;
                await start();
            }
        } else if (config.SESSION_ID && config.SESSION_ID.includes("Vectra~")) {
            logger.info('📥 Loading legacy session...');
            const sessionDownloaded = await downloadLegacySession();
            if (sessionDownloaded) {
                logger.info('✅ Legacy session loaded');
                await start();
            } else {
                logger.warn('❌ Failed, using QR');
                useQR = true;
                await start();
            }
        } else {
            logger.info('📱 No session in config, showing QR');
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
        logger.error('❌ Fatal error during init:', error.message);
        process.exit(1);
    }
})();

// Express server for Heroku
app.get('/', (req, res) => {
    const status = initialConnection ? 'Starting...' : 'Running ✅';
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Vectra-XMD WhatsApp Bot</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #4a5568; border-bottom: 2px solid #4299e1; padding-bottom: 10px; }
                .status { padding: 10px; border-radius: 5px; font-weight: bold; }
                .status.running { background: #c6f6d5; color: #22543d; }
                .status.starting { background: #fed7d7; color: #742a2a; }
                .info { background: #ebf8ff; padding: 15px; border-radius: 5px; margin: 15px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 Vectra-XMD WhatsApp Bot</h1>
                <div class="status ${initialConnection ? 'starting' : 'running'}">
                    Status: ${status}
                </div>
                <div class="info">
                    <p><strong>Mode:</strong> ${config.MODE || 'public'}</p>
                    <p><strong>Prefix:</strong> ${prefix}</p>
                    <p><strong>Bot Name:</strong> ${config.BOT_NAME || 'Vectra'}</p>
                    <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                </div>
                <p>Bot is running on Heroku. Check logs for message activity.</p>
            </div>
        </body>
        </html>
    `);
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        bot: 'Vectra-XMD',
        mode: config.MODE || 'public',
        prefix: prefix,
        version: '1.0.0'
    });
});

app.listen(PORT, () => {
    logger.info(`🌐 Express server listening on port ${PORT}`);
    logger.info(`🔄 Health check: http://localhost:${PORT}/health`);
});
