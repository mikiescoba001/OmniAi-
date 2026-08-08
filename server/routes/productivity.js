import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import {
  getTodos, saveTodo, updateTodo, deleteTodo,
  getNotes, saveNote,
  getHabits, saveHabit,
  getGoals, saveGoal,
} from '../models/database.js';

const router = Router();

// ── Todos ──
router.get('/todos', authenticate, async (req, res) => {
  try {
    const todos = await getTodos(req.userId);
    return res.json({ todos });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get todos' });
  }
});

router.post('/todos', authenticate, async (req, res) => {
  try {
    const { text } = z.object({ text: z.string().min(1).max(500) }).parse(req.body);
    const { data } = await saveTodo({ user_id: req.userId, text, done: false });
    return res.status(201).json(data);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    return res.status(500).json({ error: 'Failed to create todo' });
  }
});

router.put('/todos/:id', authenticate, async (req, res) => {
  try {
    const { done, text } = req.body;
    const { data } = await updateTodo(req.params.id, req.userId, { done, text });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update todo' });
  }
});

router.delete('/todos/:id', authenticate, async (req, res) => {
  try {
    await deleteTodo(req.params.id, req.userId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete todo' });
  }
});

// ── Notes ──
router.get('/notes', authenticate, async (req, res) => {
  try {
    const notes = await getNotes(req.userId);
    return res.json({ notes });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get notes' });
  }
});

router.post('/notes', authenticate, async (req, res) => {
  try {
    const { title, content } = z.object({
      title: z.string().max(200).optional().default('Untitled'),
      content: z.string().max(50000),
    }).parse(req.body);
    const { data } = await saveNote({
      user_id: req.userId, title, content,
      id: req.body.id || undefined,
    });
    return res.status(201).json(data);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    return res.status(500).json({ error: 'Failed to save note' });
  }
});

// ── Habits ──
router.get('/habits', authenticate, async (req, res) => {
  try {
    const habits = await getHabits(req.userId);
    return res.json({ habits });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get habits' });
  }
});

router.post('/habits', authenticate, async (req, res) => {
  try {
    const { name, icon, frequency } = z.object({
      name: z.string().min(1).max(100),
      icon: z.string().optional().default('💪'),
      frequency: z.string().optional().default('daily'),
    }).parse(req.body);
    const { data } = await saveHabit({
      user_id: req.userId, name, icon, frequency,
      streak: 0, logs: [],
    });
    return res.status(201).json(data);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    return res.status(500).json({ error: 'Failed to create habit' });
  }
});

router.put('/habits/:id/log', authenticate, async (req, res) => {
  try {
    const habits = await getHabits(req.userId);
    const habit = habits.find(h => h.id === req.params.id);
    if (!habit) return res.status(404).json({ error: 'Habit not found' });

    const today = new Date().toISOString().slice(0, 10);
    const logs = habit.logs || [];
    const idx = logs.indexOf(today);
    if (idx >= 0) logs.splice(idx, 1);
    else logs.push(today);

    // Recalculate streak
    let streak = 0;
    const d = new Date();
    while (logs.includes(d.toISOString().slice(0, 10))) {
      streak++;
      d.setDate(d.getDate() - 1);
    }

    const { data } = await saveHabit({ ...habit, logs, streak });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to log habit' });
  }
});

// ── Goals ──
router.get('/goals', authenticate, async (req, res) => {
  try {
    const goals = await getGoals(req.userId);
    return res.json({ goals });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get goals' });
  }
});

router.post('/goals', authenticate, async (req, res) => {
  try {
    const { title, targetDate, description } = z.object({
      title: z.string().min(1).max(200),
      targetDate: z.string().optional(),
      description: z.string().max(1000).optional(),
    }).parse(req.body);
    const { data } = await saveGoal({
      user_id: req.userId, title, description: description || '',
      target_date: targetDate, progress: 0,
    });
    return res.status(201).json(data);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    return res.status(500).json({ error: 'Failed to create goal' });
  }
});

router.put('/goals/:id/progress', authenticate, async (req, res) => {
  try {
    const { progress } = z.object({ progress: z.number().min(0).max(100) }).parse(req.body);
    const goals = await getGoals(req.userId);
    const goal = goals.find(g => g.id === req.params.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    const { data } = await saveHabit({ ...goal, progress });
    return res.json(data);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    return res.status(500).json({ error: 'Failed to update goal' });
  }
});

// ── Dashboard stats ──
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const [todos, notes, habits, goals, { getUsage }, { getImages }] = await Promise.all([
      getTodos(req.userId),
      getNotes(req.userId),
      getHabits(req.userId),
      getGoals(req.userId),
      import('../models/database.js'),
      import('../models/database.js'),
    ]);

    const usage = await getUsage(req.userId);
    const today = new Date().toISOString().slice(0, 10);
    const todayUsage = usage.filter(u => u.date === today);

    const images = await getImages(req.userId);

    return res.json({
      stats: {
        totalTodos: todos.length,
        completedTodos: todos.filter(t => t.done).length,
        totalNotes: notes.length,
        totalHabits: habits.length,
        longestStreak: Math.max(...habits.map(h => h.streak || 0), 0),
        totalGoals: goals.length,
        completedGoals: goals.filter(g => g.progress >= 100).length,
        imagesGenerated: images.length,
        aiChatsToday: todayUsage.find(u => u.type === 'chat')?.count || 0,
        writingToday: todayUsage.find(u => u.type === 'writing')?.count || 0,
      },
      recentActivity: [
        ...todos.slice(0, 3).map(t => ({ type: 'todo', text: t.text, done: t.done })),
        ...notes.slice(0, 2).map(n => ({ type: 'note', text: n.title })),
      ],
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

export default router;