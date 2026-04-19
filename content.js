let overlay, textNode;
let subtitles = [];
let srtContent = "";
let fileName = "未選択";
let subId = ""; // 字幕の一意なID
let offset = 0;
let bottomPercent = 15;
let fontSize = 14;
let isCooldown = false;
let targetSubIndex = 0;

// --- ユーティリティ ---
const getVideoKey = () => {
    const path = window.location.pathname;
    // URLからSIDとEDを直接抜き出す
    const match = path.match(/\/play\/(SID\d+)\/(ED\d+)/);
    
    if (match) {
        return `video_${match[1]}_${match[2]}`;
    }
    
    // play以外（詳細画面など）の場合はパスを整形して返す
    return "video_" + path.replace(/\//g, "_");
};

const saveToStorage = () => {
    const key = getVideoKey();
    const data = {
        savedSrt: srtContent, 
        savedFileName: fileName,
        savedSubId: subId,
        savedOffset: offset, 
        savedBottom: bottomPercent, 
        savedFontSize: fontSize
    };
    chrome.storage.local.set({ [key]: data });
};

const timeToSeconds = (timeString) => {
    const [h, m, s] = timeString.split(':');
    const [sec, ms] = s.split(',');
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(sec) + parseInt(ms) / 1000;
};

const formatSeconds = (totalSeconds) => {
    if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00:00";
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

const parseSRT = (data) => {
    const regex = /(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n([\s\S]*?)(?=\n\n|\n*$)/g;
    const subs = [];
    let m;
    while ((m = regex.exec(data)) !== null) {
        subs.push({
            start: timeToSeconds(m[2]),
            end: timeToSeconds(m[3]),
            text: m[4].replace(/\n/g, '<br>')
        });
    }
    return subs;
};

// --- UI作成 ---
const setupUI = () => {
    if (document.getElementById("sub-pro-panel")) return;

    const video = document.querySelector('video');
    const container = video.parentElement;

    // 1. 字幕表示エリア
    overlay = document.createElement('div');
    overlay.style.cssText = `position: absolute; bottom: ${bottomPercent}%; left: 0; width: 100%; display: flex; justify-content: center; pointer-events: none; z-index: 2147483647;`;
    textNode = document.createElement('div');
    textNode.id = "main-sub-display";
    textNode.style.cssText = `text-align: center; color: white; font-size: ${fontSize}px; font-weight: bold; text-shadow: 2px 2px 4px black; line-height: 1.4; font-family: sans-serif; padding: 0 20px;`;
    overlay.appendChild(textNode);
    container.appendChild(overlay);

    // 2. 設定パネル
    const panel = document.createElement('div');
    panel.id = "sub-pro-panel";
    panel.style.cssText = `position: absolute; bottom: 150px; right: 20px; z-index: 2147483647; background: rgba(0, 0, 0, 0.95); border-radius: 12px; padding: 15px; color: white; width: 400px; font-family: sans-serif; transition: opacity 0.3s; opacity: 0; pointer-events: none; border: 1px solid #444; box-shadow: 0 0 20px rgba(0,0,0,0.5);`;

    ["click", "mousedown", "dblclick"].forEach(ev => panel.addEventListener(ev, e => e.stopPropagation()));

    const closeBtn = document.createElement('div');
    closeBtn.innerText = "×";
    closeBtn.style.cssText = "position: absolute; top: 8px; right: 12px; cursor: pointer; color: #888; font-size: 20px; font-weight: bold;";
    closeBtn.onclick = (e) => { e.stopPropagation(); panel.style.opacity = "0"; panel.style.pointerEvents = "none"; isCooldown = true; setTimeout(() => { isCooldown = false; }, 1000); };
    panel.appendChild(closeBtn);

    // --- パネル表示・非表示のロジック ---
    let hideTimeout;
    let isMouseOverPanel = false; // パネルの上にマウスがあるか

    const showPanel = () => { 
        if (isCooldown) return; 
        panel.style.opacity = "1"; 
        panel.style.pointerEvents = "auto"; 
        resetHideTimer(); // 表示・移動のたびにタイマーをリセット
    };

    const resetHideTimer = () => {
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => { 
            const isInputFocused = document.activeElement.tagName === 'INPUT';
            
            // 「パネルにホバーしていない」かつ「入力欄にフォーカスしていない」場合のみ消す
            if (!isMouseOverPanel && !isInputFocused) { 
                panel.style.opacity = "0"; 
                panel.style.pointerEvents = "none"; 
            } else {
                // 操作中の場合は、消さずにタイマーを再セットして待機
                resetHideTimer();
            }
        }, 3000); // U-NEXTの標準バーに合わせて3秒に設定
    };

    // コンテナ全体（動画画面）での動きを監視
    container.addEventListener('mousemove', showPanel);
    
    // パネル自体のホバー状態を管理
    panel.addEventListener('mouseenter', () => {
        isMouseOverPanel = true;
        showPanel();
    });
    panel.addEventListener('mouseleave', () => {
        isMouseOverPanel = false;
        resetHideTimer();
    });

    // 入力欄（検索やSync設定）からフォーカスが外れたときにもチェック
    panel.addEventListener('focusout', () => {
        // 少し遅延させて、次のフォーカス先を確認してから判断
        setTimeout(resetHideTimer, 100);
    });


    // タイトル
    const title = document.createElement('div');
    title.innerHTML = "🎛 Subtitle Pro";
    title.style.cssText = "font-weight: bold; color: #00ffcc; margin-bottom: 8px; font-size: 14px;";
    panel.appendChild(title);

    // 動画時間表示
    const timeBox = document.createElement('div');
    timeBox.style.cssText = "background: #111; border-radius: 8px; padding: 6px 10px; margin-bottom: 10px; border: 1px solid #333; display: flex; justify-content: space-between; align-items: center;";
    timeBox.innerHTML = `<span style="font-size:10px; color:#aaa;">Video Time:</span><span id="video-time-val" style="font-family:monospace; font-weight:bold; color:#00ffcc;">00:00:00</span>`;
    panel.appendChild(timeBox);

    // 自動同期マネージャー
    const helperBox = document.createElement('div');
    helperBox.style.cssText = "background: #222; border-radius: 8px; padding: 10px; margin-bottom: 12px; border: 1px solid #333;";
    const subPreview = document.createElement('div');
    subPreview.id = "sub-preview-display";
    subPreview.style.cssText = "font-size: 11px; height: 36px; overflow: hidden; color: #fff; margin-bottom: 8px; text-align: center; background: #111; padding: 4px; border-radius: 4px; border: 1px solid #444;";
    helperBox.appendChild(subPreview);

    window.updateManagerPreview = () => {
        const preview = document.getElementById("sub-preview-display");
        if (preview && subtitles.length > 0) {
            const s = subtitles[targetSubIndex];
            preview.innerHTML = `<span style="color:#ffdd00;">[SRT: ${formatSeconds(s.start)}]</span><br>${s.text.replace(/<br>/g, ' ')}`;
        }
    };

    const helperBtns = document.createElement('div');
    helperBtns.style.cssText = "display: flex; gap: 4px;";
    const prevBtn = document.createElement('button'); prevBtn.innerText = "◀";
    const nextBtn = document.createElement('button'); nextBtn.innerText = "▶";
    const syncNowBtn = document.createElement('button');
    syncNowBtn.innerText = "このセリフに固定";
    syncNowBtn.style.cssText = "flex-grow: 1; background: #e50914; color: white; border: none; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer;";
    prevBtn.onclick = () => { if (targetSubIndex > 0) { targetSubIndex--; window.updateManagerPreview(); } };
    nextBtn.onclick = () => { if (targetSubIndex < subtitles.length - 1) { targetSubIndex++; window.updateManagerPreview(); } };
    syncNowBtn.onclick = () => { if (subtitles.length > 0) { const s = subtitles[targetSubIndex]; offset = parseFloat((s.start - video.currentTime).toFixed(1)); document.getElementById("sync-input-field").value = offset; saveToStorage(); } };
    [prevBtn, nextBtn].forEach(b => b.style.cssText = "background: #444; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer;");
    helperBtns.appendChild(prevBtn); helperBtns.appendChild(syncNowBtn); helperBtns.appendChild(nextBtn);
    helperBox.appendChild(helperBtns);
    panel.appendChild(helperBox);

    // ファイル選択
    const fileRow = document.createElement('div');
    fileRow.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-top: 5px; border-top: 1px solid #333;";
    const fileNameLabel = document.createElement('span');
    fileNameLabel.id = "file-name-label";
    fileNameLabel.style.cssText = "font-size: 11px; color: #aaa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 270px;";
    fileNameLabel.innerText = "📄 " + fileName;
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = '.srt'; fileInput.style.display = 'none';
    
    const btnWrapper = document.createElement('div'); // ボタンを横に並べるための親
    btnWrapper.style.cssText = "display: flex; gap: 4px;";
    
    const fileIconBtn = document.createElement('button');
    fileIconBtn.innerHTML = "📂 変更";
    fileIconBtn.style.cssText = "background: #333; color: #00ffcc; border: 1px solid #00ffcc; border-radius: 4px; padding: 2px 8px; font-size: 10px; cursor: pointer;";
    fileIconBtn.onclick = () => fileInput.click();

    // 【新規】手動クリアボタン
    const clearBtn = document.createElement('button');
    clearBtn.innerHTML = "🗑️ クリア";
    clearBtn.style.cssText = "background: #333; color: #ff4444; border: 1px solid #ff4444; border-radius: 4px; padding: 2px 8px; font-size: 10px; cursor: pointer;";
    clearBtn.onclick = () => {
        const key = getVideoKey();
        chrome.storage.local.remove(key, () => {
            loadVideoSettings(true); // データを消してからUIを再読み込み
        });
    };

    btnWrapper.appendChild(fileIconBtn);
    btnWrapper.appendChild(clearBtn);

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        fileName = file.name; subId = "local_" + file.name; fileNameLabel.innerText = "📄 " + fileName;
        const reader = new FileReader();
        reader.onload = (ev) => { srtContent = ev.target.result; subtitles = parseSRT(srtContent); saveToStorage(); window.updateManagerPreview(); };
        reader.readAsText(file);
    };

    fileRow.appendChild(fileNameLabel);
    fileRow.appendChild(btnWrapper);
    fileRow.appendChild(fileInput);

    panel.appendChild(fileRow);

    // 字幕検索セクション
    const searchSection = document.createElement('div');
    searchSection.style.cssText = "margin-bottom: 10px; padding-top: 5px; border-top: 1px solid #333;";
    
    let currentSelectedItem = null;
    const searchBar = document.createElement('div');
    searchBar.style.cssText = "display: flex; gap: 4px; margin-bottom: 5px; align-items: center;";
    
    const searchInput = document.createElement('input');
    searchInput.placeholder = "作品名...";
    searchInput.style.cssText = "flex-grow: 1; background: #222; color: white; border: 1px solid #444; border-radius: 4px; padding: 4px 8px; font-size: 11px; width: 100px;";
    ["keydown", "keyup", "keypress"].forEach(ev => searchInput.addEventListener(ev, e => e.stopPropagation()));

    const yearInput = document.createElement('input');
    yearInput.placeholder = "年";
    yearInput.style.cssText = "width: 45px; background: #222; color: white; border: 1px solid #444; border-radius: 4px; padding: 4px 5px; font-size: 11px;";
    ["keydown", "keyup", "keypress"].forEach(ev => yearInput.addEventListener(ev, e => e.stopPropagation()));

    const searchBtn = document.createElement('button');
    searchBtn.innerText = "検索";
    searchBtn.style.cssText = "background: #00ffcc; color: black; border: none; border-radius: 4px; padding: 4px 10px; font-size: 11px; font-weight: bold; cursor: pointer; flex-shrink: 0;";

    // 【新規】API設定切り替え用の鍵アイコンボタン
    const settingsToggleBtn = document.createElement('button');
    settingsToggleBtn.innerText = "🔑";
    settingsToggleBtn.title = "API設定を表示/非表示";
    settingsToggleBtn.style.cssText = "background: #333; color: #aaa; border: 1px solid #444; border-radius: 4px; padding: 4px 6px; font-size: 11px; cursor: pointer; flex-shrink: 0;";
    
    const resultList = document.createElement('div');
    resultList.style.cssText = "max-height: 200px; overflow-y: auto; background: #111; border-radius: 4px; font-size: 10px; display: none; border: 1px solid #333;";

    const hideResultBtn = document.createElement('button');
    hideResultBtn.innerText = "✖";
    hideResultBtn.style.cssText = "background: #333; color: #888; border: none; border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer; display: none;";
    hideResultBtn.onclick = () => {
        resultList.style.display = "none";
        hideResultBtn.style.display = "none";
        settingsToggleBtn.style.display = "block";
    };

    [searchInput, yearInput].forEach(input => {
        input.onkeydown = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                searchBtn.click();
            }
        };
    });

    searchBtn.onclick = async () => {
        const query = searchInput.value.trim();
        const year = yearInput.value.trim();
        if (!query) return;
        
        searchBtn.innerText = "Searching...";
        searchBtn.disabled = true;
        resultList.innerHTML = '<div style="padding:5px; color:#aaa;">検索中...</div>';
        resultList.style.display = "block";
        hideResultBtn.style.display = "block";
        settingsToggleBtn.style.display = "none";
        
        // 念のため設定セクションも閉じておく
        settingsSection.style.display = "none";

        chrome.runtime.sendMessage({ action: "searchSubtitles", query, year }, (response) => {
            searchBtn.innerText = "検索";
            searchBtn.disabled = false;

            if (response && response.success && response.data.data) {
                resultList.innerHTML = "";
                let hits = response.data.data;
                if (hits.length === 0) {
                    resultList.innerHTML = '<div style="padding:5px; color:#aaa;">見つかりませんでした</div>';
                }
                hits.sort((a, b) => (b.attributes.download_count || 0) - (a.attributes.download_count || 0));

                hits.forEach(hit => {
                    const item = document.createElement('div');
                    const attr = hit.attributes;
                    const hitId = hit.id;
                    const isUsing = subId === hitId;

                    item.style.cssText = `padding: 8px; border-bottom: 1px solid #222; cursor: pointer; display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; background: ${isUsing ? "#222" : "transparent"};`;
                    
                    let uploaderName = attr.uploader?.name || "anonymous";
                    let rank = attr.uploader?.rank || "";
                    let uploaderDisplay = "";
                    const lowerName = uploaderName.toLowerCase();
                    if (lowerName === "os-auto" || lowerName === "anonymous") uploaderDisplay = uploaderName;
                    else uploaderDisplay = rank || "member";

                    item.innerHTML = `
                        <div style="flex-grow:1; display:flex; flex-direction:column; gap:2px;">
                            <div style="color:${isUsing ? "#00ffcc" : "#eee"}; line-height:1.3; font-size:11px; word-break:break-all;">${attr.release}</div>
                            <div style="display:flex; gap:8px; font-size:9px; color:#aaa;">
                                <span>🌐 ${attr.language}</span>
                                <span>👤 ${uploaderDisplay}</span>
                                <span>📥 ${attr.download_count}</span>
                            </div>
                        </div>
                        <span style="color:#00ffcc; font-weight:bold; flex-shrink:0; align-self:center; font-size:11px;">${isUsing ? "使用中" : "DL"}</span>
                    `;

                    item.onclick = () => {
                        const fileId = attr.files[0].file_id;
                        if (currentSelectedItem) currentSelectedItem.style.background = "transparent";
                        currentSelectedItem = item;
                        item.style.background = "#222"; 

                        const originalHTML = item.innerHTML;
                        item.innerHTML = '<div style="padding:10px; color:#00ffcc; font-size:10px; text-align:center; width:100%;">Downloading...</div>';
                        
                        chrome.runtime.sendMessage({ action: "downloadSubtitle", fileId }, (dlResponse) => {
                            if (dlResponse && dlResponse.success) {
                                srtContent = dlResponse.data;
                                subtitles = parseSRT(srtContent);
                                fileName = attr.release + ".srt";
                                subId = hitId;
                                document.getElementById("file-name-label").innerText = "✅ " + fileName;
                                document.getElementById("file-name-label").style.color = "#00ffcc";
                                saveToStorage();
                                window.updateManagerPreview();
                                item.innerHTML = '<div style="padding:10px; color:#00ffcc; font-size:10px; text-align:center; width:100%;">✅ Applied</div>';
                                
                                setTimeout(() => {
                                    item.innerHTML = originalHTML;
                                    document.getElementById("file-name-label").style.color = "#aaa";
                                    document.getElementById("file-name-label").innerText = "📄 " + fileName;
                                    searchBtn.click();
                                }, 2000);
                            } else {
                                console.error("Download failed:", dlResponse ? dlResponse.error : "Unknown");
                                item.style.background = "transparent";
                                item.innerHTML = originalHTML;
                                alert("ダウンロード失敗");
                            }
                        });
                    };
                    resultList.appendChild(item);
                });
            } else {
                resultList.innerHTML = '<div style="padding:5px; color:#ff4444;">検索エラーが発生しました</div>';
            }
        });
    };

    // 鍵アイコンクリックで表示を切り替え
    settingsToggleBtn.onclick = () => {
        const isHidden = settingsSection.style.display === "none";
        settingsSection.style.display = isHidden ? "block" : "none";
        settingsToggleBtn.style.borderColor = isHidden ? "#00ffcc" : "#444";
    };

    searchBar.appendChild(searchInput);
    searchBar.appendChild(yearInput);
    searchBtn.onclick = searchBtn.onclick; // Ensure binding
    searchBar.appendChild(searchBtn);
    searchBar.appendChild(settingsToggleBtn); 
    searchBar.appendChild(hideResultBtn);
    searchSection.appendChild(searchBar);
    searchSection.appendChild(resultList);
    panel.appendChild(searchSection);

    // --- setupUI 関数内の適切な場所（パネルの下部など）に追加 ---

    const settingsSection = document.createElement('div');
    settingsSection.style.cssText = "margin-top: 15px; padding-top: 10px; border-top: 2px solid #444; display: none;";

    const settingsTitle = document.createElement('div');
    settingsTitle.innerText = "🔑 API Settings";
    settingsTitle.style.cssText = "font-size: 11px; color: #00ffcc; margin-bottom: 8px; font-weight: bold;";
    settingsSection.appendChild(settingsTitle);

    const createSettingInput = (placeholder, key) => {
        const input = document.createElement('input');
        input.type = "text";
        input.placeholder = placeholder;
        input.style.cssText = "width: 100%; background: #111; color: white; border: 1px solid #444; border-radius: 4px; padding: 4px 8px; font-size: 10px; margin-bottom: 5px; box-sizing: border-box;";
        ["keydown", "keyup", "keypress"].forEach(ev => input.addEventListener(ev, e => e.stopPropagation()));
        return input;
    };

    const userAgentInput = createSettingInput("User Agent (App Name)", "userAgent");
    const apiKeyInput = createSettingInput("OpenSubtitles API Key", "apiKey");
    const saveSettingsBtn = document.createElement('button');
    saveSettingsBtn.innerText = "設定を保存";
    saveSettingsBtn.style.cssText = "width: 100%; background: #444; color: #00ffcc; border: 1px solid #00ffcc; border-radius: 4px; padding: 4px; font-size: 10px; cursor: pointer; font-weight: bold;";

    // 保存処理
    saveSettingsBtn.onclick = () => {
        const globalSettings = {
            userAgent: userAgentInput.value.trim(),
            apiKey: apiKeyInput.value.trim()            
        };
        chrome.storage.local.set({ global_settings: globalSettings }, () => {
            // background.js にルール更新を通知
            chrome.runtime.sendMessage({ action: "updateSettings" }, (response) => {
                if (response?.success) {
                    saveSettingsBtn.innerText = "✅ 保存完了";
                    saveSettingsBtn.style.background = "#004400";
                    setTimeout(() => {
                        saveSettingsBtn.innerText = "設定を保存";
                        saveSettingsBtn.style.background = "#444";
                    }, 2000);
                }
            });
        });
    };

    // 初期値の読み込み
    chrome.storage.local.get(['global_settings'], (res) => {
        if (res.global_settings) {
            userAgentInput.value = res.global_settings.userAgent || "";
            apiKeyInput.value = res.global_settings.apiKey || "";
        }
    });

    settingsSection.appendChild(userAgentInput);
    settingsSection.appendChild(apiKeyInput);
    settingsSection.appendChild(saveSettingsBtn);
    panel.appendChild(settingsSection);

    // 手動設定項目
    const createControlRow = (label, currentVal, step, id, onChange) => {
        const row = document.createElement('div');
        row.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-top: 8px;";
        const name = document.createElement('span'); name.innerText = label; name.style.fontSize = "12px";
        const wrap = document.createElement('div'); wrap.style.display = "flex";
        const input = document.createElement('input');
        input.id = id; input.type = "text"; input.value = currentVal;
        input.style.cssText = "width: 65px; background: #222; color: white; border: 1px solid #555; text-align: center; font-size: 12px; margin-right: 5px;";
        ["keydown", "keyup", "keypress"].forEach(ev => input.addEventListener(ev, e => e.stopPropagation()));
        
        const btnMinus = document.createElement('button'); btnMinus.innerText = "－";
        const btnPlus = document.createElement('button'); btnPlus.innerText = "＋";
        
        const commitValue = () => { 
            const parsed = parseFloat(parseFloat(input.value).toFixed(1)); 
            if (!isNaN(parsed)) { 
                if (id === "sync-input-field") {
                    offset = parsed;
                    updateSubtitleImmediately();
                }
                onChange(parsed); 
                input.value = parsed; 
                saveToStorage(); 
            } 
        };

        input.onchange = commitValue;
        input.onkeydown = (e) => { if (e.key === "Enter") { e.target.blur(); } };
        
        btnMinus.onclick = () => { 
            let s = step;
            if (id === "pos-input-field") s = 3;
            if (id === "size-input-field") s = 5;
            input.value = (parseFloat(input.value || 0) - s).toFixed(1); 
            commitValue(); 
        };
        btnPlus.onclick = () => { 
            let s = step;
            if (id === "pos-input-field") s = 3;
            if (id === "size-input-field") s = 5;
            input.value = (parseFloat(input.value || 0) + s).toFixed(1); 
            commitValue(); 
        };

        [btnMinus, btnPlus].forEach(b => b.style.cssText = "padding: 2px 8px; background: #444; color: white; border: none; cursor: pointer; border-radius: 4px; font-size: 12px; margin-left: 2px;");
        wrap.appendChild(input);
        
        const toggleWrap = document.createElement('div');
        toggleWrap.style.cssText = "display: flex; flex-direction: column; gap: 2px; margin-left: 4px;";
        const upBtn = document.createElement('button'); upBtn.innerText = "▲";
        const downBtn = document.createElement('button'); downBtn.innerText = "▼";
        [upBtn, downBtn].forEach(b => b.style.cssText = "padding: 0 4px; background: #333; color: #aaa; border: none; cursor: pointer; font-size: 8px; height: 10px; border-radius: 2px; line-height: 1;");
        
        const tStep = (id === "sync-input-field") ? 0.1 : 1;
        upBtn.onclick = () => { input.value = (parseFloat(input.value || 0) + tStep).toFixed(1); commitValue(); };
        downBtn.onclick = () => { input.value = (parseFloat(input.value || 0) - tStep).toFixed(1); commitValue(); };
        
        toggleWrap.appendChild(upBtn); toggleWrap.appendChild(downBtn);
        wrap.appendChild(toggleWrap);
        wrap.appendChild(btnMinus); wrap.appendChild(btnPlus);
        row.appendChild(name); row.appendChild(wrap);
        panel.appendChild(row);
    };

    createControlRow("Sync (秒)", offset, 0.5, "sync-input-field", (v) => offset = v);
    createControlRow("Pos (%)", bottomPercent, 2, "pos-input-field", (v) => { bottomPercent = v; overlay.style.bottom = v + "%"; });
    createControlRow("Size (px)", fontSize, 2, "size-input-field", (v) => { fontSize = v; textNode.style.fontSize = v + "px"; });

    container.appendChild(panel);
    
    window.updateSubtitleImmediately = () => {
        if (!textNode || subtitles.length === 0) return;
        const vid = document.querySelector('video');
        if (!vid) return;
        const now = vid.currentTime + offset;
        const currentIndex = subtitles.findIndex(s => now >= s.start && now <= s.end);
        if (currentIndex !== -1) {
            textNode.innerHTML = subtitles[currentIndex].text;
            targetSubIndex = currentIndex;
            if (window.updateManagerPreview) window.updateManagerPreview();
        } else {
            textNode.innerHTML = "";
        }
    };

    window.updateManagerPreview();
};

