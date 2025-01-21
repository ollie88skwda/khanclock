// content.js
let countdown;
let timeLeft = null;  // Initialize as null to detect first start
let isTimerRunning = false;
let lastUrl = location.href;
let lastQuestionId = '';
let navigationTimeout = null;
let lastTimerReset = 0;
const TIMER_RESET_COOLDOWN = 1000; // 1 second cooldown
let isInitialStart = true;  // Flag to track first start
let isSkipping = false;     // Flag to track if we're in the process of skipping

// Debug logging function
function debugLog(message, data = {}) {
    const state = {
        timeLeft,
        isTimerRunning,
        hasCountdown: !!countdown,
        currentUrl: location.href,
        lastUrl,
        lastQuestionId,
        isInitialStart,
        isSkipping,
        ...data
    };
    console.log(`[DEBUG] ${message}`, state);
}

// Function to safely send messages to chrome runtime
function safeSendMessage(message) {
    try {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                debugLog('Chrome runtime error:', chrome.runtime.lastError);
            }
        });
    } catch (error) {
        debugLog('Failed to send message:', { error: error.message });
        // If we get an invalid context, stop the timer
        if (error.message.includes('Extension context invalidated')) {
            stopTimer();
        }
    }
}

// Function to check if we're on a question page
function isQuestionPage() {
    debugLog('Checking if on question page');
    
    // Look for common elements that indicate we're on a question page
    const indicators = [
        document.querySelector('[data-testid="exercise-skip-button"]'),
        document.querySelector('[data-test-id="question-area"]'),
        document.querySelector('[role="article"]'),
        document.querySelector('.perseus-renderer'),
        document.querySelector('.framework-perseus'),
        document.querySelector('.exercise-wrapper'),
        document.querySelector('[data-test-id="exercise-container"]'),
        document.querySelector('.sat-section-instructions'),
        document.querySelector('[data-test-id="modal-content"]')
    ];
    
    const found = indicators.some(el => el !== null);
    debugLog('Question page check result:', { found });
    return found;
}

function stopTimer() {
    debugLog('Stopping timer');
    if (countdown) {
        clearInterval(countdown);
        countdown = null;
    }
    isTimerRunning = false;
}

function resetTimer() {
    const now = Date.now();
    debugLog('Attempting timer reset', { timeSinceLastReset: now - lastTimerReset });
    
    if (now - lastTimerReset < TIMER_RESET_COOLDOWN && !isInitialStart) {
        debugLog('Skipping timer reset - too soon');
        return;
    }
    
    debugLog('Resetting timer');
    stopTimer();
    timeLeft = CONFIG.TIMER_DURATION;
    lastTimerReset = now;
    isInitialStart = false;
    startCountdown();
}

function startCountdown() {
    debugLog('Starting countdown');
    
    // Don't start if already running
    if (isTimerRunning) {
        debugLog('Timer already running, not starting new one');
        return;
    }

    // Clear any existing countdown
    stopTimer();
    
    // Always ensure we have a valid time
    if (timeLeft === null || timeLeft <= 0) {
        debugLog('Initializing timeLeft to default duration');
        timeLeft = CONFIG.TIMER_DURATION;
    }
    
    isTimerRunning = true;
    debugLog('Starting new countdown', { startingTime: timeLeft });
    
    try {
        // Send initial state
        safeSendMessage({ 
            action: 'updateCountdown', 
            time: timeLeft,
            isRunning: true
        });
        
        countdown = setInterval(() => {
            timeLeft--;
            
            // Log every tick during initial countdown
            if (timeLeft > CONFIG.TIMER_DURATION - 5) {
                debugLog('Initial timer tick');
            } else if (timeLeft % 5 === 0) {
                debugLog('Timer tick');
            }
            
            try {
                // Send update
                safeSendMessage({ 
                    action: 'updateCountdown', 
                    time: timeLeft,
                    isRunning: timeLeft > 0
                });
                
                // Check if timer is done
                if (timeLeft <= 0) {
                    debugLog('Timer finished');
                    stopTimer();
                    
                    // Try to click the skip button using simulated events
                    const skipped = clickSkipButton();
                    
                    // Send final message
                    safeSendMessage({ 
                        action: 'updateCountdown', 
                        time: 0,
                        isRunning: false,
                        skipped: skipped
                    });
                }
            } catch (error) {
                debugLog('Error in countdown interval:', { error: error.message });
                if (error.message.includes('Extension context invalidated')) {
                    stopTimer();
                }
            }
        }, 1000);
    } catch (error) {
        debugLog('Error starting countdown:', { error: error.message });
        stopTimer();
    }
}

