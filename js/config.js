// Replace these with your Supabase project URL and anon key
const SUPABASE_URL = 'https://ejvcsiwzellovtigitcj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Jt0yTwoNlZ4ccR8fxPmhyg_jqThrO4v';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const _bgGrid = document.createElement('div');
_bgGrid.className = 'bg-grid';
document.body.prepend(_bgGrid);
