import { db } from '../db/mysql';
import { JamiPreferences, JamiMemorySummary } from '../../shared/types';
import crypto from 'crypto';

export interface JamiMessageRecord {
  id: string;
  userId: string;
  sender: 'user' | 'jami';
  text: string;
  emotion?: string;
  suggestedActions?: string[];
  requiresConfirmation?: boolean;
  confirmationSummary?: string;
  proposalId?: string;
  isConfirmed?: boolean;
  createdAt: string;
}

export class JamiRepository {
  private static instance: JamiRepository;
  private demoPreferences: Map<string, JamiPreferences> = new Map();
  private demoMessages: Map<string, JamiMessageRecord[]> = new Map();
  private demoMemories: Map<string, JamiMemorySummary[]> = new Map();
  private schemaVerified = false;

  private constructor() {}

  public static getInstance(): JamiRepository {
    if (!JamiRepository.instance) {
      JamiRepository.instance = new JamiRepository();
    }
    return JamiRepository.instance;
  }

  public async ensureSchema() {
    if (this.schemaVerified || !db.isHealthy()) return;

    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS jami_messages (
          id VARCHAR(36) PRIMARY KEY,
          conversation_id VARCHAR(36) NULL,
          user_id VARCHAR(36) NOT NULL DEFAULT 'usr_student_demo_01',
          sender VARCHAR(20) NOT NULL DEFAULT 'jami',
          text TEXT NOT NULL,
          emotion VARCHAR(30) DEFAULT 'idle',
          suggested_actions_json JSON NULL,
          requires_confirmation BOOLEAN DEFAULT FALSE,
          confirmation_summary TEXT NULL,
          proposal_id VARCHAR(36) NULL,
          is_confirmed BOOLEAN DEFAULT FALSE,
          created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
          INDEX idx_jmsg_user_time (user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch {}

    const alterStatements = [
      `ALTER TABLE jami_messages ADD COLUMN user_id VARCHAR(36) NOT NULL DEFAULT 'usr_student_demo_01'`,
      `ALTER TABLE jami_messages ADD COLUMN conversation_id VARCHAR(36) NULL`,
      `ALTER TABLE jami_messages ADD COLUMN sender VARCHAR(20) NOT NULL DEFAULT 'jami'`,
      `ALTER TABLE jami_messages ADD COLUMN text TEXT NOT NULL`,
      `ALTER TABLE jami_messages ADD COLUMN emotion VARCHAR(30) DEFAULT 'idle'`,
      `ALTER TABLE jami_messages ADD COLUMN suggested_actions_json JSON NULL`,
      `ALTER TABLE jami_messages ADD COLUMN requires_confirmation BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE jami_messages ADD COLUMN confirmation_summary TEXT NULL`,
      `ALTER TABLE jami_messages ADD COLUMN proposal_id VARCHAR(36) NULL`,
      `ALTER TABLE jami_messages ADD COLUMN is_confirmed BOOLEAN DEFAULT FALSE`,
    ];

    for (const sql of alterStatements) {
      try {
        await db.execute(sql);
      } catch (err: any) {
        // Ignored: ER_DUP_FIELDNAME (1060) if column already exists
      }
    }

    this.schemaVerified = true;
  }

  public async getMessages(userId: string): Promise<JamiMessageRecord[]> {
    if (db.isHealthy()) {
      await this.ensureSchema();
      try {
        const rows = await db.query<any>(
          `SELECT id, user_id, sender, text, emotion, suggested_actions_json, requires_confirmation, confirmation_summary, proposal_id, is_confirmed, created_at
           FROM jami_messages
           WHERE user_id = ?
           ORDER BY created_at ASC`,
          [userId]
        );

        if (rows.length > 0) {
          return rows.map((r) => ({
            id: r.id,
            userId: r.user_id,
            sender: r.sender === 'user' ? 'user' : 'jami',
            text: r.text,
            emotion: r.emotion || 'idle',
            suggestedActions: r.suggested_actions_json ? (typeof r.suggested_actions_json === 'string' ? JSON.parse(r.suggested_actions_json) : r.suggested_actions_json) : [],
            requiresConfirmation: Boolean(r.requires_confirmation),
            confirmationSummary: r.confirmation_summary || undefined,
            proposalId: r.proposal_id || undefined,
            isConfirmed: Boolean(r.is_confirmed),
            createdAt: r.created_at ? (r.created_at.toISOString?.() || String(r.created_at)) : new Date().toISOString(),
          }));
        }
      } catch (err: any) {
        console.warn('[JAMI Repo] getMessages error:', err.message);
      }
    }

    return this.demoMessages.get(userId) || [];
  }

  public async saveMessage(
    userId: string,
    msg: Omit<JamiMessageRecord, 'id' | 'userId' | 'createdAt'>
  ): Promise<JamiMessageRecord> {
    const id = 'msg_' + crypto.randomUUID().substring(0, 16);
    const createdAt = new Date().toISOString();

    const record: JamiMessageRecord = {
      id,
      userId,
      sender: msg.sender,
      text: msg.text,
      emotion: msg.emotion || 'idle',
      suggestedActions: msg.suggestedActions || [],
      requiresConfirmation: Boolean(msg.requiresConfirmation),
      confirmationSummary: msg.confirmationSummary,
      proposalId: msg.proposalId,
      isConfirmed: Boolean(msg.isConfirmed),
      createdAt,
    };

    if (db.isHealthy()) {
      await this.ensureSchema();
      try {
        await db.execute(
          `INSERT INTO jami_messages
           (id, user_id, sender, text, emotion, suggested_actions_json, requires_confirmation, confirmation_summary, proposal_id, is_confirmed, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
          [
            id,
            userId,
            record.sender,
            record.text,
            record.emotion,
            JSON.stringify(record.suggestedActions),
            record.requiresConfirmation ? 1 : 0,
            record.confirmationSummary || null,
            record.proposalId || null,
            record.isConfirmed ? 1 : 0,
          ]
        );
      } catch (err: any) {
        console.warn('[JAMI Repo] saveMessage DB error:', err.message);
      }
    }

    const list = this.demoMessages.get(userId) || [];
    list.push(record);
    this.demoMessages.set(userId, list);

    return record;
  }

  public async confirmMessageAction(userId: string, messageId: string): Promise<JamiMessageRecord | null> {
    if (db.isHealthy()) {
      await this.ensureSchema();
      try {
        await db.execute(
          `UPDATE jami_messages SET is_confirmed = 1 WHERE id = ? AND user_id = ?`,
          [messageId, userId]
        );
      } catch (err: any) {
        console.warn('[JAMI Repo] confirmMessageAction DB error:', err.message);
      }
    }

    const list = this.demoMessages.get(userId) || [];
    const msg = list.find((m) => m.id === messageId);
    if (msg) {
      msg.isConfirmed = true;
      return msg;
    }

    const messages = await this.getMessages(userId);
    return messages.find((m) => m.id === messageId) || null;
  }

  public async getPreferences(userId: string): Promise<JamiPreferences> {
    if (db.isHealthy()) {
      try {
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
            soundEffects: Boolean(r.sound_effects),
            selectedVoice: r.selected_voice || 'vi-VN-Standard-A',
            animationEnabled: Boolean(r.animation_enabled),
            responseLength: r.response_length || 'balanced',
            preferredAddress: r.preferred_address || 'Minh',
            memoryEnabled: Boolean(r.memory_enabled),
          };
        }
      } catch {}
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
      preferredAddress: 'Học sinh',
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
      try {
        await db.execute(
          `INSERT INTO jami_preferences (user_id, voice_enabled, sound_effects, selected_voice, animation_enabled, response_length, preferred_address, memory_enabled, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
           ON DUPLICATE KEY UPDATE
             voice_enabled = VALUES(voice_enabled),
             sound_effects = VALUES(sound_effects),
             selected_voice = VALUES(selected_voice),
             animation_enabled = VALUES(animation_enabled),
             response_length = VALUES(response_length),
             preferred_address = VALUES(preferred_address),
             memory_enabled = VALUES(memory_enabled),
             updated_at = NOW(3)`,
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
      } catch {}
    } else {
      this.demoPreferences.set(userId, updated);
    }

    return updated;
  }

  public async getMemories(userId: string): Promise<JamiMemorySummary[]> {
    if (db.isHealthy()) {
      try {
        const rows = await db.query<any>(
          `SELECT id, user_id, category, summary, confidence, source_reference, is_active, updated_at
           FROM jami_memory_summaries
           WHERE user_id = ? AND is_active = 1
           ORDER BY updated_at DESC`,
          [userId]
        );

        return rows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          category: (r.category === 'weak_subject' || r.category === 'habit' || r.category === 'preference') ? r.category : 'weak_subject',
          summary: r.summary,
          createdAt: r.created_at ? r.created_at.toISOString?.() || String(r.created_at) : (r.updated_at ? r.updated_at.toISOString?.() || String(r.updated_at) : new Date().toISOString()),
        }));
      } catch {}
    }

    return this.demoMemories.get(userId) || [];
  }

  public async deleteMemory(userId: string, memoryId: string): Promise<boolean> {
    if (db.isHealthy()) {
      try {
        const res = await db.execute(
          `UPDATE jami_memory_summaries SET is_active = 0 WHERE id = ? AND user_id = ?`,
          [memoryId, userId]
        );
        return res?.affectedRows > 0;
      } catch {}
    }

    const list = this.demoMemories.get(userId) || [];
    const filtered = list.filter((m) => m.id !== memoryId);
    this.demoMemories.set(userId, filtered);
    return true;
  }

  public seedDemo(userId: string, prefs: JamiPreferences, memories: JamiMemorySummary[]) {
    this.demoPreferences.set(userId, prefs);
    this.demoMemories.set(userId, [...memories]);
  }
}

export const jamiRepo = JamiRepository.getInstance();
