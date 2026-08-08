import { createClient } from '@supabase/supabase-js';
import config from '../config.js';

const supabaseUrl = config.supabase.url;
const supabaseServiceKey = config.supabase.serviceKey;

const isSupabaseConfigured = !!(supabaseUrl && supabaseServiceKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
      db: { schema: 'public' },
    })
  : null;

// ⚠️ IN-MEMORY FALLBACK — DEVELOPMENT ONLY
// This is NOT persisted. Data will be lost when the server restarts.
// For production, configure Supabase in your .env file.
if (!isSupabaseConfigured) {
  console.warn('\n  ╔══════════════════════════════════════════════════════════╗');
  console.warn('  ║  WARNING: Using in-memory database                      ║');
  console.warn('  ║  All data will be lost on server restart.               ║');
  console.warn('  ║  Configure SUPABASE_URL and SUPABASE_SERVICE_KEY        ║');
  console.warn('  ║  in your .env file for production use.                  ║');
  console.warn('  ╚══════════════════════════════════════════════════════════╝\n');
}

// ── In-memory fallback (development only) ──
const memoryDB = {
  profiles: new Map(),
  chats: new Map(),
  documents: new Map(),
  notes: new Map(),
  todos: new Map(),
  habits: new Map(),
  goals: new Map(),
  images: new Map(),
  flashcards: new Map(),
  usage: new Map(),
  sessions: new Map(),
};

/**
 * Check if database is configured for production use
 */
export function isDatabaseReady() {
  return isSupabaseConfigured;
}

// ── Helper: wrap Supabase query with error handling ──
async function supabaseQuery(queryFn, fallbackFn) {
  if (supabase) {
    try {
      return await queryFn();
    } catch (err) {
      console.error('Supabase query error:', err.message);
      throw new Error('Database operation failed. Please try again.');
    }
  }
  return fallbackFn();
}

// ── Profile ──
export async function getProfile(userId) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (err) throw err;
      return data;
    },
    () => memoryDB.profiles.get(userId) || null
  );
}

export async function upsertProfile(profile) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('profiles').upsert(profile, { onConflict: 'id' }).select().single();
      if (err) throw err;
      return { data };
    },
    () => {
      memoryDB.profiles.set(profile.id, { ...profile, updated_at: new Date().toISOString() });
      return { data: memoryDB.profiles.get(profile.id) };
    }
  );
}

// ── Chat Messages ──
export async function getChatHistory(userId, limit = 50) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('chat_messages')
        .select('*').eq('user_id', userId).order('created_at', { ascending: true }).limit(limit);
      if (err) throw err;
      return data || [];
    },
    () => {
      const msgs = memoryDB.chats.get(userId) || [];
      return msgs.slice(-limit);
    }
  );
}

export async function saveChatMessage(msg) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('chat_messages').insert(msg).select().single();
      if (err) throw err;
      return { data };
    },
    () => {
      const msgs = memoryDB.chats.get(msg.user_id) || [];
      const entry = { ...msg, id: crypto.randomUUID(), created_at: new Date().toISOString() };
      msgs.push(entry);
      memoryDB.chats.set(msg.user_id, msgs);
      return { data: entry };
    }
  );
}

// ── Documents ──
export async function saveDocument(doc) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('documents').insert(doc).select().single();
      if (err) throw err;
      return { data };
    },
    () => {
      const d = { ...doc, id: crypto.randomUUID(), created_at: new Date().toISOString() };
      const docs = memoryDB.documents.get(doc.user_id) || [];
      docs.push(d);
      memoryDB.documents.set(doc.user_id, docs);
      return { data: d };
    }
  );
}

export async function getDocuments(userId) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('documents')
        .select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (err) throw err;
      return data || [];
    },
    () => memoryDB.documents.get(userId) || []
  );
}

// ── Todos ──
export async function getTodos(userId) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('todos')
        .select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (err) throw err;
      return data || [];
    },
    () => memoryDB.todos.get(userId) || []
  );
}

export async function saveTodo(todo) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('todos').insert(todo).select().single();
      if (err) throw err;
      return { data };
    },
    () => {
      const t = { ...todo, id: crypto.randomUUID(), created_at: new Date().toISOString() };
      const list = memoryDB.todos.get(todo.user_id) || [];
      list.unshift(t);
      memoryDB.todos.set(todo.user_id, list);
      return { data: t };
    }
  );
}

export async function updateTodo(id, userId, updates) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('todos')
        .update(updates).eq('id', id).eq('user_id', userId).select().single();
      if (err) throw err;
      return { data };
    },
    () => {
      const list = memoryDB.todos.get(userId) || [];
      const idx = list.findIndex(t => t.id === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...updates, updated_at: new Date().toISOString() };
        memoryDB.todos.set(userId, list);
      }
      return { data: list[idx] };
    }
  );
}

export async function deleteTodo(id, userId) {
  return supabaseQuery(
    async () => {
      const { error: err } = await supabase.from('todos').delete().eq('id', id).eq('user_id', userId);
      if (err) throw err;
      return { data: null };
    },
    () => {
      const list = memoryDB.todos.get(userId) || [];
      memoryDB.todos.set(userId, list.filter(t => t.id !== id));
      return { data: null };
    }
  );
}

