/* ============================================
   OmniAI — Beta Configuration
   Single source of truth for beta features.
   ============================================ */
'use strict';

const BETA_MODE = process.env.OMNIAI_BETA === 'true' || process.env.NODE_ENV !== 'production';

const BETA_CONFIG = {
  mode: BETA_MODE,
  name: BETA_MODE ? 'OmniAI Beta' : 'OmniAI',
  features: {
    feedback: true,
    aiFeedback: true,
    analytics: true,
    globalSearch: true,
    recentWork: true,
    onboarding: true,
    accountDeletion: true,
    dataExport: true,
  },
  limits: {
    free: {
      aiRequestsPerDay: 20,
      imageGenerationsPerDay: 3,
      documentUploadsPerDay: 5,
      maxFileSizeMB: 10,
    },
    premium: {
      aiRequestsPerDay: 500,
      imageGenerationsPerDay: 50,
      documentUploadsPerDay: 100,
      maxFileSizeMB: 50,
    },
  },
  version: '3.1.0',
  buildDate: '2026-08-04',
};

module.exports = { BETA_CONFIG, BETA_MODE };