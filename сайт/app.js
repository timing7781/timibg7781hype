// Интеграция с Supabase SDK через ESM
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Конфигурация подключения к облачной БД
const URL = 'https://rgyuyvoiovrwnrjgrnbm.supabase.co'; 
const KEY = 'sb_publishable_HTaSDRoIFtfeisZ_08lS0g_bFp0Zlju'; 
const supabase = createClient(URL, KEY);

let currentUser = null;         // Текущий авторизованный объект пользователя
let currentProfile = null;      // Локальный кэш профиля из таблицы profiles
let tempStatus = { text: '' };  // Временное хранилище выбранного статуса
let timerInterval = null;       // Ссылка на интервал локального таймера
let heartbeatInterval = null;   // Ссылка на интервал статуса онлайн
let currentMonitorTab = 'participants';
let typingTimeout = null;        // Таймер для скрытия надписи "печатает..."

function ensureMonitorTabsVisible() {
    const monitorCard = document.getElementById('monitorCard');
    const monitorTabs = document.getElementById('monitorTabs');
    const participantsPane = document.getElementById('participantsPane');

    if (monitorCard) monitorCard.style.display = 'block';
    if (monitorTabs) monitorTabs.style.display = 'grid';

    document.querySelectorAll('.monitor-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === currentMonitorTab);
    });

    document.querySelectorAll('.monitor-pane').forEach(pane => {
        pane.classList.remove('active');
    });

    const activePane = document.getElementById(`${currentMonitorTab}Pane`);
    if (activePane) {
        activePane.classList.add('active');
    } else if (participantsPane) {
        currentMonitorTab = 'participants';
        participantsPane.classList.add('active');
    }
}

const ACHIEVEMENT_DEFINITIONS = [
    { name: 'Первый шаг', icon: '🚀', description: 'Завершить первую учебную сессию' },
    { name: 'Возвращение', icon: '🔁', description: 'Завершить две учебные сессии' },
    { name: 'Стабильность', icon: '📅', description: 'Завершить пять учебных сессий' },
    { name: 'Марафонец', icon: '🏃', description: 'Провести одну сессию от 120 минут' },
    { name: 'Ранний старт', icon: '🌅', description: 'Начать учёбу до 08:00' },
    { name: 'Активист', icon: '💬', description: 'Отправить 10 сообщений в чат' },
    { name: 'Душа компании', icon: '🤝', description: 'Отправить 50 сообщений в чат' },
    { name: 'Легенда', icon: '👑', description: 'Накопить 1000 минут учёбы' }
];

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function getDisplayName(user = currentUser) {
    return user?.user_metadata?.full_name || user?.email || 'Пользователь';
}

function getAvatarUrl(user = currentUser) {
    return user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
}

function getInitials(name) {
    const cleanName = String(name || 'Пользователь').trim();
    const parts = cleanName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return cleanName[0]?.toUpperCase() || 'U';
}

function renderAvatar(name, avatarUrl, className) {
    const safeName = escapeHtml(name || 'Пользователь');
    const safeAvatarUrl = avatarUrl ? escapeHtml(avatarUrl) : '';
    if (safeAvatarUrl) {
        return `<div class="${className}"><img src="${safeAvatarUrl}" alt="${safeName}" loading="lazy" referrerpolicy="no-referrer"></div>`;
    }
    return `<div class="${className}">${escapeHtml(getInitials(name))}</div>`;
}

function pluralRu(number, forms) {
    const n = Math.abs(Number(number || 0));
    const lastTwo = n % 100;
    const lastOne = n % 10;

    if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
    if (lastOne === 1) return forms[0];
    if (lastOne >= 2 && lastOne <= 4) return forms[1];
    return forms[2];
}

function formatTimeCompact(minutes) {
    const totalMinutes = Math.max(0, Math.floor(Number(minutes || 0)));

    if (totalMinutes < 1) return '0 мин';
    if (totalMinutes < 60) return `${totalMinutes} мин`;

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    if (hours < 24) {
        return mins > 0 ? `${hours} ч ${mins} мин` : `${hours} ч`;
    }

    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return restHours > 0 ? `${days} д ${restHours} ч` : `${days} д`;
}

