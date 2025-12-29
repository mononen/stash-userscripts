(function () {
    'use strict';

    const {
        stash,
        Stash,
        waitForElementId,
        waitForElementClass,
        waitForElementByXpath,
        getElementByXpath,
        getElementsByXpath,
        getClosestAncestor,
        sortElementChildren,
        createElementFromHTML,
    } = unsafeWindow.stash;

    document.body.appendChild(document.createElement('style')).textContent = `
    .search-item > div.row:first-child > div.col-md-6.my-1 > div:first-child { display: flex; flex-direction: column; }
    .tagger-remove { order: 10; }
    `;

    const DEFAULT_DELAY = 200;
    const TIMEOUT_DELAY = 5000; // Fallback timeout if response not detected
    let running = false;
    const buttons = [];
    let maxCount = 0;
    let sceneId = null;
    let timeoutId = null;

    function scheduleRun() {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        setTimeout(() => {
            run();
        }, DEFAULT_DELAY);
    }

    function run() {
        if (!running) return;
        
        // Clear any existing timeout
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        
        const button = buttons.pop();
        stash.setProgress((maxCount - buttons.length) / maxCount * 100);
        if (button) {
            const searchItem = getClosestAncestor(button, '.search-item');
            if (searchItem.classList.contains('d-none')) {
                setTimeout(() => {
                    run();
                }, 0);
                return;
            }

            const { id } = stash.parseSearchItem(searchItem);
            sceneId = id;
            if (!button.disabled) {
                button.click();
                // Set a fallback timeout in case response detection fails
                timeoutId = setTimeout(() => {
                    console.log('[Stash Batch Save] Response timeout, proceeding to next scene');
                    run();
                }, TIMEOUT_DELAY);
            }
            else {
                buttons.push(button);
                scheduleRun();
            }
        }
        else {
            stop();
        }
    }

    function processSceneUpdate(evt) {
        if (!running) return;
        
        const data = evt.detail.data;
        if (!data) return;
        
        // Check for various possible mutation response formats
        // sceneUpdate - single scene update
        // scenesUpdate - bulk scene update (newer API)
        // bulkSceneUpdate - alternative bulk update name
        let responseId = null;
        
        if (data.sceneUpdate?.id) {
            responseId = data.sceneUpdate.id;
        } else if (data.scenesUpdate) {
            // Handle bulk update response - may be an array
            const scenes = Array.isArray(data.scenesUpdate) ? data.scenesUpdate : [data.scenesUpdate];
            responseId = scenes.find(s => s?.id === sceneId)?.id;
        } else if (data.bulkSceneUpdate?.id) {
            responseId = data.bulkSceneUpdate.id;
        }
        
        if (responseId === sceneId) {
            scheduleRun();
        }
    }

    const btnId = 'batch-save';
    const startLabel = 'Save All';
    const stopLabel = 'Stop Save';
    const btn = document.createElement("button");
    btn.setAttribute("id", btnId);
    btn.classList.add('btn', 'btn-primary', 'ml-3');
    btn.innerHTML = startLabel;
    btn.onclick = () => {
        if (running) {
            stop();
        }
        else {
            start();
        }
    };

    function start() {
        if (!confirm("Are you sure you want to batch save?")) return;
        btn.innerHTML = stopLabel;
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-danger');
        running = true;
        stash.setProgress(0);
        buttons.length = 0;
        for (const button of document.querySelectorAll('.btn.btn-primary')) {
            if (button.innerText === 'Save') {
                buttons.push(button);
            }
        }
        maxCount = buttons.length;
        stash.addEventListener('stash:response', processSceneUpdate);
        run();
    }

    function stop() {
        btn.innerHTML = startLabel;
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-primary');
        running = false;
        stash.setProgress(0);
        sceneId = null;
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        stash.removeEventListener('stash:response', processSceneUpdate);
    }

    stash.addEventListener('tagger:mutations:header', evt => {
        const el = getElementByXpath("//button[text()='Scrape All']");
        if (el && !document.getElementById(btnId)) {
            const container = el.parentElement;
            container.appendChild(btn);
            sortElementChildren(container);
            el.classList.add('ml-3');
        }
    });

    function checkSaveButtonDisplay() {
        const taggerContainer = document.querySelector('.tagger-container');
        const saveButton = getElementByXpath("//button[text()='Save']", taggerContainer);
        btn.style.display = saveButton ? 'inline-block' : 'none';
    }

    stash.addEventListener('tagger:mutations:searchitems', checkSaveButtonDisplay);

    async function initRemoveButtons() {
        const nodes = getElementsByXpath("//button[contains(@class, 'btn-primary') and text()='Scrape by fragment']");
        const buttons = [];
        let node = null;
        while (node = nodes.iterateNext()) {
            buttons.push(node);
        }
        for (const button of buttons) {
            const searchItem = getClosestAncestor(button, '.search-item');

            const removeButtonExists = searchItem.querySelector('.tagger-remove');
            if (removeButtonExists) {
                continue;
            }

            const removeEl = createElementFromHTML('<div class="mt-2 text-right tagger-remove"><button class="btn btn-danger">Remove</button></div>');
            const removeButton = removeEl.querySelector('button');
            button.parentElement.parentElement.appendChild(removeEl);
            removeButton.addEventListener('click', async () => {
                searchItem.classList.add('d-none');
            });
        }
    }

    stash.addEventListener('page:studio:scenes', function () {
        waitForElementByXpath("//button[contains(@class, 'btn-primary') and text()='Scrape by fragment']", initRemoveButtons);
    });

    stash.addEventListener('page:performer:scenes', function () {
        waitForElementByXpath("//button[contains(@class, 'btn-primary') and text()='Scrape by fragment']", initRemoveButtons);
    });

    stash.addEventListener('page:scenes', function () {
        waitForElementByXpath("//button[contains(@class, 'btn-primary') and text()='Scrape by fragment']", initRemoveButtons);
    });
})();