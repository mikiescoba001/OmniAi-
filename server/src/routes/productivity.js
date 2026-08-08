/* ============================================
   OmniAI — Productivity Routes (CRUD)
   All operations persist to Supabase.
   ============================================ */
'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../db/supabase');
const { success } = require('../utils/response');
const { AppError } = require('../utils/errors');
const { todoSchema, todoUpdateSchema, noteSchema } = require('../utils/validators');

const router = Router();
router.use(authenticate);

// ============================================
// TODOS
// ============================================

router.get('/todos', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    success(res, { todos: data || [] });
  } catch (err) { next(err); }
});

router.post('/todos', async (req, res, next) => {
  try {
    const { text } = todoSchema.parse(req.body);
    const { data, error } = await supabase
      .from('todos')
      .insert({ user_id: req.user.id, text })
      .select('*')
      .single();

    if (error) throw error;
    success(res, { todo: data }, 201);
  } catch (err) { next(err); }
});

router.put('/todos/:id', async (req, res, next) => {
  try {
    const updates = todoUpdateSchema.parse(req.body);

    // Verify ownership
    const { data: existing } = await supabase
      .from('todos').select('id').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (!existing) throw new AppError('Todo not found.', 404, 'NOT_FOUND');

    const { data, error } = await supabase
      .from('todos').update(updates).eq('id', req.params.id).select('*').single();

    if (error) throw error;
    success(res, { todo: data });
  } catch (err) { next(err); }
});

router.delete('/todos/:id', async (req, res, next) => {
  try {
    const { data: existing } = await supabase
      .from('todos').select('id').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (!existing) throw new AppError('Todo not found.', 404, 'NOT_FOUND');

    await supabase.from('todos').delete().eq('id', req.params.id);
    success(res, { message: 'Todo deleted.' });
  } catch (err) { next(err); }
});

// ============================================
// NOTES
// ============================================

router.get('/notes', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    success(res, { notes: data || [] });
  } catch (err) { next(err); }
});

router.post('/notes', async (req, res, next) => {
  try {
    const { title, content } = noteSchema.parse(req.body);
    const { data, error } = await supabase
      .from('notes')
      .insert({ user_id: req.user.id, title: title || 'Untitled Note', content })
      .select('*')
      .single();

    if (error) throw error;
    success(res, { note: data }, 201);
  } catch (err) { next(err); }
});

router.put('/notes/:id', async (req, res, next) => {
  try {
    const { title, content, pinned, color } = req.body;

    const { data: existing } = await supabase
      .from('notes').select('id').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (!existing) throw new AppError('Note not found.', 404, 'NOT_FOUND');

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (pinned !== undefined) updates.pinned = pinned;
    if (color !== undefined) updates.color = color;

    const { data, error } = await supabase
      .from('notes').update(updates).eq('id', req.params.id).select('*').single();

    if (error) throw error;
    success(res, { note: data });
  } catch (err) { next(err); }
});

router.delete('/notes/:id', async (req, res, next) => {
  try {
    const { data: existing } = await supabase
      .from('notes').select('id').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (!existing) throw new AppError('Note not found.', 404, 'NOT_FOUND');

    await supabase.from('notes').delete().eq('id', req.params.id);
    success(res, { message: 'Note deleted.' });
  } catch (err) { next(err); }
});

// ============================================
// HABITS
// ============================================

router.get('/habits', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('habits')
      .select('*, habit_logs(count)')
      .eq('user_id', req.user.id)
      .order('created_at');

    if (error) throw error;
    success(res, { habits: data || [] });
  } catch (err) { next(err); }
});

router.post('/habits', async (req, res, next) => {
  try {
    const { name, emoji } = req.body;
    if (!name) throw new AppError('Habit name is required.', 400, 'NAME_REQUIRED');

    const { data, error } = await supabase
      .from('habits')
      .insert({ user_id: req.user.id, name, emoji: emoji || '✅' })
      .select('*')
      .single();

    if (error) throw error;
    success(res, { habit: data }, 201);
  } catch (err) { next(err); }
});

