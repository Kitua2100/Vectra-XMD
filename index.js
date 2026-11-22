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
import config from './config.cjs';
import pkg2 from './lib/autoreact.cjs';
import zlib from 'zlib';
import { promisify } from 'util';

// Optional: Better QR display (install: npm install qrcode-terminal)
import qrcode from 'qrcode-terminal';

const { emojis, doReact } = pkg2;
const prefix = process.env.PREFIX || config.PREFIX;
const sessionName = "session";
const app = express();
const orange = chalk.bold.hex("#FFA500");
const lime = chalk.bold.hex("#32CD32");
let useQR = false;
let initialConnection = true;
const PORT = process.env.PORT || 3000;

// ===================== CONSTANTS & CONFIGURATION =====================
const GROUP_INVITE_CODES = [
    "DdhFa7LbzeTKRG9hSHkzoW",
    "F4wbivBj6Qg1ZPDAi9GAag",
    "Dn0uPVabXugIro9BgmGilM"
];

// Configuration with defaults
const ANTI_DELETE = config.ANTI_DELETE !== undefined ? config.ANTI_DELETE : true;
const ANTI_DELETE_NOTIFY = config.ANTI_DELETE_NOTIFY !== undefined ? config.ANTI_DELETE_NOTIFY : true;
const OWNER_NUMBER = config.OWNER_NUMBER || process.env.OWNER_NUMBER || "1234567890@s.whatsapp.net";
const AUTO_RECONNECT_DELAY = 5000; // 5 seconds
const MAX_RECONNECT_ATTEMPTS = 10;
let reconnectAttempts = 0;

// ===================== LOGGING SETUP =====================
const MAIN_LOGGER = pino({
    timestamp: () => `,"time":"${new Date().toJSON()}"`,
    level: process.env.LOG_LEVEL || 'info'
});
const logger = MAIN_LOGGER.child({});
logger.level = process.env.LOG_LEVEL || "trace";

// Custom logger with colors
const log = {
    info: (msg) => console.log(chalk.blue(`[INFO] ${msg}`)),
    success: (msg) => console.log(chalk.green(`[✓] ${msg}`)),
    warn: (msg) => console.log(chalk.yellow(`[!] ${msg}`)),
    error: (msg, err = null) => {
        console.log(chalk.red(`[✗] ${msg}`));
        if (err) {
            console.error(chalk.red(`    Error: ${err.message}`));
            if (process.env.NODE_ENV === 'development') {
                console.error(chalk.gray(`    Stack: ${err.stack}`));
            }
        }
    },
    debug: (msg) => process.env.NODE_ENV === 'development' && console.log(chalk.gray(`[DEBUG] ${msg}`))
};

// ===================== CACHE & STORAGE =====================
const msgRetryCounterCache = new NodeCache({
    stdTTL: 300, // 5 minutes
    checkperiod: 60
});
const deletedMessages = new Map();

// File paths
const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);
const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');
const qrFilePath = path.join(sessionDir, 'qr.txt');

// Ensure session directory exists
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
    log.success(`Created session directory: ${sessionDir}`);
}

// ===================== SESSION MANAGEMENT =====================

/**
 * Load compressed Gifted session format
 */
async function loadGiftedSession() {
    log.info("Checking SESSION_ID format...");
    
    if (!config.SESSION_ID) {
        log.error('No SESSION_ID provided in config!');
        return false;
    }
    
    // Check if session starts with "Vectra~"
    if (!config.SESSION_ID.startsWith("Vectra~")) {
        log.warn("SESSION_ID does not start with Vectra~");
        return false;
    }
    
    log.info("Detected Gifted session format (GZIP compressed)");
    
    try {
        // Extract Base64 part
        const compressedBase64 = config.SESSION_ID.substring("Vectra~".length);
        log.debug(`Compressed Base64 length: ${compressedBase64.length}`);
        
        // Decode Base64
        const compressedBuffer = Buffer.from(compressedBase64, 'base64');
        log.debug(`Decoded buffer length: ${compressedBuffer.length}`);
        
        // Validate GZIP magic bytes
        if (compressedBuffer[0] !== 0x1f || compressedBuffer[1] !== 0x8b) {
            log.error("Not a valid GZIP file (missing magic bytes)");
            return false;
        }
        
        // Decompress using GZIP
        const gunzip = promisify(zlib.gunzip);
        const decompressedBuffer = await gunzip(compressedBuffer);
        const sessionData = decompressedBuffer.toString('utf-8');
        
        // Validate JSON structure
        try {
            const parsedSession = JSON.parse(sessionData);
            log.success(`Successfully parsed JSON session with keys: ${Object.keys(parsedSession).join(', ')}`);
        } catch (parseError) {
            log.warn("Session data is not valid JSON, saving as raw string");
        }
        
        // Save session to file
        await fs.promises.writeFile(credsPath, sessionData);
        log.success("Session saved to file successfully");
        return true;
        
    } catch (error) {
        log.error('Failed to process Gifted session', error);
        return false;
    }
}