// --- 監視・起動 ---
const loadVideoSettings = (isForceUpdateUI = false, callback = null) => {
    const key = getVideoKey();
    chrome.storage.local.get([key], (res) => {
        const data = res[key];
        const hasData = !!data;

        if (hasData) {
            srtContent = data.savedSrt || "";
            subtitles = srtContent ? parseSRT(srtContent) : [];
            fileName = data.savedFileName || "未選択";
            subId = data.savedSubId || "";
            offset = data.savedOffset !== undefined ? data.savedOffset : 0;
            bottomPercent = data.savedBottom !== undefined ? data.savedBottom : 15;
            fontSize = data.savedFontSize !== undefined ? data.savedFontSize : 14;
        } else {
            // 【新規】データがない場合は、字幕情報のみをクリアする
            srtContent = "";
            subtitles = [];
            fileName = "未選択";
            subId = "";
            offset = 0;
            targetSubIndex = 0;
            // ※フォントサイズや位置(bottomPercent)はユーザーの好みなので、あえて残しておくのが親切だぞ
        }

        const updateUI = () => {
            const fileNameLabel = document.getElementById("file-name-label");
            const syncInput = document.getElementById("sync-input-field");
            // ... (既存のUI更新処理)
            if (fileNameLabel) {
                fileNameLabel.innerText = "📄 " + fileName;
                fileNameLabel.style.color = hasData ? "#00ffcc" : "#aaa";
            }
            if (syncInput) syncInput.value = offset;
            if (textNode) textNode.innerHTML = ""; // 画面上の字幕を消去
        };

        if (document.getElementById("sub-pro-panel") || isForceUpdateUI) {
            updateUI();
        }
        if (callback) callback(hasData);
    });
};


