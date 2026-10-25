import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

// Decap may omit optional fields, or serialize a cleared number as an empty string.
const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const optionalText = z.string().nullish().transform(value => value ?? '');
const order = z.number().int().nonnegative();
const homeOrder = z.preprocess(value => value === '' || value == null ? null : value, order.nullable());

const projekte = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/projekte', generateId: ({ data }) => id.parse(data.id) }),
  schema: z.object({
    title: z.string().min(1),
    completion: z.string().min(1),
    partner: optionalText,
    client: optionalText,
    location: optionalText,
    description: z.string(),
    images: z.array(z.string().min(1)).length(2),
    cover: z.string().min(1),
    galleryOrder: order,
    listOrder: order,
    homeOrder,
  }),
});
const bescheinigungen = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/bescheinigungen', generateId: ({ data }) => id.parse(data.id) }),
  schema: z.object({
    title: z.string().min(1),
    file: z.string().regex(/\.pdf$/i),
    order,
  }),
});
export const collections = { projekte, bescheinigungen };
