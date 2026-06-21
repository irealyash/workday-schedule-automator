let data = null;

document.addEventListener('DOMContentLoaded', () => {
    const addToWorkdayBtn = document.getElementById('addToWorkdayBtn');
    const addToWorkdayBtnPopup = document.getElementById('addToWorkdayBtnPopup');

    if (addToWorkdayBtn) addToWorkdayBtn.addEventListener('click', (e) => finale(e));
    if (addToWorkdayBtnPopup) addToWorkdayBtnPopup.addEventListener('click', (e) => finale(e));;

})
async function finale(e) {
    e.preventDefault();

    console.log("Finale function called");

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));


    try {
        // Wait 500ms first if you need to wait for a previous save to settle
        await delay(500);

        // FIX: Clean await directly on the storage call
        let result = await chrome.storage.local.get('finaldata');
        data = result.finaldata;

        // If data is missing, wait 1000ms more and try one retry
        if (!data) {
            console.log('Data not found on first try. Retrying in 1000ms...');
            await delay(1000);

            result = await chrome.storage.local.get('finaldata');
            data = result.finaldata;
        }

        if (data) {
            console.log('Successfully retrieved finaldata:', data);
            // Run your Workday script logic here...
        } else {
            console.log('Failed to retrieve finaldata after retry.');
        }

    } catch (error) {
        console.error('Error retrieving data from storage:', error);
    }



    const shouldAutomate = false; // Set this to true or false based on your popup's UI state

    chrome.tabs.query({ url: "https://*.myworkday.com/*" }, (tabs) => {
        if (!tabs || tabs.length === 0) {
            console.error("Automation failed: No open Workday tab was found.");
            alert("Please open your UBC Workday page first!");
            return;
        }

        // Target the active Workday tab if multiple are open, otherwise pick the first one
        const targetTab = tabs.find(tab => tab.active) || tabs[0];

        console.log("Found Workday tab! Blasting message to tab ID:", targetTab.id);

        // 3. Send the message with a confirmation callback to keep the port stable
        chrome.tabs.sendMessage(targetTab.id, {
            action: "START_AUTOMATION",
            payload: shouldAutomate
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Message delivery failed:", chrome.runtime.lastError.message);
            } else {
                console.log("Workday page acknowledged the start signal:", response);
            }
        });
    });
};

