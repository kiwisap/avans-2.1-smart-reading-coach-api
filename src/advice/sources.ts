// Where an advice comes from: the AI model, or the rule based scoring (when the AI service is
// not configured or not available).
export const ADVICE_SOURCES = ['ai', 'rules'] as const;
export type AdviceSource = (typeof ADVICE_SOURCES)[number];
