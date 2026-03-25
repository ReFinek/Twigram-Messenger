// config.js
const SUPABASE_URL = 'https://njgmnsjqumzeaoneykjh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_miPivHovbKhofi0tfQ-9Lg_1PyDekM1';

if (typeof supabase === 'undefined') {
    console.error('Supabase библиотека не загружена!');
}

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('Supabase клиент создан:', !!supabaseClient);
