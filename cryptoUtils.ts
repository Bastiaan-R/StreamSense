import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  const keyPath = path.resolve('.encryption_key');
  if (fs.existsSync(keyPath)) {
    ENCRYPTION_KEY = fs.readFileSync(keyPath, 'utf8').trim();
  } else {
    ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(keyPath, ENCRYPTION_KEY, 'utf8');
    } catch (e) {
      console.warn('Could not write .encryption_key file', e);
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_development_secret_only';

const IV_LENGTH = 16;

export function encryptToken(text: string): string {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest('base64').substring(0, 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return 'enc:' + iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptToken(text: string): string {
  if (!text) return text;
  if (!text.startsWith('enc:')) {
    // Return plaintext if it's not encrypted (backwards compatibility for existing tokens)
    return text;
  }
  
  try {
    const textParts = text.substring(4).split(':');
    if (textParts.length !== 2) return text;
    
    const iv = Buffer.from(textParts[0], 'hex');
    const encryptedText = Buffer.from(textParts[1], 'hex');
    const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest('base64').substring(0, 32);
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString();
  } catch (err) {
    console.error('Decryption failed, falling back to original');
    return text;
  }
}

export const getJwtSecret = () => JWT_SECRET;
