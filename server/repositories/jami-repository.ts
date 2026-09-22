import { db } from '../db/mysql';
import {
  JamiPreferences,
  JamiMemorySummary,
  JamiConversation,
  JamiMessageItem,
  JamiActionProposal,
} from '../../shared/types';
import { jamiActionService } from '../services/jami-action-service';
import crypto from 'crypto';

export class JamiRepository {
  private static instance: JamiRepository;
  private demoConversations: Map<string, JamiConversation[]> = new Map();
  private demoMessages: Map<string, JamiMessageItem[]> = new Map();
  private demoPreferences: Map<string, JamiPreferences> = new Map();
  private demoMemories: Map<string, JamiMemorySummary[]> = new Map();

  private constructor() {}

  public static getInstance(): JamiRepository {
    if (!JamiRepository.instance) {
      JamiRepository.instance = new JamiRepository();
    }
    return JamiRepository.instance;
  }

  // ==========================================
  // Conversations
  // ==========================================

  public async getConversations(userId: string): Promise<JamiConversation[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT id, user_id, title, is_archived, created_at, updated_at
         FROM jami_conversations
         WHERE user_id = ? AND (is_archived = 0 OR is_archived IS NULL)
         ORDER BY updated_at DESC`,
        [userId]
      );

      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        title: r.title,
        isArchived: Boolean(r.is_archived),
        createdAt: r.created_at?.toISOString?.() || String(r.created_at),
        updatedAt: r.updated_at?.toISOString?.() || String(r.updated_at),
      }));
    }

    const list = this.demoConversations.get(userId) || [];
    return list.filter((c) => !c.isArchived);
  }

  public async getConversation(userId: string, conversationId: string): Promise<JamiConversation | null> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT id, user_id, title, is_archived, created_at, updated_at
         FROM jami_conversations
         WHERE id = ? AND user_id = ?`,
        [conversationId, userId]
      );

      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        userId: r.user_id,
        title: r.title,
        isArchived: Boolean(r.is_archived),
        createdAt: r.created_at?.toISOString?.() || String(r.created_at),
        updatedAt: r.updated_at?.toISOString?.() || String(r.updated_at),
      };
    }

    const list = this.demoConversations.get(userId) || [];
    return list.find((c) => c.id === conversationId) || null;
  }

  public async createConversation(userId: string, title = 'Hội thoại với Jami'): Promise<JamiConversation> {
    const id = 'conv_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const now = new Date().toISOString();

    const conversation: JamiConversation = {
      id,
      userId,
      title: title.trim() || 'Hội thoại với Jami',
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO jami_conversations (id, user_id, title, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, 0, NOW(3), NOW(3))`,
        [conversation.id, userId, conversation.title]
      );
    } else {
      const list = this.demoConversations.get(userId) || [];
      list.unshift(conversation);
      this.demoConversations.set(userId, list);
    }

    return conversation;
  }

  public async updateConversation(userId: string, conversationId: string, title: string): Promise<JamiConversation | null> {
    const existing = await this.getConversation(userId, conversationId);
    if (!existing) return null;

    const updated: JamiConversation = {
      ...existing,
      title: title.trim() || existing.title,
      updatedAt: new Date().toISOString(),
    };

    if (db.isHealthy()) {
      await db.execute(
        `UPDATE jami_conversations SET title = ?, updated_at = NOW(3) WHERE id = ? AND user_id = ?`,
        [updated.title, conversationId, userId]
      );
    } else {
      const list = this.demoConversations.get(userId) || [];
      const idx = list.findIndex((c) => c.id === conversationId);
      if (idx !== -1) {
        list[idx] = updated;
        this.demoConversations.set(userId, list);
      }
    }

    return updated;
  }

  public async archiveConversation(userId: string, conversationId: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `UPDATE jami_conversations SET is_archived = 1, updated_at = NOW(3) WHERE id = ? AND user_id = ?`,
        [conversationId, userId]
      );
      return (res?.affectedRows || 0) > 0;
    }

    const list = this.demoConversations.get(userId) || [];
    const conv = list.find((c) => c.id === conversationId);
    if (conv) {
      conv.isArchived = true;
      return true;
    }
    return false;
  }

  // ==========================================
  // Messages
  // ==========================================

  public async getMessages(userId: string, conversationId?: string, limit = 50): Promise<JamiMessageItem[]> {
    if (db.isHealthy()) {
      let sql = `
        SELECT m.id, m.conversation_id, m.user_id, m.sender, m.text, m.content, m.emotion,
               m.suggested_actions_json, m.requires_confirmation, m.confirmation_summary,
               m.proposal_id, m.is_confirmed, m.client_message_id, m.created_at,
               p.action_type as prop_action_type, p.payload_json as prop_payload, p.preview_text as prop_preview_text,
               p.status as prop_status, p.expires_at as prop_expires_at
        FROM jami_messages m
        LEFT JOIN jami_action_proposals p ON m.proposal_id = p.id
        WHERE m.user_id = ?
      `;
      const params: any[] = [userId];

      if (conversationId) {
        sql += ` AND m.conversation_id = ?`;
        params.push(conversationId);
      }

      sql += ` ORDER BY m.created_at ASC LIMIT ?`;
      params.push(limit);

      const rows = await db.query<any>(sql, params);

      return rows.map((r) => {
        let suggestedActions: any[] = [];
        if (r.suggested_actions_json) {
          try {
            suggestedActions = typeof r.suggested_actions_json === 'string'
              ? JSON.parse(r.suggested_actions_json)
              : r.suggested_actions_json;
          } catch {}
        }

        let proposal: JamiActionProposal | undefined = undefined;
        if (r.proposal_id && r.prop_action_type) {
          let parsedPayload: any = {};
          try {
            parsedPayload = typeof r.prop_payload === 'string' ? JSON.parse(r.prop_payload) : (r.prop_payload || {});
          } catch {}
          proposal = {
            id: r.proposal_id,
            userId,
            conversationId: r.conversation_id,
            messageId: r.id,
            actionType: r.prop_action_type,
            arguments: parsedPayload,
            preview: r.prop_preview_text || (parsedPayload ? JSON.stringify(parsedPayload) : ''),
            status: r.prop_status || 'pending',
            expiresAt: r.prop_expires_at?.toISOString?.() || String(r.prop_expires_at),
            createdAt: r.created_at?.toISOString?.() || String(r.created_at),
          };
        }

        return {
          id: r.id,
          conversationId: r.conversation_id || undefined,
          userId: r.user_id,
          sender: r.sender === 'user' ? 'user' : 'jami',
          text: r.text || r.content || '',
          emotion: r.emotion || 'idle',
          suggestedActions,
          requiresConfirmation: Boolean(r.requires_confirmation),
          confirmationSummary: r.confirmation_summary || undefined,
          proposalId: r.proposal_id || undefined,
          proposal,
          isConfirmed: Boolean(r.is_confirmed),
          clientMessageId: r.client_message_id || undefined,
          createdAt: r.created_at?.toISOString?.() || String(r.created_at),
        };
      });
    }

    const list = this.demoMessages.get(userId) || [];
    if (conversationId) {
      return list.filter((m) => m.conversationId === conversationId);
    }
    return list;
  }

  public async saveMessage(userId: string, msg: Partial<JamiMessageItem>): Promise<JamiMessageItem> {
    const id = msg.id || 'msg_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const createdAt = msg.createdAt || new Date().toISOString();

    const record: JamiMessageItem = {
      id,
      conversationId: msg.conversationId,
      userId,
      sender: msg.sender || 'jami',
      text: msg.text || '',
      emotion: msg.emotion || 'idle',
      suggestedActions: msg.suggestedActions || [],
      requiresConfirmation: Boolean(msg.requiresConfirmation),
      confirmationSummary: msg.confirmationSummary,
      proposalId: msg.proposalId,
      proposal: msg.proposal,
      isConfirmed: Boolean(msg.isConfirmed),
      clientMessageId: msg.clientMessageId,
      createdAt,
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO jami_messages
         (id, conversation_id, user_id, sender, text, content, emotion, suggested_actions_json, requires_confirmation, confirmation_summary, proposal_id, is_confirmed, client_message_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
        [
          record.id,
          record.conversationId || null,
          userId,
          record.sender,
          record.text,
          record.text,
          record.emotion,
          JSON.stringify(record.suggestedActions || []),
          record.requiresConfirmation ? 1 : 0,
          record.confirmationSummary || null,
          record.proposalId || null,
          record.isConfirmed ? 1 : 0,
          record.clientMessageId || null,
        ]
      );

      // Update conversation updated_at
      if (record.conversationId) {
        await db.execute(
          `UPDATE jami_conversations SET updated_at = NOW(3) WHERE id = ? AND user_id = ?`,
          [record.conversationId, userId]
        );
      }
    } else {
      const list = this.demoMessages.get(userId) || [];
      list.push(record);
      this.demoMessages.set(userId, list);
    }

    return record;
  }

  public async confirmMessageAction(
    userId: string,
    messageId: string,
    decision: 'confirm' | 'reject' = 'confirm'
  ): Promise<{ message: JamiMessageItem; actionResult: any }> {
    let targetMessage: JamiMessageItem | null;

    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT id, conversation_id, user_id, sender, text, proposal_id, is_confirmed
         FROM jami_messages
         WHERE id = ? AND user_id = ?`,
        [messageId, userId]
      );

      if (rows.length === 0) {
        throw new Error('Tin nhắn không tồn tại hoặc không thuộc quyền sở hữu');
      }

      targetMessage = {
        id: rows[0].id,
        conversationId: rows[0].conversation_id,
        userId: rows[0].user_id,
        sender: rows[0].sender,
        text: rows[0].text,
        proposalId: rows[0].proposal_id,
        isConfirmed: Boolean(rows[0].is_confirmed),
        createdAt: new Date().toISOString(),
      };
    } else {
      const list = this.demoMessages.get(userId) || [];
      targetMessage = list.find((m) => m.id === messageId) || null;
    }

    if (!targetMessage) {
      throw new Error('Tin nhắn không tồn tại hoặc không thuộc quyền sở hữu.');
    }

    if (!targetMessage.proposalId) {
      throw new Error('PROPOSAL_MISSING: Tin nhắn này không chứa đề xuất hành động hợp lệ để xác nhận.');
    }

    if (targetMessage.isConfirmed) {
      return {
        message: targetMessage,
        actionResult: {
          success: true,
          message: 'Đề xuất này đã được xác nhận trước đó.',
          isAlreadyConfirmed: true,
        },
      };
    }

    // Execute actual action proposal via JamiActionService
    const actionResult = await jamiActionService.handleProposalDecision(
      userId,
      decision,
      targetMessage.proposalId,
      targetMessage.conversationId
    );

    if (actionResult.success || actionResult.isAlreadyConfirmed) {
      // Update message confirmation state in MySQL
      if (db.isHealthy()) {
        await db.execute(
          `UPDATE jami_messages SET is_confirmed = 1 WHERE id = ? AND user_id = ?`,
          [messageId, userId]
        );
      }
      targetMessage.isConfirmed = true;

      // Save Jami confirmation follow-up reply in conversation
      if (actionResult.message && !actionResult.isAlreadyConfirmed) {
        await this.saveMessage(userId, {
          conversationId: targetMessage.conversationId,
          sender: 'jami',
          text: actionResult.message,
          emotion: decision === 'confirm' ? 'celebrating' : 'speaking',
        });
      }
    }

    return {
      message: targetMessage,
      actionResult,
    };
  }

  public async clearMessages(userId: string, conversationId?: string): Promise<boolean> {
    if (db.isHealthy()) {
      if (conversationId) {
        await db.execute(
          `DELETE FROM jami_messages WHERE user_id = ? AND conversation_id = ?`,
          [userId, conversationId]
        );
      } else {
        await db.execute(
          `DELETE FROM jami_messages WHERE user_id = ?`,
          [userId]
        );
      }
      return true;
    }

    if (conversationId) {
      const list = this.demoMessages.get(userId) || [];
      this.demoMessages.set(
        userId,
        list.filter((m) => m.conversationId !== conversationId)
      );
    } else {
      this.demoMessages.delete(userId);
    }
    return true;
  }

  // ==========================================
  // Preferences & Memory
  // ==========================================

  public async getPreferences(userId: string): Promise<JamiPreferences> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT user_id, voice_enabled, sound_effects, selected_voice, animation_enabled, response_length, preferred_address, memory_enabled
         FROM jami_preferences
         WHERE user_id = ?`,
        [userId]
      );

      if (rows.length > 0) {
        const r = rows[0];
        return {
          userId: r.user_id,
          voiceEnabled: Boolean(r.voice_enabled),
          soundEffects: r.sound_effects !== null && r.sound_effects !== undefined ? Boolean(r.sound_effects) : true,
          selectedVoice: r.selected_voice || 'vi-VN-Standard-A',
          animationEnabled: Boolean(r.animation_enabled),
          responseLength: r.response_length || 'balanced',
          preferredAddress: r.preferred_address || 'Bạn',
          memoryEnabled: Boolean(r.memory_enabled),
        };
      }
    }

    const demo = this.demoPreferences.get(userId);
    if (demo) return demo;

    return {
      userId,
      voiceEnabled: true,
      soundEffects: true,
      selectedVoice: 'vi-VN-Standard-A',
      animationEnabled: true,
      responseLength: 'balanced',
      preferredAddress: 'Bạn',
      memoryEnabled: true,
    };
  }

  public async updatePreferences(userId: string, updates: Partial<JamiPreferences>): Promise<JamiPreferences> {
    const current = await this.getPreferences(userId);
    const updated: JamiPreferences = {
      ...current,
      ...updates,
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO jami_preferences (user_id, voice_enabled, sound_effects, selected_voice, animation_enabled, response_length, preferred_address, memory_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           voice_enabled = VALUES(voice_enabled),
           sound_effects = VALUES(sound_effects),
           selected_voice = VALUES(selected_voice),
           animation_enabled = VALUES(animation_enabled),
           response_length = VALUES(response_length),
           preferred_address = VALUES(preferred_address),
           memory_enabled = VALUES(memory_enabled)`,
        [
          userId,
          updated.voiceEnabled ? 1 : 0,
          updated.soundEffects ? 1 : 0,
          updated.selectedVoice,
          updated.animationEnabled ? 1 : 0,
          updated.responseLength,
          updated.preferredAddress,
          updated.memoryEnabled ? 1 : 0,
        ]
      );
    } else {
      this.demoPreferences.set(userId, updated);
    }

    return updated;
  }

  public async getMemories(userId: string): Promise<JamiMemorySummary[]> {
    if (db.isHealthy()) {
      const rows = await db.query<any>(
        `SELECT id, user_id, category, summary, created_at
         FROM jami_memory_summaries
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [userId]
      );

      return rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        category: r.category,
        summary: r.summary,
        createdAt: r.created_at?.toISOString?.() || String(r.created_at),
      }));
    }

    return this.demoMemories.get(userId) || [];
  }

  public async deleteMemory(userId: string, memoryId: string): Promise<boolean> {
    if (db.isHealthy()) {
      const res = await db.execute(
        `DELETE FROM jami_memory_summaries WHERE id = ? AND user_id = ?`,
        [memoryId, userId]
      );
      return (res?.affectedRows || 0) > 0;
    }

    const list = this.demoMemories.get(userId) || [];
    const filtered = list.filter((m) => m.id !== memoryId);
    this.demoMemories.set(userId, filtered);
    return true;
  }

  public seedDemo(userId: string, prefs: JamiPreferences, memories: JamiMemorySummary[], messages?: JamiMessageItem[]) {
    this.demoPreferences.set(userId, prefs);
    this.demoMemories.set(userId, [...memories]);
    if (messages) {
      this.demoMessages.set(userId, [...messages]);
    }
  }
}

export const jamiRepo = JamiRepository.getInstance();
