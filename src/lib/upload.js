import { supabase } from './supabase.js';

// Upload a logo to the public "branding" bucket. folder: 'clubs/<id>' or 'events/<id>'.
export async function uploadLogo(folder, file) {
  if (!/^image\//.test(file.type)) throw new Error('Choose an image file (PNG, JPG, SVG or WebP).');
  if (file.size > 3 * 1024 * 1024) throw new Error('That image is over 3 MB. Use a smaller logo.');
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('branding').upload(path, file, { upsert: false, contentType: file.type, cacheControl: '31536000' });
  if (error) throw error;
  return supabase.storage.from('branding').getPublicUrl(path).data.publicUrl;
}
