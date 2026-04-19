const OPEN_SUBTITLES_API_URL = "https://api.opensubtitles.com/api/v1";

// ストレージから設定を読み込んでヘッダー書き換えルールを更新する関数
async function updateNetRequestRules() {
    const res = await chrome.storage.local.get(['global_settings']);
    const settings = res.global_settings || {};
    const userAgent = settings.userAgent || "TemporaryUserAgent";

    const rules = [{
        id: 1,
        priority: 1,
        action: {
            type: "modifyHeaders",
            requestHeaders: [
                { header: "User-Agent", operation: "set", value: userAgent },
                { header: "Origin", operation: "remove" }
            ]
        },
        condition: {
            urlFilter: "https://api.opensubtitles.com/*",
            resourceTypes: ["xmlhttprequest"]
        }
    }];

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1],
        addRules: rules
    });
}

// インストール・更新時に実行
chrome.runtime.onInstalled.addListener(updateNetRequestRules);

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateSettings") {
        updateNetRequestRules().then(() => sendResponse({ success: true }));
        return true;
    }

    if (request.action === "searchSubtitles") {
        handleSearch(request, sendResponse);
        return true;
    }

    if (request.action === "downloadSubtitle") {
        handleDownload(request, sendResponse);
        return true;
    }
});

async function handleSearch(request, sendResponse) {
    try {
        const res = await chrome.storage.local.get(['global_settings']);
        const apiKey = res.global_settings?.apiKey;
        if (!apiKey) throw new Error("APIキーが設定されていません");

        let url = `${OPEN_SUBTITLES_API_URL}/subtitles?query=${encodeURIComponent(request.query)}&languages=en&order_by=download_count`;
        if (request.year) url += `&year=${encodeURIComponent(request.year)}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Api-Key': apiKey, 'Accept': 'application/json' }
        });
        const data = await response.json();
        sendResponse({ success: true, data });
    } catch (e) {
        sendResponse({ success: false, error: e.message });
    }
}

async function handleDownload(request, sendResponse) {
    try {
        const res = await chrome.storage.local.get(['global_settings']);
        const { apiKey, userAgent } = res.global_settings || {};
        
        const response = await fetch(`${OPEN_SUBTITLES_API_URL}/download`, {
            method: 'POST',
            headers: { 'Api-Key': apiKey, 'User-Agent': userAgent, 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_id: request.fileId })
        });
        const downloadInfo = await response.json();
        
        const srtResponse = await fetch(downloadInfo.link, { headers: { 'User-Agent': userAgent } });
        const text = await srtResponse.text();
        sendResponse({ success: true, data: text });
    } catch (e) {
        sendResponse({ success: false, error: e.message });
    }
}