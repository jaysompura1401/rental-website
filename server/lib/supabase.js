// ─── Local Storage Adapter (replaces Supabase Storage) ────────────────────────
import { saveLocalBuffer, removeLocalFile } from "./storage.js";

export const IMAGES_BUCKET = "property-images";

export const supabaseAdmin = {
  storage: {
    from: (bucket) => ({
      upload: async (objectPath, buffer, _options) => {
        try {
          const parts = objectPath.split("/");
          const filename = parts.pop();
          const subFolder = parts.join("/") || bucket;
          await saveLocalBuffer(subFolder, filename, buffer);
          return { error: null };
        } catch (error) {
          return { error };
        }
      },
      getPublicUrl: (objectPath) => ({
        data: { publicUrl: `/uploads/${objectPath}` },
      }),
      remove: async (paths) => {
        for (const p of paths) {
          await removeLocalFile(p);
        }
        return { error: null };
      },
    }),
  },
};
