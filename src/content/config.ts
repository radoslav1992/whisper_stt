import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
    type: 'content',
    schema: z.object({
        title: z.string(),
        description: z.string(),
        date: z.coerce.date(),
        author: z.string().default('Whisper STT Team'),
        tags: z.array(z.string()).default([]),
        readTime: z.string().optional(),
    }),
});

export const collections = { blog };
