import { z } from "zod";

export const channelNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const joinChannelSchema = z.object({
  channel: channelNameSchema,
});

export const sendMessageSchema = z.object({
  channel: channelNameSchema,
  content: z.string().trim().min(1).max(2000),
});