router.post('/habits/:id/log', async (req, res, next) => {
  try {
    const { data: habit } = await supabase
      .from('habits').select('*').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (!habit) throw new AppError('Habit not found.', 404, 'NOT_FOUND');

    const today = new Date().toISOString().split('T')[0];

    // Check if already logged today
    const { data: existing } = await supabase
      .from('habit_logs')
      .select('id')
      .eq('habit_id', req.params.id)
      .eq('completed_date', today)
      .maybeSingle();

    if (existing) {
      throw new AppError('Already logged today!', 409, 'ALREADY_LOGGED');
    }

    await supabase.from('habit_logs').insert({
      habit_id: req.params.id,
      user_id: req.user.id,
      completed_date: today,
    });

    // Update streak
    const { data: logs } = await supabase
      .from('habit_logs')
      .select('completed_date')
      .eq('habit_id', req.params.id)
      .order('completed_date', { ascending: false })
      .limit(30);

    let streak = 0;
    const todayDate = new Date();
    for (let i = 0; i < (logs || []).length; i++) {
      const logDate = new Date(logs[i].completed_date);
      const expected = new Date(todayDate);
      expected.setDate(expected.getDate() - i);
      if (logDate.toDateString() === expected.toDateString()) {
        streak++;
      } else {
        break;
      }
    }

    const longestStreak = Math.max(streak, habit.longest_streak || 0);

    await supabase.from('habits').update({
      streak,
      longest_streak: longestStreak,
    }).eq('id', req.params.id);

    success(res, { streak, longest_streak: longestStreak });
  } catch (err) { next(err); }
});

router.delete('/habits/:id', async (req, res, next) => {
  try {
    await supabase.from('habits').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    success(res, { message: 'Habit deleted.' });
  } catch (err) { next(err); }
});

// ============================================
// GOALS
// ============================================

router.get('/goals', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    success(res, { goals: data || [] });
  } catch (err) { next(err); }
});

router.post('/goals', async (req, res, next) => {
  try {
    const { title, description, target_date, color } = req.body;
    if (!title) throw new AppError('Goal title is required.', 400, 'TITLE_REQUIRED');

    const { data, error } = await supabase
      .from('goals')
      .insert({ user_id: req.user.id, title, description, target_date, color })
      .select('*')
      .single();

    if (error) throw error;
    success(res, { goal: data }, 201);
  } catch (err) { next(err); }
});

router.put('/goals/:id/progress', async (req, res, next) => {
  try {
    const { progress } = req.body;
    if (typeof progress !== 'number' || progress < 0 || progress > 100) {
      throw new AppError('Progress must be 0-100.', 400, 'INVALID_PROGRESS');
    }

    const { data, error } = await supabase
      .from('goals').update({ progress }).eq('id', req.params.id).eq('user_id', req.user.id)
      .select('*').single();

    if (error) throw error;
    if (!data) throw new AppError('Goal not found.', 404, 'NOT_FOUND');

    success(res, { goal: data });
  } catch (err) { next(err); }
});

router.delete('/goals/:id', async (req, res, next) => {
  try {
    await supabase.from('goals').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    success(res, { message: 'Goal deleted.' });
  } catch (err) { next(err); }
});

// ============================================
// LEARNING PROGRESS
// ============================================

router.get('/learning', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('learning_progress')
      .select('*')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    success(res, { topics: data || [] });
  } catch (err) { next(err); }
});

router.post('/learning', async (req, res, next) => {
  try {
    const { topic } = req.body;
    if (!topic) throw new AppError('Topic is required.', 400, 'TOPIC_REQUIRED');

    const { data, error } = await supabase
      .from('learning_progress')
      .insert({ user_id: req.user.id, topic })
      .select('*')
      .single();

    if (error) throw error;
    success(res, { topic: data }, 201);
  } catch (err) { next(err); }
});

// ============================================
// BUSINESS PROJECTS
// ============================================

router.get('/business', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('business_projects')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    success(res, { projects: data || [] });
  } catch (err) { next(err); }
});

router.post('/business', async (req, res, next) => {
  try {
    const { title, type, content } = req.body;
    if (!title || !type || !content) {
      throw new AppError('Title, type, and content are required.', 400, 'INVALID_INPUT');
    }

    const { data, error } = await supabase
      .from('business_projects')
      .insert({ user_id: req.user.id, title, type, content })
      .select('*')
      .single();

    if (error) throw error;
    success(res, { project: data }, 201);
  } catch (err) { next(err); }
});

module.exports = router;