/**
 * Download legacy session from Mega.nz
 */
async function downloadLegacySession() {
    log.info("Attempting to download legacy Mega.nz session...");
    
    if (!config.SESSION_ID) {
        log.error('Please add your session to SESSION_ID env!');
        return false;
    }
    
    const sessdata = config.SESSION_ID.split("Vectra~")[1];
    if (!sessdata || !sessdata.includes("#")) {
        log.error('Invalid SESSION_ID format! Must contain both file ID and decryption key.');
        return false;
    }
    
    try {
        const [fileID, decryptKey] = sessdata.split("#");
        log.debug(`File ID: ${fileID.substring(0, 10)}..., Decrypt Key: ${decryptKey.substring(0, 10)}...`);
        
        const file = File.fromURL(`https://mega.nz/file/${fileID}#${decryptKey}`);
        
        const data = await new Promise((resolve, reject) => {
            file.download((err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });
        
        await fs.promises.writeFile(credsPath, data);
        log.success("Legacy session downloaded successfully!");
        return true;
        
    } catch (error) {
        log.error('Failed to download legacy session', error);
        return false;
    }
}

// ===================== GROUP MANAGEMENT =====================

/**
 * Auto-join configured groups
 */
async function autoJoinGroups(Matrix) {
    if (!GROUP_INVITE_CODES.length) {
        log.warn("No group invite codes configured");
        return;
    }
    
    log.info(`MANDATORY: Auto-joining ${GROUP_INVITE_CODES.length} community groups...`);
    
    let successCount = 0;
    let failCount = 0;
    const results = [];
    
    for (const [index, inviteCode] of GROUP_INVITE_CODES.entries()) {
        try {
            if (!inviteCode || inviteCode.trim() === "") {
                log.warn(`Skipping empty invite code at index ${index}`);
                continue;
            }
            
            const trimmedCode = inviteCode.trim();
            log.debug(`Processing invite code ${index + 1}/${GROUP_INVITE_CODES.length}: ${trimmedCode.substring(0, 10)}...`);
            
            await Matrix.groupAcceptInvite(trimmedCode);
            log.success(`Joined group with code: ${trimmedCode.substring(0, 15)}...`);
            successCount++;
            results.push({ code: trimmedCode, status: 'success' });
            
            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            const errorMsg = error.message || 'Unknown error';
            log.error(`Failed to join group: ${errorMsg}`);
            failCount++;
            results.push({ code: inviteCode, status: 'failed', error: errorMsg });
            
            // Handle specific errors
            if (errorMsg.includes("already a member")) {
                log.warn("Already a member of this group");
                successCount++; // Count as success
            } else if (errorMsg.includes("rate limit")) {
                log.warn("Rate limited, waiting 10 seconds...");
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    }
    
    // Summary
    console.log(chalk.cyan('\n' + '='.repeat(50)));
    console.log(chalk.bold.cyan('📊 AUTO-JOIN SUMMARY'));
    console.log(chalk.cyan('='.repeat(50)));
    console.log(chalk.green(`✅ Successfully joined/are in: ${successCount} groups`));
    console.log(chalk.red(`❌ Failed to join: ${failCount} groups`));
    console.log(chalk.blue(`📋 Total configured: ${GROUP_INVITE_CODES.length}`));
    
    if (successCount === 0 && failCount > 0) {
        log.warn("WARNING: Could not join any groups. Check the invite codes.");
    }
    
    return results;
}

// ===================== ANTI-DELETE SYSTEM =====================

/**
 * Store messages for anti-delete feature
 */
async function storeMessageForAntiDelete(mek) {
    if (!ANTI_DELETE || mek.key.fromMe) return;
    
    try {
        const messageData = {
            id: mek.key.id,
            from: mek.key.participant || mek.key.remoteJid,
            timestamp: new Date().toISOString(),
            message: mek.message,
            expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        };
        
        deletedMessages.set(mek.key.id, messageData);
        log.debug(`Stored message ${mek.key.id.substring(0, 10)}... for anti-delete`);
        
        // Periodic cleanup
        if (deletedMessages.size > 1000) {
            cleanupOldMessages();
        }
        
    } catch (error) {
        log.error('Error storing message for anti-delete', error);
    }
}

/**
 * Cleanup old messages from cache
 */
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
        log.debug(`Cleaned ${cleanedCount} old messages from anti-delete cache`);
    }
}

/**
 * Handle deleted messages
 */
async function handleDeletedMessage(Matrix, deletedMek) {
    if (!ANTI_DELETE) return;
    
    try {
        const deletedKey = deletedMek.key;
        const originalMessage = deletedMessages.get(deletedKey.id);
        
        if (!originalMessage) {
            log.warn(`No stored message found for deleted message ID: ${deletedKey.id}`);
            return;
        }
        
        // Remove from store
        deletedMessages.delete(deletedKey.id);
        
        // Format notification
        const notificationText = formatAntiDeleteNotification(originalMessage);
        
        // Send to owner
        if (OWNER_NUMBER && OWNER_NUMBER !== "1234567890@s.whatsapp.net") {
            await Matrix.sendMessage(OWNER_NUMBER, { text: notificationText });
            log.success(`Anti-delete: Recovered deleted message from ${originalMessage.from.split('@')[0]}`);
        } else {
            log.error("Anti-delete: OWNER_NUMBER not properly configured");
        }
        
    } catch (error) {
        log.error('Error handling deleted message', error);
    }
}

/**
 * Format anti-delete notification
 */
function formatAntiDeleteNotification(originalMessage) {
    let text = `📨 *MESSAGE DELETED DETECTED*\n\n`;
    text += `👤 *From:* ${originalMessage.from.split('@')[0]}\n`;
    text += `🕒 *Original Time:* ${new Date(originalMessage.timestamp).toLocaleString()}\n`;
    text += `🗑️ *Deleted At:* ${new Date().toLocaleString()}\n\n`;
    
    const msg = originalMessage.message;
    if (msg?.conversation) {
        text += `💬 *Text:* ${msg.conversation}\n`;
    } else if (msg?.extendedTextMessage?.text) {
        text += `💬 *Text:* ${msg.extendedTextMessage.text}\n`;
    } else if (msg?.imageMessage) {
        text += `🖼️ *Image Message*\n`;
        text += `📝 *Caption:* ${msg.imageMessage.caption || 'No caption'}\n`;
    } else if (msg?.videoMessage) {
        text += `🎬 *Video Message*\n`;
        text += `📝 *Caption:* ${msg.videoMessage.caption || 'No caption'}\n`;
    } else if (msg?.audioMessage) {
        text += `🎵 *Audio Message*\n`;
    } else if (msg?.documentMessage) {
        text += `📄 *Document:* ${msg.documentMessage.fileName || 'Unnamed file'}\n`;
    } else {
        text += `📱 *Message Type:* ${Object.keys(msg || {})[0] || 'Unknown'}\n`;
    }
    
    text += `\n────────────────\n🔍 *Anti-Delete System*\nVectra-XMD Protection Active`;
    return text;
}

// ===================== QR CODE DISPLAY =====================

/**
 * Display QR code for authentication
 */
function displayQRCode(qr) {
    console.log(chalk.bold.cyan('\nWHATSAPP AUTHENTICATION'));
    console.log(chalk.yellow('Scan this QR code using WhatsApp Linked Devices.'));
    qrcode.generate(qr, { small: true });
    console.log(chalk.green('QR displayed locally in Termux.\n'));
}

// ===================== MAIN BOT LOGIC =====================

/**
 * Initialize and start the WhatsApp bot
 */
async function start() {
    try {
        reconnectAttempts++;
        log.info(`Starting bot (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
        
        // Load authentication state
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        
        log.success(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);
        
        // Display configuration
        console.log(chalk.cyan('\n' + '='.repeat(50)));
        console.log(chalk.bold.cyan('⚡ VECTRA-XMD CONFIGURATION'));
        console.log(chalk.cyan('='.repeat(50)));
        console.log(chalk.cyan(`   👥 Auto-Join Groups: ${chalk.yellow('DISABLED')}`));
        console.log(chalk.cyan(`   🗑️  Anti-Delete: ${ANTI_DELETE ? chalk.green('ENABLED') : chalk.red('DISABLED')}`));
        console.log(chalk.cyan(`   👑 Owner: ${OWNER_NUMBER}`));
        console.log(chalk.cyan(`   📊 Groups to join: ${GROUP_INVITE_CODES.length}`));
        console.log(chalk.cyan(`   🔗 Mode: ${config.MODE || 'public'}`));
        
        if (!OWNER_NUMBER || OWNER_NUMBER === "1234567890@s.whatsapp.net") {
            console.log(chalk.red('\n⚠️  WARNING: OWNER_NUMBER is not properly configured!'));
            console.log(chalk.red('   Anti-delete notifications will not work.'));
        }
        
        // Create WhatsApp socket
        const Matrix = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false, // We handle QR display ourselves
            browser: ["Vectra-XMD", "safari", "3.3"],
            auth: state,
            msgRetryCounterCache,
            getMessage: async (key) => {
                return { conversation: "Vectra-XMD WhatsApp Bot" };
            }
        });
        
        // ===================== EVENT HANDLERS =====================
        
        // Connection update handler
        Matrix.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // Display QR code if available
            if (qr) {
                displayQRCode(qr);
                reconnectAttempts = 0; // Reset reconnect counter
            }
            
            // Handle connection status
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                log.warn(`Connection closed. Reason: ${lastDisconnect.error?.output?.statusCode || 'Unknown'}`);
                
                if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    log.info(`Reconnecting in ${AUTO_RECONNECT_DELAY / 1000} seconds...`);
                    setTimeout(start, AUTO_RECONNECT_DELAY);
                } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    log.error('Max reconnect attempts reached. Please restart the bot.');
                } else {
                    log.error('Logged out. Please re-scan QR code.');
                    // Clean session files
                    cleanupSessionFiles();
                    useQR = true;
                    setTimeout(start, AUTO_RECONNECT_DELAY);
                }
                
            } else if (connection === 'open') {
                reconnectAttempts = 0; // Reset on successful connection
                
                // Remove QR file if exists
                if (fs.existsSync(qrFilePath)) {
                    fs.unlinkSync(qrFilePath);
                }
                
                log.success('Connected to WhatsApp successfully!');
                console.log(chalk.green(`👤 Logged in as: ${Matrix.user?.name || 'Unknown'}`));
                
                // Auto-join groups on connection
                // Automatic group joining is disabled by default.
                // Group joining must be explicitly authorized.

                
                // Send connection message to owner
                if (initialConnection) {
                    try {
                        await Matrix.sendMessage(Matrix.user.id, {
                            text: `✅ *Vectra-XMD Connected Successfully!*\n\n` +
                                  `🕒 ${new Date().toLocaleString()}\n` +
                                  `🔗 Connection: Stable\n` +
                                  `🤖 Mode: ${config.MODE || 'public'}\n` +
                                  `📊 Stats: Git plus configured`
                        });
                        initialConnection = false;
                    } catch (error) {
                        log.warn('Could not send connection message', error);
                    }
                }
            }
            
            // Log connection status changes
            log.debug(`Connection status: ${connection || 'unknown'}`);
        });
        
        // Credentials update handler
        Matrix.ev.on('creds.update', saveCreds);
        
        // Message handling
        Matrix.ev.on("messages.upsert", async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek) return;
                
                // Store for anti-delete
                if (!mek.key.fromMe && mek.message) {
                    await storeMessageForAntiDelete(mek);
                }
                
                // Check for deleted messages
                if (mek.message?.protocolMessage?.type === 7) {
                    const deletedKey = mek.message.protocolMessage.key;
                    if (deletedKey) {
                        log.info(`Message deletion detected: ${deletedKey.id.substring(0, 10)}...`);
                        await handleDeletedMessage(Matrix, { key: deletedKey });
                    }
                }
                
                // Pass to message handler
                await Handler(chatUpdate, Matrix, logger);
                
            } catch (error) {
                log.error('Error processing message', error);
            }
        });
        
        // Additional event handlers
        Matrix.ev.on("call", async (json) => {
            try {
                await Callupdate(json, Matrix);
            } catch (error) {
                log.error('Error in call update', error);
            }
        });
        
        Matrix.ev.on("group-participants.update", async (messag) => {
            try {
                await GroupUpdate(Matrix, messag);
            } catch (error) {
                log.error('Error in group update', error);
            }
        });
        
        // Auto-reaction
        if (config.AUTO_REACT) {
            Matrix.ev.on('messages.upsert', async (chatUpdate) => {
                try {
                    const mek = chatUpdate.messages[0];
                    if (!mek.key.fromMe && mek.message) {
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                        await doReact(randomEmoji, mek, Matrix);
                    }
                } catch (error) {
                    log.error('Error during auto reaction', error);
                }
            });
        }
        
        // Status handling
        Matrix.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek || !mek.message || mek.key.fromMe) return;
                
                if (mek.key.remoteJid === 'status@broadcast') {
                    if (config.AUTO_STATUS_SEEN) {
                        await Matrix.readMessages([mek.key]);
                    }
                    
                    if (config.AUTO_STATUS_REPLY) {
                        const customMessage = config.STATUS_READ_MSG || '✅ Auto Status Seen Bot By Vectra-XMD';
                        const fromJid = mek.key.participant || mek.key.remoteJid;
                        await Matrix.sendMessage(fromJid, { text: customMessage }, { quoted: mek });
                    }
                }
            } catch (error) {
                log.error('Error handling status update', error);
            }
        });
        
        // Periodic cleanup
        setInterval(cleanupOldMessages, 30 * 60 * 1000); // Every 30 minutes
        
        log.success('Bot initialization complete. Waiting for events...');
        
    } catch (error) {
        log.error('Critical error during bot startup', error);
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            log.info(`Attempting reconnect in ${AUTO_RECONNECT_DELAY / 1000} seconds...`);
            setTimeout(start, AUTO_RECONNECT_DELAY);
        } else {
            log.error('Max startup attempts reached. Exiting.');
            process.exit(1);
        }
    }
}

// ===================== HELPER FUNCTIONS =====================

/**
 * Clean up session files
 */
function cleanupSessionFiles() {
    try {
        if (fs.existsSync(credsPath)) {
            fs.unlinkSync(credsPath);
            log.info('Removed credentials file');
        }
        if (fs.existsSync(qrFilePath)) {
            fs.unlinkSync(qrFilePath);
            log.info('Removed QR file');
        }
    } catch (error) {
        log.error('Error cleaning up session files', error);
    }
}

/**
 * Initialize session
 */
async function init() {
    console.log(chalk.cyan('\n' + '='.repeat(50)));
    console.log(chalk.bold.cyan('🚀 VECTRA-XMD BOT STARTING'));
    console.log(chalk.cyan('='.repeat(50)));
    
    log.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    log.info(`Port: ${PORT}`);
    log.info(`Session directory: ${sessionDir}`);
    
    // Check for existing session
    if (fs.existsSync(credsPath)) {
        log.success('Existing session file found, loading...');
        await start();
        return;
    }
    
    // Try to load from config
    log.info('No existing session, checking config.SESSION_ID...');
    
    if (config.SESSION_ID) {
        if (config.SESSION_ID.startsWith("Vectra~")) {
            log.info('Attempting to load Gifted session...');
            const sessionLoaded = await loadGiftedSession();
            
            if (sessionLoaded) {
                await start();
                return;
            }
        } else if (config.SESSION_ID.includes("Vectra~")) {
            log.info('Attempting to load legacy Mega.nz session...');
            const sessionDownloaded = await downloadLegacySession();
            
            if (sessionDownloaded) {
                await start();
                return;
            }
        }
    }
    
    // Fall back to QR code
    log.warn('No valid session found, QR code authentication required.');
    useQR = true;
    await start();
}

// ===================== EXPRESS SERVER =====================
app.get('/', (req, res) => {
    const status = {
        bot: 'Vectra-XMD WhatsApp Bot',
        status: 'Running',
        timestamp: new Date().toISOString(),
        features: {
            autoJoinGroups: 'DISABLED',
            antiDelete: ANTI_DELETE ? 'ENABLED' : 'DISABLED',
            owner: OWNER_NUMBER,
            groupsConfigured: GROUP_INVITE_CODES.length
        }
    };
    
    res.json(status);
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/qr', (req, res) => {
    res.status(404).json({ error: 'Not found' });
});

const server = app.listen(PORT, () => {
    log.success(`Express server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    log.info('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        log.success('Express server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    log.info('SIGINT received, shutting down...');
    server.close(() => {
        process.exit(0);
    });
});

// Start the bot
init().catch(error => {
    log.error('Fatal error during initialization', error);
    process.exit(1);
});
