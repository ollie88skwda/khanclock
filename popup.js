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
    const skipButton = document.getElementById('skip-question');
    const timerDisplay = document.getElementById('countdown-display');
    const timerDurationInput = document.getElementById('timer-duration');

    // Set initial display and input value
    timerDurationInput.value = CONFIG.TIMER_DURATION;
    updateDisplay(CONFIG.TIMER_DURATION);

    // Check if we're on a test-prep page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url.includes('khanacademy.org/test-prep')) {
        statusMessage.textContent = 'Timer only works on SAT test-prep pages';
        statusMessage.style.color = '#d92916';
        skipButton.style.display = 'none';
        timerDisplay.style.opacity = '0.5';
        return;
    }

    // Add event listener to update timer duration
    timerDurationInput.addEventListener('change', async () => {
        const duration = parseInt(timerDurationInput.value, 10);
        if (duration > 0) {
            try {
                // Update config globally
                updateTimerDuration(duration);
                
                // Update content script
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab) {
                    try {
                        await chrome.tabs.sendMessage(tab.id, { 
                            action: 'updateTimerDuration', 
                            duration: duration 
                        });
                        updateDisplay(duration);
                        statusMessage.textContent = `Timer set to ${duration} seconds`;
                    } catch (error) {
                        // If content script isn't ready, inject it
                        if (error.message.includes("Receiving end does not exist")) {
                            await injectContentScripts(tab.id);
                            // Try sending the message again after injection
                            await chrome.tabs.sendMessage(tab.id, { 
                                action: 'updateTimerDuration', 
                                duration: duration 
                            });
                            updateDisplay(duration);
                            statusMessage.textContent = `Timer set to ${duration} seconds`;
                        } else {
                            throw error;
                        }
                    }
                }
            } catch (error) {
                console.error('Error updating timer duration:', error);
                statusMessage.textContent = 'Error updating timer';
            }
        }
    });

    // Add click handler for skip button
    skipButton.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'skipQuestion' });
            if (response.status === 'skipped') {
                statusMessage.textContent = 'Question skipped';
                skipButton.style.display = 'none';
            }
        } catch (error) {
            console.error('Error skipping question:', error);
            statusMessage.textContent = 'Error skipping question';
        }
    });

    // Try to check if content script is loaded
    try {
        await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        console.log('Content script already loaded');
        
        // Get current timer state
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getTimerState' });
        if (response.timeLeft !== undefined) {
            updateDisplay(response.timeLeft);
            statusMessage.textContent = response.isRunning ? 'Timer running' : 'Timer ready';
            skipButton.style.display = response.isRunning ? 'block' : 'none';
        }
    } catch (error) {
        console.log('Content script not loaded, injecting...');
        if (await injectContentScripts(tab.id)) {
            console.log('Successfully injected content scripts');
            statusMessage.textContent = 'Timer ready';
        } else {
            statusMessage.textContent = 'Error loading timer';
            return;
        }
    }

    // Listen for timer updates
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'updateCountdown') {
            updateDisplay(request.time);
            
            if (!request.isRunning) {
                statusMessage.textContent = 'Timer stopped';
                skipButton.style.display = 'none';
            } else {
                statusMessage.textContent = 'Timer running';
                skipButton.style.display = 'block';
            }

            if (request.time <= 0) {
                statusMessage.textContent = request.skipped ? 'Time\'s up! Question skipped' : 'Time\'s up!';
                skipButton.style.display = 'none';
            }
        }
        return true; // Keep the message channel open for sendResponse
    });
});