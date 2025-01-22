// config.js
const CONFIG = {
  // Time in seconds for the countdown timer
  TIMER_DURATION: 120, // Default duration in seconds
};

// Load saved duration from storage
chrome.storage.local.get(['timerDuration'], function(result) {
  if (result.timerDuration) {
    CONFIG.TIMER_DURATION = result.timerDuration;
  }
});

// Function to update timer duration
function updateTimerDuration(duration) {
  CONFIG.TIMER_DURATION = duration;
  chrome.storage.local.set({ timerDuration: duration });
}

// Make CONFIG available to other files
if (typeof module !== "undefined" && module.exports) {
  module.exports = CONFIG;
} else {
  window.CONFIG = CONFIG;
}