// ── Notes ──
export async function getNotes(userId) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('notes')
        .select('*').eq('user_id', userId).order('updated_at', { ascending: false });
      if (err) throw err;
      return data || [];
    },
    () => memoryDB.notes.get(userId) || []
  );
}

export async function saveNote(note) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('notes').upsert(note, { onConflict: 'id' }).select().single();
      if (err) throw err;
      return { data };
    },
    () => {
      const n = { ...note, id: note.id || crypto.randomUUID(), updated_at: new Date().toISOString() };
      const list = memoryDB.notes.get(note.user_id) || [];
      const idx = list.findIndex(x => x.id === n.id);
      if (idx !== -1) list[idx] = n; else list.unshift(n);
      memoryDB.notes.set(note.user_id, list);
      return { data: n };
    }
  );
}

// ── Habits ──
export async function getHabits(userId) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('habits').select('*').eq('user_id', userId);
      if (err) throw err;
      return data || [];
    },
    () => memoryDB.habits.get(userId) || []
  );
}

export async function saveHabit(habit) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('habits').upsert(habit, { onConflict: 'id' }).select().single();
      if (err) throw err;
      return { data };
    },
    () => {
      const h = { ...habit, id: habit.id || crypto.randomUUID() };
      const list = memoryDB.habits.get(habit.user_id) || [];
      const idx = list.findIndex(x => x.id === h.id);
      if (idx !== -1) list[idx] = h; else list.push(h);
      memoryDB.habits.set(habit.user_id, list);
      return { data: h };
    }
  );
}

// ── Goals ──
export async function getGoals(userId) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('goals').select('*').eq('user_id', userId);
      if (err) throw err;
      return data || [];
    },
    () => memoryDB.goals.get(userId) || []
  );
}

export async function saveGoal(goal) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('goals').upsert(goal, { onConflict: 'id' }).select().single();
      if (err) throw err;
      return { data };
    },
    () => {
      const g = { ...goal, id: goal.id || crypto.randomUUID() };
      const list = memoryDB.goals.get(goal.user_id) || [];
      const idx = list.findIndex(x => x.id === g.id);
      if (idx !== -1) list[idx] = g; else list.push(g);
      memoryDB.goals.set(goal.user_id, list);
      return { data: g };
    }
  );
}

// ── Images ──
export async function getImages(userId) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('images')
        .select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (err) throw err;
      return data || [];
    },
    () => memoryDB.images.get(userId) || []
  );
}

export async function saveImage(img) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('images').insert(img).select().single();
      if (err) throw err;
      return { data };
    },
    () => {
      const i = { ...img, id: crypto.randomUUID(), created_at: new Date().toISOString() };
      const list = memoryDB.images.get(img.user_id) || [];
      list.unshift(i);
      memoryDB.images.set(img.user_id, list);
      return { data: i };
    }
  );
}

// ── Flashcards ──
export async function getFlashcards(userId) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('flashcards').select('*').eq('user_id', userId);
      if (err) throw err;
      return data || [];
    },
    () => memoryDB.flashcards.get(userId) || []
  );
}

export async function saveFlashcard(card) {
  return supabaseQuery(
    async () => {
      const { data, error: err } = await supabase.from('flashcards').upsert(card, { onConflict: 'id' }).select().single();
      if (err) throw err;
      return { data };
    },
    () => {
      const c = { ...card, id: card.id || crypto.randomUUID() };
      const list = memoryDB.flashcards.get(card.user_id) || [];
      const idx = list.findIndex(x => x.id === c.id);
      if (idx !== -1) list[idx] = c; else list.push(c);
      memoryDB.flashcards.set(card.user_id, list);
      return { data: c };
    }
  );
}

// ── Usage ──
export async function getUsage(userId) {
  return supabaseQuery(
    async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error: err } = await supabase.from('usage')
        .select('*').eq('user_id', userId).gte('date', today);
      if (err) throw err;
      return data || [];
    },
    () => memoryDB.usage.get(userId) || []
  );
}

export async function incrementUsage(userId, type) {
  const today = new Date().toISOString().slice(0, 10);

  return supabaseQuery(
    async () => {
      // Upsert usage count
      const { data: existing } = await supabase.from('usage')
        .select('*').eq('user_id', userId).eq('type', type).eq('date', today).maybeSingle();

      if (existing) {
        const { error: err } = await supabase.from('usage')
          .update({ count: existing.count + 1 }).eq('id', existing.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('usage')
          .insert({ user_id: userId, type, date: today, count: 1 });
        if (err) throw err;
      }
      return { data: null };
    },
    () => {
      let records = memoryDB.usage.get(userId) || [];
      const existing = records.find(r => r.type === type && r.date === today);
      if (existing) existing.count += 1;
      else records.push({ type, date: today, count: 1 });
      memoryDB.usage.set(userId, records);
      return { data: null };
    }
  );
}

// ── Sessions ──
export async function saveSession(session) {
  memoryDB.sessions.set(session.id, session);
}

export async function getSession(id) {
  return memoryDB.sessions.get(id) || null;
}