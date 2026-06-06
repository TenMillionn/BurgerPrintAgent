import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './schemas/user.schema';
import { encrypt, decrypt } from '../common/crypto.util';

export interface KeyStatus {
  configured: boolean;
  last4: string | null;
}

/**
 * Manages the seller's own BurgerPrints API key: encrypted set/clear, a
 * non-sensitive status ({configured, last4}), and internal decryption for the
 * agent runtime. The full plaintext key is never logged or returned to clients.
 */
@Injectable()
export class UserKeyService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly config: ConfigService,
  ) {}

  private get secret(): string {
    return this.config.get<string>('encryptionKey') as string;
  }

  async setKey(userId: string, plaintext: string): Promise<KeyStatus> {
    const enc = encrypt(plaintext, this.secret);
    await this.userModel.updateOne(
      { _id: userId },
      { $set: { burgerprintsApiKeyEnc: enc } },
    );
    return { configured: true, last4: plaintext.slice(-4) };
  }

  async clearKey(userId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { $unset: { burgerprintsApiKeyEnc: '' } },
    );
  }

  /** Status only — decrypts in memory solely to derive the last-4 hint. */
  async getStatus(userId: string): Promise<KeyStatus> {
    const key = await this.getDecryptedKey(userId);
    return key
      ? { configured: true, last4: key.slice(-4) }
      : { configured: false, last4: null };
  }

  /** Internal use (agent runtime): returns the plaintext key or null. */
  async getDecryptedKey(userId: string): Promise<string | null> {
    const user = await this.userModel
      .findById(userId)
      .select('+burgerprintsApiKeyEnc')
      .lean();
    if (!user?.burgerprintsApiKeyEnc) return null;
    try {
      return decrypt(user.burgerprintsApiKeyEnc, this.secret);
    } catch {
      // Tampered or encrypted under a rotated ENCRYPTION_KEY → treat as unset.
      return null;
    }
  }
}
