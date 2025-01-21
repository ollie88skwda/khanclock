// popup.js
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateDisplay(time) {
    document.getElementById('countdown-display').textContent = formatTime(time);
}

async function injectContentScripts(tabId) {
    try {
        // Inject config.js first
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['config.js']
        });
        
        // Then inject content.js
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        });
        
        return true;
    } catch (error) {
        console.error('Error injecting scripts:', error);
        return false;
    }
}

// Initialize display with CONFIG duration
document.addEventListener('DOMContentLoaded', async () => {
    const statusMessage = document.getElementById('status-message');
    const startButton = document.getElementById('start-timer');
    const timerDisplay = document.getElementById('countdown-display');

    // Set initial display
    updateDisplay(CONFIG.TIMER_DURATION);

    // Check if we're on a test-prep page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url.includes('khanacademy.org/test-prep')) {
        statusMessage.textContent = 'Timer only works on SAT test-prep pages';
        statusMessage.style.color = '#d92916';
        startButton.style.display = 'none';
        timerDisplay.style.opacity = '0.5';
        return;
    }

    // Try to check if content script is loaded
    try {
        await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
    } catch (error) {
        console.log('Content scripts not loaded, injecting them...');
        const injected = await injectContentScripts(tab.id);
        if (!injected) {
            statusMessage.textContent = 'Error: Could not load timer scripts';
            statusMessage.style.color = '#d92916';
            return;
        }
        // Wait a bit for scripts to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Hide the start button since timer starts automatically
    startButton.style.display = 'none';
    statusMessage.textContent = 'Timer starts automatically on each question';
    statusMessage.style.color = '#1865f2';

    // Try to force check for question page
    try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'checkForQuestion' });
        console.log('Question check response:', response);
    } catch (error) {
        console.error('Error checking for question:', error);
    }

    // Listen for timer updates
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'updateCountdown') {
            updateDisplay(request.time);
            
            if (request.isRunning) {
                statusMessage.textContent = 'Timer running...';
                statusMessage.style.color = '#1865f2';
            } else if (request.time <= 0) {
                if (request.skipped) {
                    statusMessage.textContent = 'Time\'s up! Question skipped';
                } else {
                    statusMessage.textContent = 'Time\'s up! Could not skip question';
                }
                statusMessage.style.color = '#d92916';
            }
        }
    });
});