// Debounce function to prevent multiple rapid calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function simulateClick(element) {
    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
        const event = new MouseEvent(eventType, {
            view: window,
            bubbles: true,
            cancelable: true,
            buttons: 1
        });
        element.dispatchEvent(event);
    });
}

function clickConfirmSkip() {
    debugLog('Attempting to click confirm skip button');
    // Look for the confirmation button with various possible selectors
    const confirmButtonSelectors = [
        '[data-test-id="skip-confirm-button"]',
        'button[aria-label="Yes, skip"]',
        // Dialog buttons are often in a dialog or modal element
        'div[role="dialog"] button',
        'div[role="modal"] button',
        // Fallback to all buttons
        'button'
    ];

    for (const selector of confirmButtonSelectors) {
        const buttons = document.querySelectorAll(selector);
        for (const button of buttons) {
            const buttonText = button.textContent.toLowerCase().trim();
            if (buttonText.includes('yes') && buttonText.includes('skip')) {
                debugLog('Found confirm skip button:', { buttonText });
                simulateClick(button);
                return true;
            }
        }
    }
    
    // Log all buttons for debugging
    debugLog('Available buttons:');
    document.querySelectorAll('button').forEach(button => {
        console.log('Button text:', button.textContent.trim());
    });
    
    return false;
}

function clickSkipButton() {
    debugLog('Attempting to click skip button');
    const skipButton = document.querySelector('[data-testid="exercise-skip-button"]');
    if (skipButton) {
        debugLog('Found initial skip button');
        isSkipping = true;  // Set skipping flag
        simulateClick(skipButton);
        
        // Wait for the confirmation dialog to appear and click the confirm button
        setTimeout(() => {
            if (clickConfirmSkip()) {
                debugLog('Successfully clicked confirm skip button');
            } else {
                debugLog('Could not find confirm skip button');
                isSkipping = false;  // Reset flag if skip failed
            }
        }, 0);
        
        return true;
    }
    isSkipping = false;  // Reset flag if no skip button found
    return false;
}

// Function to force timer reset
function forceTimerReset() {
    const now = Date.now();
    debugLog('Attempting forced timer reset', { timeSinceLastReset: now - lastTimerReset });
    
    // Allow reset if it's initial start, even if skipping
    if (isSkipping && !isInitialStart) {
        debugLog('Skipping timer reset - currently skipping question');
        return;
    }
    
    if (now - lastTimerReset < TIMER_RESET_COOLDOWN && !isInitialStart) {
        debugLog('Skipping timer reset - too soon');
        return;
    }
    
    debugLog('Forcing timer reset');
    stopTimer();
    timeLeft = CONFIG.TIMER_DURATION;
    lastTimerReset = now;
    isInitialStart = false;
    
    // Start immediately if we're on a question page
    if (isQuestionPage()) {
        debugLog('Starting forced timer reset');
        startCountdown();
    } else {
        debugLog('Not on question page, skipping forced reset');
    }
}

// Start timer automatically when we detect we're on a question page
function checkAndStartTimer() {
    if (isSkipping) {
        debugLog('Skipping timer start - currently skipping question');
        return false;
    }
    
    if (isQuestionPage()) {
        debugLog('Question page detected, resetting timer');
        resetTimer();
        return true;
    }
    return false;
}

