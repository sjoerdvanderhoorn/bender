chrome.action.onClicked.addListener((tab) => {

  if (!tab.id) return;

  chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: 'sidepanel.html',
    enabled: true
  });

  chrome.sidePanel.open({ tabId: tab.id });

});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-sidebar' && tab && tab.id) {
    chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: 'sidepanel.html',
      enabled: true
    });
    chrome.sidePanel.open({ tabId: tab.id });
  }
});
