import { CONFIG } from './config.js';

const OPEN_SUBTITLES_API_URL = "https://api.opensubtitles.com/api/v1";

const API_KEY = CONFIG.OPEN_SUBTITLES_API_KEY;
const USER_AGENT = CONFIG.USER_AGENT;

// 拡張機能起動時にルールを設定
chrome.runtime.onInstalled.addListener(() => {
    const rules = [{
        id: 1,
        priority: 1,
        action: {
            type: "modifyHeaders",
            requestHeaders: [
                { header: "User-Agent", operation: "set", value: USER_AGENT },
                { header: "Origin", operation: "remove" } // Originを消してTalendに近づける
            ]
        },
        condition: {
            urlFilter: "https://api.opensubtitles.com/*",
            resourceTypes: ["xmlhttprequest"]
        }
    }];
    
    // 既存のルールをクリアして新しいルールを適用
    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1],
        addRules: rules
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "searchSubtitles") {
        searchSubtitles(request.query, request.year)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; 
    }

    if (request.action === "downloadSubtitle") {
        downloadSubtitle(request.fileId)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

async function searchSubtitles(query, year) {
    let url = `${OPEN_SUBTITLES_API_URL}/subtitles?query=${encodeURIComponent(query)}&languages=en&order_by=download_count`;
    
    if (year) {
        url += `&year=${encodeURIComponent(year)}`;
    }
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Api-Key': API_KEY,
            'Accept': 'application/json'
            // User-AgentはdeclarativeNetRequestが自動で付けてくれる
        }
    });

    if (!response.ok) {
        throw new Error(`Search failed: ${response.status} ${response.statusText}`);
    }
    return await response.json();
}

async function downloadSubtitle(fileId) {
    const downloadUrl = `${OPEN_SUBTITLES_API_URL}/download`;
    const response = await fetch(downloadUrl, {
        method: 'POST',
        headers: {
            'Api-Key': API_KEY,
            'User-Agent': USER_AGENT, 
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ file_id: fileId })
    });

    if (!response.ok) {
        throw new Error(`Failed to get download link: ${response.status} ${response.statusText}`);
    }

    const downloadInfo = await response.json();
    
    const srtResponse = await fetch(downloadInfo.link, {
        headers: {
            'User-Agent': USER_AGENT
        }
    });
    
    if (!srtResponse.ok) {
        throw new Error(`Failed to download SRT file`);
    }
    
    return await srtResponse.text();
}