function formatTimePhrase(minutes) {
    const totalMinutes = Math.max(0, Math.floor(Number(minutes || 0)));

    if (totalMinutes < 1) return 'меньше минуты';
    if (totalMinutes < 60) {
        return `${totalMinutes} ${pluralRu(totalMinutes, ['минута', 'минуты', 'минут'])}`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    if (hours < 24) {
        const hourText = `${hours} ${pluralRu(hours, ['час', 'часа', 'часов'])}`;
        const minuteText = mins > 0 ? ` ${mins} ${pluralRu(mins, ['минута', 'минуты', 'минут'])}` : '';
        return `${hourText}${minuteText}`;
    }

    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    const dayText = `${days} ${pluralRu(days, ['день', 'дня', 'дней'])}`;
    const hourText = restHours > 0 ? ` ${restHours} ${pluralRu(restHours, ['час', 'часа', 'часов'])}` : '';
    return `${dayText}${hourText}`;
}

function formatLastSeen(minutes) {
    const totalMinutes = Math.max(0, Math.floor(Number(minutes || 0)));
    if (totalMinutes < 1) return 'был только что';
    return `был ${formatTimePhrase(totalMinutes)} назад`;
}

function formatStudyHours(minutes) {
    return formatTimeCompact(minutes);
}

function isRecentlyOnline(user) {
    return Boolean(user?.last_seen && (new Date() - new Date(user.last_seen) < 60000));
}

function getAchievementDefinition(name) {
    return ACHIEVEMENT_DEFINITIONS.find(item => item.name === name) || null;
}

function getAchievementIcon(item) {
    return item?.icon || getAchievementDefinition(item?.name)?.icon || '⭐';
}

function getAchievementDescription(item) {
    return item?.description || getAchievementDefinition(item?.name)?.description || 'Уникальное достижение';
}

function getStatusView(user, online) {
    if (user?.is_studying && user?.session_start) {
        return { text: '📖 Учится', className: 'studying' };
    }
    if (!online) {
        return { text: '⚫ Офлайн', className: 'offline' };
    }
    return { text: user?.status || '🟢 Онлайн', className: '' };
}

async function seedAchievements() {
    const { data: existing, error: selectError } = await supabase.from('achievements').select('name');
    if (selectError) {
        console.warn('Не удалось проверить таблицу achievements:', selectError.message);
        return;
    }

    const existingNames = new Set((existing || []).map(item => item.name));
    const toInsert = ACHIEVEMENT_DEFINITIONS.filter(item => !existingNames.has(item.name));
    if (!toInsert.length) return;

    const { error: fullInsertError } = await supabase.from('achievements').insert(toInsert);
    if (!fullInsertError) return;

    console.warn('Полная вставка достижений не прошла, пробую вставить только name:', fullInsertError.message);
    const onlyNames = toInsert.map(item => ({ name: item.name }));
    const { error: nameInsertError } = await supabase.from('achievements').insert(onlyNames);
    if (nameInsertError) {
        console.warn('Автодобавление достижений не прошло. Проверь SQL/RLS для achievements:', nameInsertError.message);
    }
}

async function getMyAchievementCount() {
    if (!currentUser) return 0;
    const { count, error } = await supabase
        .from('user_achievements')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', currentUser.id);

    if (error) {
        console.warn('Не удалось получить количество достижений:', error.message);
        return 0;
    }
    return count || 0;
}

async function refreshProfile() {
    if (!currentUser) return;

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    if (error) {
        console.error('Ошибка загрузки профиля:', error.message);
        return;
    }

    currentProfile = profile;
    const achievementsCount = await getMyAchievementCount();
    renderProfile(profile, achievementsCount);
}

function renderProfile(profile, achievementsCount = 0) {
    const infoBox = document.querySelector('.status-info-box');
    const name = getDisplayName();
    const avatarUrl = profile?.avatar_url || getAvatarUrl();
    const safeName = escapeHtml(name);
    const totalMinutes = profile?.total_study_minutes || 0;

    infoBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
            ${renderAvatar(name, avatarUrl, 'profile-avatar')}
            <div style="min-width:0;">
                <div style="font-weight: bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${safeName}</div>
                <div style="font-size: 0.8rem; color: var(--success-color);">● В системе</div>
            </div>
        </div>

        <div class="stats-grid-container">
            <div class="stat-card">
                <b>${formatStudyHours(totalMinutes)}</b>
                <span>Учёба</span>
            </div>
            <div class="stat-card">
                <b>${profile?.sessions_count || 0}</b>
                <span>Сессий</span>
            </div>
            <div class="stat-card">
                <b>${profile?.messages_count || 0}</b>
                <span>Сообщ.</span>
            </div>
            <div class="stat-card">
                <b>${achievementsCount}</b>
                <span>Ачивки</span>
            </div>
        </div>

        <div class="info-row" style="margin-top: 15px; font-size: 0.85rem;">📌 Статус: <span id="currentStatusText">${escapeHtml(profile?.status || 'не установлен')}</span></div>
        
        <button id="logoutBtn" style="background:none; border:none; color:var(--danger-color); cursor:pointer; font-size:12px; margin-top:10px; text-decoration:underline; width: 100%; text-align: right;">Выйти из системы</button>
    `;

    document.getElementById('logoutBtn').onclick = async () => {
        await supabase.auth.signOut();
        window.location.reload();
    };
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ: Проверка состояния авторизации и инициализация модулей
 */
async function checkUser() {
    const { data } = await supabase.auth.getUser();
    const infoBox = document.querySelector('.status-info-box');

    if (data?.user) {
        currentUser = data.user;
        const name = getDisplayName();
        const avatarUrl = getAvatarUrl();
        
        // Активация интерфейса для авторизованных
        document.getElementById('sessionUI').style.display = 'block';
        document.getElementById('chatSection').style.display = 'block'; 
        ensureMonitorTabsVisible();
        
        // Регистрация/Обновление профиля в БД, включая Google-аватар
        const { error: upsertError } = await supabase.from('profiles').upsert({ 
            id: currentUser.id, 
            username: name,
            avatar_url: avatarUrl,
            last_seen: new Date().toISOString()
        }, { onConflict: 'id' });

        if (upsertError) {
            console.error('Ошибка обновления профиля:', upsertError.message);
        }

        await seedAchievements();
        await refreshProfile();

        // Запуск логики модулей
        initSessionLogic();
        fetchGroup();
        fetchMessages(); 
        fetchRanking();      
        fetchAchievements();  
        
        // ТЕХНИЧЕСКИЙ ХАРТБИТ: Обновление времени активности
        updateHeartbeat(); 
        if (!heartbeatInterval) {
            heartbeatInterval = setInterval(updateHeartbeat, 30000); // Каждые 30 сек подтверждаем онлайн
        } 

    } else {
        // Интерфейс для гостей (OAuth Google)
        infoBox.innerHTML = `
            <button id="loginBtn" style="width:100%; padding:14px; cursor:pointer; border-radius:10px; border:1px solid rgba(255,255,255,0.1); background:white; color: #1e293b; display:flex; align-items:center; justify-content:center; gap:10px; font-weight:bold;">
                <img src="https://www.google.com/favicon.ico" width="18"> Авторизация через Google
            </button>
        `;
        document.getElementById('sessionUI').style.display = 'none';
        document.getElementById('chatSection').style.display = 'none';
        currentMonitorTab = 'participants';
        ensureMonitorTabsVisible();
        document.getElementById('groupList').innerHTML = '<div class="empty-state">Авторизуйтесь через Google, чтобы увидеть участников группы.</div>';
        document.getElementById('rankList').innerHTML = '<div class="empty-state">Рейтинг доступен после входа.</div>';
        document.getElementById('achList').innerHTML = ACHIEVEMENT_DEFINITIONS.map(a => `
            <div class="ach-item">
                <div class="ach-icon">${escapeHtml(a.icon)}</div>
                <div class="ach-name">${escapeHtml(a.name)}</div>
                <div class="ach-desc">${escapeHtml(a.description)}</div>
            </div>
        `).join('');

        document.getElementById('loginBtn').onclick = () => supabase.auth.signInWithOAuth({ 
            provider: 'google',
            options: { redirectTo: window.location.href }
        });
    }
}

/**
 * МОДУЛЬ ТАЙМЕРА: Работа с учебными сессиями + сохранение накопленного времени
 */
async function initSessionLogic() {
    const btn = document.getElementById('toggleSessionBtn');
    const timerDisp = document.getElementById('timerDisplay');

    // Подгружаем состояние при входе
    const { data: profile, error } = await supabase.from('profiles')
        .select('is_studying, session_start')
        .eq('id', currentUser.id)
        .single();

    if (error) {
        console.error('Ошибка чтения учебной сессии:', error.message);
    }

    if (profile?.is_studying && profile.session_start) {
        runLocalTimer(profile.session_start);
    } else {
        clearInterval(timerInterval);
        timerDisp.innerText = '00:00:00';
        btn.innerText = '▶ Начать период учебы';
        btn.classList.remove('btn-stop');
        btn.classList.add('btn-start');
    }

    btn.onclick = async () => {
        if (btn.disabled) return; // Защита от спама кликами
        btn.disabled = true;

        try {
            const isStarting = btn.classList.contains('btn-start');
            const now = new Date();

            if (!isStarting) {
                // ОСТАНАВЛИВАЕМ ВСЁ СРАЗУ (не дожидаясь ответа базы)
                clearInterval(timerInterval);
                timerDisp.innerText = '00:00:00';
                btn.innerText = '▶ Начать период учебы';
                btn.classList.replace('btn-stop', 'btn-start');

                // А теперь спокойно сохраняем данные в фоне
                const { data: p, error: profileError } = await supabase.from('profiles')
                    .select('session_start, total_study_minutes, sessions_count')
                    .eq('id', currentUser.id)
                    .single();

                if (profileError) throw profileError;

                if (p?.session_start) {
                    const diffMin = Math.max(0, Math.floor((now - new Date(p.session_start)) / 60000));
                    const newTotal = (p.total_study_minutes || 0) + diffMin;
                    const newSessions = (p.sessions_count || 0) + 1;

                    const { error: updateError } = await supabase.from('profiles').update({ 
                        total_study_minutes: newTotal,
                        sessions_count: newSessions,
                        is_studying: false,
                        session_start: null,
                        last_seen: now.toISOString()
                    }).eq('id', currentUser.id);

                    if (updateError) throw updateError;

                    await evaluateAchievements({
                        diffMin,
                        totalMinutes: newTotal,
                        sessionsCount: newSessions,
                        messagesCount: currentProfile?.messages_count || 0
                    });
                } else {
                    const { error: stopError } = await supabase.from('profiles').update({ 
                        is_studying: false,
                        session_start: null,
                        last_seen: now.toISOString()
                    }).eq('id', currentUser.id);

                    if (stopError) throw stopError;
                }

                fetchGroup();
                fetchRanking();
                fetchAchievements();
                refreshProfile();

            } else {
                // СТАРТ
                const startTime = now.toISOString();
                const { error: startError } = await supabase.from('profiles').update({ 
                    is_studying: true, 
                    session_start: startTime,
                    last_seen: startTime
                }).eq('id', currentUser.id);

                if (startError) throw startError;
                
                if (now.getHours() < 8) await grantAchievement('Ранний старт');

                runLocalTimer(startTime);
                btn.innerText = '⏹ Завершить период';
                btn.classList.replace('btn-start', 'btn-stop');
                fetchGroup();
                refreshProfile();
            }
        } catch (e) {
            console.error('Ошибка сессии:', e);
        } finally {
            btn.disabled = false;
        }
    };
}

async function evaluateAchievements(stats = {}) {
    if (!currentUser) return;

    const sessionsCount = Number(stats.sessionsCount || 0);
    const totalMinutes = Number(stats.totalMinutes || 0);
    const messagesCount = Number(stats.messagesCount || 0);
    const diffMin = Number(stats.diffMin || 0);

    if (sessionsCount >= 1) await grantAchievement('Первый шаг', false);
    if (sessionsCount >= 2) await grantAchievement('Возвращение', false);
    if (sessionsCount >= 5) await grantAchievement('Стабильность', false);
    if (diffMin >= 120) await grantAchievement('Марафонец', false);
    if (messagesCount >= 10) await grantAchievement('Активист', false);
    if (messagesCount >= 50) await grantAchievement('Душа компании', false);
    if (totalMinutes >= 1000) await grantAchievement('Легенда', false);

    fetchAchievements();
    refreshProfile();
}

// Вспомогательная функция для ачивок
async function grantAchievement(name, refreshAfter = true) {
    if (!currentUser) return;

    const { data: a, error: achError } = await supabase
        .from('achievements')
        .select('id')
        .eq('name', name)
        .single();

    if (achError || !a) {
        console.warn(`Достижение "${name}" не найдено в таблице achievements:`, achError?.message || 'нет записи');
        return;
    }

    const { error: grantError } = await supabase
        .from('user_achievements')
        .upsert({ user_id: currentUser.id, achievement_id: a.id }, { onConflict: 'user_id,achievement_id', ignoreDuplicates: true });

    if (grantError) {
        console.warn(`Не удалось выдать достижение "${name}":`, grantError.message);
        return;
    }

    if (refreshAfter) {
        fetchAchievements();
        refreshProfile();
    }
}

// ОБНОВЛЕННЫЙ РЕЙТИНГ С АВАТАРКАМИ GOOGLE
async function fetchRanking() {
    const rankList = document.getElementById('rankList');
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('total_study_minutes', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Ошибка рейтинга:', error.message);
        rankList.innerHTML = '<div class="empty-state">Не удалось загрузить рейтинг.</div>';
        return;
    }

    if (!data || !data.length) {
        rankList.innerHTML = '<div class="empty-state">Пока нет данных для рейтинга.</div>';
        return;
    }

    const medals = ['🥇', '🥈', '🥉', '4', '5', '6', '7', '8', '9', '10'];
    rankList.innerHTML = data.map((s, i) => {
        const username = s.username || 'Пользователь';
        return `
            <div class="rank-row">
                <div style="width: 25px; font-weight: bold; color: var(--primary-color);">${escapeHtml(medals[i])}</div>
                ${renderAvatar(username, s.avatar_url, 'rank-avatar')}
                <div style="flex-grow: 1; min-width:0;">
                    <div style="font-weight: 600; font-size: 0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(username)}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">${s.sessions_count || 0} сессий</div>
                </div>
                <b style="color: var(--success-color); white-space:nowrap;">${formatTimeCompact(s.total_study_minutes || 0)}</b>
            </div>
        `;
    }).join('');
}

// Загрузка ачивок
async function fetchAchievements() {
    const achList = document.getElementById('achList');
    const { data: all, error: allError } = await supabase.from('achievements').select('*').order('name', { ascending: true });
    const { data: my, error: myError } = currentUser
        ? await supabase.from('user_achievements').select('achievement_id').eq('user_id', currentUser.id)
        : { data: [], error: null };

    if (allError) {
        console.warn('Не удалось загрузить achievements, показываю локальный список:', allError.message);
    }
    if (myError) {
        console.warn('Не удалось загрузить user_achievements:', myError.message);
    }

    const myIds = my?.map(m => m.achievement_id) || [];
    const source = all?.length ? all : ACHIEVEMENT_DEFINITIONS.map((item, index) => ({ ...item, id: `local-${index}` }));

    achList.innerHTML = source.map(a => {
        const unlocked = myIds.includes(a.id);
        return `
            <div class="ach-item ${unlocked ? 'unlocked' : ''}">
                <div class="ach-icon">${escapeHtml(getAchievementIcon(a))}</div>
                <div class="ach-name">${escapeHtml(a.name)}</div>
                <div class="ach-desc">${escapeHtml(getAchievementDescription(a))}</div>
            </div>
        `;
    }).join('');
}

function runLocalTimer(startTime) {
    const btn = document.getElementById('toggleSessionBtn');
    btn.innerText = '⏹ Завершить период';
    btn.classList.remove('btn-start');
    btn.classList.add('btn-stop');
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const diff = Math.floor((new Date() - new Date(startTime)) / 1000);
        const h = Math.floor(diff / 3600).toString().padStart(2, '0');
        const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
        const s = (diff % 60).toString().padStart(2, '0');
        document.getElementById('timerDisplay').innerText = `${h}:${m}:${s}`;
    }, 1000);
}

async function updateHeartbeat() {
    if (currentUser) {
        const { error } = await supabase.from('profiles').update({ 
            last_seen: new Date().toISOString() 
        }).eq('id', currentUser.id);

        if (error) console.warn('Ошибка heartbeat:', error.message);
    }
}

window.prepStatus = (element, text) => {
    document.querySelectorAll('.status-option').forEach(opt => opt.classList.remove('active'));
    element.classList.add('active');
    tempStatus.text = text;
};

window.applyStatus = async () => {
    if (!currentUser || !tempStatus.text) return;
    const { error } = await supabase
        .from('profiles')
        .update({ status: tempStatus.text, last_seen: new Date().toISOString() })
        .eq('id', currentUser.id);

    if (error) {
        console.error('Ошибка обновления статуса:', error.message);
        return;
    }

    fetchGroup();
    refreshProfile(); // Обновить текст статуса в профиле
};

window.switchMonitorTab = (tab) => {
    currentMonitorTab = tab;
    document.querySelectorAll('.monitor-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.monitor-pane').forEach(pane => pane.classList.remove('active'));

    if (tab === 'participants') {
        document.getElementById('participantsPane').classList.add('active');
        fetchGroup();
    }
    if (tab === 'ranking') {
        document.getElementById('rankingPane').classList.add('active');
        fetchRanking();
    }
    if (tab === 'achievements') {
        document.getElementById('achievementsPane').classList.add('active');
        fetchAchievements();
    }
};

async function fetchGroup() {
    const { data, error } = await supabase.from('profiles').select('*').order('username', { ascending: true });
    const list = document.getElementById('groupList');
    const summary = document.getElementById('monitorSummary');

    if (error || !data) {
        console.error('Ошибка загрузки участников:', error?.message);
        list.innerHTML = '<div class="empty-state">Не удалось загрузить участников.</div>';
        return;
    }

    const studyingCount = data.filter(user => user.is_studying && user.session_start).length;
    const onlineCount = data.filter(user => isRecentlyOnline(user)).length;
    const offlineCount = data.filter(user => !isRecentlyOnline(user)).length;

    summary.innerHTML = `
        <div class="monitor-summary-card study"><b>${studyingCount}</b><span>учатся</span></div>
        <div class="monitor-summary-card online"><b>${onlineCount}</b><span>онлайн</span></div>
        <div class="monitor-summary-card offline"><b>${offlineCount}</b><span>офлайн</span></div>
    `;

    if (!data.length) {
        list.innerHTML = '<div class="empty-state">Пока нет участников.</div>';
        return;
    }

    list.innerHTML = data.map(user => {
        const online = isRecentlyOnline(user);
        const statusView = getStatusView(user, online);
        const username = user.username || 'Пользователь';
        const avatarUrl = user.avatar_url || '';
        let studyTag = '';

        if (user.is_studying && user.session_start) {
            const diffMin = Math.max(0, Math.floor((new Date() - new Date(user.session_start)) / 60000));
            studyTag = `<span class="session-tag">📖 В учебе: ${formatTimePhrase(diffMin)}</span>`;
        } else if (!online && user.last_seen) {
            const diffMin = Math.max(0, Math.floor((new Date() - new Date(user.last_seen)) / 60000));
            studyTag = `<span class="session-tag" style="color: var(--text-muted);">${formatLastSeen(diffMin)}</span>`;
        }

        return `
            <div class="user-item">
                <div class="user-avatar-wrap">
                    ${renderAvatar(username, avatarUrl, 'user-avatar')}
                    <div class="online-dot ${online ? 'active' : ''}"></div>
                </div>
                <div class="username">
                    ${escapeHtml(username)}
                </div>
                <div class="user-meta">
                    <div class="status-tag ${statusView.className}">${escapeHtml(statusView.text)}</div>
                    ${studyTag}
                </div>
            </div>
        `;
    }).join('');
}

window.sendMessage = async () => {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !currentUser) return;

    // Отправка сообщения
    const { error: insertError } = await supabase.from('messages').insert({
        user_id: currentUser.id,
        username: getDisplayName(),
        text: text
    });

    if (insertError) {
        console.error('Ошибка отправки сообщения:', insertError.message);
        return;
    }

    // Обновление счетчика сообщений в профиле (инкремент)
    const { data: p, error: readProfileError } = await supabase
        .from('profiles')
        .select('messages_count, total_study_minutes, sessions_count')
        .eq('id', currentUser.id)
        .single();

    if (readProfileError) {
        console.error('Ошибка чтения счетчика сообщений:', readProfileError.message);
    } else {
        const newMessagesCount = (p?.messages_count || 0) + 1;
        const { error: updateProfileError } = await supabase
            .from('profiles')
            .update({ messages_count: newMessagesCount, last_seen: new Date().toISOString() })
            .eq('id', currentUser.id);

        if (updateProfileError) {
            console.error('Ошибка обновления счетчика сообщений:', updateProfileError.message);
        } else {
            await evaluateAchievements({
                messagesCount: newMessagesCount,
                totalMinutes: p?.total_study_minutes || 0,
                sessionsCount: p?.sessions_count || 0,
                diffMin: 0
            });
        }
    }

    input.value = '';
    fetchMessages();
    refreshProfile(); // Сразу обновляем цифру в статистике профиля
};

async function fetchMessages() {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25);

    const chatBox = document.getElementById('chatBox');

    if (error) {
        console.error('Ошибка загрузки сообщений:', error.message);
        chatBox.innerHTML = '<div class="empty-state">Не удалось загрузить сообщения.</div>';
        return;
    }

    if (data) {
        chatBox.innerHTML = data.reverse().map(m => {
            const isMine = currentUser && m.user_id === currentUser.id;
            const senderName = isMine
                ? 'Вы'
                : String(m.username || 'Пользователь').split(' ')[0];

            return `
                <div class="chat-msg ${isMine ? 'my-message' : ''}">
                    <b>${escapeHtml(senderName)}:</b>
                    <span>${escapeHtml(m.text).replace(/\n/g, '<br>')}</span>
                </div>
            `;
        }).join('');

        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

// ================= REALTIME CHAT =================

const chatChannel = supabase.channel('global-chat-room')

.on(
    'broadcast',
    { event: 'reaction_event' },
    (payload) => {
        const chatBox = document.getElementById('chatBox');

        const note = document.createElement('div');

        note.className = 'chat-msg';

        note.innerHTML = `
            <b>Реакция</b>
            <div class="reaction-badge">
                ${escapeHtml(payload.payload.user)} отправил: ${escapeHtml(payload.payload.emoji)}
            </div>
        `;

        chatBox.appendChild(note);

        chatBox.scrollTop = chatBox.scrollHeight;

        setTimeout(() => {
            note.remove();
        }, 3000);
    }
)

.on(
    'broadcast',
    { event: 'typing' },
    (payload) => {

        const bubble = document.getElementById('typingBubble');
        const userLabel = document.getElementById('typingUser');

        if (!bubble || !userLabel) return;

        if (
            payload.payload.isTyping &&
            payload.payload.user !== getDisplayName().split(' ')[0]
        ) {

            userLabel.innerText =
                `${payload.payload.user} печатает...`;

            bubble.style.display = 'block';

            clearTimeout(window.typingHideTimeout);

            window.typingHideTimeout = setTimeout(() => {
                bubble.style.display = 'none';
            }, 2000);

        } else {
            bubble.style.display = 'none';
        }
    }
)

.subscribe((status) => {
    console.log('Realtime status:', status);
});
window.sendReaction = (emoji) => {
    if (!currentUser) return;

    chatChannel.send({
        type: 'broadcast',
        event: 'reaction_event',
        payload: {
            user: getDisplayName().split(' ')[0],
            emoji: emoji
        }
    });
};

const chatInput = document.getElementById('chatInput');

if (chatInput) {
    chatInput.addEventListener('input', () => {
        if (!currentUser) return;

        chatChannel.send({
            type: 'broadcast',
            event: 'typing',
            payload: {
                user: getDisplayName().split(' ')[0],
                isTyping: true
            }
        });

        clearTimeout(typingTimeout);

        typingTimeout = setTimeout(() => {
            chatChannel.send({
                type: 'broadcast',
                event: 'typing',
                payload: {
                    user: getDisplayName().split(' ')[0],
                    isTyping: false
                }
            });
        }, 1500);
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            window.sendMessage();
        }
    });
}

// Инициализация системы
checkUser();

// Фоновое обновление данных
setInterval(() => {
    fetchGroup();
    if (currentUser) {
        fetchMessages();
        fetchRanking();
        fetchAchievements();
    }
}, 15000);