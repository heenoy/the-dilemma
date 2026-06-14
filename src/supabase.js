import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

if (!supabaseUrl || !supabaseKey) {
  console.error('[Supabase] 环境变量读取失败:', {
    VITE_SUPABASE_URL: supabaseUrl || '(未设置)',
    VITE_SUPABASE_ANON_KEY: supabaseKey ? '(已设置)' : '(未设置)',
  })
} else {
  console.log('[Supabase] 环境变量已加载:', {
    url: supabaseUrl,
    keyLength: supabaseKey.length,
    keyPrefix: `${supabaseKey.slice(0, 12)}...`,
  })
}

export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null
