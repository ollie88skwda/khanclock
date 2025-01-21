// background.js
let currentTime = '2025-01-19T22:29:23-08:00';
let timerState = {
    timeLeft: 10,
    isRunning: false
};

// Function to get the current time
function getCurrentTime() {
    return currentTime;
}

// Expose the function to the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getTime') {
        sendResponse({ time: getCurrentTime() });
    }

    if (request.action === 'updateCountdown') {
        timerState.timeLeft = request.time;
        timerState.isRunning = request.time > 0;
        
        // Broadcast the update to all listeners (including popup)
        chrome.runtime.sendMessage({
            action: 'timerUpdate',
            time: timerState.timeLeft,
            isRunning: timerState.isRunning,
            skipped: request.skipped
        });
        
        // Always send a response
        sendResponse({status: 'updated'});
        return true;
    }
    
    // Send current timer state to popup when requested
    if (request.action === 'getTimerState') {
        sendResponse(timerState);
        return true;
    }

    // Send a response for any unhandled messages
    sendResponse({status: 'unknown_action'});
    return true;
});