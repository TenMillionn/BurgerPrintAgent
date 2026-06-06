import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import {
  Conversation,
  ConversationDocument,
} from '../conversation/schemas/conversation.schema';
import {
  Message,
  MessageDocument,
} from '../conversation/schemas/message.schema';

/** Admin-facing user management: list, view, change role, enable/disable, delete. */
@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
  ) {}

  /** List all users with their conversation counts (newest first). */
  async list() {
    const users = await this.userModel
      .find()
      .sort({ createdAt: -1 })
      .select('email role isActive authProvider lastLoginAt createdAt')
      .lean();

    const counts = await this.conversationModel.aggregate([
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]);
    const countBy = new Map(counts.map((c: any) => [String(c._id), c.count]));

    return {
      users: users.map((u: any) =>
        this.toCard(u, countBy.get(String(u._id)) ?? 0),
      ),
    };
  }

  async detail(id: string) {
    const u = await this.loadOrThrow(id);
    const conversationCount = await this.conversationModel.countDocuments({
      userId: u._id,
    });
    return this.toCard(u.toObject(), conversationCount);
  }

  async setRole(id: string, role: string, actingUserId: string) {
    if (!['user', 'admin'].includes(role)) {
      throw new BadRequestException('Invalid role');
    }
    const u = await this.loadOrThrow(id);
    if (String(u._id) === String(actingUserId) && role !== 'admin') {
      throw new ForbiddenException('You cannot remove your own admin role');
    }
    u.role = role;
    await u.save();
    return this.toCard(u.toObject(), undefined);
  }

  async setActive(id: string, isActive: boolean, actingUserId: string) {
    const u = await this.loadOrThrow(id);
    if (String(u._id) === String(actingUserId) && !isActive) {
      throw new ForbiddenException('You cannot disable your own account');
    }
    u.isActive = isActive;
    await u.save();
    return this.toCard(u.toObject(), undefined);
  }

  /** Delete a user and cascade-delete their conversations + messages. */
  async remove(id: string, actingUserId: string) {
    const u = await this.loadOrThrow(id);
    if (String(u._id) === String(actingUserId)) {
      throw new ForbiddenException('You cannot delete your own account');
    }
    const convs = await this.conversationModel
      .find({ userId: u._id })
      .select('_id')
      .lean();
    const convIds = convs.map((c: any) => c._id);
    if (convIds.length) {
      await this.messageModel.deleteMany({ conversationId: { $in: convIds } });
      await this.conversationModel.deleteMany({ _id: { $in: convIds } });
    }
    await this.userModel.deleteOne({ _id: u._id });
    return { ok: true, deletedConversations: convIds.length };
  }

  private async loadOrThrow(id: string): Promise<UserDocument> {
    if (!isValidObjectId(id)) throw new NotFoundException('User not found');
    const u = await this.userModel.findById(id);
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  private toCard(u: any, conversationCount?: number) {
    return {
      id: (u._id as Types.ObjectId).toString(),
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      authProvider: u.authProvider,
      lastLoginAt: u.lastLoginAt ?? null,
      createdAt: u.createdAt ?? null,
      ...(conversationCount !== undefined ? { conversationCount } : {}),
    };
  }
}
