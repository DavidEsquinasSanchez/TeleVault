// js/app.js

window.addLog = function(msg, type = 'info') {
    const consoleEl = document.getElementById('logConsole');
    if (!consoleEl) return;

    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = `log-msg-${type}`;
    div.textContent = `[${time}] ${msg}`;

    consoleEl.appendChild(div);
    consoleEl.scrollTop = consoleEl.scrollHeight;
};

document.addEventListener('DOMContentLoaded', async () => {
    // ---------------------------------------------------------------- Ajustes
    const SMALL_FILE_BYTES = 100 * 1024 * 1024;   // hasta 100 MB: se pueden subir varios a la vez
    const SMALL_CONCURRENCY = 3;                  // subidas simultáneas de archivos pequeños
    const UPLOADABLE = ['Pendiente Subir', 'Error en subida', 'Subido Previamente', 'Cancelado'];
    const WORKING = ['Subiendo', 'Preparando', 'Enviando', 'Reintentando', 'Esperando', 'Cancelando'];
    const HEALTH_INTERVAL_MS = 10000;

    // ----------------------------------------------------------------- Estado
    let telegramData = [];
    let filesToUpload = [];
    let fileToDeleteId = null;
    let currentSortColumn = 'transformedName';
    let currentSortAsc = true;
    let uploading = false;
    let cancelRequested = false;
    let isReorderMode = false;
    let draggedItem = null;
    const expandedTopics = new Set(); // temas desplegados en la barra lateral (clave: grupo:tema)
    const expandedChannels = new Set(); // canales expandidos (por defecto todos comprimidos)

    // ------------------------------------------------------------- Catálogo SVG
    const SVG = {
        sun: '<svg class="icon-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
        moon: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
        chevronLeft: '<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>',
        chevronRight: '<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
        chevronUp: '<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>',
        chevronDown: '<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>',
        arrowUpDown: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>',
        saveDisk: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
        pencil: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
        trash: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>',
        check: '<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
        cross: '<svg class="icon-svg" viewBox="0 0 24 24"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>',
        download: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
        square: '<svg class="icon-svg" viewBox="0 0 24 24"><rect width="14" height="14" x="5" y="5" rx="2"/></svg>',
        spinner: '<svg class="icon-svg icon-spin" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
        eye: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
        eyeOff: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>'
    };

    // --------------------------------------------------------------- Elementos
    const sidebar = document.getElementById('sidebar');
    const btnToggleSidebar = document.getElementById('btnToggleSidebar');
    const btnSidebarCollapse = document.getElementById('btnSidebarCollapse');
    const sidebarGroups = document.getElementById('sidebarGroups');
    const btnRefresh = document.getElementById('btnRefresh');
    const connDot = document.getElementById('connDot');
    const connText = document.getElementById('connText');
    const brandVersionPill = document.getElementById('brandVersionPill');
    const aboutVersionBadge = document.getElementById('aboutVersionBadge');
    const aboutMetaBadge = document.getElementById('aboutMetaBadge');

    const uploadForm = document.getElementById('uploadForm');
    const categoriaSelect = document.getElementById('categoria');
    const temasContainer = document.getElementById('temasContainer');
    const serieNuevaCheck = document.getElementById('serieNueva');
    const subcategoriaContainer = document.getElementById('subcategoriaContainer');
    const subcategoriaSelect = document.getElementById('subcategoria');
    const subcategoriaSearch = document.getElementById('subcategoriaSearch');
    const btnToggleSubcategoriaDropdown = document.getElementById('btnToggleSubcategoriaDropdown');
    const btnClearSubcategoriaSearch = document.getElementById('btnClearSubcategoriaSearch');
    const subcategoriaDropdown = document.getElementById('subcategoriaDropdown');
    const subcategoriaCombobox = document.getElementById('subcategoriaCombobox');
    let currentComboboxTopics = [];
    let comboboxActiveIndex = -1;

    const nuevaSerieContainer = document.getElementById('nuevaSerieContainer');
    const nombreSerieInput = document.getElementById('nombreSerie');
    const temporadaInput = document.getElementById('temporada');
    const btnSeleccionar = document.getElementById('btnSeleccionar');

    const btnCrearTema = document.getElementById('btnCrearTema');
    const btnSubir = document.getElementById('btnSubir');
    const btnReintentar = document.getElementById('btnReintentar');
    const btnCancelar = document.getElementById('btnCancelar');

    const filesTable = document.getElementById('filesTable');
    const filesTableBody = document.getElementById('filesTableBody');
    const thOriginal = document.getElementById('thOriginal');
    const thTransformado = document.getElementById('thTransformado');
    const thDestino = document.getElementById('thDestino');
    const thSize = document.getElementById('thSize');

    const logSection = document.getElementById('logSection');
    const logToggleTitle = document.getElementById('logToggleTitle');
    const btnClearLog = document.getElementById('btnClearLog');
    const logConsole = document.getElementById('logConsole');

    const deleteModal = document.getElementById('deleteModal');
    const btnConfirmDelete = document.getElementById('btnConfirmDelete');
    const btnCancelDelete = document.getElementById('btnCancelDelete');

    const btnClearAllUploads = document.getElementById('btnClearAllUploads');
    const deleteAllModal = document.getElementById('deleteAllModal');
    const btnConfirmDeleteAll = document.getElementById('btnConfirmDeleteAll');
    const btnCancelDeleteAll = document.getElementById('btnCancelDeleteAll');

    const btnClearCompletedUploads = document.getElementById('btnClearCompletedUploads');
    const deleteOkModal = document.getElementById('deleteOkModal');
    const btnConfirmDeleteOk = document.getElementById('btnConfirmDeleteOk');
    const btnCancelDeleteOk = document.getElementById('btnCancelDeleteOk');
    const helpText = document.getElementById('helpText');

    const downloadTopicModal = document.getElementById('downloadTopicModal');
    const downloadTopicModalText = document.getElementById('downloadTopicModalText');
    const btnConfirmDownloadTopic = document.getElementById('btnConfirmDownloadTopic');
    const btnCancelDownloadTopic = document.getElementById('btnCancelDownloadTopic');

    const uploadViewControls = document.getElementById('uploadViewControls');
    const downloadViewControls = document.getElementById('downloadViewControls');
    const btnCancelarDescarga = document.getElementById('btnCancelarDescarga');
    const btnReintentarDescarga = document.getElementById('btnReintentarDescarga');
    const btnDescargarContenido = document.getElementById('btnDescargarContenido');
    const tabUploads = document.getElementById('tabUploads');
    const tabDownloads = document.getElementById('tabDownloads');
    const uploadsWrapper = document.getElementById('uploadsWrapper');
    const downloadsWrapper = document.getElementById('downloadsWrapper');
    const badgeUploads = document.getElementById('badgeUploads');
    const badgeDownloads = document.getElementById('badgeDownloads');
    const downloadsTable = document.getElementById('downloadsTable');
    const downloadsTableBody = document.getElementById('downloadsTableBody');
    const checkAllDownloads = document.getElementById('checkAllDownloads');
    const btnClearCompletedDownloads = document.getElementById('btnClearCompletedDownloads');
    const btnClearAllDownloads = document.getElementById('btnClearAllDownloads');
    const deleteDownloadModal = document.getElementById('deleteDownloadModal');
    const btnConfirmDeleteDownload = document.getElementById('btnConfirmDeleteDownload');
    const btnCancelDeleteDownload = document.getElementById('btnCancelDeleteDownload');
    const deleteAllDownloadsModal = document.getElementById('deleteAllDownloadsModal');
    const btnConfirmDeleteAllDownloads = document.getElementById('btnConfirmDeleteAllDownloads');
    const btnCancelDeleteAllDownloads = document.getElementById('btnCancelDeleteAllDownloads');
    const deleteOkDownloadsModal = document.getElementById('deleteOkDownloadsModal');
    const btnConfirmDeleteOkDownloads = document.getElementById('btnConfirmDeleteOkDownloads');
    const btnCancelDeleteOkDownloads = document.getElementById('btnCancelDeleteOkDownloads');
    let downloadToDeleteId = null;

    // Elementos de Gestión de Canales y Reordenación
    const btnReorderSidebar = document.getElementById('btnReorderSidebar');
    const btnResetSidebarOrder = document.getElementById('btnResetSidebarOrder');
    const btnRescanAll = document.getElementById('btnRescanAll');
    const btnManageChannels = document.getElementById('btnManageChannels');
    const channelsModal = document.getElementById('channelsModal');
    const btnCloseChannelsModal = document.getElementById('btnCloseChannelsModal');
    const btnModalRescanChannels = document.getElementById('btnModalRescanChannels');
    const inputNewChannel = document.getElementById('inputNewChannel');
    const btnSubmitAddChannel = document.getElementById('btnSubmitAddChannel');
    const modalBotName = document.getElementById('modalBotName');
    const channelAddFeedback = document.getElementById('channelAddFeedback');
    const channelsCount = document.getElementById('channelsCount');
    const btnRefreshChannelsList = document.getElementById('btnRefreshChannelsList');
    const channelsListContainer = document.getElementById('channelsListContainer');
    const deleteChannelModal = document.getElementById('deleteChannelModal');
    const deleteChannelModalText = document.getElementById('deleteChannelModalText');
    const btnConfirmDeleteChannel = document.getElementById('btnConfirmDeleteChannel');
    const btnCancelDeleteChannel = document.getElementById('btnCancelDeleteChannel');
    let channelToDelete = null;

    // Configuración del Bot y Sugerencias de Canales
    const btnConfigBot = document.getElementById('btnConfigBot');
    const headerBotUsername = document.getElementById('headerBotUsername');
    const botConfigModal = document.getElementById('botConfigModal');
    const btnCloseBotConfigModal = document.getElementById('btnCloseBotConfigModal');
    const inputBotToken = document.getElementById('inputBotToken');
    const btnToggleBotTokenVis = document.getElementById('btnToggleBotTokenVis');
    const inputApiId = document.getElementById('inputApiId');
    const inputApiHash = document.getElementById('inputApiHash');
    const botConfigFeedback = document.getElementById('botConfigFeedback');
    const btnSaveBotConfig = document.getElementById('btnSaveBotConfig');
    const btnCancelBotConfig = document.getElementById('btnCancelBotConfig');
    const btnUploadCloudBackup = document.getElementById('btnUploadCloudBackup');
    const btnRestoreCloudBackup = document.getElementById('btnRestoreCloudBackup');
    const channelSuggestionsDropdown = document.getElementById('channelSuggestionsDropdown');
    const btnDetectChannels = document.getElementById('btnDetectChannels');
    const btnToggleChannelHelp = document.getElementById('btnToggleChannelHelp');
    const channelHelpBlock = document.getElementById('channelHelpBlock');
    let knownChannelsList = [];
    let checkChannelDebounceTimer = null;
    let selectedChannelToVerify = null;

    const DOWNLOAD_LOCKED_MSG = "Descarga en curso. Al finalizar se volverá a habilitar";
    function getDownloadLockedMsg() {
        return window.TeleVaultI18n
            ? window.TeleVaultI18n.t('downloads.locked_msg', "Descarga en curso. Al finalizar se volverá a habilitar")
            : "Descarga en curso. Al finalizar se volverá a habilitar";
    }
    let isDownloading = false;
    let pendingTopicDownload = null;
    let downloadPollInterval = null;
    let downloadEventSource = null;
    let seenDownloadLogs = new Set();
    let currentTab = 'uploads';
    let downloadsList = [];

    // --------------------------------------------------- Modo Claro / Oscuro
    const btnToggleTheme = document.getElementById('btnToggleTheme');

    function applyTheme(theme) {
        if (theme === 'light') {
            document.body.classList.add('light-theme');
            if (btnToggleTheme) {
                btnToggleTheme.innerHTML = SVG.sun;
                const title = window.TeleVaultI18n ? window.TeleVaultI18n.t('header.theme_dark', 'Cambiar a modo oscuro') : 'Cambiar a modo oscuro';
                btnToggleTheme.title = title;
                btnToggleTheme.setAttribute('aria-label', title);
            }
        } else {
            document.body.classList.remove('light-theme');
            if (btnToggleTheme) {
                btnToggleTheme.innerHTML = SVG.moon;
                const title = window.TeleVaultI18n ? window.TeleVaultI18n.t('header.theme_light', 'Cambiar a modo claro') : 'Cambiar a modo claro';
                btnToggleTheme.title = title;
                btnToggleTheme.setAttribute('aria-label', title);
            }
        }
    }

    function initTheme() {
        const savedTheme = localStorage.getItem('teleVaultTheme') || 'dark';
        applyTheme(savedTheme);

        if (btnToggleTheme) {
            btnToggleTheme.addEventListener('click', () => {
                const isLight = document.body.classList.contains('light-theme');
                const nextTheme = isLight ? 'dark' : 'light';
                localStorage.setItem('teleVaultTheme', nextTheme);
                applyTheme(nextTheme);
            });
        }
    }
    initTheme();

    // --------------------------------------------------- Internacionalización (i18n)
    const btnToggleLang = document.getElementById('btnToggleLang');
    const langCurrentText = document.getElementById('langCurrentText');

    function updateLangButtonText(lang) {
        if (langCurrentText) {
            langCurrentText.textContent = (lang || 'es').toUpperCase();
        }
        if (btnToggleLang && window.TeleVaultI18n) {
            const title = window.TeleVaultI18n.t('header.lang');
            btnToggleLang.setAttribute('title', title);
            btnToggleLang.setAttribute('aria-label', title);
        }
    }

    function initLanguage() {
        if (!window.TeleVaultI18n) return;

        updateLangButtonText(window.TeleVaultI18n.getLanguage());

        if (btnToggleLang) {
            btnToggleLang.addEventListener('click', () => {
                const nextLang = window.TeleVaultI18n.toggleLanguage();
                updateLangButtonText(nextLang);
            });
        }

        window.addEventListener('televault:langchange', (e) => {
            const lang = e.detail && e.detail.lang;
            updateLangButtonText(lang);
            renderCategoriaOptions();
            renderSidebar();
            renderTable();
            renderDownloadsTable();
            updateBadges();
            validateForm();
            checkUploadButtonState();
            checkDownloadButtonState();
            applyTheme(document.body.classList.contains('light-theme') ? 'light' : 'dark');
            if (lastHealthState && lastHealthState.key) {
                setConn(lastHealthState.state, lastHealthState.key, lastHealthState.fallback);
            }
        });
    }
    initLanguage();

    // --------------------------------------------------- Atajos de Teclado Accesibles
    function initKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            // Ignorar atajos si se está escribiendo en campos de texto editables
            const target = e.target;
            const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

            // Escape: cerrar el modal visible actual
            if (e.key === 'Escape') {
                const openModal = document.querySelector('.modal:not(.hidden)');
                if (openModal) {
                    openModal.classList.add('hidden');
                    e.preventDefault();
                    return;
                }
            }

            if (isTyping) return;

            // Alt + 1: Pestaña Subidas
            if (e.altKey && e.key === '1') {
                if (tabUploads) tabUploads.click();
                e.preventDefault();
            }
            // Alt + 2: Pestaña Descargas
            else if (e.altKey && e.key === '2') {
                if (tabDownloads) tabDownloads.click();
                e.preventDefault();
            }
            // Alt + T: Alternar tema claro / oscuro
            else if (e.altKey && (e.key === 't' || e.key === 'T')) {
                if (btnToggleTheme) btnToggleTheme.click();
                e.preventDefault();
            }
            // Alt + L: Alternar idioma
            else if (e.altKey && (e.key === 'l' || e.key === 'L')) {
                if (btnToggleLang) btnToggleLang.click();
                e.preventDefault();
            }
            // Alt + U / Ctrl + O: Abrir selector de archivos
            else if ((e.altKey && (e.key === 'u' || e.key === 'U')) || (e.ctrlKey && (e.key === 'o' || e.key === 'O'))) {
                if (currentTab === 'uploads' && btnElegirArchivos && !btnElegirArchivos.disabled) {
                    btnElegirArchivos.click();
                    e.preventDefault();
                }
            }
        });
    }
    initKeyboardShortcuts();

    // --------------------------------------------------- Menú lateral colapsable y redimensionable
    const sidebarResizer = document.getElementById('sidebarResizer');
    let isResizingSidebar = false;

    function applySidebarWidth(w) {
        if (!sidebar) return;
        const maxAvail = Math.min(800, window.innerWidth - 360);
        const clamped = Math.max(220, Math.min(w, maxAvail));
        sidebar.style.width = clamped + 'px';
        sidebar.style.minWidth = clamped + 'px';
    }

    function initSidebar() {
        const savedWidth = parseInt(localStorage.getItem('teleVaultSidebarWidth'), 10);
        if (savedWidth && !isNaN(savedWidth) && savedWidth >= 220) {
            applySidebarWidth(savedWidth);
        }

        if (!sidebarResizer) return;

        sidebarResizer.addEventListener('mousedown', (e) => {
            if (sidebar.classList.contains('collapsed')) return;
            isResizingSidebar = true;
            document.body.classList.add('resizing-sidebar');
            sidebarResizer.classList.add('is-resizing');
            sidebar.classList.add('no-transition');
            const startX = e.clientX;
            const startWidth = sidebar.getBoundingClientRect().width;

            function onMouseMove(ev) {
                if (!isResizingSidebar) return;
                const deltaX = ev.clientX - startX;
                applySidebarWidth(startWidth + deltaX);
            }

            function onMouseUp() {
                if (!isResizingSidebar) return;
                isResizingSidebar = false;
                document.body.classList.remove('resizing-sidebar');
                sidebarResizer.classList.remove('is-resizing');
                sidebar.classList.remove('no-transition');
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);

                const finalWidth = Math.round(sidebar.getBoundingClientRect().width);
                localStorage.setItem('teleVaultSidebarWidth', finalWidth);
            }

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });
    }

    function toggleSidebar() {
        if (!sidebar) return;
        const isCollapsed = sidebar.classList.toggle('collapsed');
        if (btnToggleSidebar) {
            btnToggleSidebar.innerHTML = isCollapsed ? SVG.chevronRight : SVG.chevronLeft;
            const expTitle = window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.expand_title', 'Descomprimir menú lateral') : 'Descomprimir menú lateral';
            const colTitle = window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.collapse_title', 'Comprimir menú lateral') : 'Comprimir menú lateral';
            btnToggleSidebar.title = isCollapsed ? expTitle : colTitle;
        }
        if (!isCollapsed) {
            const savedWidth = parseInt(localStorage.getItem('teleVaultSidebarWidth'), 10) || 280;
            applySidebarWidth(savedWidth);
        }
    }

    if (btnToggleSidebar) btnToggleSidebar.addEventListener('click', toggleSidebar);
    if (btnSidebarCollapse) btnSidebarCollapse.addEventListener('click', toggleSidebar);
    initSidebar();

    // --------------------------------------------- Log de Actividad colapsable
    if (logToggleTitle && logSection) {
        logToggleTitle.addEventListener('click', () => {
            logSection.classList.toggle('collapsed');
        });
    }

    // ------------------------------------------------------------- Utilidades
    function isWorkingStatus(status) {
        return WORKING.some(prefix => status.startsWith(prefix));
    }

    const naturalCompare = (a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

    function parseTransformedTitle(title) {
        if (!title) return { series: '', season: 0, episode: 0, part: 0, isEpisode: false };

        let clean = title.trim();
        let partNum = 0;

        // 1. Detectar corte binario tipo .001, .002
        const numericPartMatch = clean.match(/\.(\d{3,4})$/);
        if (numericPartMatch) {
            partNum = parseInt(numericPartMatch[1], 10);
            clean = clean.substring(0, numericPartMatch.index);
        }

        // 2. Quitar extensión de vídeo (ej: .mp4, .mkv) si queda al final
        const dotIdx = clean.lastIndexOf('.');
        if (dotIdx > 0) {
            clean = clean.substring(0, dotIdx);
        }

        // 3. Detectar compatibilidad con partes antiguas .part1, -part2
        let nameWithoutPart = clean;
        const legacyPartMatch = clean.match(/[\._-]part(\d+)$/i);
        if (legacyPartMatch) {
            if (!partNum) partNum = parseInt(legacyPartMatch[1], 10);
            nameWithoutPart = clean.substring(0, legacyPartMatch.index);
        }

        const matchX = nameWithoutPart.match(/^(.*?)(?:^|\s+)(\d+)x(\d+)(.*?)$/i);
        if (matchX) {
            const series = (matchX[1] + (matchX[4] || '')).trim();
            const season = parseInt(matchX[2], 10);
            let episode = parseInt(matchX[3], 10);
            const epStr = String(matchX[3]);
            const sStr = String(season);
            if (epStr.length === sStr.length + 2 && epStr.startsWith(sStr)) {
                episode = parseInt(epStr.slice(sStr.length), 10);
            }
            return {
                series: series.toLowerCase(),
                season: season,
                episode: episode,
                part: partNum,
                isEpisode: true
            };
        }

        const matchSE = nameWithoutPart.match(/^(.*?)(?:^|\s+)s(\d+)e(\d+)(.*?)$/i);
        if (matchSE) {
            const series = (matchSE[1] + (matchSE[4] || '')).trim();
            const season = parseInt(matchSE[2], 10);
            let episode = parseInt(matchSE[3], 10);
            const epStr = String(matchSE[3]);
            const sStr = String(season);
            if (epStr.length === sStr.length + 2 && epStr.startsWith(sStr)) {
                episode = parseInt(epStr.slice(sStr.length), 10);
            }
            return {
                series: series.toLowerCase(),
                season: season,
                episode: episode,
                part: partNum,
                isEpisode: true
            };
        }

        return {
            series: nameWithoutPart.toLowerCase(),
            season: 0,
            episode: 0,
            part: partNum,
            isEpisode: false
        };
    }

    function compareTransformedTitles(aTitle, bTitle) {
        const a = parseTransformedTitle(aTitle);
        const b = parseTransformedTitle(bTitle);

        if (a.series && b.series && a.series === b.series) {
            if (a.isEpisode && b.isEpisode) {
                if (a.season !== b.season) return a.season - b.season;
                if (a.episode !== b.episode) return a.episode - b.episode;
            }
            if (a.part !== b.part) return a.part - b.part;
        }
        return (aTitle || '').localeCompare(bTitle || '', 'es', { numeric: true, sensitivity: 'base' });
    }

    const compareForUpload = (a, b) => {
        const catA = a.categoryName || a.categoryId || '';
        const catB = b.categoryName || b.categoryId || '';
        if (catA !== catB) {
            return naturalCompare(catA, catB);
        }
        const topA = a.topicName || (a.topicId !== undefined && a.topicId !== null ? String(a.topicId) : '');
        const topB = b.topicName || (b.topicId !== undefined && b.topicId !== null ? String(b.topicId) : '');
        if (topA !== topB) {
            return naturalCompare(topA, topB);
        }
        return compareTransformedTitles(a.transformedName, b.transformedName) || naturalCompare(a.originalName, b.originalName);
    };

    // ---------------------------------------------------- Estado de conexión
    let lastHealthState = { state: 'unknown', key: 'header.bot_checking', fallback: 'Comprobando...' };
    function setConn(state, keyOrText, fallback = null) {
        if (connDot) connDot.className = `conn-dot conn-${state}`;
        if (connText) {
            connText.className = `conn-badge conn-badge-${state}`;
            let text = keyOrText;
            if (fallback !== null) {
                lastHealthState = { state, key: keyOrText, fallback };
                text = window.TeleVaultI18n ? window.TeleVaultI18n.t(keyOrText, fallback) : fallback;
            } else {
                lastHealthState = { state, key: null, fallback: keyOrText };
            }
            connText.textContent = text;
        }
    }

    let wasScanning = false;
    async function checkHealth() {
        try {
            const h = await window.TelegramAPI.health();
            if (h.version) {
                if (brandVersionPill) {
                    brandVersionPill.textContent = h.version;
                    const branchInfo = h.branch ? ` · Rama: ${h.branch}` : '';
                    const commitInfo = h.commit ? ` (${h.commit})` : '';
                    brandVersionPill.title = `TeleVault ${h.version}${branchInfo}${commitInfo}`;
                }
                if (aboutVersionBadge) {
                    aboutVersionBadge.textContent = h.version;
                }
                if (aboutMetaBadge) {
                    aboutMetaBadge.classList.add('hidden');
                }
            }

            if (h.bot) {
                if (headerBotUsername) headerBotUsername.textContent = `@${h.bot}`;
                if (modalBotName) modalBotName.textContent = `@${h.bot}`;
            } else {
                if (headerBotUsername) {
                    headerBotUsername.textContent = window.TeleVaultI18n ? window.TeleVaultI18n.t('header.bot_config', 'Configurar Bot') : 'Configurar Bot';
                }
            }

            if (!h.configured) {
                setConn('error', 'header.bot_not_configured', 'Sin configurar');
                if (btnRescanAll) btnRescanAll.classList.remove('is-spinning');
                if (btnModalRescanChannels) btnModalRescanChannels.classList.remove('is-spinning');
            } else if (!h.telegram) {
                setConn('error', 'header.bot_error', 'Desconectado');
                if (btnRescanAll) btnRescanAll.classList.remove('is-spinning');
                if (btnModalRescanChannels) btnModalRescanChannels.classList.remove('is-spinning');
            } else if (h.scanning) {
                wasScanning = true;
                setConn('busy', 'header.bot_syncing', 'Sincronizando…');
                if (btnRescanAll) btnRescanAll.classList.add('is-spinning');
                if (btnModalRescanChannels) btnModalRescanChannels.classList.add('is-spinning');
            } else {
                if (wasScanning) {
                    wasScanning = false;
                    refreshSidebar();
                }
                setConn('ok', 'header.bot_connected', 'Conectado');
                if (btnRescanAll) btnRescanAll.classList.remove('is-spinning');
                if (btnModalRescanChannels) btnModalRescanChannels.classList.remove('is-spinning');
            }
        } catch (error) {
            setConn('error', error.status === 401 ? 'Sesión caducada' : 'Sin backend');
            if (btnRescanAll) btnRescanAll.classList.remove('is-spinning');
            if (btnModalRescanChannels) btnModalRescanChannels.classList.remove('is-spinning');
        }
    }

    // ------------------------------------------------------------------- Inicio
    async function init() {
        addLog("Iniciando aplicación y cargando interfaz...", "info");
        initTableResizers();
        renderTable();
        renderDownloadsTable();
        updateBadges();
        syncHeaderCheckbox();
        checkDownloadButtonState();
        checkHealth();
        setInterval(checkHealth, HEALTH_INTERVAL_MS);

        // Comprobar actualizaciones oficiales en segundo plano
        setTimeout(() => {
            checkAppUpdates(false, true);
        }, 1500);

        // 0) Comprobar si hay descarga en curso o cola previa
        try {
            const prog = await window.TelegramAPI.getDownloadProgress();
            if (prog && (prog.active || (prog.queue && prog.queue.length > 0))) {
                downloadsList = prog.queue || [];
                renderDownloadsTable(prog);
                updateBadges();
                if (prog.active) {
                    setDownloadLock(true);
                    startDownloadPolling();
                }
            }
        } catch (e) {
            // Ignorar error inicial
        }

        // Sincronizar orden personalizado de canales desde backend si no está en localStorage
        try {
            const serverOrder = await window.TelegramAPI.getSidebarOrder();
            if (serverOrder && typeof serverOrder === 'object') {
                if (serverOrder.topics) delete serverOrder.topics;
                localStorage.setItem('televault_sidebar_order', JSON.stringify(serverOrder));
            }
        } catch (_) {}

        // 1) Al instante, con lo que el backend tiene guardado
        let hasCached = false;
        try {
            const cached = await window.TelegramAPI.getGrupos(true);
            if (cached.length > 0) {
                applyGroupsData(cached);
                hasCached = true;
            }
        } catch (error) {
            // el error ya se registra en el log
        }

        // 2) Datos al día desde Telegram (el backend ya los está actualizando en segundo plano)
        try {
            applyGroupsData(await window.TelegramAPI.getGrupos(false));
        } catch (error) {
            if (!hasCached) addLog("Error crítico al inicializar los datos de Telegram.", "error");
        }
        checkHealth();
    }

    function getStoredSidebarOrder() {
        try {
            const raw = localStorage.getItem('televault_sidebar_order');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.topics) delete parsed.topics;
                return parsed;
            }
        } catch (_) {}
        return null;
    }

    function applySidebarOrdering(data) {
        let list = (data || []).filter(g => g.nombre && g.nombre.trim().toLowerCase() !== 'general');
        const order = getStoredSidebarOrder();
        if (order && Array.isArray(order.channels) && order.channels.length > 0) {
            const chMap = new Map(order.channels.map((id, idx) => [String(id), idx]));
            list.sort((a, b) => {
                const hasA = chMap.has(String(a.id));
                const hasB = chMap.has(String(b.id));
                if (hasA && hasB) return chMap.get(String(a.id)) - chMap.get(String(b.id));
                return naturalCompare(a.nombre || '', b.nombre || '');
            });
        } else {
            list.sort((a, b) => naturalCompare(a.nombre || '', b.nombre || ''));
        }
        list.forEach(grupo => {
            if (order && order.video_sort && order.video_sort[String(grupo.id)]) {
                grupo.sort_dir = order.video_sort[String(grupo.id)];
            } else if (!grupo.sort_dir) {
                grupo.sort_dir = 'asc';
            }
            if (grupo.tieneTemas && grupo.temas) {
                if (grupo.sort_dir === 'desc') {
                    grupo.temas.sort((a, b) => naturalCompare(b.nombre || '', a.nombre || ''));
                } else {
                    grupo.temas.sort((a, b) => naturalCompare(a.nombre || '', b.nombre || ''));
                }
            }
        });
        return list;
    }

    function moveGroup(fromIdx, dir) {
        const toIdx = fromIdx + dir;
        if (toIdx < 0 || toIdx >= telegramData.length) return;
        const item = telegramData.splice(fromIdx, 1)[0];
        telegramData.splice(toIdx, 0, item);
        renderSidebar();
        renderCategoriaOptions();
    }

    function moveTopic(groupId, fromIdx, dir) {
        const grupo = telegramData.find(g => String(g.id) === String(groupId));
        if (!grupo || !grupo.temas) return;
        const toIdx = fromIdx + dir;
        if (toIdx < 0 || toIdx >= grupo.temas.length) return;
        const item = grupo.temas.splice(fromIdx, 1)[0];
        grupo.temas.splice(toIdx, 0, item);
        renderSidebar();
        if (categoriaSelect.value === String(groupId)) {
            populateSubcategorias(grupo);
        }
    }

    function toggleGroupSort(groupId) {
        const grupo = telegramData.find(g => String(g.id) === String(groupId));
        if (!grupo) return;
        const nextDir = (grupo.sort_dir === 'desc') ? 'asc' : 'desc';
        grupo.sort_dir = nextDir;
        if (grupo.tieneTemas && grupo.temas) {
            if (nextDir === 'desc') {
                grupo.temas.sort((a, b) => naturalCompare(b.nombre || '', a.nombre || ''));
            } else {
                grupo.temas.sort((a, b) => naturalCompare(a.nombre || '', b.nombre || ''));
            }
            if (categoriaSelect.value === String(groupId)) {
                populateSubcategorias(grupo);
            }
        } else if (!grupo.tieneTemas && grupo.videos) {
            if (nextDir === 'desc') {
                grupo.videos.sort((a, b) => compareTransformedTitles(b, a));
            } else {
                grupo.videos.sort(compareTransformedTitles);
            }
        }
        renderSidebar();
    }

    async function toggleReorderMode() {
        if (!isReorderMode) {
            isReorderMode = true;
            renderSidebar();
        } else {
            isReorderMode = false;
            renderSidebar();
            await saveCurrentSidebarOrder();
        }
    }

    async function saveCurrentSidebarOrder() {
        const orderData = {
            channels: telegramData.map(g => String(g.id)),
            topics: {},
            video_sort: {}
        };
        telegramData.forEach(g => {
            if (g.sort_dir) {
                orderData.video_sort[String(g.id)] = g.sort_dir;
            }
        });
        try {
            localStorage.setItem('televault_sidebar_order', JSON.stringify(orderData));
        } catch (_) {}
        const ok = await window.TelegramAPI.saveSidebarOrder(orderData);
        const msg = window.TeleVaultI18n ? 
            window.TeleVaultI18n.t('sidebar.order_saved', 'Orden de canales y temas guardado correctamente.') : 
            'Orden de canales y temas guardado correctamente.';
        addLog(msg, ok ? 'success' : 'info');
    }

    async function handleResetSidebarOrder() {
        try {
            localStorage.removeItem('televault_sidebar_order');
        } catch (_) {}
        await window.TelegramAPI.resetSidebarOrder();
        telegramData.sort((a, b) => naturalCompare(a.nombre || '', b.nombre || ''));
        telegramData.forEach(g => {
            g.sort_dir = 'asc';
            if (g.tieneTemas && g.temas) {
                g.temas.sort((a, b) => naturalCompare(a.nombre || '', b.nombre || ''));
            } else if (!g.tieneTemas && g.videos) {
                g.videos.sort(compareTransformedTitles);
            }
        });
        const msg = window.TeleVaultI18n ? 
            window.TeleVaultI18n.t('sidebar.order_reset', 'Orden restablecido alfabéticamente.') : 
            'Orden restablecido alfabéticamente.';
        addLog(msg, 'info');
        renderSidebar();
        renderCategoriaOptions();
    }

    // Pinta los datos y conserva lo que el usuario tenía seleccionado en el formulario
    function applyGroupsData(data) {
        telegramData = applySidebarOrdering(data);
        renderSidebar();

        const prevCat = categoriaSelect.value;
        const prevSub = subcategoriaSelect.value;
        renderCategoriaOptions();
        const grupo = telegramData.find(g => g.id === prevCat);
        if (grupo) {
            categoriaSelect.value = prevCat;
            populateSubcategorias(grupo);
            if (prevSub && !serieNuevaCheck.checked &&
                Array.from(subcategoriaSelect.options).some(o => o.value === prevSub)) {
                subcategoriaSelect.value = prevSub;
                syncSubcategoriaCombobox();
            }
        }
        validateForm();
    }

    btnRefresh.addEventListener('click', () => { window.location.reload(); });

    // Recarga rápida (desde la caché del backend) tras subir vídeos
    async function refreshSidebar() {
        try {
            applyGroupsData(await window.TelegramAPI.getGrupos(true));
        } catch (error) {
            // el error ya se registra en el log
        }
    }

    // ------------------------------------------------------------ Barra lateral
    function renderSidebar() {
        sidebarGroups.innerHTML = '';
        if (sidebar) {
            sidebar.classList.toggle('reorder-mode', isReorderMode);
        }
        if (btnReorderSidebar) {
            btnReorderSidebar.classList.toggle('active', isReorderMode);
            const reorderTitle = window.TeleVaultI18n ? 
                (isReorderMode ? window.TeleVaultI18n.t('sidebar.save_order_title', 'Guardar nuevo orden') : window.TeleVaultI18n.t('sidebar.reorder_title', 'Organizar canales y temas')) :
                (isReorderMode ? 'Guardar nuevo orden' : 'Organizar canales y temas');
            btnReorderSidebar.title = reorderTitle;
            btnReorderSidebar.setAttribute('aria-label', reorderTitle);
            btnReorderSidebar.innerHTML = isReorderMode ? SVG.saveDisk : SVG.arrowUpDown;
        }
        if (btnResetSidebarOrder) {
            btnResetSidebarOrder.classList.toggle('hidden', !isReorderMode);
        }

        if (!telegramData || telegramData.length === 0) {
            const noChannelsText = window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.no_channels', 'No hay canales configurados') : 'No hay canales configurados';
            const addChannelText = window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.add_channel_btn', '➕ Añadir canal') : '➕ Añadir canal';
            sidebarGroups.innerHTML = `
                <div class="sidebar-empty">
                    <div class="empty-icon">📁</div>
                    <div class="empty-text">${noChannelsText}</div>
                    <button type="button" class="btn-sidebar-add-empty" id="btnSidebarEmptyAdd">${addChannelText}</button>
                </div>
            `;
            const btnEmpty = document.getElementById('btnSidebarEmptyAdd');
            if (btnEmpty) btnEmpty.addEventListener('click', () => openChannelsModal(true));
            return;
        }
        telegramData.forEach((grupo, gIdx) => {
            const folderDiv = document.createElement('div');
            folderDiv.className = 'folder-item folder-collapsible';
            const isChannelExpanded = expandedChannels.has(grupo.id);
            if (isChannelExpanded) {
                folderDiv.classList.add('expanded');
            }

            const titleDiv = document.createElement('div');
            titleDiv.className = 'folder-title';
            titleDiv.tabIndex = 0;
            titleDiv.setAttribute('role', 'button');
            titleDiv.setAttribute('aria-expanded', String(isChannelExpanded));
            titleDiv.title = window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.toggle_channel_title', 'Haz clic para comprimir o descomprimir este canal') : 'Haz clic para comprimir o descomprimir este canal';

            if (isReorderMode) {
                const dragHandle = document.createElement('span');
                dragHandle.className = 'folder-drag-handle';
                dragHandle.textContent = '⠿';
                dragHandle.title = window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.drag_handle_title', 'Arrastra para mover') : 'Arrastra para mover';
                dragHandle.addEventListener('click', (e) => e.stopPropagation());
                titleDiv.appendChild(dragHandle);
            }

            const toggleIcon = document.createElement('span');
            toggleIcon.className = 'folder-toggle-icon';
            toggleIcon.textContent = '▶';

            const folderIcon = document.createElement('span');
            folderIcon.className = 'folder-emoji';
            folderIcon.textContent = isChannelExpanded ? '📂' : '📁';

            const titleText = document.createElement('span');
            titleText.className = 'folder-title-text';
            titleText.textContent = grupo.nombre;

            titleDiv.append(toggleIcon, folderIcon, titleText);

            if (isReorderMode) {
                const orderActions = document.createElement('div');
                orderActions.className = 'folder-order-actions';

                const btnSort = document.createElement('button');
                btnSort.type = 'button';
                btnSort.className = 'btn-sort-toggle';
                const isDesc = (grupo.sort_dir === 'desc');
                btnSort.textContent = isDesc ? 'Z-A' : 'A-Z';
                btnSort.title = isDesc ? 
                    (window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.sort_az', 'Ordenar A-Z') : 'Ordenar A-Z') : 
                    (window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.sort_za', 'Ordenar Z-A') : 'Ordenar Z-A');
                btnSort.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleGroupSort(grupo.id);
                });

                const btnUp = document.createElement('button');
                btnUp.type = 'button';
                btnUp.className = 'btn-move-arrow';
                btnUp.title = window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.move_up', 'Subir posición') : 'Subir posición';
                btnUp.innerHTML = SVG.chevronUp;
                btnUp.disabled = (gIdx === 0);
                btnUp.addEventListener('click', (e) => {
                    e.stopPropagation();
                    moveGroup(gIdx, -1);
                });

                const btnDown = document.createElement('button');
                btnDown.type = 'button';
                btnDown.className = 'btn-move-arrow';
                btnDown.title = window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.move_down', 'Bajar posición') : 'Bajar posición';
                btnDown.innerHTML = SVG.chevronDown;
                btnDown.disabled = (gIdx === telegramData.length - 1);
                btnDown.addEventListener('click', (e) => {
                    e.stopPropagation();
                    moveGroup(gIdx, 1);
                });

                orderActions.append(btnSort, btnUp, btnDown);
                titleDiv.appendChild(orderActions);

                folderDiv.setAttribute('draggable', 'true');
                folderDiv.addEventListener('dragstart', (e) => {
                    if (!isReorderMode) return;
                    draggedItem = { type: 'group', id: String(grupo.id), index: gIdx };
                    e.dataTransfer.setData('text/plain', JSON.stringify(draggedItem));
                    e.dataTransfer.effectAllowed = 'move';
                    folderDiv.classList.add('dragging');
                });
                folderDiv.addEventListener('dragend', () => {
                    folderDiv.classList.remove('dragging');
                    document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
                        el.classList.remove('drag-over-top', 'drag-over-bottom');
                    });
                    draggedItem = null;
                });
                folderDiv.addEventListener('dragover', (e) => {
                    if (!isReorderMode || !draggedItem || draggedItem.type !== 'group') return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const rect = folderDiv.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    if (e.clientY < midY) {
                        folderDiv.classList.add('drag-over-top');
                        folderDiv.classList.remove('drag-over-bottom');
                    } else {
                        folderDiv.classList.add('drag-over-bottom');
                        folderDiv.classList.remove('drag-over-top');
                    }
                });
                folderDiv.addEventListener('dragleave', () => {
                    folderDiv.classList.remove('drag-over-top', 'drag-over-bottom');
                });
                folderDiv.addEventListener('drop', (e) => {
                    if (!isReorderMode || !draggedItem || draggedItem.type !== 'group') return;
                    e.preventDefault();
                    e.stopPropagation();
                    folderDiv.classList.remove('drag-over-top', 'drag-over-bottom');
                    const fromIdx = draggedItem.index;
                    const rect = folderDiv.getBoundingClientRect();
                    const isTop = e.clientY < (rect.top + rect.height / 2);
                    let toIdx = isTop ? gIdx : gIdx + 1;
                    if (fromIdx < toIdx) toIdx--;
                    if (fromIdx !== toIdx) {
                        const item = telegramData.splice(fromIdx, 1)[0];
                        telegramData.splice(toIdx, 0, item);
                        renderSidebar();
                        renderCategoriaOptions();
                    }
                });
            }

            folderDiv.appendChild(titleDiv);

            const toggleChannel = () => {
                if (expandedChannels.has(grupo.id)) {
                    expandedChannels.delete(grupo.id);
                } else {
                    expandedChannels.add(grupo.id);
                }
                const nowExpanded = expandedChannels.has(grupo.id);
                folderDiv.classList.toggle('expanded', nowExpanded);
                titleDiv.setAttribute('aria-expanded', String(nowExpanded));
                folderIcon.textContent = nowExpanded ? '📂' : '📁';
            };

            titleDiv.addEventListener('click', toggleChannel);
            titleDiv.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleChannel();
                }
            });

            // Filtrar temas para no mostrar "General" ni id 1
            const temasFiltrados = (grupo.temas || []).filter(
                t => String(t.id) !== '1' && t.nombre.trim().toLowerCase() !== 'general'
            );

            if (grupo.tieneTemas && temasFiltrados.length > 0) {
                const sublist = document.createElement('ul');
                sublist.className = 'subfolder-list';

                temasFiltrados.forEach((tema, tIdx) => {
                    const subItem = document.createElement('li');
                    subItem.className = 'subfolder-item';

                    // Vídeos del tema, ordenados por número de capítulo / parte
                    const videos = (tema.videos || []).slice().sort(compareTransformedTitles);

                    if (videos.length === 0) {
                        subItem.textContent = tema.nombre;
                    } else {
                        const key = `${grupo.id}:${tema.id}`;
                        subItem.classList.add('subfolder-collapsible');

                        const row = document.createElement('div');
                        row.className = 'subfolder-row';
                        row.tabIndex = 0;
                        row.setAttribute('role', 'button');

                        if (isReorderMode) {
                            const topicDrag = document.createElement('span');
                            topicDrag.className = 'subfolder-drag-handle';
                            topicDrag.textContent = '⠿';
                            topicDrag.title = window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.drag_handle_title', 'Arrastra para mover') : 'Arrastra para mover';
                            topicDrag.addEventListener('click', (e) => e.stopPropagation());
                            row.appendChild(topicDrag);
                        }

                        const icon = document.createElement('span');
                        icon.className = 'toggle-icon';
                        icon.textContent = '▶';

                        const name = document.createElement('span');
                        name.className = 'subfolder-name';
                        name.textContent = tema.nombre;

                        const count = document.createElement('span');
                        count.className = 'video-count';
                        count.textContent = videos.length;

                        row.append(icon, name, count);

                        if (isReorderMode) {
                            const topicActions = document.createElement('div');
                            topicActions.className = 'subfolder-order-actions';

                            const btnUp = document.createElement('button');
                            btnUp.type = 'button';
                            btnUp.className = 'btn-move-arrow';
                            btnUp.title = window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.move_up', 'Subir posición') : 'Subir posición';
                            btnUp.innerHTML = SVG.chevronUp;
                            btnUp.disabled = (tIdx === 0);
                            btnUp.addEventListener('click', (e) => {
                                e.stopPropagation();
                                moveTopic(grupo.id, tIdx, -1);
                            });

                            const btnDown = document.createElement('button');
                            btnDown.type = 'button';
                            btnDown.className = 'btn-move-arrow';
                            btnDown.title = window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.move_down', 'Bajar posición') : 'Bajar posición';
                            btnDown.innerHTML = SVG.chevronDown;
                            btnDown.disabled = (tIdx === temasFiltrados.length - 1);
                            btnDown.addEventListener('click', (e) => {
                                e.stopPropagation();
                                moveTopic(grupo.id, tIdx, 1);
                            });

                            topicActions.append(btnUp, btnDown);
                            row.appendChild(topicActions);

                            subItem.setAttribute('draggable', 'true');
                            subItem.addEventListener('dragstart', (e) => {
                                if (!isReorderMode) return;
                                e.stopPropagation();
                                draggedItem = { type: 'topic', groupId: String(grupo.id), topicId: String(tema.id), index: tIdx };
                                e.dataTransfer.setData('text/plain', JSON.stringify(draggedItem));
                                e.dataTransfer.effectAllowed = 'move';
                                subItem.classList.add('dragging');
                            });
                            subItem.addEventListener('dragend', (e) => {
                                e.stopPropagation();
                                subItem.classList.remove('dragging');
                                document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => {
                                    el.classList.remove('drag-over-top', 'drag-over-bottom');
                                });
                                draggedItem = null;
                            });
                            subItem.addEventListener('dragover', (e) => {
                                if (!isReorderMode || !draggedItem || draggedItem.type !== 'topic') return;
                                if (draggedItem.groupId !== String(grupo.id)) return;
                                e.preventDefault();
                                e.stopPropagation();
                                e.dataTransfer.dropEffect = 'move';
                                const rect = subItem.getBoundingClientRect();
                                const midY = rect.top + rect.height / 2;
                                if (e.clientY < midY) {
                                    subItem.classList.add('drag-over-top');
                                    subItem.classList.remove('drag-over-bottom');
                                } else {
                                    subItem.classList.add('drag-over-bottom');
                                    subItem.classList.remove('drag-over-top');
                                }
                            });
                            subItem.addEventListener('dragleave', (e) => {
                                e.stopPropagation();
                                subItem.classList.remove('drag-over-top', 'drag-over-bottom');
                            });
                            subItem.addEventListener('drop', (e) => {
                                if (!isReorderMode || !draggedItem || draggedItem.type !== 'topic') return;
                                if (draggedItem.groupId !== String(grupo.id)) return;
                                e.preventDefault();
                                e.stopPropagation();
                                subItem.classList.remove('drag-over-top', 'drag-over-bottom');
                                const fromIdx = draggedItem.index;
                                const rect = subItem.getBoundingClientRect();
                                const isTop = e.clientY < (rect.top + rect.height / 2);
                                let toIdx = isTop ? tIdx : tIdx + 1;
                                if (fromIdx < toIdx) toIdx--;
                                if (fromIdx !== toIdx) {
                                    const item = grupo.temas.splice(fromIdx, 1)[0];
                                    grupo.temas.splice(toIdx, 0, item);
                                    renderSidebar();
                                    if (categoriaSelect.value === String(grupo.id)) {
                                        populateSubcategorias(grupo);
                                    }
                                }
                            });
                        } else {
                            // Botón de descarga de todos los vídeos del tema
                            const btnDlTopic = document.createElement('button');
                            btnDlTopic.type = 'button';
                            btnDlTopic.className = 'btn-download-topic';
                            const dlAllTitle = window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.download_all_topic', 'Descargar todos los archivos') : 'Descargar todos los archivos';
                            btnDlTopic.title = isDownloading ? getDownloadLockedMsg() : dlAllTitle;
                            btnDlTopic.disabled = isDownloading;
                            btnDlTopic.innerHTML = SVG.download;
                            btnDlTopic.addEventListener('click', (e) => {
                                e.stopPropagation();
                                if (isDownloading) return;
                                pendingTopicDownload = { categoryId: grupo.id, topicId: tema.id, topicName: tema.nombre };
                                if (downloadTopicModalText) {
                                    downloadTopicModalText.textContent = `¿Deseas descargar todos los vídeos del tema "${tema.nombre}"?`;
                                }
                                if (downloadTopicModal) {
                                    downloadTopicModal.classList.remove('hidden');
                                }
                            });
                            row.appendChild(btnDlTopic);
                        }

                        const videoList = document.createElement('ul');
                        videoList.className = 'video-list';
                        videos.forEach(v => {
                            const li = document.createElement('li');
                            li.className = 'video-item';

                            const vTitle = document.createElement('span');
                            vTitle.className = 'video-item-title';
                            vTitle.textContent = v;
                            vTitle.title = v;

                            const btnDlVideo = document.createElement('button');
                            btnDlVideo.type = 'button';
                            btnDlVideo.className = 'btn-download-video';
                            const dlVideoTitle = window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.download_video', 'Descargar video') : 'Descargar video';
                            btnDlVideo.title = isDownloading ? getDownloadLockedMsg() : dlVideoTitle;
                            btnDlVideo.disabled = isDownloading;
                            btnDlVideo.innerHTML = SVG.download;
                            btnDlVideo.addEventListener('click', async (e) => {
                                e.stopPropagation();
                                if (isDownloading) return;
                                await promptAndAddVideoToDownloadList(grupo.id, tema.id, v);
                            });

                            li.append(vTitle, btnDlVideo);
                            videoList.appendChild(li);
                        });

                        subItem.append(row, videoList);

                        const setExpanded = (open) => {
                            subItem.classList.toggle('expanded', open);
                            row.setAttribute('aria-expanded', String(open));
                            if (open) expandedTopics.add(key); else expandedTopics.delete(key);
                        };
                        setExpanded(expandedTopics.has(key));

                        row.addEventListener('click', () => setExpanded(!subItem.classList.contains('expanded')));
                        row.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                row.click();
                            }
                        });
                    }
                    sublist.appendChild(subItem);
                });
                folderDiv.appendChild(sublist);
            } else if (!grupo.tieneTemas && grupo.videos && grupo.videos.length > 0) {
                const videoList = document.createElement('ul');
                videoList.className = 'video-list direct-channel-videos';
                const directVideos = (grupo.videos || []).slice();
                if (grupo.sort_dir === 'desc') {
                    directVideos.sort((a, b) => compareTransformedTitles(b, a));
                } else {
                    directVideos.sort(compareTransformedTitles);
                }

                directVideos.forEach(v => {
                    const li = document.createElement('li');
                    li.className = 'video-item';

                    const vTitle = document.createElement('span');
                    vTitle.className = 'video-item-title';
                    vTitle.textContent = v;
                    vTitle.title = v;

                    const btnDlVideo = document.createElement('button');
                    btnDlVideo.type = 'button';
                    btnDlVideo.className = 'btn-download-video';
                    const dlVideoTitle = window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.download_video', 'Descargar video') : 'Descargar video';
                    btnDlVideo.title = isDownloading ? getDownloadLockedMsg() : dlVideoTitle;
                    btnDlVideo.disabled = isDownloading;
                    btnDlVideo.innerHTML = SVG.download;
                    btnDlVideo.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (isDownloading) return;
                        await promptAndAddVideoToDownloadList(grupo.id, null, v);
                    });

                    li.append(vTitle, btnDlVideo);
                    videoList.appendChild(li);
                });
                folderDiv.appendChild(videoList);
            }
            sidebarGroups.appendChild(folderDiv);
        });
    }

    // --------------------------------------------------------------- Formulario
    function renderCategoriaOptions() {
        const currentVal = categoriaSelect.value;
        const noChannelsText = window.TeleVaultI18n ? window.TeleVaultI18n.t('uploads.no_channels_option', '-- No hay canales configurados --') : '-- No hay canales configurados --';
        const selectCatText = window.TeleVaultI18n ? window.TeleVaultI18n.t('uploads.select_category', 'Selecciona Categoria...') : 'Selecciona Categoria...';
        if (!telegramData || telegramData.length === 0) {
            categoriaSelect.innerHTML = `<option value="">${noChannelsText}</option>`;
            return;
        }
        categoriaSelect.innerHTML = `<option value="">${selectCatText}</option>`;
        telegramData.forEach(grupo => {
            const option = document.createElement('option');
            option.value = grupo.id;
            option.textContent = grupo.nombre;
            categoriaSelect.appendChild(option);
        });
        if (currentVal) categoriaSelect.value = currentVal;
    }

    function normalizeSearchText(text) {
        if (!text) return '';
        return text
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    function syncSubcategoriaCombobox() {
        if (!subcategoriaSearch || !subcategoriaSelect) return;
        const selectedId = subcategoriaSelect.value;
        if (!selectedId) {
            subcategoriaSearch.value = '';
            if (btnClearSubcategoriaSearch) btnClearSubcategoriaSearch.classList.add('hidden');
            return;
        }
        const opt = subcategoriaSelect.options[subcategoriaSelect.selectedIndex];
        subcategoriaSearch.value = opt ? opt.textContent : '';
        if (btnClearSubcategoriaSearch) btnClearSubcategoriaSearch.classList.remove('hidden');
    }

    function closeSubcategoriaDropdown() {
        if (!subcategoriaDropdown) return;
        subcategoriaDropdown.classList.add('hidden');
        if (subcategoriaCombobox) subcategoriaCombobox.classList.remove('open');
        comboboxActiveIndex = -1;
    }

    function openSubcategoriaDropdown() {
        if (!subcategoriaDropdown || (subcategoriaSearch && subcategoriaSearch.disabled)) return;
        renderSubcategoriaDropdown(subcategoriaSearch ? subcategoriaSearch.value : '');
        subcategoriaDropdown.classList.remove('hidden');
        if (subcategoriaCombobox) subcategoriaCombobox.classList.add('open');
    }

    function renderSubcategoriaDropdown(query = '') {
        if (!subcategoriaDropdown) return;
        subcategoriaDropdown.innerHTML = '';
        comboboxActiveIndex = -1;

        const normQuery = normalizeSearchText(query);
        const queryTerms = normQuery.split(/\s+/).filter(Boolean);

        let filtered = currentComboboxTopics;
        if (queryTerms.length > 0) {
            filtered = currentComboboxTopics.filter(topic => {
                const normName = normalizeSearchText(topic.nombre);
                return queryTerms.every(term => normName.includes(term));
            });
        }

        if (filtered.length === 0) {
            const noMatchesText = window.TeleVaultI18n ? window.TeleVaultI18n.t('uploads.no_subcategories_found', 'Sin coincidencias') : 'Sin coincidencias';
            const emptyEl = document.createElement('div');
            emptyEl.className = 'combobox-empty';
            emptyEl.textContent = noMatchesText;
            subcategoriaDropdown.appendChild(emptyEl);
            return;
        }

        filtered.forEach((topic, idx) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'combobox-item';
            itemEl.dataset.id = topic.id;
            itemEl.dataset.index = idx;
            if (String(subcategoriaSelect.value) === String(topic.id)) {
                itemEl.classList.add('selected');
            }

            if (queryTerms.length > 0) {
                let html = topic.nombre;
                queryTerms.forEach(term => {
                    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                    html = html.replace(regex, '<mark>$1</mark>');
                });
                itemEl.innerHTML = `<span>${html}</span>`;
            } else {
                itemEl.textContent = topic.nombre;
            }

            itemEl.addEventListener('mousedown', (e) => {
                e.preventDefault();
                selectSubcategoriaOption(topic);
            });

            subcategoriaDropdown.appendChild(itemEl);
        });

        const selectedEl = subcategoriaDropdown.querySelector('.combobox-item.selected');
        if (selectedEl) {
            selectedEl.scrollIntoView({ block: 'nearest' });
        }
    }

    function selectSubcategoriaOption(topic) {
        if (!topic) return;
        subcategoriaSelect.value = topic.id;
        if (subcategoriaSearch) subcategoriaSearch.value = topic.nombre;
        if (btnClearSubcategoriaSearch) btnClearSubcategoriaSearch.classList.remove('hidden');
        closeSubcategoriaDropdown();
        subcategoriaSelect.dispatchEvent(new Event('change'));
    }

    function clearSubcategoriaSelection() {
        subcategoriaSelect.value = '';
        if (subcategoriaSearch) subcategoriaSearch.value = '';
        if (btnClearSubcategoriaSearch) btnClearSubcategoriaSearch.classList.add('hidden');
        closeSubcategoriaDropdown();
        subcategoriaSelect.dispatchEvent(new Event('change'));
    }

    function populateSubcategorias(grupo) {
        const selectSubText = window.TeleVaultI18n ? window.TeleVaultI18n.t('uploads.select_subcategory', 'Selecciona subcategoria') : 'Selecciona subcategoria';
        subcategoriaSelect.innerHTML = `<option value="">${selectSubText}</option>`;
        currentComboboxTopics = [];
        if (!grupo) {
            subcategoriaSelect.value = '';
            if (subcategoriaSearch) {
                subcategoriaSearch.value = '';
                subcategoriaSearch.disabled = true;
            }
            if (btnToggleSubcategoriaDropdown) btnToggleSubcategoriaDropdown.disabled = true;
            if (btnClearSubcategoriaSearch) btnClearSubcategoriaSearch.classList.add('hidden');
            closeSubcategoriaDropdown();
            return;
        }
        // Filtrar temas para no mostrar ni permitir elegir "General" respetando el orden del grupo
        const temasFiltrados = (grupo.temas || []).filter(
            t => String(t.id) !== '1' && t.nombre.trim().toLowerCase() !== 'general'
        );
        currentComboboxTopics = temasFiltrados.map(t => ({ id: String(t.id), nombre: t.nombre }));
        temasFiltrados.forEach(tema => {
            const opt = document.createElement('option');
            opt.value = tema.id;
            opt.textContent = tema.nombre;
            subcategoriaSelect.appendChild(opt);
        });

        if (subcategoriaSearch) {
            subcategoriaSearch.disabled = false;
            subcategoriaSearch.value = '';
        }
        if (btnToggleSubcategoriaDropdown) btnToggleSubcategoriaDropdown.disabled = false;
        if (btnClearSubcategoriaSearch) btnClearSubcategoriaSearch.classList.add('hidden');
        closeSubcategoriaDropdown();
    }

    if (subcategoriaSearch) {
        subcategoriaSearch.addEventListener('input', () => {
            if (btnClearSubcategoriaSearch) {
                if (subcategoriaSearch.value.trim()) {
                    btnClearSubcategoriaSearch.classList.remove('hidden');
                } else {
                    btnClearSubcategoriaSearch.classList.add('hidden');
                }
            }
            openSubcategoriaDropdown();
        });

        subcategoriaSearch.addEventListener('focus', () => {
            openSubcategoriaDropdown();
        });

        subcategoriaSearch.addEventListener('keydown', (e) => {
            if (!subcategoriaDropdown || subcategoriaDropdown.classList.contains('hidden')) {
                if (e.key === 'ArrowDown' || e.key === 'Enter') {
                    openSubcategoriaDropdown();
                    e.preventDefault();
                }
                return;
            }

            const items = Array.from(subcategoriaDropdown.querySelectorAll('.combobox-item'));
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                comboboxActiveIndex = (comboboxActiveIndex + 1) % items.length;
                items.forEach((it, i) => it.classList.toggle('active', i === comboboxActiveIndex));
                items[comboboxActiveIndex].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                comboboxActiveIndex = (comboboxActiveIndex - 1 + items.length) % items.length;
                items.forEach((it, i) => it.classList.toggle('active', i === comboboxActiveIndex));
                items[comboboxActiveIndex].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (comboboxActiveIndex >= 0 && comboboxActiveIndex < items.length) {
                    const chosenId = items[comboboxActiveIndex].dataset.id;
                    const topic = currentComboboxTopics.find(t => String(t.id) === String(chosenId));
                    if (topic) selectSubcategoriaOption(topic);
                } else if (items.length === 1) {
                    const chosenId = items[0].dataset.id;
                    const topic = currentComboboxTopics.find(t => String(t.id) === String(chosenId));
                    if (topic) selectSubcategoriaOption(topic);
                }
            } else if (e.key === 'Escape') {
                closeSubcategoriaDropdown();
                syncSubcategoriaCombobox();
            }
        });

        subcategoriaSearch.addEventListener('blur', () => {
            setTimeout(() => {
                closeSubcategoriaDropdown();
                syncSubcategoriaCombobox();
            }, 200);
        });
    }

    if (btnToggleSubcategoriaDropdown) {
        btnToggleSubcategoriaDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
            if (subcategoriaSearch && subcategoriaSearch.disabled) return;
            if (subcategoriaDropdown && !subcategoriaDropdown.classList.contains('hidden')) {
                closeSubcategoriaDropdown();
            } else {
                if (subcategoriaSearch) subcategoriaSearch.focus();
                openSubcategoriaDropdown();
            }
        });
    }

    if (btnClearSubcategoriaSearch) {
        btnClearSubcategoriaSearch.addEventListener('click', (e) => {
            e.stopPropagation();
            clearSubcategoriaSelection();
            if (subcategoriaSearch) subcategoriaSearch.focus();
            openSubcategoriaDropdown();
        });
    }

    document.addEventListener('click', (e) => {
        if (subcategoriaCombobox && !subcategoriaCombobox.contains(e.target)) {
            closeSubcategoriaDropdown();
        }
    });

    categoriaSelect.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        const grupo = telegramData.find(g => g.id === selectedId);

        serieNuevaCheck.checked = false;
        serieNuevaCheck.disabled = true;
        nombreSerieInput.value = '';
        temporadaInput.value = '';
        populateSubcategorias(null);

        if (grupo && grupo.tieneTemas) {
            temasContainer.classList.remove('hidden');
            subcategoriaContainer.classList.remove('hidden');
            nuevaSerieContainer.classList.add('hidden');
            serieNuevaCheck.disabled = false;
            populateSubcategorias(grupo);
        } else {
            temasContainer.classList.add('hidden');
        }
        validateForm();
    });

    function adjustSeriesInputWidth() {
        if (!nombreSerieInput) return;
        const len = nombreSerieInput.value.length;
        if (len === 0) {
            nombreSerieInput.style.width = '';
            return;
        }
        // Base de 220px, se expande fluidamente según los caracteres hasta un máximo de 420px
        const targetWidth = Math.min(420, Math.max(220, len * 9.2 + 28));
        nombreSerieInput.style.width = `${Math.round(targetWidth)}px`;
    }

    serieNuevaCheck.addEventListener('change', (e) => {
        if (e.target.checked) {
            subcategoriaContainer.classList.add('hidden');
            nuevaSerieContainer.classList.remove('hidden');
            subcategoriaSelect.value = '';
            syncSubcategoriaCombobox();
            adjustSeriesInputWidth();
        } else {
            subcategoriaContainer.classList.remove('hidden');
            nuevaSerieContainer.classList.add('hidden');
            nombreSerieInput.value = '';
            temporadaInput.value = '';
            subcategoriaSelect.value = '';
            syncSubcategoriaCombobox();
            adjustSeriesInputWidth();
        }
        validateForm();
    });

    subcategoriaSelect.addEventListener('change', () => {
        syncSubcategoriaCombobox();
        validateForm();
        updatePendingTransformedNames();
    });
    nombreSerieInput.addEventListener('input', () => {
        adjustSeriesInputWidth();
        validateForm();
    });
    temporadaInput.addEventListener('input', validateForm);

    // Bloquea / desbloquea el formulario mientras se sube
    function setFormLocked(locked) {
        categoriaSelect.disabled = locked;
        subcategoriaSelect.disabled = locked;
        if (subcategoriaSearch) subcategoriaSearch.disabled = locked;
        if (btnToggleSubcategoriaDropdown) btnToggleSubcategoriaDropdown.disabled = locked;
        if (btnClearSubcategoriaSearch) btnClearSubcategoriaSearch.disabled = locked;
        if (locked) closeSubcategoriaDropdown();
        nombreSerieInput.disabled = locked;
        temporadaInput.disabled = locked;
        const grupo = telegramData.find(g => g.id === categoriaSelect.value);
        serieNuevaCheck.disabled = locked || !(grupo && grupo.tieneTemas);
    }

    function validateForm() {
        let isFormValid = true;
        let canCreateTopic = false;
        const selectedId = categoriaSelect.value;
        const grupo = telegramData.find(g => g.id === selectedId);

        if (!selectedId) {
            isFormValid = false;
        } else if (grupo && grupo.tieneTemas) {
            if (serieNuevaCheck.checked) {
                isFormValid = false;
                if (nombreSerieInput.value.trim() !== '' && temporadaInput.value.trim() !== '') {
                    canCreateTopic = true;
                }
            } else {
                if (!subcategoriaSelect.value) {
                    isFormValid = false;
                }
            }
        }

        const selectionEnabled = isFormValid && !uploading;
        btnSeleccionar.disabled = !selectionEnabled;
        btnCrearTema.disabled = !canCreateTopic || uploading;
        if (helpText) helpText.style.display = selectionEnabled ? 'none' : '';

        if (isDownloading) {
            const lockedMsg = getDownloadLockedMsg();
            btnSeleccionar.disabled = true;
            btnSeleccionar.title = lockedMsg;
            btnSubir.disabled = true;
            btnSubir.title = lockedMsg;
            btnReintentar.disabled = true;
            btnReintentar.title = lockedMsg;
            btnCrearTema.disabled = !canCreateTopic;
            btnCrearTema.title = canCreateTopic ? (window.TeleVaultI18n ? window.TeleVaultI18n.t('uploads.create_topic_title', 'Crear nuevo tema en el canal') : 'Crear nuevo tema en el canal') : '';
            if (btnClearCompletedUploads) {
                btnClearCompletedUploads.disabled = true;
                btnClearCompletedUploads.title = lockedMsg;
            }
            if (btnClearAllUploads) {
                btnClearAllUploads.disabled = true;
                btnClearAllUploads.title = lockedMsg;
            }
            return;
        }

        checkUploadButtonState();
    }

    btnCrearTema.addEventListener('click', async () => {
        const categoryId = categoriaSelect.value;
        const nombreSerie = nombreSerieInput.value.trim();
        const temporada = temporadaInput.value.trim();
        const topicName = `${nombreSerie} - Temporada ${temporada}`;

        btnCrearTema.disabled = true;

        try {
            const result = await window.TelegramAPI.createTopic(categoryId, topicName);

            if (result.success) {
                addLog(`Tema creado correctamente: ${topicName}`, "success");
                const grupoNuevo = telegramData.find(g => g.id === categoryId);
                if (grupoNuevo && !grupoNuevo.temas.some(t => t.id === result.topic.id)) {
                    grupoNuevo.temas.push({ id: result.topic.id, nombre: result.topic.nombre, videos: [] });
                    if (grupoNuevo.sort_dir === 'desc') {
                        grupoNuevo.temas.sort((a, b) => naturalCompare(b.nombre || '', a.nombre || ''));
                    } else {
                        grupoNuevo.temas.sort((a, b) => naturalCompare(a.nombre || '', b.nombre || ''));
                    }
                }
                expandedChannels.add(categoryId);
                renderSidebar();

                serieNuevaCheck.checked = false;
                subcategoriaContainer.classList.remove('hidden');
                nuevaSerieContainer.classList.add('hidden');
                nombreSerieInput.value = '';
                temporadaInput.value = '';

                populateSubcategorias(telegramData.find(g => g.id === categoryId));
                subcategoriaSelect.value = result.topic.id;
                syncSubcategoriaCombobox();
                validateForm();
                updatePendingTransformedNames();
            } else if (result.reason === "duplicate") {
                addLog("No se ha creado el tema. Ya existe un tema con el mismo nombre previamente", "warning");
                validateForm();
            } else {
                addLog(`No se pudo crear el tema: ${result.reason || 'motivo desconocido'}`, "error");
                validateForm();
            }
        } catch (error) {
            addLog(`Error al crear el tema: ${error.message || 'Error desconocido'}`, "error");
            validateForm();
        }
    });

    function checkUploadButtonState() {
        const hasCompleted = filesToUpload.some(f => f.status === 'Subido OK');
        const hasAnyFiles = filesToUpload.length > 0;
        const lockedMsg = getDownloadLockedMsg();

        if (btnClearCompletedUploads) {
            btnClearCompletedUploads.disabled = uploading || isDownloading || !hasCompleted;
            btnClearCompletedUploads.title = isDownloading
                ? lockedMsg
                : (hasCompleted
                    ? (window.TeleVaultI18n ? window.TeleVaultI18n.t('uploads.clear_completed_title', 'Limpiar de la tabla los archivos finalizados correctamente') : 'Limpiar de la tabla los archivos finalizados correctamente')
                    : (window.TeleVaultI18n ? window.TeleVaultI18n.t('uploads.no_completed_title', 'No hay archivos subidos correctamente para limpiar') : 'No hay archivos subidos correctamente para limpiar'));
        }

        if (btnClearAllUploads) {
            btnClearAllUploads.disabled = uploading || isDownloading || !hasAnyFiles;
            btnClearAllUploads.title = isDownloading
                ? lockedMsg
                : (hasAnyFiles
                    ? (window.TeleVaultI18n ? window.TeleVaultI18n.t('uploads.clear_all_title', 'Vaciar todos los archivos de la tabla') : 'Vaciar todos los archivos de la tabla')
                    : (window.TeleVaultI18n ? window.TeleVaultI18n.t('uploads.empty_table_title', 'La tabla está vacía') : 'La tabla está vacía'));
        }

        if (isDownloading) {
            btnSubir.disabled = true;
            btnSubir.title = lockedMsg;
            btnReintentar.disabled = true;
            btnReintentar.title = lockedMsg;
            return;
        }
        const hasFilesToUpload = filesToUpload.some(f => UPLOADABLE.includes(f.status));
        btnSubir.disabled = !hasFilesToUpload || uploading;
        btnSubir.title = '';
        // "Reintentar" solo tiene sentido si hay archivos con error (y no se está subiendo)
        btnReintentar.disabled = uploading || !filesToUpload.some(f => f.status === 'Error en subida');
        btnReintentar.title = '';
        checkDownloadButtonState();
    }

    // ------------------------------------------------- Bloqueo y Control de Descargas
    function setDownloadLock(locked) {
        isDownloading = locked;

        if (btnCancelarDescarga) {
            const cancelText = window.TeleVaultI18n ? window.TeleVaultI18n.t('downloads.cancel_download', 'Cancelar descarga') : 'Cancelar descarga';
            btnCancelarDescarga.innerHTML = `<span class="btn-icon">${SVG.square}</span><span class="btn-text">${cancelText}</span>`;
        }

        checkDownloadButtonState();
        checkUploadButtonState();

        const lockedMsg = getDownloadLockedMsg();
        const dlAllTitle = window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.download_all_topic', 'Descargar todos los archivos') : 'Descargar todos los archivos';
        const dlVideoTitle = window.TeleVaultI18n ? window.TeleVaultI18n.t('sidebar.download_video', 'Descargar video') : 'Descargar video';

        document.querySelectorAll('.btn-download-topic, .btn-download-video').forEach(btn => {
            btn.disabled = locked;
            if (locked) {
                btn.setAttribute('title', lockedMsg);
            } else {
                btn.setAttribute('title', btn.classList.contains('btn-download-topic') ? dlAllTitle : dlVideoTitle);
            }
        });

        if (!locked) {
            validateForm();
            renderTable();
        }
        renderSidebar();
        renderDownloadsTable();
        updateBadges();
    }

    // ------------------------------------------------- Pestañas y Tabla de Descargas
    function switchTab(tab) {
        currentTab = tab;
        if (tab === 'uploads') {
            if (tabUploads) tabUploads.classList.add('active');
            if (tabDownloads) tabDownloads.classList.remove('active');
            if (uploadsWrapper) uploadsWrapper.classList.remove('hidden');
            if (downloadsWrapper) downloadsWrapper.classList.add('hidden');
            validateForm();
            checkUploadButtonState();
        } else {
            if (tabDownloads) tabDownloads.classList.add('active');
            if (tabUploads) tabUploads.classList.remove('active');
            if (downloadsWrapper) downloadsWrapper.classList.remove('hidden');
            if (uploadsWrapper) uploadsWrapper.classList.add('hidden');
            checkDownloadButtonState();
        }
    }

    if (tabUploads) tabUploads.addEventListener('click', () => switchTab('uploads'));
    if (tabDownloads) tabDownloads.addEventListener('click', () => switchTab('downloads'));

    function updateBadges() {
        if (badgeUploads) badgeUploads.textContent = filesToUpload.length;
        if (badgeDownloads) {
            badgeDownloads.textContent = downloadsList.length;
            if (isDownloading) {
                badgeDownloads.classList.add('badge-active-pulse');
            } else {
                badgeDownloads.classList.remove('badge-active-pulse');
            }
        }
    }

    function syncHeaderCheckbox() {
        if (!checkAllDownloads) return;
        if (downloadsList.length === 0) {
            checkAllDownloads.checked = false;
            checkAllDownloads.indeterminate = false;
            return;
        }
        const allChecked = downloadsList.every(i => i.checked);
        const noneChecked = downloadsList.every(i => !i.checked);
        checkAllDownloads.checked = allChecked;
        checkAllDownloads.indeterminate = !allChecked && !noneChecked;
    }

    if (checkAllDownloads) {
        checkAllDownloads.addEventListener('change', () => {
            if (isDownloading) return;
            const checked = checkAllDownloads.checked;
            downloadsList.forEach(i => { i.checked = checked; });
            renderDownloadsTable();
            checkDownloadButtonState();
        });
    }

    function checkDownloadButtonState() {
        if (!btnDescargarContenido || !btnCancelarDescarga || !btnReintentarDescarga) return;

        const lockedMsg = getDownloadLockedMsg();

        if (isDownloading) {
            btnCancelarDescarga.disabled = false;
            btnCancelarDescarga.title = window.TeleVaultI18n ? window.TeleVaultI18n.t('downloads.cancel_active_title', 'Cancelar descarga en curso') : 'Cancelar descarga en curso';

            btnReintentarDescarga.disabled = true;
            btnReintentarDescarga.title = lockedMsg;

            btnDescargarContenido.disabled = true;
            btnDescargarContenido.title = lockedMsg;
        } else {
            btnCancelarDescarga.disabled = true;
            btnCancelarDescarga.title = window.TeleVaultI18n ? window.TeleVaultI18n.t('downloads.no_active_title', 'No hay ninguna descarga en curso') : 'No hay ninguna descarga en curso';

            // Reintentar: solo si al finalizar alguna descarga tuvo error
            const hasError = downloadsList.some(it => it.status === 'Error');
            btnReintentarDescarga.disabled = !hasError;
            btnReintentarDescarga.title = hasError
                ? (window.TeleVaultI18n ? window.TeleVaultI18n.t('downloads.retry_failed_title', 'Reintentar descargas fallidas') : 'Reintentar descargas fallidas')
                : '';

            // Descargar contenido: habilitado si hay al menos un elemento marcado
            const hasChecked = downloadsList.some(it => it.checked);
            btnDescargarContenido.disabled = !hasChecked;
            btnDescargarContenido.title = hasChecked
                ? ''
                : (window.TeleVaultI18n ? window.TeleVaultI18n.t('downloads.select_at_least_one', 'Selecciona al menos un vídeo de la tabla para descargar') : 'Selecciona al menos un vídeo de la tabla para descargar');
        }

        const hasCompleted = downloadsList.some(it => it.status === 'Finalizado OK' || it.status === 'Completado');
        const hasAnyItems = downloadsList.length > 0;

        if (btnClearCompletedDownloads) {
            btnClearCompletedDownloads.disabled = isDownloading || uploading || !hasCompleted;
            btnClearCompletedDownloads.title = isDownloading
                ? lockedMsg
                : (hasCompleted
                    ? (window.TeleVaultI18n ? window.TeleVaultI18n.t('downloads.clear_completed_title', 'Limpiar de la tabla los archivos descargados correctamente') : 'Limpiar de la tabla los archivos descargados correctamente')
                    : '');
        }

        if (btnClearAllDownloads) {
            btnClearAllDownloads.disabled = isDownloading || uploading || !hasAnyItems;
            btnClearAllDownloads.title = isDownloading
                ? lockedMsg
                : (hasAnyItems
                    ? (window.TeleVaultI18n ? window.TeleVaultI18n.t('downloads.clear_all_title', 'Vaciar todos los archivos de la tabla de descargas') : 'Vaciar todos los archivos de la tabla de descargas')
                    : '');
        }
    }

    function getCleanVideoBaseName(filename) {
        if (!filename) return '';
        return filename.replace(/\.\d{3,4}$/, '');
    }

    async function promptAndAddVideoToDownloadList(chatId, topicId, videoName, switchTabToDownloads = true) {
        if (!videoName || isDownloading) return;
        const baseName = getCleanVideoBaseName(videoName);

        addLog(`Selecciona la carpeta donde guardar '${baseName}'...`, 'info');
        let folder;
        try {
            folder = await window.TelegramAPI.selectFolder();
        } catch (err) {
            addLog(`Error al abrir selector de carpetas: ${err.message}`, 'error');
            return;
        }

        if (!folder) {
            addLog('Operación cancelada: no se seleccionó ninguna carpeta.', 'warning');
            return;
        }

        // Contar partes binarias y calcular tamaño en bytes
        const grupo = telegramData.find(g => String(g.id) === String(chatId));
        let partsCount = 1;
        let totalBytes = 0;
        if (grupo) {
            let vList = [];
            let vSizes = {};
            if (topicId) {
                const tema = (grupo.temas || []).find(t => String(t.id) === String(topicId));
                if (tema) {
                    vList = tema.videos || [];
                    vSizes = tema.video_sizes || {};
                }
            } else {
                vList = grupo.videos || [];
                vSizes = grupo.video_sizes || {};
            }
            const matching = vList.filter(vn => getCleanVideoBaseName(vn).toLowerCase() === baseName.toLowerCase());
            if (matching.length > 1) {
                partsCount = matching.length;
            }
            matching.forEach(vn => {
                if (vSizes && vSizes[vn]) {
                    totalBytes += Number(vSizes[vn]) || 0;
                }
            });
        }

        const existing = downloadsList.find(it => String(it.chatId) === String(chatId) && it.name.toLowerCase() === baseName.toLowerCase());
        if (existing) {
            existing.dest = folder;
            existing.checked = true;
            if (!existing.size && totalBytes > 0) existing.size = totalBytes;
            addLog(`Actualizada ubicación de '${baseName}' a '${folder}'.`, 'info');
            if ((!existing.size || existing.size === 0) && window.TelegramAPI && window.TelegramAPI.resolveVideoSize) {
                window.TelegramAPI.resolveVideoSize(chatId, baseName, topicId).then(res => {
                    if (res && res.size > 0) {
                        existing.size = res.size;
                        if (res.parts && res.parts > (existing.parts || 1)) existing.parts = res.parts;
                        renderDownloadsTable();
                    }
                }).catch(() => {});
            }
        } else {
            const newItem = {
                id: 'dl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                chatId: chatId,
                topicId: topicId,
                name: baseName,
                parts: partsCount,
                size: totalBytes,
                checked: true,
                status: 'Pendiente',
                percent: 0,
                speed: null,
                eta: null,
                dest: folder,
                error: null
            };
            downloadsList.push(newItem);
            const partInfo = partsCount > 1 ? ` (${partsCount} partes binarias)` : '';
            addLog(`Añadido a la lista de descargas: '${baseName}'${partInfo} -> '${folder}'`, 'info');
            if (totalBytes === 0 && window.TelegramAPI && window.TelegramAPI.resolveVideoSize) {
                window.TelegramAPI.resolveVideoSize(chatId, baseName, topicId).then(res => {
                    if (res && res.size > 0) {
                        newItem.size = res.size;
                        if (res.parts && res.parts > (newItem.parts || 1)) newItem.parts = res.parts;
                        renderDownloadsTable();
                    }
                }).catch(() => {});
            }
        }

        if (switchTabToDownloads) {
            switchTab('downloads');
        }
        renderDownloadsTable();
        updateBadges();
        syncHeaderCheckbox();
        checkDownloadButtonState();
    }

    async function promptAndAddTopicVideosToDownloadList(chatId, topicId, topicName) {
        if (isDownloading) return;
        const grupo = telegramData.find(g => String(g.id) === String(chatId));
        if (!grupo) return;
        const tema = (grupo.temas || []).find(t => String(t.id) === String(topicId));
        if (!tema || !tema.videos || tema.videos.length === 0) {
            addLog(`El tema '${topicName}' no contiene vídeos para descargar.`, 'warning');
            return;
        }

        addLog(`Selecciona la carpeta donde guardar los vídeos del tema '${topicName}'...`, 'info');
        let folder;
        try {
            folder = await window.TelegramAPI.selectFolder();
        } catch (err) {
            addLog(`Error al abrir selector de carpetas: ${err.message}`, 'error');
            return;
        }

        if (!folder) {
            addLog('Operación cancelada: no se seleccionó ninguna carpeta.', 'warning');
            return;
        }

        const uniqueBases = new Set();
        tema.videos.forEach(v => uniqueBases.add(getCleanVideoBaseName(v)));
        const vSizes = tema.video_sizes || {};

        let count = 0;
        uniqueBases.forEach(baseName => {
            const matching = (tema.videos || []).filter(vn => getCleanVideoBaseName(vn).toLowerCase() === baseName.toLowerCase());
            const partsCount = matching.length > 1 ? matching.length : 1;
            let totalBytes = 0;
            matching.forEach(vn => {
                if (vSizes && vSizes[vn]) {
                    totalBytes += Number(vSizes[vn]) || 0;
                }
            });

            const existing = downloadsList.find(it => String(it.chatId) === String(chatId) && it.name.toLowerCase() === baseName.toLowerCase());
            if (existing) {
                existing.dest = folder;
                existing.checked = true;
                if (!existing.size && totalBytes > 0) existing.size = totalBytes;
                if ((!existing.size || existing.size === 0) && window.TelegramAPI && window.TelegramAPI.resolveVideoSize) {
                    window.TelegramAPI.resolveVideoSize(chatId, baseName, topicId).then(res => {
                        if (res && res.size > 0) {
                            existing.size = res.size;
                            if (res.parts && res.parts > (existing.parts || 1)) existing.parts = res.parts;
                            renderDownloadsTable();
                        }
                    }).catch(() => {});
                }
            } else {
                const newItem = {
                    id: 'dl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                    chatId: chatId,
                    topicId: topicId,
                    name: baseName,
                    parts: partsCount,
                    size: totalBytes,
                    checked: true,
                    status: 'Pendiente',
                    percent: 0,
                    speed: null,
                    eta: null,
                    dest: folder,
                    error: null
                };
                downloadsList.push(newItem);
                if (totalBytes === 0 && window.TelegramAPI && window.TelegramAPI.resolveVideoSize) {
                    window.TelegramAPI.resolveVideoSize(chatId, baseName, topicId).then(res => {
                        if (res && res.size > 0) {
                            newItem.size = res.size;
                            if (res.parts && res.parts > (newItem.parts || 1)) newItem.parts = res.parts;
                            renderDownloadsTable();
                        }
                    }).catch(() => {});
                }
            }
            count++;
        });

        addLog(`Añadidos ${count} vídeos del tema '${topicName}' a la lista de descargas -> '${folder}'.`, 'success');
        switchTab('downloads');
        renderDownloadsTable();
        updateBadges();
        syncHeaderCheckbox();
        checkDownloadButtonState();
    }

    function renderDownloadsTable(prog = null) {
        if (!downloadsTableBody) return;

        if (!downloadsList || downloadsList.length === 0) {
            const emptyTitle = (window.TeleVaultI18n && window.TeleVaultI18n.t('downloads.empty_title')) || 'No hay descargas en la lista';
            const emptyDesc = (window.TeleVaultI18n && window.TeleVaultI18n.t('downloads.empty_desc')) || 'Haz clic en el icono de descarga junto a cualquier tema o vídeo en el panel lateral para añadirlo a esta lista.';
            downloadsTableBody.innerHTML = `
                <tr class="empty-downloads-row">
                    <td colspan="6" class="empty-table-cell">
                        <div class="empty-state-box">
                            <svg class="icon-svg empty-state-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                            <div class="empty-state-text">${emptyTitle}</div>
                            <div class="empty-state-subtext">${emptyDesc}</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        downloadsTableBody.innerHTML = '';

        downloadsList.forEach((item, index) => {
            const tr = document.createElement('tr');

            // 0. Columna Checkbox
            const tdCheck = document.createElement('td');
            tdCheck.className = 'download-check-cell';
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.className = 'download-item-check';
            chk.dataset.id = item.id;
            chk.checked = Boolean(item.checked);
            chk.disabled = isDownloading;
            chk.title = chk.checked
                ? (window.TeleVaultI18n ? window.TeleVaultI18n.t('downloads.uncheck_video', 'Desmarcar este vídeo') : 'Desmarcar este vídeo')
                : (window.TeleVaultI18n ? window.TeleVaultI18n.t('downloads.check_video', 'Marcar este vídeo para descargar') : 'Marcar este vídeo para descargar');
            chk.addEventListener('change', (e) => {
                e.stopPropagation();
                item.checked = chk.checked;
                syncHeaderCheckbox();
                checkDownloadButtonState();
            });
            tdCheck.appendChild(chk);

            // 1. Vídeo / Archivo
            const tdName = document.createElement('td');
            tdName.className = 'download-cell-name';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'download-file-text';
            nameSpan.textContent = item.name;
            nameSpan.title = item.name;
            tdName.appendChild(nameSpan);

            if (item.parts > 1) {
                const partBadge = document.createElement('span');
                partBadge.className = 'download-part-badge';
                partBadge.textContent = window.TeleVaultI18n
                    ? window.TeleVaultI18n.t('downloads.parts_count', `${item.parts} partes`, { count: item.parts })
                    : `${item.parts} partes`;
                partBadge.title = window.TeleVaultI18n
                    ? window.TeleVaultI18n.t('downloads.parts_tooltip', `Archivo fraccionado en ${item.parts} partes binarias en Telegram`, { count: item.parts })
                    : `Archivo fraccionado en ${item.parts} partes binarias en Telegram`;
                tdName.appendChild(partBadge);
            }

            // 2. Carpeta Destino
            const tdDest = document.createElement('td');
            const destSpan = document.createElement('span');
            destSpan.className = 'download-dest-text';
            destSpan.textContent = item.dest || '-';
            destSpan.title = item.dest || (window.TeleVaultI18n ? window.TeleVaultI18n.t('downloads.dest_unassigned', 'Se asignará al descargar') : 'Se asignará al descargar');
            tdDest.appendChild(destSpan);

            // 3. Tamaño
            const tdSize = document.createElement('td');
            tdSize.className = 'download-cell-size';
            const sizeVal = Number(item.size) || 0;
            if (sizeVal > 0) {
                tdSize.textContent = window.TelegramAPI.formatBytes(sizeVal);
                tdSize.title = `${sizeVal.toLocaleString()} bytes`;
            } else {
                tdSize.textContent = item._fetchingSize ? '…' : '-';
                tdSize.title = '';
                if (!item._fetchingSize && window.TelegramAPI && window.TelegramAPI.resolveVideoSize && item.chatId && item.name) {
                    item._fetchingSize = true;
                    window.TelegramAPI.resolveVideoSize(item.chatId, item.name, item.topicId).then(res => {
                        item._fetchingSize = false;
                        if (res && res.size > 0) {
                            item.size = res.size;
                            if (res.parts && res.parts > (item.parts || 1)) {
                                item.parts = res.parts;
                            }
                            renderDownloadsTable();
                        }
                    }).catch(() => {
                        item._fetchingSize = false;
                    });
                }
            }

            // 4. Estado / Progreso
            const tdProgress = document.createElement('td');
            const status = item.status || 'Pendiente';

            if (status.startsWith('Descargando')) {
                const container = document.createElement('div');
                container.className = 'download-progress-cell';

                const meta = document.createElement('div');
                meta.className = 'download-progress-meta';

                const statusText = document.createElement('span');
                statusText.className = 'download-progress-status-text status-curso';
                statusText.textContent = status;

                const speedText = document.createElement('span');
                speedText.className = 'download-progress-speed-text';
                const speedFormatted = item.speed ? window.TelegramAPI.formatSpeed(item.speed) : '';
                const etaFormatted = (item.eta !== null && item.eta !== undefined) ? `ETA: ${window.TelegramAPI.formatDuration(item.eta)}` : '';
                const stats = [speedFormatted, etaFormatted].filter(Boolean).join(' · ');
                speedText.textContent = stats;

                meta.appendChild(statusText);
                meta.appendChild(speedText);

                const track = document.createElement('div');
                track.className = 'download-bar-track';
                const fill = document.createElement('div');
                fill.className = 'download-bar-fill';
                fill.style.width = `${item.percent || 0}%`;
                track.appendChild(fill);

                container.appendChild(meta);
                container.appendChild(track);
                tdProgress.appendChild(container);

            } else if (status.startsWith('Uniendo')) {
                const container = document.createElement('div');
                container.className = 'download-progress-cell';

                const meta = document.createElement('div');
                meta.className = 'download-progress-meta';

                const statusText = document.createElement('span');
                statusText.className = 'download-progress-status-text status-curso';
                const mergingText = window.TeleVaultI18n ? window.TeleVaultI18n.t('status.merging', 'Uniendo partes binarias...') : status;
                statusText.textContent = mergingText;

                meta.appendChild(statusText);

                const track = document.createElement('div');
                track.className = 'download-bar-track';
                const fill = document.createElement('div');
                fill.className = 'download-bar-fill status-merging';
                track.appendChild(fill);

                container.appendChild(meta);
                container.appendChild(track);
                tdProgress.appendChild(container);

            } else if (status === 'Completado' || status === 'Finalizado OK') {
                const text = window.TeleVaultI18n ? window.TeleVaultI18n.t('status.finished_ok', 'Finalizado OK') : 'Finalizado OK';
                tdProgress.innerHTML = `<span class="status-ok">${text}</span>`;
            } else if (status === 'Pendiente') {
                const text = window.TeleVaultI18n ? window.TeleVaultI18n.t('status.pending', 'Pendiente') : 'Pendiente';
                tdProgress.innerHTML = `<span class="status-pendiente">${text}</span>`;
            } else if (status === 'En cola ⏳' || status === 'En cola') {
                const text = window.TeleVaultI18n ? window.TeleVaultI18n.t('status.queued', 'En cola') : 'En cola';
                tdProgress.innerHTML = `<span class="status-pendiente">${text}</span>`;
            } else if (status === 'Cancelado') {
                const text = window.TeleVaultI18n ? window.TeleVaultI18n.t('status.cancelled', 'Cancelado') : 'Cancelado';
                tdProgress.innerHTML = `<span class="status-cancelado">${text}</span>`;
            } else if (status === 'Error') {
                const text = window.TeleVaultI18n ? window.TeleVaultI18n.t('status.error', 'Error') : 'Error';
                tdProgress.innerHTML = `<span class="status-error" title="${item.error || 'Error'}">${text}</span>`;
            } else {
                tdProgress.innerHTML = `<span>${status}</span>`;
            }

            // 5. Eliminar (Acción)
            const tdAction = document.createElement('td');
            tdAction.className = 'td-delete';
            const isItemActive = status.startsWith('Descargando') || status.startsWith('Uniendo');

            if (!isItemActive) {
                const btnDel = document.createElement('button');
                btnDel.type = 'button';
                btnDel.className = 'btn-delete-row-icon';
                btnDel.innerHTML = SVG.trash;
                btnDel.title = isDownloading ? getDownloadLockedMsg() : (window.TeleVaultI18n ? window.TeleVaultI18n.t('downloads.delete_row_tooltip', 'Eliminar archivo de la lista') : 'Eliminar archivo de la lista');
                btnDel.disabled = isDownloading;
                btnDel.addEventListener('click', () => {
                    if (isDownloading) return;
                    downloadToDeleteId = item.id;
                    if (deleteDownloadModal) {
                        deleteDownloadModal.classList.remove('hidden');
                    }
                });
                tdAction.appendChild(btnDel);
            }

            tr.append(tdCheck, tdName, tdDest, tdSize, tdProgress, tdAction);
            downloadsTableBody.appendChild(tr);
        });
    }

    async function executeDownloadProcess() {
        const checkedItems = downloadsList.filter(it => it.checked);
        if (checkedItems.length === 0) return;

        // Si algún elemento seleccionado no tiene carpeta de destino asignada (ej. restaurado sin dest), pedirla
        const missingDest = checkedItems.filter(it => !it.dest);
        if (missingDest.length > 0) {
            addLog(`Falta indicar ubicación en ${missingDest.length} vídeo(s). Selecciona la carpeta donde guardarlos...`, 'info');
            let folder;
            try {
                folder = await window.TelegramAPI.selectFolder();
            } catch (err) {
                addLog(`Error al abrir selector de carpetas: ${err.message}`, 'error');
                return;
            }

            if (!folder) {
                addLog('Descarga cancelada: no se seleccionó ninguna carpeta.', 'warning');
                return;
            }

            missingDest.forEach(it => {
                it.dest = folder;
            });
        }

        checkedItems.forEach(it => {
            it.status = 'En cola ⏳';
            it.percent = 0;
            it.speed = null;
            it.eta = null;
            it.error = null;
        });

        setDownloadLock(true);
        renderDownloadsTable();

        const itemsPayload = checkedItems.map(it => {
            if (!it.id) {
                it.id = 'dl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            }
            return {
                id: it.id,
                chatId: it.chatId,
                topicId: it.topicId,
                videoName: it.name,
                dest: it.dest
            };
        });

        addLog(`Iniciando descarga de ${checkedItems.length} vídeo(s) hacia sus destinos asignados...`, 'info');

        try {
            await window.TelegramAPI.startDownload({
                destFolder: checkedItems[0].dest || '',
                itemsJson: JSON.stringify(itemsPayload)
            });
            startDownloadPolling();
        } catch (err) {
            setDownloadLock(false);
            checkedItems.forEach(it => {
                it.status = 'Error';
                it.error = err.message;
            });
            renderDownloadsTable();
            checkDownloadButtonState();
            addLog(`Error al iniciar descarga: ${err.message}`, 'error');
        }
    }

    if (btnDescargarContenido) {
        btnDescargarContenido.addEventListener('click', () => {
            if (isDownloading) return;
            executeDownloadProcess();
        });
    }

    if (btnReintentarDescarga) {
        btnReintentarDescarga.addEventListener('click', () => {
            if (isDownloading) return;
            downloadsList.forEach(it => {
                if (it.status === 'Error') {
                    it.checked = true;
                    it.status = 'Pendiente';
                    it.error = null;
                } else {
                    it.checked = false;
                }
            });
            syncHeaderCheckbox();
            renderDownloadsTable();
            checkDownloadButtonState();
            executeDownloadProcess();
        });
    }

    if (btnCancelarDescarga) {
        btnCancelarDescarga.addEventListener('click', async () => {
            if (!isDownloading) return;
            btnCancelarDescarga.disabled = true;
            const cancellingText = window.TeleVaultI18n ? window.TeleVaultI18n.t('downloads.cancelling_download', 'Cancelando descarga...') : 'Cancelando descarga...';
            btnCancelarDescarga.innerHTML = `<span class="btn-icon">${SVG.spinner}</span><span class="btn-text">${cancellingText}</span>`;
            addLog('Cancelando descarga en curso...', 'warning');
            try {
                await window.TelegramAPI.cancelDownload();
            } catch (e) {
                addLog(`Error al cancelar descarga: ${e.message}`, 'error');
            }
        });
    }

    function stopDownloadTracking() {
        if (downloadEventSource) {
            try { downloadEventSource.close(); } catch (e) {}
            downloadEventSource = null;
        }
        if (downloadPollInterval) {
            clearInterval(downloadPollInterval);
            downloadPollInterval = null;
        }
    }

    function applyDownloadProgressData(prog) {
        if (!prog) return;

        if (prog.queue && Array.isArray(prog.queue)) {
            prog.queue.forEach(qItem => {
                const localItem = downloadsList.find(it => 
                    (qItem.id && it.id === qItem.id) ||
                    (qItem.original_name && it.name && it.name.toLowerCase() === qItem.original_name.toLowerCase()) ||
                    (it.name && qItem.name && it.name.toLowerCase() === qItem.name.toLowerCase())
                );
                if (localItem) {
                    if (qItem.name && localItem.name !== qItem.name) {
                        localItem.name = qItem.name;
                    }
                    if (qItem.size && (!localItem.size || localItem.size === 0)) {
                        localItem.size = qItem.size;
                    }
                    localItem.status = qItem.status;
                    localItem.percent = qItem.percent;
                    localItem.speed = qItem.speed;
                    localItem.eta = qItem.eta;
                    localItem.dest = qItem.dest || localItem.dest;
                    localItem.error = qItem.error;
                    if (qItem.status === 'Completado' || qItem.status === 'Finalizado OK') {
                        localItem.checked = false;
                    }
                }
            });
            renderDownloadsTable(prog);
            updateBadges();
            checkDownloadButtonState();
        }

        if (prog.logs && Array.isArray(prog.logs)) {
            prog.logs.forEach(l => {
                const logKey = `${l.ts}_${l.msg}`;
                if (!seenDownloadLogs.has(logKey)) {
                    seenDownloadLogs.add(logKey);
                    addLog(l.msg, l.type || 'info');
                }
            });
        }

        if (!prog.active) {
            stopDownloadTracking();
            if (prog.queue && Array.isArray(prog.queue)) {
                prog.queue.forEach(qItem => {
                    const localItem = downloadsList.find(it => 
                        (qItem.id && it.id === qItem.id) ||
                        (qItem.original_name && it.name && it.name.toLowerCase() === qItem.original_name.toLowerCase()) ||
                        (it.name && qItem.name && it.name.toLowerCase() === qItem.name.toLowerCase())
                    );
                    if (localItem) {
                        if (qItem.name && localItem.name !== qItem.name) {
                            localItem.name = qItem.name;
                        }
                        if (qItem.size && (!localItem.size || localItem.size === 0)) {
                            localItem.size = qItem.size;
                        }
                        localItem.status = qItem.status;
                        localItem.percent = qItem.percent;
                        localItem.speed = qItem.speed;
                        localItem.eta = qItem.eta;
                        localItem.dest = qItem.dest || localItem.dest;
                        localItem.error = qItem.error;
                        if (qItem.status === 'Completado' || qItem.status === 'Finalizado OK') {
                            localItem.checked = false;
                        }
                    }
                });
            }
            setDownloadLock(false);
            renderDownloadsTable(prog);
            updateBadges();
            syncHeaderCheckbox();
            checkDownloadButtonState();
            if (prog.error) {
                addLog(`Descarga finalizada con error: ${prog.error}`, 'error');
            }
        }
    }

    function startDownloadPolling() {
        stopDownloadTracking();
        seenDownloadLogs.clear();

        const startFallback = () => {
            if (downloadPollInterval) return;
            downloadPollInterval = setInterval(async () => {
                try {
                    const prog = await window.TelegramAPI.getDownloadProgress();
                    applyDownloadProgressData(prog);
                } catch (e) {
                    // Errores temporales de red/sondeo
                }
            }, 750);
        };

        // Preferir streaming en tiempo real vía SSE
        if (window.TelegramAPI && typeof window.TelegramAPI.createDownloadProgressSource === 'function') {
            downloadEventSource = window.TelegramAPI.createDownloadProgressSource(
                (data) => {
                    applyDownloadProgressData(data);
                },
                () => {
                    // Si SSE experimenta error o desconexión, fallback fluido a sondeo HTTP
                    if (downloadEventSource) {
                        try { downloadEventSource.close(); } catch (e) {}
                        downloadEventSource = null;
                    }
                    startFallback();
                }
            );
            if (!downloadEventSource) {
                startFallback();
            }
        } else {
            startFallback();
        }
    }

    // ------------------------------------------------- Nombres de episodio/serie
    function parseEpisodeNumber(filename, seasonHint = null) {
        if (!filename) return 1;

        // 1. S01E04 o s1e4
        const regexSE = /(?:^|[^0-9a-z])s(\d{1,2})e(\d{1,3})(?:[^0-9a-z]|$)/i;
        const matchSE = filename.match(regexSE);
        if (matchSE) return parseInt(matchSE[2], 10);

        // 2. 1x01 o 2x20 o 4x04
        const regexX = /(?:^|[^0-9a-z])\d{1,2}x(\d{1,3})(?:[^0-9a-z]|$)/i;
        const matchX = filename.match(regexX);
        if (matchX) return parseInt(matchX[1], 10);

        // 3. Cap.104 o Cap.401 (concatenación temporada + 2 dígitos de capítulo con Cap/Ep)
        // Debe evaluarse ANTES de regexWord para no ser devorado por \d{1,3}
        const regexCapConcat = /(?:capitulo|episodio|cap|ep)\.?\s*(\d{1,2})(\d{2})(?:[^0-9a-z]|$)/i;
        const matchCapConcat = filename.match(regexCapConcat);
        if (matchCapConcat) {
            if (!seasonHint || parseInt(matchCapConcat[1], 10) === seasonHint) {
                return parseInt(matchCapConcat[2], 10);
            }
        }

        // 4. Episodio 20, Cap. 04, Ep 3 (1 a 3 dígitos tras palabra clave)
        const regexWord = /(?:capitulo|episodio|cap|ep)\.?\s*(\d{1,3})(?:[^0-9a-z]|$)/i;
        const matchWord = filename.match(regexWord);
        if (matchWord) {
            const num = parseInt(matchWord[1], 10);
            if (seasonHint && num >= 100 && num <= 9999) {
                const numStr = String(num);
                const seasonStr = String(seasonHint);
                if (numStr.startsWith(seasonStr) && numStr.length === seasonStr.length + 2) {
                    return parseInt(numStr.slice(seasonStr.length), 10);
                }
            }
            return num;
        }

        // 5. Número de 3 dígitos con prefijo de temporada conocido en guion, corchete o espacio
        // Ej: " - 401", "_401", "[401]", " 401 "
        if (seasonHint && seasonHint > 0) {
            const seasonStr = String(seasonHint);
            const regexSeasonConcat = new RegExp('(?:^|[^0-9a-z])' + seasonStr + '(\\d{2})(?:[^0-9a-z]|$)', 'i');
            const matchSeasonConcat = filename.match(regexSeasonConcat);
            if (matchSeasonConcat) {
                const candidate = parseInt(seasonStr + matchSeasonConcat[1], 10);
                const isResolution = (candidate === 720 || candidate === 1080 || candidate === 2160);
                if (!isResolution) {
                    return parseInt(matchSeasonConcat[1], 10);
                }
            }
        }

        // 6. Concatenación genérica de 3 dígitos si no hay seasonHint: e.g. Cap.104
        const regexGenericCapConcat = /[Cc]ap\.?\s*\d(\d{2})(?:[^0-9a-z]|$)/i;
        const matchGenericCap = filename.match(regexGenericCapConcat);
        if (matchGenericCap) return parseInt(matchGenericCap[1], 10);

        // 7. - 01 o _01 o [01] o - 101
        const regexGuion = /(?:-\s*|_\s*|\[\s*)(\d{1,3})(?:\s*-|\s*_|\s*\]|\.|\s*$)/i;
        const matchGuion = filename.match(regexGuion);
        if (matchGuion) {
            const num = parseInt(matchGuion[1], 10);
            if (seasonHint && num >= 100 && num <= 9999) {
                const numStr = String(num);
                const seasonStr = String(seasonHint);
                if (numStr.startsWith(seasonStr) && numStr.length === seasonStr.length + 2) {
                    return parseInt(numStr.slice(seasonStr.length), 10);
                }
            }
            return num;
        }

        // 8. Cualquier número suelto de 1 o 2 dígitos
        const regexAnyNum = /(?:^|[^0-9a-z])(\d{1,2})(?:[^0-9a-z]|$)/i;
        const matchAnyNum = filename.match(regexAnyNum);
        if (matchAnyNum) return parseInt(matchAnyNum[1], 10);

        return 1;
    }

    function getSeriesInfo(categoryId, topicId) {
        let seriesName = '';
        let season = 1;

        if (serieNuevaCheck && serieNuevaCheck.checked) {
            seriesName = nombreSerieInput.value.trim();
            season = parseInt(temporadaInput.value.trim(), 10) || 1;
            return { seriesName, season };
        }

        const grupo = telegramData.find(g => g.id === categoryId);
        let topicName = '';
        if (grupo && grupo.temas) {
            const tId = topicId || (subcategoriaSelect ? subcategoriaSelect.value : null);
            const tema = grupo.temas.find(t => String(t.id) === String(tId));
            if (tema) topicName = tema.nombre.trim();
        }
        if (!topicName && subcategoriaSelect && subcategoriaSelect.selectedIndex >= 0) {
            const opt = subcategoriaSelect.options[subcategoriaSelect.selectedIndex];
            if (opt && opt.value) topicName = opt.text.trim();
        }

        if (topicName) {
            // Ejemplo: "Agatha y Lola - Temporada 1" o "Agatha y Lola - Temporada 2"
            const match = topicName.match(/^(.*?)\s*-\s*(?:Temporada|Temp\.?|T)\s*(\d+)\s*$/i);
            if (match) {
                seriesName = match[1].trim();
                season = parseInt(match[2], 10) || 1;
            } else {
                const matchDashNum = topicName.match(/^(.*?)\s*-\s*(\d+)\s*$/);
                if (matchDashNum) {
                    seriesName = matchDashNum[1].trim();
                    season = parseInt(matchDashNum[2], 10) || 1;
                } else {
                    seriesName = topicName.trim();
                    season = 1;
                }
            }
        }
        return { seriesName, season };
    }

    function getSeriesBaseCode(filename, categoryId, topicId) {
        const { seriesName, season } = getSeriesInfo(categoryId, topicId);
        const episode = parseEpisodeNumber(filename, season);
        const episodeStr = episode.toString().padStart(2, '0');
        const epCode = `${season}x${episodeStr}`;
        return seriesName ? `${seriesName} ${epCode}` : epCode;
    }

    function getTransformedName(item, categoryId, topicId = null) {
        const grupo = telegramData.find(g => g.id === categoryId);
        const hasTopics = grupo && grupo.tieneTemas;
        const nameWithoutExt = item.originalBase || (item.name ? item.name.substring(0, item.name.lastIndexOf('.')) : '') || item.name || '';

        if (item.isPart) {
            const partStr = item.partIndex.toString().padStart(3, '0');
            if (hasTopics) {
                // Serie fraccionada (> 2000 MB): "Agatha y Lola 2x20.mp4.001"
                const baseCode = getSeriesBaseCode(item.name || nameWithoutExt, categoryId, topicId);
                return `${baseCode}.mp4.${partStr}`;
            } else {
                // Película fraccionada (> 2000 MB): "NombrePelicula.mp4.001"
                return `${nameWithoutExt}.mp4.${partStr}`;
            }
        } else {
            if (hasTopics) {
                // Serie normal: "Agatha y Lola 1x01.mp4"
                const baseCode = getSeriesBaseCode(nameWithoutExt, categoryId, topicId);
                return `${baseCode}.mp4`;
            } else {
                // Película normal: "NombrePelicula.mp4"
                return `${nameWithoutExt}.mp4`;
            }
        }
    }

    function updatePendingTransformedNames() {
        let changed = false;

        filesToUpload.forEach(fileObj => {
            if (!fileObj.isCustom && (fileObj.status === 'Pendiente Subir' || fileObj.status === 'Subido Previamente')) {
                const item = fileObj.rawItem || {
                    name: fileObj.originalName.replace(/\s*\(Parte\s+\d+\/\d+\)$/, ''),
                    isPart: fileObj.isPart,
                    partIndex: fileObj.partIndex,
                    totalParts: fileObj.totalParts
                };
                const catId = fileObj.categoryId || categoriaSelect.value;
                const topId = fileObj.topicId !== undefined ? fileObj.topicId : (subcategoriaSelect.value || null);
                const newName = getTransformedName(item, catId, topId);

                if (newName && newName !== fileObj.transformedName) {
                    fileObj.transformedName = newName;
                    changed = true;
                }
            }
        });

        if (changed) {
            renderTable();
        }
    }

    // ------------------------------------------------- Selección de archivos
    async function addFilesToQueue(items) {
        const categoryId = categoriaSelect.value;
        const topicId = subcategoriaSelect.value || null;
        const grupo = telegramData.find(g => g.id === categoryId);
        const tema = (grupo && grupo.temas) ? grupo.temas.find(t => String(t.id) === String(topicId)) : null;
        const categoryName = grupo ? (grupo.titulo || grupo.nombre || categoryId) : categoryId;
        const topicName = tema ? (tema.titulo || tema.nombre || (topicId ? `Tema ${topicId}` : null)) : null;
        const destinationLabel = topicName ? `${categoryName} › ${topicName}` : categoryName;

        btnSeleccionar.disabled = true;
        btnSubir.disabled = true;
        btnReintentar.disabled = true;

        for (const item of items) {
            const transformedName = getTransformedName(item, categoryId, topicId);
            const existe = await window.TelegramAPI.checkFileExists(transformedName, categoryId, topicId);
            const status = existe ? 'Subido Previamente' : 'Pendiente Subir';

            const displayName = item.isPart
                ? `${item.name} (Parte ${item.partIndex}/${item.totalParts})`
                : item.name;

            filesToUpload.push({
                id: item.id,
                size: item.size || 0,
                totalFileSize: item.totalFileSize || item.size || 0,
                originalName: displayName,
                transformedName: transformedName,
                categoryId: categoryId,
                categoryName: categoryName,
                topicId: topicId,
                topicName: topicName,
                destinationLabel: destinationLabel,
                status: status,
                isPart: item.isPart || false,
                partIndex: item.partIndex,
                totalParts: item.totalParts,
                rawItem: item,
                isCustom: false,
                percent: 0,
                eta: null,
                speed: null
            });

            if (item.isPart) {
                addLog(`Archivo grande dividido en cola [${destinationLabel}]: ${item.name} [Parte ${item.partIndex}/${item.totalParts}] -> ${transformedName} [${status}]`, "info");
            } else {
                addLog(`Archivo añadido a la cola [${destinationLabel}]: ${item.name} -> ${transformedName} [${status}]`, "info");
            }
        }

        validateForm();
        renderTable();
        checkUploadButtonState();
    }

    btnSeleccionar.addEventListener('click', async () => {
        btnSeleccionar.disabled = true;
        addLog("Abriendo el selector de archivos del equipo...", "info");
        try {
            const files = await window.TelegramAPI.selectFiles();
            if (files.length === 0) {
                addLog("No se ha seleccionado ningún archivo.", "info");
            } else {
                await addFilesToQueue(files);
            }
        } catch (error) {
            addLog(`Error al seleccionar archivos: ${error.message}`, "error");
        } finally {
            validateForm();
        }
    });

    // Evita que soltar un vídeo en la página haga que el navegador lo abra
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    // ------------------------------------------------------------------ Tabla
    function getStatusClass(status) {
        if (isWorkingStatus(status)) return 'status-curso';
        switch (status) {
            case 'Pendiente Subir': return 'status-pendiente';
            case 'Subido OK': return 'status-ok';
            case 'Error en subida': return 'status-error';
            case 'Subido Previamente': return 'status-previo';
            case 'Cancelado': return 'status-cancelado';
            default: return '';
        }
    }

    thOriginal.addEventListener('click', (e) => {
        if (e.target.closest('.resizer')) return;
        handleSort('originalName');
    });

    thTransformado.addEventListener('click', (e) => {
        if (e.target.closest('.resizer')) return;
        handleSort('transformedName');
    });

    if (thDestino) {
        thDestino.addEventListener('click', (e) => {
            if (e.target.closest('.resizer')) return;
            handleSort('destinationLabel');
        });
    }

    if (thSize) {
        thSize.addEventListener('click', (e) => {
            if (e.target.closest('.resizer')) return;
            handleSort('size');
        });
    }

    function handleSort(column) {
        if (currentSortColumn === column) {
            currentSortAsc = !currentSortAsc;
        } else {
            currentSortColumn = column;
            currentSortAsc = true;
        }
        renderTable();
    }

    function updateSortIcons() {
        if (thOriginal) thOriginal.querySelector('.sort-icon').textContent = '';
        if (thTransformado) thTransformado.querySelector('.sort-icon').textContent = '';
        if (thDestino) thDestino.querySelector('.sort-icon').textContent = '';
        if (thSize) thSize.querySelector('.sort-icon').textContent = '';
        if (currentSortColumn === 'originalName' && thOriginal) {
            thOriginal.querySelector('.sort-icon').textContent = currentSortAsc ? '▲' : '▼';
        } else if (currentSortColumn === 'transformedName' && thTransformado) {
            thTransformado.querySelector('.sort-icon').textContent = currentSortAsc ? '▲' : '▼';
        } else if (currentSortColumn === 'destinationLabel' && thDestino) {
            thDestino.querySelector('.sort-icon').textContent = currentSortAsc ? '▲' : '▼';
        } else if (currentSortColumn === 'size' && thSize) {
            thSize.querySelector('.sort-icon').textContent = currentSortAsc ? '▲' : '▼';
        }
    }

    function sortFiles() {
        if (currentSortColumn === 'size') {
            return [...filesToUpload].sort((a, b) => {
                const diff = (a.size || 0) - (b.size || 0);
                return currentSortAsc ? diff : -diff;
            });
        }
        if (currentSortColumn === 'destinationLabel') {
            return [...filesToUpload].sort((a, b) => {
                const cmp = naturalCompare(a.destinationLabel || '', b.destinationLabel || '');
                return currentSortAsc ? cmp : -cmp;
            });
        }
        if (!currentSortColumn || currentSortColumn === 'transformedName') {
            return [...filesToUpload].sort((a, b) => {
                const cmp = compareForUpload(a, b);
                return currentSortAsc ? cmp : -cmp;
            });
        }
        return [...filesToUpload].sort((a, b) => {
            if (currentSortColumn === 'originalName') {
                const cmp = naturalCompare(a.originalName, b.originalName);
                return currentSortAsc ? cmp : -cmp;
            }
            const valA = (a[currentSortColumn] || '').toLowerCase();
            const valB = (b[currentSortColumn] || '').toLowerCase();
            if (valA < valB) return currentSortAsc ? -1 : 1;
            if (valA > valB) return currentSortAsc ? 1 : -1;
            return 0;
        });
    }

    // Edición en línea del título transformado con el lápiz
    function startEditingTransformedName(fileObj, cellWrapper) {
        cellWrapper.innerHTML = '';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'input-edit-transformed';
        input.value = fileObj.transformedName;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'edit-actions';

        const btnSave = document.createElement('button');
        btnSave.type = 'button';
        btnSave.className = 'btn-save-transformed';
        btnSave.title = 'Guardar';
        btnSave.innerHTML = SVG.check;

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'btn-cancel-transformed';
        btnCancel.title = 'Cancelar';
        btnCancel.innerHTML = SVG.cross;

        actionsDiv.append(btnSave, btnCancel);

        let isFinished = false;

        const save = () => {
            if (isFinished) return;
            isFinished = true;
            const val = input.value.trim();
            if (val && val !== fileObj.transformedName) {
                const oldName = fileObj.transformedName;
                fileObj.transformedName = val;
                fileObj.isCustom = true;
                addLog(`Título modificado: "${oldName}" -> "${val}"`, 'info');
            }
            renderTable();
        };

        const cancel = () => {
            if (isFinished) return;
            isFinished = true;
            renderTable();
        };

        btnSave.addEventListener('click', (e) => {
            e.stopPropagation();
            save();
        });

        btnCancel.addEventListener('click', (e) => {
            e.stopPropagation();
            cancel();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                save();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });

        cellWrapper.append(input, actionsDiv);
        input.focus();
        input.select();
    }

    // Render de celda de estado con soporte para barra de progreso en vivo
    function renderStatusCell(cell, fileObj) {
        if (!cell || !fileObj) return;
        const status = fileObj.status || 'Pendiente Subir';

        if (status === 'Subiendo a Telegram' || (isWorkingStatus(status) && (fileObj.percent > 0 || status.includes('%')))) {
            cell.className = 'status-curso';
            cell.innerHTML = '';

            const container = document.createElement('div');
            container.className = 'upload-progress-cell';

            const meta = document.createElement('div');
            meta.className = 'upload-progress-meta';

            const statusText = document.createElement('span');
            statusText.className = 'upload-progress-status-text status-curso';
            const pct = Math.min(100, Math.max(0, fileObj.percent || 0));
            statusText.textContent = window.TeleVaultI18n ? window.TeleVaultI18n.t('status.uploading_pct', `Subiendo ${pct}%`, { pct }) : `Subiendo ${pct}%`;

            const speedText = document.createElement('span');
            speedText.className = 'upload-progress-speed-text';
            const speedFormatted = fileObj.speed ? window.TelegramAPI.formatSpeed(fileObj.speed) : '';
            const etaFormatted = (fileObj.eta !== null && fileObj.eta !== undefined)
                ? `ETA: ${window.TelegramAPI.formatDuration(fileObj.eta)}`
                : '';
            speedText.textContent = [speedFormatted, etaFormatted].filter(Boolean).join(' · ');

            meta.append(statusText, speedText);

            const track = document.createElement('div');
            track.className = 'upload-bar-track';
            const fill = document.createElement('div');
            fill.className = 'upload-bar-fill';
            fill.style.width = `${pct}%`;
            track.appendChild(fill);

            container.append(meta, track);
            cell.appendChild(container);

        } else if (status === 'Subido OK') {
            cell.className = 'status-ok';
            const text = window.TeleVaultI18n ? window.TeleVaultI18n.t('status.uploaded_ok', 'Subido OK') : 'Subido OK';
            cell.innerHTML = `<span class="status-ok">${text}</span>`;
        } else if (status === 'Subido Previamente') {
            cell.className = 'status-previo';
            const text = window.TeleVaultI18n ? window.TeleVaultI18n.t('status.previously_uploaded', 'Subido Previamente') : 'Subido Previamente';
            cell.innerHTML = `<span class="status-previo">${text}</span>`;
        } else if (status === 'Pendiente Subir') {
            cell.className = 'status-pendiente';
            const text = window.TeleVaultI18n ? window.TeleVaultI18n.t('status.pending_upload', 'Pendiente Subir') : 'Pendiente Subir';
            cell.innerHTML = `<span class="status-pendiente">${text}</span>`;
        } else if (status === 'Cancelado') {
            cell.className = 'status-cancelado';
            const text = window.TeleVaultI18n ? window.TeleVaultI18n.t('status.cancelled', 'Cancelado') : 'Cancelado';
            cell.innerHTML = `<span class="status-cancelado">${text}</span>`;
        } else if (status === 'Error en subida') {
            cell.className = 'status-error';
            const text = window.TeleVaultI18n ? window.TeleVaultI18n.t('status.upload_error', 'Error en subida') : 'Error en subida';
            cell.innerHTML = `<span class="status-error" title="${text}">${text}</span>`;
        } else {
            cell.className = getStatusClass(status);
            cell.textContent = status;
            cell.title = status;
        }
    }

    // Render de filas
    function renderTable() {
        filesTableBody.innerHTML = '';

        if (!filesToUpload || filesToUpload.length === 0) {
            const emptyTitle = (window.TeleVaultI18n && window.TeleVaultI18n.t('uploads.empty_title')) || 'No hay vídeos seleccionados para subir';
            const emptyDesc = (window.TeleVaultI18n && window.TeleVaultI18n.t('uploads.empty_desc')) || 'Selecciona la categoría y pulsa "Seleccionar vídeo(s)…" para añadir archivos a la lista.';
            filesTableBody.innerHTML = `
                <tr class="empty-files-row">
                    <td colspan="6" class="empty-table-cell">
                        <div class="empty-state-box">
                            <svg class="icon-svg empty-state-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                            <div class="empty-state-text">${emptyTitle}</div>
                            <div class="empty-state-subtext">${emptyDesc}</div>
                        </div>
                    </td>
                </tr>
            `;
            updateSortIcons();
            updateBadges();
            checkUploadButtonState();
            return;
        }

        sortFiles().forEach(fileObj => {
            const tr = document.createElement('tr');

            // 1. Título Original
            const tdOriginal = document.createElement('td');
            tdOriginal.textContent = fileObj.originalName;
            tdOriginal.title = fileObj.originalName;

            // 2. Título Transformado con botón lápiz
            const tdTransformed = document.createElement('td');
            tdTransformed.className = 'td-transformed';

            const cellWrapper = document.createElement('div');
            cellWrapper.className = 'transformed-cell-wrapper';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'transformed-name-text';
            nameSpan.textContent = fileObj.transformedName;
            nameSpan.title = fileObj.transformedName;

            const btnEdit = document.createElement('button');
            btnEdit.type = 'button';
            btnEdit.className = 'btn-edit-transformed';
            btnEdit.title = isDownloading ? getDownloadLockedMsg() : (window.TeleVaultI18n ? window.TeleVaultI18n.t('uploads.edit_title_tooltip', 'Editar título transformado') : 'Editar título transformado');
            btnEdit.innerHTML = SVG.pencil;
            btnEdit.disabled = isWorkingStatus(fileObj.status) || isDownloading;
            btnEdit.addEventListener('click', (e) => {
                e.stopPropagation();
                startEditingTransformedName(fileObj, cellWrapper);
            });

            cellWrapper.append(nameSpan, btnEdit);
            tdTransformed.appendChild(cellWrapper);

            // 3. Destino (Canal y/o Tema)
            const tdDestino = document.createElement('td');
            tdDestino.className = 'td-destination';

            const destBox = document.createElement('div');
            destBox.className = 'destination-cell-box';

            const destBadge = document.createElement('span');
            destBadge.className = 'destination-badge';

            if (fileObj.topicName) {
                const catSpan = document.createElement('span');
                catSpan.className = 'dest-category-text';
                catSpan.textContent = fileObj.categoryName || '';

                const sepSpan = document.createElement('span');
                sepSpan.className = 'dest-separator';
                sepSpan.textContent = ' › ';

                const topicSpan = document.createElement('span');
                topicSpan.className = 'dest-topic-text';
                topicSpan.textContent = fileObj.topicName;

                destBadge.append(catSpan, sepSpan, topicSpan);
                destBadge.title = fileObj.destinationLabel || `${fileObj.categoryName || ''} › ${fileObj.topicName}`;
            } else {
                const catSpan = document.createElement('span');
                catSpan.className = 'dest-category-text';
                catSpan.textContent = fileObj.categoryName || fileObj.destinationLabel || '';
                destBadge.appendChild(catSpan);
                destBadge.title = fileObj.categoryName || fileObj.destinationLabel || '';
            }

            destBox.appendChild(destBadge);
            tdDestino.appendChild(destBox);

            // 4. Tamaño / Info de Partición
            const tdSize = document.createElement('td');
            tdSize.className = 'td-size';
            const sizeBox = document.createElement('div');
            sizeBox.className = 'file-size-cell';

            const sizeText = document.createElement('span');
            sizeText.className = 'file-size-value';
            sizeText.textContent = window.TelegramAPI.formatBytes(fileObj.size);
            sizeBox.appendChild(sizeText);

            if (fileObj.isPart) {
                const splitBadge = document.createElement('span');
                splitBadge.className = 'file-split-badge';
                const totalFormatted = window.TelegramAPI.formatBytes(fileObj.totalFileSize || fileObj.size);
                splitBadge.title = window.TeleVaultI18n
                    ? window.TeleVaultI18n.t('uploads.split_badge_tooltip', `Archivo original de ${totalFormatted}. Dividido automáticamente en ${fileObj.totalParts} partes binarias para cumplir con el límite de Telegram (2 GB).`, { size: totalFormatted, parts: fileObj.totalParts })
                    : `Archivo original de ${totalFormatted}. Dividido automáticamente en ${fileObj.totalParts} partes binarias para cumplir con el límite de Telegram (2 GB).`;
                const partLabel = window.TeleVaultI18n
                    ? window.TeleVaultI18n.t('uploads.part_badge', `Parte ${fileObj.partIndex}/${fileObj.totalParts}`, { current: fileObj.partIndex, total: fileObj.totalParts })
                    : `Parte ${fileObj.partIndex}/${fileObj.totalParts}`;
                splitBadge.innerHTML = `<svg class="icon-svg size-badge-icon" viewBox="0 0 24 24"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg> ${partLabel}`;
                sizeBox.appendChild(splitBadge);
            }
            tdSize.appendChild(sizeBox);

            // 5. Estado con barra de progreso reactiva
            const tdStatus = document.createElement('td');
            tdStatus.id = `status-${fileObj.id}`;
            renderStatusCell(tdStatus, fileObj);

            // 6. Eliminar
            const tdDelete = document.createElement('td');
            tdDelete.className = 'td-delete';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-delete-row-icon';
            btn.dataset.id = fileObj.id;
            btn.innerHTML = SVG.trash;
            btn.title = isDownloading ? getDownloadLockedMsg() : (window.TeleVaultI18n ? window.TeleVaultI18n.t('uploads.delete_row_tooltip', 'Eliminar archivo de la lista') : 'Eliminar archivo de la lista');
            btn.disabled = isWorkingStatus(fileObj.status) || isDownloading;
            btn.addEventListener('click', () => {
                fileToDeleteId = fileObj.id;
                deleteModal.classList.remove('hidden');
            });
            tdDelete.appendChild(btn);

            tr.append(tdOriginal, tdTransformed, tdDestino, tdSize, tdStatus, tdDelete);
            filesTableBody.appendChild(tr);
        });
        updateSortIcons();
        updateBadges();
        checkUploadButtonState();
    }

    function updateRowStatus(id, newStatus, meta = null) {
        const fileObj = filesToUpload.find(f => f.id === id);
        if (!fileObj) return;
        fileObj.status = newStatus;
        if (meta) {
            if (meta.percent !== undefined) fileObj.percent = meta.percent;
            if (meta.eta !== undefined) fileObj.eta = meta.eta;
            if (meta.speed !== undefined) fileObj.speed = meta.speed;
        } else if (newStatus === 'Subido OK') {
            fileObj.percent = 100;
        }

        const statusCell = document.getElementById(`status-${id}`);
        if (statusCell) {
            renderStatusCell(statusCell, fileObj);
        }
        const deleteBtn = filesTableBody.querySelector(`button[data-id="${id}"]`);
        if (deleteBtn) deleteBtn.disabled = isWorkingStatus(newStatus);

        const row = statusCell ? statusCell.closest('tr') : null;
        if (row) {
            const editBtn = row.querySelector('.btn-edit-transformed');
            if (editBtn) editBtn.disabled = isWorkingStatus(newStatus);
        }
        checkUploadButtonState();
    }

    // ------------------------------------ Redimensionamiento de columnas de la tabla
    function initTableResizers() {
        const resizers = document.querySelectorAll('.table-section .resizer');

        resizers.forEach(resizer => {
            const th = resizer.parentElement;
            let startX = 0;
            let startWidth = 0;

            const onMouseMove = (e) => {
                const diff = e.pageX - startX;
                const newWidth = Math.max(65, startWidth + diff);
                th.style.width = `${newWidth}px`;
            };

            const onMouseUp = () => {
                resizer.classList.remove('resizing');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            resizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startX = e.pageX;
                startWidth = th.offsetWidth;
                resizer.classList.add('resizing');
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            resizer.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });
    }

    // ---------------------------------------------------------------- Borrado
    btnCancelDelete.addEventListener('click', () => { deleteModal.classList.add('hidden'); fileToDeleteId = null; });
    deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) { deleteModal.classList.add('hidden'); fileToDeleteId = null; } });
    btnConfirmDelete.addEventListener('click', () => {
        if (fileToDeleteId) {
            filesToUpload = filesToUpload.filter(f => f.id !== fileToDeleteId);
            renderTable();
            checkUploadButtonState();
            addLog("Archivo eliminado de la lista.", "info");
        }
        deleteModal.classList.add('hidden');
        fileToDeleteId = null;
    });

    if (btnClearAllUploads) {
        btnClearAllUploads.addEventListener('click', () => {
            if (!btnClearAllUploads.disabled && filesToUpload.length > 0 && deleteAllModal) {
                deleteAllModal.classList.remove('hidden');
            }
        });
    }
    if (btnCancelDeleteAll && deleteAllModal) {
        btnCancelDeleteAll.addEventListener('click', () => { deleteAllModal.classList.add('hidden'); });
        deleteAllModal.addEventListener('click', (e) => { if (e.target === deleteAllModal) deleteAllModal.classList.add('hidden'); });
    }
    if (btnConfirmDeleteAll) {
        btnConfirmDeleteAll.addEventListener('click', () => {
            filesToUpload = [];
            renderTable();
            checkUploadButtonState();
            addLog("Se han eliminado todos los archivos de la tabla.", "warning");
            if (deleteAllModal) deleteAllModal.classList.add('hidden');
        });
    }

    if (btnClearCompletedUploads) {
        btnClearCompletedUploads.addEventListener('click', () => {
            if (!btnClearCompletedUploads.disabled && filesToUpload.some(f => f.status === 'Subido OK') && deleteOkModal) {
                deleteOkModal.classList.remove('hidden');
            }
        });
    }
    if (btnCancelDeleteOk && deleteOkModal) {
        btnCancelDeleteOk.addEventListener('click', () => { deleteOkModal.classList.add('hidden'); });
        deleteOkModal.addEventListener('click', (e) => { if (e.target === deleteOkModal) deleteOkModal.classList.add('hidden'); });
    }
    if (btnConfirmDeleteOk) {
        btnConfirmDeleteOk.addEventListener('click', () => {
            const totalBefore = filesToUpload.length;
            filesToUpload = filesToUpload.filter(f => f.status !== 'Subido OK');
            renderTable();
            checkUploadButtonState();
            addLog(`Se han eliminado ${totalBefore - filesToUpload.length} archivo(s) con estado 'Subido OK'.`, "info");
            if (deleteOkModal) deleteOkModal.classList.add('hidden');
        });
    }

    // ---------------------------------------------------------------- Borrado en Descargas
    if (btnCancelDeleteDownload && deleteDownloadModal) {
        btnCancelDeleteDownload.addEventListener('click', () => {
            deleteDownloadModal.classList.add('hidden');
            downloadToDeleteId = null;
        });
        deleteDownloadModal.addEventListener('click', (e) => {
            if (e.target === deleteDownloadModal) {
                deleteDownloadModal.classList.add('hidden');
                downloadToDeleteId = null;
            }
        });
    }

    if (btnConfirmDeleteDownload) {
        btnConfirmDeleteDownload.addEventListener('click', () => {
            if (downloadToDeleteId) {
                downloadsList = downloadsList.filter(it => it.id !== downloadToDeleteId);
                renderDownloadsTable();
                checkDownloadButtonState();
                updateBadges();
                syncHeaderCheckbox();
                addLog("Descarga eliminada de la lista.", "info");
            }
            if (deleteDownloadModal) deleteDownloadModal.classList.add('hidden');
            downloadToDeleteId = null;
        });
    }

    if (btnClearAllDownloads) {
        btnClearAllDownloads.addEventListener('click', () => {
            if (!btnClearAllDownloads.disabled && downloadsList.length > 0 && deleteAllDownloadsModal) {
                deleteAllDownloadsModal.classList.remove('hidden');
            }
        });
    }
    if (btnCancelDeleteAllDownloads && deleteAllDownloadsModal) {
        btnCancelDeleteAllDownloads.addEventListener('click', () => {
            deleteAllDownloadsModal.classList.add('hidden');
        });
        deleteAllDownloadsModal.addEventListener('click', (e) => {
            if (e.target === deleteAllDownloadsModal) deleteAllDownloadsModal.classList.add('hidden');
        });
    }
    if (btnConfirmDeleteAllDownloads) {
        btnConfirmDeleteAllDownloads.addEventListener('click', async () => {
            downloadsList = [];
            await window.TelegramAPI.clearDownloads('all');
            renderDownloadsTable();
            checkDownloadButtonState();
            updateBadges();
            syncHeaderCheckbox();
            addLog("Se han eliminado todos los archivos de la tabla de descargas.", "warning");
            if (deleteAllDownloadsModal) deleteAllDownloadsModal.classList.add('hidden');
        });
    }

    if (btnClearCompletedDownloads) {
        btnClearCompletedDownloads.addEventListener('click', () => {
            if (!btnClearCompletedDownloads.disabled && downloadsList.some(it => it.status === 'Finalizado OK' || it.status === 'Completado') && deleteOkDownloadsModal) {
                deleteOkDownloadsModal.classList.remove('hidden');
            }
        });
    }
    if (btnCancelDeleteOkDownloads && deleteOkDownloadsModal) {
        btnCancelDeleteOkDownloads.addEventListener('click', () => {
            deleteOkDownloadsModal.classList.add('hidden');
        });
        deleteOkDownloadsModal.addEventListener('click', (e) => {
            if (e.target === deleteOkDownloadsModal) deleteOkDownloadsModal.classList.add('hidden');
        });
    }
    if (btnConfirmDeleteOkDownloads) {
        btnConfirmDeleteOkDownloads.addEventListener('click', async () => {
            const totalBefore = downloadsList.length;
            downloadsList = downloadsList.filter(it => it.status !== 'Finalizado OK' && it.status !== 'Completado');
            await window.TelegramAPI.clearDownloads('completed');
            renderDownloadsTable();
            checkDownloadButtonState();
            updateBadges();
            syncHeaderCheckbox();
            addLog(`Se han eliminado ${totalBefore - downloadsList.length} descarga(s) finalizadas con éxito de la tabla.`, "info");
            if (deleteOkDownloadsModal) deleteOkDownloadsModal.classList.add('hidden');
        });
    }

    // ---------------------------------------------------------------- Descarga de tema (Modal)
    if (btnConfirmDownloadTopic) {
        btnConfirmDownloadTopic.addEventListener('click', async () => {
            if (downloadTopicModal) downloadTopicModal.classList.add('hidden');
            if (pendingTopicDownload) {
                const { categoryId, topicId, topicName } = pendingTopicDownload;
                pendingTopicDownload = null;
                await promptAndAddTopicVideosToDownloadList(categoryId, topicId, topicName);
            }
        });
    }

    if (btnCancelDownloadTopic) {
        btnCancelDownloadTopic.addEventListener('click', () => {
            if (downloadTopicModal) downloadTopicModal.classList.add('hidden');
            pendingTopicDownload = null;
        });
    }

    if (downloadTopicModal) {
        downloadTopicModal.addEventListener('click', (e) => {
            if (e.target === downloadTopicModal) {
                downloadTopicModal.classList.add('hidden');
                pendingTopicDownload = null;
            }
        });
    }

    // ------------------------------------------------------------------ Subida
    async function runOne(fileObj, categoryId, topicId) {
        const startedAt = performance.now();
        updateRowStatus(fileObj.id, 'Preparando...');

        const destLabel = fileObj.destinationLabel || (fileObj.topicName ? `${fileObj.categoryName || ''} › ${fileObj.topicName}` : (fileObj.categoryName || ''));
        try {
            await window.TelegramAPI.uploadFile(
                fileObj, categoryId, topicId,
                (statusText, meta) => { if (!cancelRequested) updateRowStatus(fileObj.id, statusText, meta); }
            );
            const duration = window.TelegramAPI.formatDuration((performance.now() - startedAt) / 1000);
            updateRowStatus(fileObj.id, 'Subido OK');
            addLog(`Subida finalizada con éxito [${destLabel}]: ${fileObj.transformedName} (${duration})`, "success");
        } catch (error) {
            if (error.cancelled || cancelRequested) {
                updateRowStatus(fileObj.id, 'Cancelado');
                addLog(`Subida cancelada: ${fileObj.transformedName}`, "warning");
            } else {
                updateRowStatus(fileObj.id, 'Error en subida');
                addLog(`Error en ${fileObj.transformedName} [${destLabel}]: ${error.message}`, "error");
            }
        }
    }

    async function executeUploadProcess() {
        if (uploading) return;
        const defaultCategoryId = categoriaSelect.value;
        const defaultTopicId = subcategoriaSelect.value || null;

        uploading = true;
        cancelRequested = false;
        setFormLocked(true);
        btnSubir.disabled = true;
        btnReintentar.disabled = true;
        btnCrearTema.disabled = true;
        btnSeleccionar.disabled = true;
        if (btnClearAllUploads) btnClearAllUploads.disabled = true;
        if (btnClearCompletedUploads) btnClearCompletedUploads.disabled = true;
        btnCancelar.disabled = false;
        btnCancelar.classList.remove('hidden');

        addLog("Iniciando proceso de subida...", "info");

        const queue = filesToUpload.filter(f => UPLOADABLE.includes(f.status)).sort(compareForUpload);

        await new Promise((resolve) => {
            const running = new Set();
            let bigRunning = false;

            const pump = () => {
                if (!cancelRequested) {
                    while (queue.length > 0) {
                        const next = queue[0];
                        const isBig = (next.size || 0) > SMALL_FILE_BYTES;

                        const targetCat = next.categoryId || defaultCategoryId;
                        const targetTop = next.topicId !== undefined ? next.topicId : defaultTopicId;
                        const grupo = telegramData.find(g => g.id === targetCat);
                        const isTopic = Boolean(targetTop || (grupo && grupo.tieneTemas));

                        if (isTopic) {
                            // Para temas/series: subida estrictamente secuencial para mantener orden 01, 02.part1, 02.part2, 03...
                            if (running.size > 0) break;
                        } else {
                            if (bigRunning) break;
                            if (isBig ? running.size > 0 : running.size >= SMALL_CONCURRENCY) break;
                        }

                        queue.shift();
                        running.add(next.id);
                        if (isBig) bigRunning = true;
                        runOne(next, targetCat, targetTop).finally(() => {
                            running.delete(next.id);
                            if (isBig) bigRunning = false;
                            pump();
                        });
                    }
                }
                if (running.size === 0 && (queue.length === 0 || cancelRequested)) resolve();
            };
            pump();
        });

        uploading = false;
        btnCancelar.classList.add('hidden');
        setFormLocked(false);
        addLog(cancelRequested
            ? "Subida cancelada. Los archivos pendientes siguen en la lista."
            : "Cola de subida procesada.", cancelRequested ? "warning" : "info");
        cancelRequested = false;

        // Asegurar que ninguna fila quede en 'Cancelando...' ni en estado de ejecución
        filesToUpload.forEach(f => {
            if (f.status === 'Cancelando...' || isWorkingStatus(f.status)) {
                updateRowStatus(f.id, 'Cancelado');
            }
        });

        validateForm();
        checkUploadButtonState();

        if (filesToUpload.some(f => f.status === 'Subido OK')) {
            refreshSidebar();
        }
    }

    btnSubir.addEventListener('click', executeUploadProcess);

    btnReintentar.addEventListener('click', async () => {
        addLog("Preparando archivos para reintentar la subida...", "info");
        filesToUpload.forEach(fileObj => {
            if (fileObj.status === 'Error en subida') updateRowStatus(fileObj.id, 'Pendiente Subir');
        });
        await executeUploadProcess();
    });

    btnCancelar.addEventListener('click', async () => {
        if (!uploading || cancelRequested) return;
        cancelRequested = true;
        btnCancelar.disabled = true;
        addLog("Cancelando subida...", "warning");

        const running = filesToUpload.filter(f => isWorkingStatus(f.status));
        running.forEach(f => updateRowStatus(f.id, 'Cancelando...'));

        const ids = running.map(f => f.id);
        try {
            await window.TelegramAPI.cancelUploads(ids);
        } catch (error) {
            addLog(`No se pudo cancelar: ${error.message}`, "error");
        }
    });

    // Aviso si se intenta cerrar la pestaña mientras se sube
    window.addEventListener('beforeunload', (e) => {
        if (uploading) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // -------------------------------------------------- Gestión de Canales
    async function openChannelsModal(focusInput = false) {
        if (!channelsModal) return;
        channelsModal.classList.remove('hidden');
        if (channelAddFeedback) {
            channelAddFeedback.className = 'channel-feedback hidden';
            channelAddFeedback.textContent = '';
        }
        if (inputNewChannel) inputNewChannel.value = '';
        if (btnSubmitAddChannel) {
            btnSubmitAddChannel.disabled = true;
            btnSubmitAddChannel.title = 'Introduce un canal válido donde el bot sea Administrador';
        }
        if (channelSuggestionsDropdown) {
            channelSuggestionsDropdown.classList.add('hidden');
            channelSuggestionsDropdown.innerHTML = '';
        }
        // Por defecto la ayuda inicia oculta y el botón inactivo
        if (channelHelpBlock) channelHelpBlock.classList.add('hidden');
        if (btnToggleChannelHelp) btnToggleChannelHelp.classList.remove('active');

        try {
            const res = await window.TelegramAPI.getKnownChannels();
            knownChannelsList = res.channels || [];
        } catch (e) {
            knownChannelsList = [];
        }
        loadChannelsManager();
        if (focusInput && inputNewChannel) {
            setTimeout(() => inputNewChannel.focus(), 100);
        }
    }

    function closeChannelsModal() {
        if (!channelsModal) return;
        channelsModal.classList.add('hidden');
        if (channelSuggestionsDropdown) channelSuggestionsDropdown.classList.add('hidden');
        if (channelHelpBlock) channelHelpBlock.classList.add('hidden');
        if (btnToggleChannelHelp) btnToggleChannelHelp.classList.remove('active');
    }

    function renderSuggestionsList(items, headerTitle = 'Canales sugeridos', filterQuery = '') {
        if (!channelSuggestionsDropdown) return;
        if (!items || items.length === 0) {
            channelSuggestionsDropdown.classList.add('hidden');
            channelSuggestionsDropdown.innerHTML = '';
            return;
        }

        channelSuggestionsDropdown.innerHTML = '';

        // Encabezado con título y botón de cerrar
        const header = document.createElement('div');
        header.className = 'channel-suggestions-header';

        const titleEl = document.createElement('span');
        titleEl.textContent = headerTitle;

        const btnClose = document.createElement('button');
        btnClose.type = 'button';
        btnClose.className = 'btn-close-suggestions';
        btnClose.title = 'Cerrar sugerencias';
        btnClose.textContent = '✕';
        btnClose.addEventListener('click', (e) => {
            e.stopPropagation();
            channelSuggestionsDropdown.classList.add('hidden');
        });

        header.append(titleEl, btnClose);
        channelSuggestionsDropdown.appendChild(header);

        // Lista de sugerencias
        items.slice(0, 8).forEach(c => {
            const item = document.createElement('div');
            item.className = 'channel-suggestion-item';

            const left = document.createElement('div');
            left.className = 'suggestion-left';

            const icon = document.createElement('span');
            icon.className = 'suggestion-icon';
            icon.textContent = c.forum ? '📂' : '📢';

            const text = document.createElement('div');
            text.className = 'suggestion-text';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'suggestion-title';

            if (filterQuery) {
                const regex = new RegExp(`(${filterQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                titleSpan.innerHTML = (c.title || String(c.id)).replace(regex, '<mark>$1</mark>');
            } else {
                titleSpan.textContent = c.title || String(c.id);
            }

            const idSpan = document.createElement('span');
            idSpan.className = 'suggestion-id';
            idSpan.textContent = `ID: ${c.id}`;

            text.append(titleSpan, idSpan);
            left.append(icon, text);

            const badge = document.createElement('span');
            if (c.is_added) {
                badge.className = 'suggestion-badge registered';
                badge.textContent = c.visible ? '✔ Registrado' : '👁️‍🗨️ Oculto';
            } else if (c.is_admin) {
                badge.className = 'suggestion-badge detected';
                badge.textContent = '✨ Clic para añadir';
            } else {
                badge.className = 'suggestion-badge cached';
                badge.textContent = 'Disponible';
            }

            item.append(left, badge);

            item.addEventListener('click', (e) => {
                e.preventDefault();
                selectChannelSuggestion(c);
            });

            channelSuggestionsDropdown.appendChild(item);
        });

        channelSuggestionsDropdown.classList.remove('hidden');
    }

    function renderChannelSuggestions(filterText) {
        const q = (filterText || '').toLowerCase().trim();
        if (!q) {
            if (channelSuggestionsDropdown) channelSuggestionsDropdown.classList.add('hidden');
            return;
        }
        const matches = knownChannelsList.filter(c =>
            (c.title && c.title.toLowerCase().includes(q)) || String(c.id).includes(q)
        );
        if (matches.length > 0) {
            renderSuggestionsList(matches, `Canales sugeridos (${matches.length})`, q);
        } else if (channelSuggestionsDropdown) {
            channelSuggestionsDropdown.innerHTML = `
                <div class="channel-suggestions-header">
                    <span>Búsqueda</span>
                    <button type="button" class="btn-close-suggestions" title="Cerrar">✕</button>
                </div>
                <div class="suggestion-empty">No se encontraron canales guardados que coincidan con "${filterText.trim()}".<br>Si es un canal privado, pulsa <strong>"Detectar canales del bot"</strong> o pega el enlace del mensaje.</div>
            `;
            const closeBtn = channelSuggestionsDropdown.querySelector('.btn-close-suggestions');
            if (closeBtn) closeBtn.onclick = () => channelSuggestionsDropdown.classList.add('hidden');
            channelSuggestionsDropdown.classList.remove('hidden');
        }
    }

    function selectChannelSuggestion(c) {
        if (!inputNewChannel) return;
        selectedChannelToVerify = c;
        inputNewChannel.value = c.title || c.id;
        inputNewChannel.dataset.channelId = String(c.id);
        if (channelSuggestionsDropdown) channelSuggestionsDropdown.classList.add('hidden');

        if (c.is_added) {
            showChannelFeedback(`El canal "${c.title}" ya está registrado en tu lista inferior.`, 'info');
            if (btnSubmitAddChannel) {
                btnSubmitAddChannel.disabled = true;
                btnSubmitAddChannel.title = 'Este canal ya está registrado';
            }
        } else {
            verifyChannelAdmin(c.id);
        }
    }

    async function verifyChannelAdmin(channelInput) {
        if (!channelInput || !btnSubmitAddChannel) return;
        btnSubmitAddChannel.disabled = true;
        showChannelFeedback('Comprobando permisos del bot en Telegram...', 'info');

        try {
            const res = await window.TelegramAPI.checkChannel(channelInput);
            if (res.is_admin) {
                btnSubmitAddChannel.disabled = false;
                btnSubmitAddChannel.title = 'Añadir canal';
                const botName = res.bot_username ? `@${res.bot_username}` : 'el bot';
                showChannelFeedback(`✔ Canal verificado: el bot ${botName} es Administrador.`, 'success');
            } else {
                btnSubmitAddChannel.disabled = true;
                btnSubmitAddChannel.title = 'El bot no es Administrador';
                const botName = res.bot_username ? `@${res.bot_username}` : 'el bot';
                const errMsg = res.error || `El canal elegido no tiene al bot (${botName}) añadido como Administrador.`;
                showChannelFeedback(errMsg, 'error');
            }
        } catch (err) {
            btnSubmitAddChannel.disabled = true;
            showChannelFeedback(err.message || 'No se pudo verificar el canal', 'error');
        }
    }

    async function loadChannelsManager() {
        if (!channelsListContainer) return;
        channelsListContainer.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-muted);">Cargando canales...</div>';
        try {
            const data = await window.TelegramAPI.getChannels(true);
            if (modalBotName && data.bot) {
                modalBotName.textContent = `@${data.bot}`;
            }
            const channels = (data.channels || []).slice().sort((a, b) => naturalCompare(a.title || '', b.title || ''));
            if (channelsCount) channelsCount.textContent = channels.length;

            if (channels.length === 0) {
                channelsListContainer.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No tienes ningún canal registrado todavía.</div>';
                return;
            }

            channelsListContainer.innerHTML = '';
            channels.forEach(ch => {
                const card = document.createElement('div');
                card.className = `channel-card ${!ch.visible ? 'channel-hidden' : ''}`;

                const left = document.createElement('div');
                left.className = 'channel-card-left';

                const icon = document.createElement('span');
                icon.className = 'channel-card-icon';
                icon.textContent = ch.forum ? '📂' : '📢';

                const info = document.createElement('div');
                info.className = 'channel-card-info';

                const titleRow = document.createElement('div');
                titleRow.className = 'channel-card-title-row';

                const titleSpan = document.createElement('span');
                titleSpan.className = 'channel-card-title';
                titleSpan.textContent = ch.title;
                titleSpan.title = ch.title;

                const badge = document.createElement('span');
                badge.className = 'channel-card-badge';
                badge.textContent = ch.forum ? 'Foro / Temas' : 'Canal Normal';

                titleRow.append(titleSpan, badge);

                const meta = document.createElement('span');
                meta.className = 'channel-card-meta';
                meta.textContent = `ID: ${ch.id}`;

                info.append(titleRow, meta);
                left.append(icon, info);

                const actions = document.createElement('div');
                actions.className = 'channel-card-actions';

                // Botón Visibilidad (Toggle)
                const btnToggle = document.createElement('button');
                btnToggle.type = 'button';
                btnToggle.className = `btn-channel-toggle ${ch.visible ? 'active' : ''}`;
                const hideTitle = window.TeleVaultI18n ? window.TeleVaultI18n.t('modals.channels.hide_title', 'Haz clic para ocultar de la aplicación') : 'Haz clic para ocultar de la aplicación';
                const showTitle = window.TeleVaultI18n ? window.TeleVaultI18n.t('modals.channels.show_title', 'Haz clic para mostrar en la aplicación') : 'Haz clic para mostrar en la aplicación';
                const visibleLabel = window.TeleVaultI18n ? window.TeleVaultI18n.t('modals.channels.visible_label', 'Visible') : 'Visible';
                const hiddenLabel = window.TeleVaultI18n ? window.TeleVaultI18n.t('modals.channels.hidden_label', 'Oculto') : 'Oculto';
                btnToggle.title = ch.visible ? hideTitle : showTitle;
                btnToggle.innerHTML = ch.visible ? `${SVG.eye} <span>${visibleLabel}</span>` : `${SVG.eyeOff} <span>${hiddenLabel}</span>`;
                btnToggle.addEventListener('click', async () => {
                    btnToggle.disabled = true;
                    try {
                        await window.TelegramAPI.toggleChannel(ch.id);
                        await loadChannelsManager();
                        await refreshSidebar();
                    } catch (err) {
                        alert(`Error al cambiar visibilidad: ${err.message}`);
                    }
                });

                // Botón Eliminar
                const btnDelete = document.createElement('button');
                btnDelete.type = 'button';
                btnDelete.className = 'btn-channel-delete btn-delete-row-icon';
                btnDelete.title = window.TeleVaultI18n ? window.TeleVaultI18n.t('modals.channels.delete_title', 'Eliminar este canal') : 'Eliminar este canal';
                btnDelete.innerHTML = SVG.trash;
                btnDelete.addEventListener('click', () => {
                    channelToDelete = ch;
                    if (deleteChannelModalText) {
                        deleteChannelModalText.textContent = `¿Estás seguro de que deseas eliminar el canal "${ch.title}"?`;
                    }
                    if (deleteChannelModal) deleteChannelModal.classList.remove('hidden');
                });

                actions.append(btnToggle, btnDelete);
                card.append(left, actions);
                channelsListContainer.appendChild(card);
            });
        } catch (error) {
            channelsListContainer.innerHTML = `<div style="text-align:center; padding:15px; color:var(--error);">Error al cargar: ${error.message}</div>`;
        }
    }

    async function handleAddChannel() {
        if (!inputNewChannel || !btnSubmitAddChannel || btnSubmitAddChannel.disabled) return;
        
        // Priorizar el ID verificado del canal si proviene de una sugerencia/detección
        const verifiedId = inputNewChannel.dataset.channelId || (selectedChannelToVerify ? String(selectedChannelToVerify.id) : null);
        const val = (verifiedId || inputNewChannel.value).trim();
        
        if (!val) {
            showChannelFeedback('Introduce un enlace (t.me/+...), @usuario o ID', 'error');
            return;
        }

        btnSubmitAddChannel.disabled = true;
        inputNewChannel.disabled = true;
        showChannelFeedback('Verificando y guardando canal en Telegram...', 'info');

        try {
            const res = await window.TelegramAPI.addChannel(val);
            if (res.ok) {
                showChannelFeedback(res.message || 'Canal añadido con éxito', 'success');
                inputNewChannel.value = '';
                delete inputNewChannel.dataset.channelId;
                selectedChannelToVerify = null;
                if (channelSuggestionsDropdown) channelSuggestionsDropdown.classList.add('hidden');
                await loadChannelsManager();
                await refreshSidebar();
            } else {
                showChannelFeedback(res.message || 'No se pudo añadir el canal', 'error');
            }
        } catch (err) {
            showChannelFeedback(err.message || 'Error al conectar con el canal', 'error');
        } finally {
            btnSubmitAddChannel.disabled = false;
            inputNewChannel.disabled = false;
        }
    }

    function showChannelFeedback(msg, type) {
        if (!channelAddFeedback) return;
        channelAddFeedback.className = `channel-feedback ${type}`;
        channelAddFeedback.textContent = msg;
        channelAddFeedback.classList.remove('hidden');
    }

    // -------------------------------------------------- Configuración del Bot
    function openBotConfigModal() {
        if (!botConfigModal) return;
        botConfigModal.classList.remove('hidden');
        if (botConfigFeedback) {
            botConfigFeedback.className = 'channel-feedback hidden';
            botConfigFeedback.textContent = '';
        }
        loadBotConfigData();
    }

    function closeBotConfigModal() {
        if (!botConfigModal) return;
        botConfigModal.classList.add('hidden');
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function loadBotConfigData() {
        try {
            const cfg = await window.TelegramAPI.getBotConfig();
            if (inputBotToken && cfg.token_preview) {
                inputBotToken.placeholder = `Token actual: ${cfg.token_preview}`;
            }
            if (inputApiId && cfg.api_id) {
                inputApiId.value = cfg.api_id;
            }
        } catch (e) {
            // Ignorar
        }
        await renderCloudSyncStatus();
    }

    async function renderCloudSyncStatus() {
        const block = document.getElementById('cloudSyncStatusBlock');
        if (!block) return;

        try {
            const status = await window.TelegramAPI.getCloudCacheStatus();
            const t = (k, def) => window.TeleVaultI18n ? window.TeleVaultI18n.t(k, def) : def;

            if (!status.bot_configured) {
                block.innerHTML = `
                    <div style="color: var(--text-muted);">
                        ${t('modals.bot.step1', 'Configura y conecta tu bot primero para activar la sincronización en la nube.')}
                    </div>
                `;
                if (btnUploadCloudBackup) btnUploadCloudBackup.disabled = true;
                if (btnRestoreCloudBackup) btnRestoreCloudBackup.disabled = true;
                return;
            }

            if (btnUploadCloudBackup) btnUploadCloudBackup.disabled = false;
            if (btnRestoreCloudBackup) btnRestoreCloudBackup.disabled = false;

            let html = '';
            if (status.linked) {
                const ownerName = status.owner_username ? `@${status.owner_username}` : (status.owner_first_name || `ID ${status.owner_chat_id}`);
                const sizeFmt = window.TelegramAPI.formatBytes ? window.TelegramAPI.formatBytes(status.local_cache_size) : `${status.local_cache_size} bytes`;
                html += `
                    <div style="color: #34d399; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                        <span>🟢</span>
                        <span>${t('modals.bot.cloud_linked', 'Chat privado vinculado.')} (${escapeHtml(ownerName)})</span>
                    </div>
                    <div class="cloud-sync-meta">
                        <div class="cloud-sync-meta-item">
                            <span>${t('modals.bot.cloud_last_backup', 'Última copia en la nube:')}</span>
                            <strong style="color: var(--text-main);">${status.last_backup_time || 'Aún no subida'}</strong>
                        </div>
                        <div class="cloud-sync-meta-item">
                            <span>${t('modals.bot.cloud_local_cache', 'Caché local:')}</span>
                            <strong style="color: var(--text-main);">${status.channels_count} canales · ${status.videos_count} vídeos (${sizeFmt})</strong>
                        </div>
                    </div>
                `;
            } else {
                const botUser = status.bot_username || 'tu_bot';
                html += `
                    <div style="color: #f59e0b; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                        <span>🟡</span>
                        <span>${t('modals.bot.cloud_not_linked', 'Chat privado no vinculado todavía.')}</span>
                    </div>
                    <div style="color: var(--text-muted); font-size: 0.78rem;">
                        ${t('modals.bot.cloud_instructions', 'Para vincular tu chat y sincronizar entre varios equipos: abre una conversación con tu bot en Telegram y pulsa Iniciar o envíale cualquier mensaje.')}
                    </div>
                    <a href="https://t.me/${encodeURIComponent(botUser)}" target="_blank" rel="noopener noreferrer" class="btn-bot-link">
                        <span>💬</span>
                        <span>${t('modals.bot.btn_open_bot_chat', 'Abrir chat con el bot en Telegram')} (@${escapeHtml(botUser)})</span>
                    </a>
                `;
            }
            block.innerHTML = html;
        } catch (e) {
            block.innerHTML = `<div style="color: #f87171;">Error al consultar estado de la nube: ${escapeHtml(e.message)}</div>`;
        }
    }

    async function saveBotConfigHandler() {
        if (!inputBotToken || !btnSaveBotConfig) return;
        const token = inputBotToken.value.trim();
        if (!token) {
            showBotFeedback('Debes introducir el Token del Bot proporcionado por @BotFather', 'error');
            return;
        }

        btnSaveBotConfig.disabled = true;
        showBotFeedback('Conectando con Telegram y verificando bot...', 'info');

        try {
            const apiId = inputApiId ? inputApiId.value.trim() : null;
            const apiHash = inputApiHash ? inputApiHash.value.trim() : null;
            const res = await window.TelegramAPI.setBotConfig(token, apiId, apiHash);
            if (res.ok) {
                showBotFeedback(`✔ Conectado exitosamente como @${res.bot}`, 'success');
                if (headerBotUsername) headerBotUsername.textContent = `@${res.bot}`;
                if (modalBotName) modalBotName.textContent = `@${res.bot}`;
                inputBotToken.value = '';
                setTimeout(() => {
                    closeBotConfigModal();
                    checkHealth();
                    refreshSidebar();
                }, 1200);
            } else {
                showBotFeedback(res.message || 'No se pudo configurar el bot', 'error');
            }
        } catch (err) {
            showBotFeedback(err.message || 'Error al conectar con Telegram', 'error');
        } finally {
            btnSaveBotConfig.disabled = false;
        }
    }

    function showBotFeedback(msg, type) {
        if (!botConfigFeedback) return;
        botConfigFeedback.className = `channel-feedback ${type}`;
        botConfigFeedback.textContent = msg;
        botConfigFeedback.classList.remove('hidden');
    }

    if (btnConfigBot) btnConfigBot.addEventListener('click', openBotConfigModal);
    if (btnCloseBotConfigModal) btnCloseBotConfigModal.addEventListener('click', closeBotConfigModal);
    if (btnCancelBotConfig) btnCancelBotConfig.addEventListener('click', closeBotConfigModal);
    if (btnSaveBotConfig) btnSaveBotConfig.addEventListener('click', saveBotConfigHandler);
    if (btnToggleBotTokenVis && inputBotToken) {
        btnToggleBotTokenVis.addEventListener('click', () => {
            inputBotToken.type = inputBotToken.type === 'password' ? 'text' : 'password';
            btnToggleBotTokenVis.innerHTML = inputBotToken.type === 'password' ? SVG.eye : SVG.eyeOff;
        });
    }

    if (btnUploadCloudBackup) {
        btnUploadCloudBackup.addEventListener('click', async () => {
            btnUploadCloudBackup.disabled = true;
            showBotFeedback('Subiendo copia de seguridad silenciosa a Telegram...', 'info');
            try {
                await window.TelegramAPI.backupCloudCache();
                const t = (k, def) => window.TeleVaultI18n ? window.TeleVaultI18n.t(k, def) : def;
                showBotFeedback(t('modals.bot.cloud_backup_success', 'Copia de seguridad subida a Telegram con éxito.'), 'success');
                renderCloudSyncStatus();
            } catch (err) {
                showBotFeedback(`Error al subir copia: ${err.message}`, 'error');
            } finally {
                btnUploadCloudBackup.disabled = false;
            }
        });
    }

    if (btnRestoreCloudBackup) {
        btnRestoreCloudBackup.addEventListener('click', async () => {
            btnRestoreCloudBackup.disabled = true;
            showBotFeedback('Restaurando copia desde Telegram...', 'info');
            try {
                const res = await window.TelegramAPI.restoreCloudCache();
                const t = (k, def) => window.TeleVaultI18n ? window.TeleVaultI18n.t(k, def) : def;
                showBotFeedback(res.message || t('modals.bot.cloud_restore_success', 'Caché restaurada desde Telegram con éxito.'), 'success');
                renderCloudSyncStatus();
                refreshSidebar();
            } catch (err) {
                showBotFeedback(`Error al restaurar copia: ${err.message}`, 'error');
            } finally {
                btnRestoreCloudBackup.disabled = false;
            }
        });
    }

    async function handleRescanAll() {
        const t = (k, def) => window.TeleVaultI18n ? window.TeleVaultI18n.t(k, def) : def;
        addLog(t('modals.bot.rescan_started', 'Actualización masiva iniciada. Sincronizando todos los canales...'), 'info');
        if (btnRescanAll) btnRescanAll.classList.add('is-spinning');
        if (btnModalRescanChannels) btnModalRescanChannels.classList.add('is-spinning');

        try {
            await window.TelegramAPI.rescanChannels();
            checkHealth();
        } catch (err) {
            addLog(`Error al iniciar reescaneo: ${err.message}`, 'error');
            if (btnRescanAll) btnRescanAll.classList.remove('is-spinning');
            if (btnModalRescanChannels) btnModalRescanChannels.classList.remove('is-spinning');
        }
    }

    if (btnReorderSidebar) {
        btnReorderSidebar.addEventListener('click', toggleReorderMode);
    }
    if (btnResetSidebarOrder) {
        btnResetSidebarOrder.addEventListener('click', handleResetSidebarOrder);
    }

    if (btnRescanAll) {
        btnRescanAll.addEventListener('click', handleRescanAll);
    }
    if (btnModalRescanChannels) {
        btnModalRescanChannels.addEventListener('click', handleRescanAll);
    }

    if (btnManageChannels) btnManageChannels.addEventListener('click', () => openChannelsModal(false));
    if (btnCloseChannelsModal) btnCloseChannelsModal.addEventListener('click', closeChannelsModal);
    if (btnRefreshChannelsList) btnRefreshChannelsList.addEventListener('click', loadChannelsManager);
    if (btnSubmitAddChannel) btnSubmitAddChannel.addEventListener('click', handleAddChannel);

    if (btnToggleChannelHelp && channelHelpBlock) {
        btnToggleChannelHelp.addEventListener('click', () => {
            const isHidden = channelHelpBlock.classList.toggle('hidden');
            btnToggleChannelHelp.classList.toggle('active', !isHidden);
        });
    }

    if (btnDetectChannels) {
        btnDetectChannels.addEventListener('click', async () => {
            btnDetectChannels.disabled = true;
            showChannelFeedback('Escaneando canales recientes del bot en Telegram...', 'info');
            try {
                const res = await window.TelegramAPI.detectChannels();
                const detected = res.detected || [];
                if (detected.length === 0) {
                    showChannelFeedback('No se detectaron canales nuevos. Asegúrate de enviar un mensaje en el canal (ej: "hola") para que el bot reciba la notificación.', 'error');
                    if (channelSuggestionsDropdown) channelSuggestionsDropdown.classList.add('hidden');
                } else {
                    // Actualizar lista en memoria con los detectados
                    detected.forEach(d => {
                        const existing = knownChannelsList.find(k => String(k.id) === String(d.id));
                        if (!existing) {
                            knownChannelsList.unshift(d);
                        } else {
                            existing.is_added = d.is_added;
                            existing.is_admin = d.is_admin;
                        }
                    });

                    // Mostrar siempre los canales detectados en el bloque de sugerencias
                    renderSuggestionsList(detected, `🔍 Canales detectados del bot (${detected.length})`);

                    const unadded = detected.filter(d => !d.is_added);
                    if (unadded.length > 0) {
                        showChannelFeedback(`✔ Se encontraron ${detected.length} canal(es). Haz clic sobre "${unadded[0].title}" en la lista de sugerencias para seleccionarlo y añadirlo.`, 'success');
                    } else {
                        showChannelFeedback(`Se detectaron ${detected.length} canal(es) donde el bot está activo. Ya se encuentran registrados en tu lista inferior.`, 'info');
                    }
                }
            } catch (err) {
                showChannelFeedback(err.message || 'Error al escanear canales', 'error');
            } finally {
                btnDetectChannels.disabled = false;
            }
        });
    }

    if (inputNewChannel) {
        inputNewChannel.addEventListener('input', () => {
            delete inputNewChannel.dataset.channelId;
            selectedChannelToVerify = null;
            const val = inputNewChannel.value;
            renderChannelSuggestions(val);
            if (btnSubmitAddChannel) btnSubmitAddChannel.disabled = true;

            clearTimeout(checkChannelDebounceTimer);
            const trimmed = val.trim();
            if (trimmed.startsWith('-100') || trimmed.startsWith('@') || trimmed.includes('t.me/')) {
                checkChannelDebounceTimer = setTimeout(() => {
                    verifyChannelAdmin(trimmed);
                }, 500);
            }
        });

        inputNewChannel.addEventListener('focus', () => {
            if (inputNewChannel.value.trim()) {
                renderChannelSuggestions(inputNewChannel.value);
            }
        });

        inputNewChannel.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (!btnSubmitAddChannel.disabled) {
                    handleAddChannel();
                } else if (inputNewChannel.value.trim()) {
                    verifyChannelAdmin(inputNewChannel.value.trim());
                }
            }
        });
    }

    // Ocultar sugerencias al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (channelSuggestionsDropdown && !channelSuggestionsDropdown.contains(e.target) && e.target !== inputNewChannel) {
            channelSuggestionsDropdown.classList.add('hidden');
        }
    });

    if (btnConfirmDeleteChannel) {
        btnConfirmDeleteChannel.addEventListener('click', async () => {
            if (!channelToDelete) return;
            btnConfirmDeleteChannel.disabled = true;
            try {
                await window.TelegramAPI.deleteChannel(channelToDelete.id);
                if (deleteChannelModal) deleteChannelModal.classList.add('hidden');
                channelToDelete = null;
                await loadChannelsManager();
                await refreshSidebar();
            } catch (err) {
                alert(`Error al eliminar: ${err.message}`);
            } finally {
                btnConfirmDeleteChannel.disabled = false;
            }
        });
    }

    if (btnCancelDeleteChannel) {
        btnCancelDeleteChannel.addEventListener('click', () => {
            channelToDelete = null;
            if (deleteChannelModal) deleteChannelModal.classList.add('hidden');
        });
    }

    if (channelsModal) {
        channelsModal.addEventListener('click', (e) => {
            if (e.target === channelsModal) closeChannelsModal();
        });
    }
    if (botConfigModal) {
        botConfigModal.addEventListener('click', (e) => {
            if (e.target === botConfigModal) closeBotConfigModal();
        });
    }
    if (deleteChannelModal) {
        deleteChannelModal.addEventListener('click', (e) => {
            if (e.target === deleteChannelModal) {
                channelToDelete = null;
                deleteChannelModal.classList.add('hidden');
            }
        });
    }

    // -------------------------------------------------- Modal de Guía de Uso y Configuración
    const guideModal = document.getElementById('guideModal');
    const btnOpenGuideModal = document.getElementById('btnOpenGuideModal');
    const btnCloseGuideModal = document.getElementById('btnCloseGuideModal');
    const linkGuideFromBot = document.getElementById('linkGuideFromBot');
    const linkGuideFromChannels = document.getElementById('linkGuideFromChannels');
    const btnShortcutOpenBotConfig = document.getElementById('btnShortcutOpenBotConfig');
    const btnShortcutOpenApiConfig = document.getElementById('btnShortcutOpenApiConfig');
    const btnShortcutOpenChannels = document.getElementById('btnShortcutOpenChannels');

    function openGuideModal(openTopicId = null) {
        if (!guideModal) return;
        guideModal.classList.remove('hidden');

        // Cerrar otros modales si estuvieran abiertos
        if (channelsModal) channelsModal.classList.add('hidden');
        if (botConfigModal) botConfigModal.classList.add('hidden');

        const guideItems = guideModal.querySelectorAll('.guide-item');
        guideItems.forEach(item => {
            const content = item.querySelector('.guide-item-content');
            if (openTopicId && item.id === openTopicId) {
                item.classList.add('open');
                if (content) content.classList.remove('hidden');
                setTimeout(() => item.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120);
            } else {
                item.classList.remove('open');
                if (content) content.classList.add('hidden');
            }
        });
    }

    function closeGuideModal() {
        if (!guideModal) return;
        guideModal.classList.add('hidden');
    }

    // Acordeón interactivo de guías
    const guideHeaders = document.querySelectorAll('.guide-item-header');
    guideHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const item = header.closest('.guide-item');
            const targetId = header.getAttribute('data-target');
            const content = targetId ? document.getElementById(targetId) : (item ? item.querySelector('.guide-item-content') : null);
            if (!item || !content) return;

            const isOpen = item.classList.contains('open');
            if (isOpen) {
                item.classList.remove('open');
                content.classList.add('hidden');
            } else {
                item.classList.add('open');
                content.classList.remove('hidden');
            }
        });
    });

    if (btnOpenGuideModal) btnOpenGuideModal.addEventListener('click', () => openGuideModal());
    if (btnCloseGuideModal) btnCloseGuideModal.addEventListener('click', closeGuideModal);

    // Enlaces directos cruzados
    if (linkGuideFromBot) {
        linkGuideFromBot.addEventListener('click', () => {
            openGuideModal('guideItemBotFather');
        });
    }
    if (linkGuideFromChannels) {
        linkGuideFromChannels.addEventListener('click', () => {
            openGuideModal('guideItemChannels');
        });
    }
    if (btnShortcutOpenBotConfig) {
        btnShortcutOpenBotConfig.addEventListener('click', () => {
            closeGuideModal();
            openBotConfigModal();
        });
    }
    if (btnShortcutOpenApiConfig) {
        btnShortcutOpenApiConfig.addEventListener('click', () => {
            closeGuideModal();
            openBotConfigModal();
            const adv = document.querySelector('.bot-advanced-details');
            if (adv) adv.open = true;
        });
    }
    if (btnShortcutOpenChannels) {
        btnShortcutOpenChannels.addEventListener('click', () => {
            closeGuideModal();
            openChannelsModal();
        });
    }
    const btnShortcutOpenChannelsFromTopics = document.getElementById('btnShortcutOpenChannelsFromTopics');
    if (btnShortcutOpenChannelsFromTopics) {
        btnShortcutOpenChannelsFromTopics.addEventListener('click', () => {
            closeGuideModal();
            openChannelsModal();
        });
    }

    if (guideModal) {
        guideModal.addEventListener('click', (e) => {
            if (e.target === guideModal) closeGuideModal();
        });
    }

    // -------------------------------------------------- Modal Acerca de TeleVault
    const aboutModal = document.getElementById('aboutModal');
    const btnAboutProject = document.getElementById('btnAboutProject');
    const btnCloseAboutModal = document.getElementById('btnCloseAboutModal');
    const btnConfirmCloseAboutModal = document.getElementById('btnConfirmCloseAboutModal');

    function openAboutModal() {
        if (!aboutModal) return;
        aboutModal.classList.remove('hidden');
    }

    function closeAboutModal() {
        if (!aboutModal) return;
        aboutModal.classList.add('hidden');
    }

    if (btnAboutProject) btnAboutProject.addEventListener('click', openAboutModal);
    if (btnCloseAboutModal) btnCloseAboutModal.addEventListener('click', closeAboutModal);
    if (btnConfirmCloseAboutModal) btnConfirmCloseAboutModal.addEventListener('click', closeAboutModal);

    if (aboutModal) {
        aboutModal.addEventListener('click', (e) => {
            if (e.target === aboutModal) closeAboutModal();
        });
    }

    // -------------------------------------------------- Sistema de Actualizaciones de 1 Clic
    const btnUpdateNotification = document.getElementById('btnUpdateNotification');
    const updateNotificationText = document.getElementById('updateNotificationText');
    const aboutUpdateStatusText = document.getElementById('aboutUpdateStatusText');
    const aboutUpdateSubText = document.getElementById('aboutUpdateSubText');
    const btnAboutCheckUpdate = document.getElementById('btnAboutCheckUpdate');

    const updateModal = document.getElementById('updateModal');
    const btnCloseUpdateModal = document.getElementById('btnCloseUpdateModal');
    const btnCancelUpdateModal = document.getElementById('btnCancelUpdateModal');
    const updateConfirmView = document.getElementById('updateConfirmView');
    const updateProgressView = document.getElementById('updateProgressView');
    const updateCurrentVer = document.getElementById('updateCurrentVer');
    const updateLatestVer = document.getElementById('updateLatestVer');
    const updateReleaseNotes = document.getElementById('updateReleaseNotes');
    const btnConfirmInstallUpdate = document.getElementById('btnConfirmInstallUpdate');
    const updateProgressTitle = document.getElementById('updateProgressTitle');
    const updateProgressStatus = document.getElementById('updateProgressStatus');
    const updateProgressBar = document.getElementById('updateProgressBar');

    let cachedUpdateInfo = null;
    let isCheckingUpdate = false;
    let isInstallingUpdate = false;

    function formatMarkdownNotes(raw) {
        if (!raw) return '<p style="color:var(--text-muted); font-style:italic;">No se proporcionaron notas detalladas para esta versión.</p>';
        let text = String(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        text = text.replace(/^### (.*$)/gim, '<h5 style="margin: 8px 0 4px; font-weight:700; color:var(--text-main);">$1</h5>');
        text = text.replace(/^## (.*$)/gim, '<h4 style="margin: 12px 0 6px; font-weight:700; color:var(--accent);">$1</h4>');
        text = text.replace(/^# (.*$)/gim, '<h3 style="margin: 14px 0 8px; font-weight:800; color:var(--accent);">$1</h3>');
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
        text = text.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08); padding:1px 5px; border-radius:4px; font-size:0.88em;">$1</code>');
        text = text.replace(/^\s*[-*]\s+(.*$)/gim, '<li style="margin-left: 18px; margin-bottom: 4px;">$1</li>');
        text = text.replace(/\n\n/g, '<br><br>');
        return text;
    }

    function updateUiForUpdateInfo(info) {
        if (!info) return;
        const currentVer = info.current_version || (brandVersionPill ? brandVersionPill.textContent : 'v3.2.0');
        const latestVer = info.latest_version || currentVer;

        if (info.update_available) {
            // Mostrar botón pill en el header
            if (btnUpdateNotification) {
                btnUpdateNotification.classList.remove('hidden');
                const badgeText = window.TeleVaultI18n ? window.TeleVaultI18n.t('modals.updater.badge_update_available', `Nueva versión ${latestVer}`, { ver: latestVer }) : `Nueva versión ${latestVer}`;
                if (updateNotificationText) updateNotificationText.textContent = badgeText;
            }
            // En modal Acerca de
            if (aboutUpdateStatusText) {
                const foundText = window.TeleVaultI18n ? window.TeleVaultI18n.t('modals.updater.update_found', `¡Nueva versión disponible: ${latestVer}!`, { ver: latestVer }) : `¡Nueva versión disponible: ${latestVer}!`;
                aboutUpdateStatusText.textContent = foundText;
                aboutUpdateStatusText.style.color = '#10b981';
            }
            if (aboutUpdateSubText) {
                aboutUpdateSubText.textContent = info.release_name ? `${info.release_name}` : `Versión ${latestVer} disponible en GitHub`;
            }
            if (btnAboutCheckUpdate) {
                btnAboutCheckUpdate.textContent = window.TeleVaultI18n ? window.TeleVaultI18n.t('modals.updater.btn_install', 'Actualizar ahora (1 Clic)') : 'Actualizar ahora (1 Clic)';
                btnAboutCheckUpdate.classList.add('btn-install-action');
            }
        } else {
            // Ocultar botón pill en header
            if (btnUpdateNotification) {
                btnUpdateNotification.classList.add('hidden');
            }
            // En modal Acerca de
            if (aboutUpdateStatusText) {
                const upToDateText = window.TeleVaultI18n ? window.TeleVaultI18n.t('modals.updater.up_to_date', `TeleVault está actualizado (${currentVer})`, { ver: currentVer }) : `TeleVault está actualizado (${currentVer})`;
                aboutUpdateStatusText.textContent = upToDateText;
                aboutUpdateStatusText.style.color = '';
            }
            if (aboutUpdateSubText) {
                aboutUpdateSubText.textContent = 'Tienes instalada la última versión disponible.';
            }
            if (btnAboutCheckUpdate) {
                btnAboutCheckUpdate.textContent = window.TeleVaultI18n ? window.TeleVaultI18n.t('modals.updater.btn_check_update', 'Buscar actualizaciones') : 'Buscar actualizaciones';
                btnAboutCheckUpdate.classList.remove('btn-install-action');
            }
        }
    }

    async function checkAppUpdates(force = false, silent = true) {
        if (isCheckingUpdate || isInstallingUpdate) return;
        isCheckingUpdate = true;

        if (btnAboutCheckUpdate && !silent) {
            btnAboutCheckUpdate.disabled = true;
            btnAboutCheckUpdate.textContent = window.TeleVaultI18n ? window.TeleVaultI18n.t('modals.updater.btn_checking', 'Comprobando...') : 'Comprobando...';
        }

        try {
            const res = await window.TelegramAPI.checkUpdate(force);
            cachedUpdateInfo = res;
            updateUiForUpdateInfo(res);

            if (!silent) {
                if (res.update_available) {
                    openUpdateModal(res);
                } else {
                    addLog(`TeleVault está en su versión más reciente (${res.current_version}).`, 'info');
                }
            }
        } catch (err) {
            console.warn('[Updater] Error al comprobar actualización:', err);
            if (!silent) {
                addLog(`No se pudo comprobar la actualización: ${err.message}`, 'error');
            }
        } finally {
            isCheckingUpdate = false;
            if (btnAboutCheckUpdate) {
                btnAboutCheckUpdate.disabled = false;
                if (!cachedUpdateInfo?.update_available) {
                    btnAboutCheckUpdate.textContent = window.TeleVaultI18n ? window.TeleVaultI18n.t('modals.updater.btn_check_update', 'Buscar actualizaciones') : 'Buscar actualizaciones';
                }
            }
        }
    }

    function openUpdateModal(info) {
        const updateData = info || cachedUpdateInfo;
        if (!updateData || !updateModal) return;

        // Si ya está en proceso de instalación, no reiniciar la vista
        if (!isInstallingUpdate) {
            if (updateConfirmView) updateConfirmView.classList.remove('hidden');
            if (updateProgressView) updateProgressView.classList.add('hidden');
            if (btnCloseUpdateModal) btnCloseUpdateModal.style.display = '';

            const current = updateData.current_version || (brandVersionPill ? brandVersionPill.textContent : 'v3.2.0');
            const latest = updateData.latest_version || current;

            if (updateCurrentVer) updateCurrentVer.textContent = current;
            if (updateLatestVer) updateLatestVer.textContent = latest;
            if (updateReleaseNotes) updateReleaseNotes.innerHTML = formatMarkdownNotes(updateData.release_notes);
            if (btnConfirmInstallUpdate) btnConfirmInstallUpdate.disabled = false;
        }

        updateModal.classList.remove('hidden');
    }

    function closeUpdateModal() {
        if (isInstallingUpdate) return; // Bloquear cierre mientras se instala
        if (updateModal) updateModal.classList.add('hidden');
    }

    async function handleInstallUpdate() {
        if (isInstallingUpdate) return;

        // Comprobar que no haya transferencias activas
        const hasUploading = filesToUpload && filesToUpload.some(f => isWorkingStatus(f.status));
        if (hasUploading) {
            const busyMsg = window.TeleVaultI18n ? window.TeleVaultI18n.t('modals.updater.busy_uploads', 'Hay subidas en curso. Espera a que finalicen antes de actualizar.') : 'Hay subidas en curso. Espera a que finalicen antes de actualizar.';
            alert(busyMsg);
            return;
        }

        if (isDownloading) {
            const busyMsg = window.TeleVaultI18n ? window.TeleVaultI18n.t('modals.updater.busy_downloads', 'Hay descargas en curso. Espera a que finalicen antes de actualizar.') : 'Hay descargas en curso. Espera a que finalicen antes de actualizar.';
            alert(busyMsg);
            return;
        }

        isInstallingUpdate = true;

        if (updateConfirmView) updateConfirmView.classList.add('hidden');
        if (updateProgressView) updateProgressView.classList.remove('hidden');
        if (btnCloseUpdateModal) btnCloseUpdateModal.style.display = 'none';

        if (updateProgressBar) updateProgressBar.style.width = '20%';
        if (updateProgressStatus) updateProgressStatus.textContent = 'Descargando paquete oficial de actualización desde GitHub...';

        const tag = cachedUpdateInfo?.latest_version || null;
        const url = cachedUpdateInfo?.download_url || null;

        try {
            // Simular avance inicial fluido
            setTimeout(() => {
                if (isInstallingUpdate && updateProgressBar) updateProgressBar.style.width = '55%';
                if (isInstallingUpdate && updateProgressStatus) updateProgressStatus.textContent = 'Verificando e instalando archivos actualizados...';
            }, 800);

            const result = await window.TelegramAPI.installUpdate(tag, url);

            if (updateProgressBar) updateProgressBar.style.width = '100%';
            if (updateProgressStatus) {
                updateProgressStatus.textContent = window.TeleVaultI18n
                    ? window.TeleVaultI18n.t('modals.updater.install_success', '¡Actualización completada con éxito! Reiniciando la aplicación...')
                    : '¡Actualización completada con éxito! Reiniciando la aplicación...';
                updateProgressStatus.style.color = '#10b981';
            }

            addLog(`TeleVault se ha actualizado con éxito a la versión ${result.version || tag}.`, 'success');

            // Countdown para recarga automática
            let countdown = 2;
            const targetUrl = window.location.origin + window.location.pathname + '?v=' + Date.now();
            if (updateProgressStatus) {
                const reloadText = window.TeleVaultI18n
                    ? window.TeleVaultI18n.t('modals.updater.reloading_in', `Recargando en ${countdown}s...`, { n: countdown })
                    : `Recargando en ${countdown}s...`;
                updateProgressStatus.textContent = `${result.message || 'Actualizado correctamente.'} ${reloadText}`;
            }

            const timer = setInterval(() => {
                countdown--;
                if (updateProgressStatus) {
                    const reloadText = window.TeleVaultI18n
                        ? window.TeleVaultI18n.t('modals.updater.reloading_in', `Recargando en ${countdown}s...`, { n: countdown })
                        : `Recargando en ${countdown}s...`;
                    updateProgressStatus.textContent = `${result.message || 'Actualizado correctamente.'} ${reloadText}`;
                }
                if (countdown <= 0) {
                    clearInterval(timer);
                    pollServerAndReload();
                }
            }, 1000);

        } catch (err) {
            console.error('[Updater] Error durante la instalación:', err);
            isInstallingUpdate = false;
            if (btnCloseUpdateModal) btnCloseUpdateModal.style.display = '';
            if (updateProgressBar) updateProgressBar.style.width = '0%';
            if (updateProgressStatus) {
                updateProgressStatus.textContent = `${window.TeleVaultI18n ? window.TeleVaultI18n.t('modals.updater.install_error', 'Error durante la actualización') : 'Error durante la actualización'}: ${err.message}`;
                updateProgressStatus.style.color = '#ef4444';
            }
            addLog(`Fallo al instalar actualización: ${err.message}`, 'error');
        }
    }

    async function pollServerAndReload() {
        let attempts = 0;
        const maxAttempts = 25;
        const targetUrl = window.location.origin + window.location.pathname + '?v=' + Date.now();
        const check = async () => {
            attempts++;
            try {
                const res = await fetch('/api/health?_t=' + Date.now(), { cache: 'no-store' });
                if (res.status === 200 || res.status === 401) {
                    window.location.replace(targetUrl);
                    return;
                }
            } catch (e) {
                // Servidor reiniciándose
            }

            if (attempts < maxAttempts) {
                setTimeout(check, 600);
            } else {
                window.location.replace(targetUrl);
            }
        };
        setTimeout(check, 800);
    }

    if (btnUpdateNotification) {
        btnUpdateNotification.addEventListener('click', () => {
            openUpdateModal(cachedUpdateInfo);
        });
    }

    if (btnAboutCheckUpdate) {
        btnAboutCheckUpdate.addEventListener('click', () => {
            if (cachedUpdateInfo?.update_available) {
                closeAboutModal();
                openUpdateModal(cachedUpdateInfo);
            } else {
                checkAppUpdates(true, false);
            }
        });
    }

    if (btnCloseUpdateModal) btnCloseUpdateModal.addEventListener('click', closeUpdateModal);
    if (btnCancelUpdateModal) btnCancelUpdateModal.addEventListener('click', closeUpdateModal);
    if (btnConfirmInstallUpdate) btnConfirmInstallUpdate.addEventListener('click', handleInstallUpdate);

    if (updateModal) {
        updateModal.addEventListener('click', (e) => {
            if (e.target === updateModal) closeUpdateModal();
        });
    }

    window.addEventListener('televault:langchange', () => {
        if (cachedUpdateInfo) {
            updateUiForUpdateInfo(cachedUpdateInfo);
        }
    });

    // Tecla Escape para cerrar cualquier modal abierto de forma intuitiva
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (updateModal && !updateModal.classList.contains('hidden') && !isInstallingUpdate) {
                closeUpdateModal();
                return;
            }
            if (aboutModal && !aboutModal.classList.contains('hidden')) closeAboutModal();
            if (guideModal && !guideModal.classList.contains('hidden')) closeGuideModal();
            if (channelsModal && !channelsModal.classList.contains('hidden')) closeChannelsModal();
            if (botConfigModal && !botConfigModal.classList.contains('hidden')) closeBotConfigModal();
            if (deleteModal && !deleteModal.classList.contains('hidden')) {
                deleteModal.classList.add('hidden');
                fileToDelete = null;
            }
            if (downloadTopicModal && !downloadTopicModal.classList.contains('hidden')) {
                downloadTopicModal.classList.add('hidden');
                pendingTopicDownload = null;
            }
        }
    });

    btnClearLog.addEventListener('click', () => { logConsole.innerHTML = ''; });

    init();
});