// Initialize navigation observer
function initNavigationObserver() {
    debugLog('Initializing navigation observer');
    
    // Create an observer instance to watch for DOM changes
    const observer = new MutationObserver((mutations) => {
        let significantChange = false;
        
        for (const mutation of mutations) {
            // Only check added nodes that might be question content
            if (mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Look for specific question-related elements
                        if (node.classList?.contains('perseus-renderer') ||
                            node.querySelector?.('.perseus-renderer') ||
                            node.getAttribute?.('data-test-id') === 'question-area' ||
                            node.querySelector?.('[data-test-id="question-area"]') ||
                            node.classList?.contains('exercise-wrapper') ||
                            node.querySelector?.('.exercise-wrapper') ||
                            node.classList?.contains('sat-section-instructions') ||
                            node.querySelector?.('.sat-section-instructions')) {
                            significantChange = true;
                            break;
                        }
                    }
                }
                if (significantChange) break;
            }
        }
        
        if (significantChange) {
            debugLog('Significant DOM change detected');
            // Only reset timer if we're not currently skipping
            if (!isSkipping && isQuestionPage()) {
                debugLog('Question page detected after DOM change');
                forceTimerReset();
            }
        }
    });

    // Start observing with more specific options
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
    });
    
    // Listen for next/check/let's go button clicks
    document.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        
        // Get all possible text content
        const buttonText = (button.textContent || '').toLowerCase().trim();
        const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
        const dialogText = button.closest('[role="dialog"]')?.textContent.toLowerCase() || '';
        const modalText = button.closest('[data-test-id="modal-content"]')?.textContent.toLowerCase() || '';
        
        debugLog('Button clicked', { 
            buttonText, 
            ariaLabel,
            dialogText: dialogText.substring(0, 50),
            modalText: modalText.substring(0, 50),
            buttonClasses: button.className,
            buttonId: button.id,
            buttonRole: button.getAttribute('role'),
            parentRole: button.parentElement?.getAttribute('role')
        });
        
        const isStartButton = 
            buttonText.includes("let's go") ||
            buttonText.includes("let's start") ||
            buttonText === 'go' ||
            dialogText.includes("let's go") ||
            modalText.includes("let's go") ||
            buttonText.includes('start') ||
            dialogText.includes('start the section') ||
            modalText.includes('start the section');
        
        const isNextButton = 
            buttonText.includes('next') || 
            buttonText.includes('check') ||
            ariaLabel.includes('next');
        
        if (isStartButton) {
            debugLog('Start button clicked - forcing initial start', { buttonText, ariaLabel });
            isSkipping = false;  // Reset skipping flag
            isInitialStart = true;  // Force start
            forceTimerReset();
        } else if (isNextButton) {
            debugLog('Next button clicked - normal reset', { buttonText, ariaLabel });
            isSkipping = false;  // Reset skipping flag
            forceTimerReset();
        }
    }, true);
}

// Initialize when the page loads
debugLog('Content script loaded');
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        checkAndStartTimer();
        initNavigationObserver();
    });
} else {
    checkAndStartTimer();
    initNavigationObserver();
}

// Listen for messages
try {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        try {
            debugLog('Received message', { request });
            
            if (request.action === 'ping') {
                debugLog('Received ping');
                sendResponse({status: 'ok'});
                return true;
            }
            
            if (request.action === 'checkForQuestion') {
                debugLog('Received checkForQuestion request');
                const result = checkAndStartTimer();
                sendResponse({status: result ? 'found_and_started' : 'not_found'});
                return true;
            }
            
            if (request.action === 'startTimer' && !isTimerRunning) {
                debugLog('Received startTimer request');
                startCountdown();
                sendResponse({status: 'started'});
                return true;
            }

            sendResponse({status: 'unknown_action'});
            return true;
        } catch (error) {
            debugLog('Error handling message:', { error: error.message });
            if (error.message.includes('Extension context invalidated')) {
                stopTimer();
            }
            sendResponse({status: 'error', error: error.message});
            return true;
        }
    });
} catch (error) {
    debugLog('Error setting up message listener:', { error: error.message });
}