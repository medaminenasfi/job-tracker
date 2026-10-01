import { z } from 'zod';

// A note is free text owned by the user. Trim so leading/trailing whitespace is
// never persisted; require at least one visible character so empty notes can't be
// created (deleting is a separate operation, not an empty-body update).
export const createNoteSchema = z.object({
  body: z.string().trim().min(1, 'Note is required').max(20000),
});

// On update the body must still be non-empty — clearing text should delete the
// note instead of leaving a blank row behind.
export const updateNoteSchema = z.object({
  body: z.string().trim().min(1, 'Note is required').max(20000),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
