import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop()
  passwordHash?: string;

  @Prop()
  displayName?: string;

  @Prop()
  avatar?: string;

  @Prop({ required: true, enum: ['local', 'google'], default: 'local' })
  authProvider: string;

  @Prop({ sparse: true, unique: true })
  providerId?: string;

  @Prop({ required: true, enum: ['user', 'admin'], default: 'user' })
  role: string;

  @Prop({ default: true })
  isActive: boolean;

  /**
   * The seller's own BurgerPrints API key, AES-256-GCM encrypted at rest
   * (see crypto.util). Absent = not configured. Not selected by default; only a
   * {configured, last4} status is ever exposed to clients.
   */
  @Prop({ select: false })
  burgerprintsApiKeyEnc?: string;

  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop()
  lockUntil?: Date;

  @Prop()
  lastLoginAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