const startApp = () => {
    let lastKey = "";
    const checkPage = () => {
        const path = window.location.pathname;
        const currentKey = getVideoKey();

        if (path.startsWith("/play/")) {
            if (currentKey !== lastKey) {
                lastKey = currentKey;
                loadVideoSettings(true);
                initVideoObserver();
            }
        } else {
            lastKey = "";
        }
    };


    const initVideoObserver = () => {
        const checkVideo = setInterval(() => {
            const video = document.querySelector('video');
            if (video && video.parentElement) {
                clearInterval(checkVideo);
                setupUI();
                
                if (!video.dataset.subProInited) {
                    video.dataset.subProInited = "true";
                    video.addEventListener('timeupdate', () => {
                        const timeDisp = document.getElementById("video-time-val");
                        if (timeDisp) timeDisp.innerText = formatSeconds(video.currentTime);

                        if (!textNode || subtitles.length === 0) return;
                        const now = video.currentTime + offset;
                        const currentIndex = subtitles.findIndex(s => now >= s.start && now <= s.end);
                        if (currentIndex !== -1) {
                            textNode.innerHTML = subtitles[currentIndex].text;
                            targetSubIndex = currentIndex;
                            if (window.updateManagerPreview) window.updateManagerPreview();
                        } else {
                            textNode.innerHTML = "";
                        }
                    });
                }
            }
        }, 1000);
    };

    setInterval(checkPage, 1000);
    checkPage();
};

startApp();