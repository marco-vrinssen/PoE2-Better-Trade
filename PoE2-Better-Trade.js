// ==UserScript==
// @name         PoE2 Better Trade
// @namespace    https://github.com/marco-vrinssen/PoE2-Better-Trade
// @version      1.0.0
// @description  Fuzzy search, item copying, and filter duplication for Path of Exile 2 trade site
// @author       marco-vrinssen
// @match        *://*.pathofexile.com/trade2/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pathofexile.com
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // [unified script configuration for all features]

    const config = {
        debug: true,
        fuzzy: {
            prefix: '~'
        },
        duplicator: {
            maxRetries: 100,
            retryDelay: 200,
            buttonUpdateDelay: 300,
            debounceDelay: 150
        }
    };

    const logger = {
        log(feature, message, data = null) {
            if (config.debug) {
                const prefix = `[PoE2 Better Trade - ${feature}]`;
                console.log(`${prefix} ${message}`, data || '');
            }
        },

        error(feature, message, error = null) {
            const prefix = `[PoE2 Better Trade - ${feature}]`;
            console.error(`${prefix} ${message}`, error || '');
        }
    };

    const utils = {
        deepClone(obj) {
            return JSON.parse(JSON.stringify(obj));
        },

        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        waitForElement(selector, callback, maxRetries = 50) {
            let retries = 0;

            function check() {
                const element = document.querySelector(selector);
                if (element) {
                    callback(element);
                } else if (retries < maxRetries) {
                    retries++;
                    setTimeout(check, 100);
                }
            }

            check();
        },

        waitForVueApp(callback, maxRetries = config.duplicator.maxRetries) {
            let retryCount = 0;

            function checkApp() {
                if (window.app && window.app.$store && window.app.$store.state) {
                    logger.log('Duplicator', 'Vue app and store found');
                    callback();
                } else if (retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(checkApp, config.duplicator.retryDelay);
                } else {
                    logger.error('Duplicator', 'Failed to find Vue app after maximum retries');
                }
            }

            checkApp();
        }
    };

    const fuzzySearch = {
        init() {
            logger.log('FuzzySearch', 'Initializing');

            document.body.addEventListener('keydown', this.handleInput.bind(this));
            document.body.addEventListener('paste', (e) => {
                setTimeout(() => this.handleInput(e), 0);
            });
        },

        handleInput(event) {
            const target = event.target;

            if (!target.classList.contains('multiselect__input')) {
                return;
            }

            if (target.selectionStart !== target.selectionEnd) {
                return;
            }

            const value = target.value;
            const shouldAddPrefix = (
                !value.startsWith(config.fuzzy.prefix) &&
                !value.startsWith(' ') &&
                event.key !== ' '
            );

            if (shouldAddPrefix) {
                target.value = config.fuzzy.prefix + value;
            }
        }
    };

    const itemCopy = {
        processedRows: new Set(),

        init() {
            logger.log('ItemCopy', 'Initializing');

            this.addStyles();
            this.processExistingRows();
            this.observeNewRows();
        },

        addStyles() {
            if (document.querySelector('#poe2-itemcopy-styles')) {
                return;
            }

            const link = document.createElement('link');
            link.id = 'material-icons-itemcopy-font';
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=add_notes';
            document.head.appendChild(link);

            const style = document.createElement('style');
            style.id = 'poe2-itemcopy-styles';
            style.textContent = `
                .poe2-copy-btn {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    cursor: pointer !important;
                    background: transparent !important;
                    border: none !important;
                    padding: 4px !important;
                    opacity: 0 !important;
                }
                div.row:hover .poe2-copy-btn {
                    opacity: 1 !important;
                }
                .poe2-copy-icon {
                    font-family: 'Material Symbols Outlined' !important;
                    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24 !important;
                    font-size: 24px !important;
                    color: #fff !important;
                    -webkit-font-smoothing: antialiased !important;
                }
            `;
            document.head.appendChild(style);
        },

        processExistingRows() {
            document.querySelectorAll('div.row').forEach(row => {
                if (row.querySelector('div.itemHeader')) {
                    this.processRow(row);
                }
            });
        },

        observeNewRows() {
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE &&
                            node.classList.contains('row') &&
                            node.querySelector('div.itemHeader')) {
                            this.processRow(node);
                        }
                    }
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        },

        processRow(row) {
            if (this.processedRows.has(row)) {
                return;
            }

            try {
                const leftDiv = row.querySelector('div.left');
                if (!leftDiv || !leftDiv.children || leftDiv.children.length < 2) {
                    return;
                }

                const existingButton = leftDiv.children[1];
                if (existingButton.classList.contains('poe2-copy-btn')) {
                    return;
                }

                const copyButton = document.createElement('button');
                copyButton.className = 'poe2-copy-btn copy';
                copyButton.title = 'Copy Item Stats';

                const icon = document.createElement('span');
                icon.className = 'poe2-copy-icon';
                icon.textContent = 'add_notes';

                copyButton.appendChild(icon);
                copyButton.addEventListener('click', () => this.handleCopy(row));

                existingButton.replaceWith(copyButton);

                this.processedRows.add(row);
            } catch (error) {
                logger.error('ItemCopy', 'Error processing row', error);
            }
        },

        handleCopy(row) {
            const itemHeader = row.querySelector('div.itemHeader.doubleLine') ??
                row.querySelector('div.itemHeader');
            const content = row.querySelector('div.content');

            if (!itemHeader || !content) {
                logger.error('ItemCopy', 'Item header or content not found');
                return;
            }

            const itemText = this.buildItemText(row, itemHeader, content);
            navigator.clipboard.writeText(itemText);
        },

        buildItemText(row, itemHeader, content) {
            const parts = [];

            parts.push(this.getRarity(row));
            parts.push(this.getNames(itemHeader));
            parts.push(this.getQuality(content));
            parts.push(this.getRequirements(content));
            parts.push(this.getSockets(row));
            parts.push(this.getItemLevel(content));
            parts.push(this.getMods(content, '.enchantMod', 'enchant'));
            parts.push(this.getMods(content, '.runeMod', 'rune'));
            parts.push(this.getMods(content, '.implicitMod', 'implicit'));
            parts.push(this.getExplicitMods(content));
            parts.push(this.getCorrupted(content));
            parts.push(this.getPriceNote(content));

            return parts.filter(part => part).join('');
        },

        getRarity(row) {
            const rarities = [
                { selector: '.normalPopup', name: 'Normal' },
                { selector: '.magicPopup', name: 'Magic' },
                { selector: '.rarePopup', name: 'Rare' },
                { selector: '.uniquePopup', name: 'Unique' }
            ];

            for (const rarity of rarities) {
                if (row.querySelector(rarity.selector)) {
                    return `Rarity: ${rarity.name}\n`;
                }
            }

            return '';
        },

        getNames(itemHeader) {
            const typeLine = itemHeader.querySelector('.itemName.typeLine .lc');
            const itemName = itemHeader.querySelector('.itemName:not(.typeLine) .lc');

            let text = '';
            if (itemName) text += `${itemName.innerText}\n`;
            if (typeLine) text += `${typeLine.innerText}\n`;

            return text;
        },

        getQuality(content) {
            const quality = content.querySelector('span[data-field="quality"] .colourAugmented');
            if (!quality) return '';

            return `--------\nQuality: ${quality.innerText} (augmented)\n`;
        },

        getRequirements(content) {
            const requirements = content.querySelector('.requirements');
            if (!requirements) return '';

            const parts = ['--------\n', 'Requirements:\n'];

            const level = requirements.querySelector('span[data-field="lvl"] .colourDefault');
            if (level) parts.push(`Level: ${level.innerText}\n`);

            const stats = ['str', 'int', 'dex'];
            for (const stat of stats) {
                const element = requirements.querySelector(`span[data-field="${stat}"] .colourDefault`);
                if (element) {
                    parts.push(`${stat.charAt(0).toUpperCase() + stat.slice(1)}: ${element.innerText}\n`);
                }
            }

            parts.push('--------\n');
            return parts.join('');
        },

        getSockets(row) {
            const socketsDiv = row.querySelector('div.left .sockets');
            if (!socketsDiv || socketsDiv.childElementCount === 0) return '';

            return `Sockets: ${'S '.repeat(socketsDiv.childElementCount)}\n--------\n`;
        },

        getItemLevel(content) {
            const itemLevel = content.querySelector('.itemLevel');
            if (!itemLevel) return '';

            return `${itemLevel.innerText.trim()}\n--------\n`;
        },

        getMods(content, selector, tag) {
            const mods = content.querySelectorAll(selector);
            if (mods.length === 0) return '';

            const modTexts = Array.from(mods).map(mod =>
                `${mod.innerText.trim()} (${tag})`
            );

            return `${modTexts.join('\n')}\n--------\n`;
        },

        getExplicitMods(content) {
            const mods = content.querySelectorAll('.explicitMod');
            if (mods.length === 0) return '';

            const modTexts = Array.from(mods).map(mod =>
                mod.querySelector('.lc.s').innerText.trim()
            );

            return `${modTexts.join('\n')}\n`;
        },

        getCorrupted(content) {
            const corrupted = content.querySelector('.unmet');
            if (!corrupted) return '';

            return `--------\n${corrupted.innerText}\n`;
        },

        getPriceNote(content) {
            const priceNote = content.querySelector('.textCurrency');
            if (!priceNote || !priceNote.innerText.includes('~price')) return '';

            const price = priceNote.innerText.replace('~price', '').trim();
            return `--------\nNote: ${price}\n`;
        }
    };

    const filterDuplicator = {
        init() {
            logger.log('Duplicator', 'Initializing');

            this.addStyles();

            utils.waitForVueApp(() => {
                logger.log('Duplicator', 'Vue app ready');

                const delays = [500, 1000, 2000];
                delays.forEach(delay => {
                    setTimeout(() => this.addButtons(), delay);
                });

                this.observeFilterChanges();
            });
        },

        addStyles() {
            if (document.querySelector('#poe2-duplicator-styles')) {
                return;
            }

            const link = document.createElement('link');
            link.id = 'material-icons-font';
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200';
            document.head.appendChild(link);

            const style = document.createElement('style');
            style.id = 'poe2-duplicator-styles';
            style.textContent = `
                .poe2-duplicate-btn.edit-btn::after {
                    content: "" !important;
                    display: none !important;
                }
                .poe2-duplicate-btn {
                    display: inline-block !important;
                    position: relative !important;
                    text-align: center !important;
                    vertical-align: middle !important;
                }
                .poe2-duplicate-icon {
                    font-family: 'Material Symbols Outlined' !important;
                    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20 !important;
                    font-size: 18px !important;
                    width: 18px !important;
                    height: 18px !important;
                    line-height: 18px !important;
                    color: #fff !important;
                    display: inline-block !important;
                    text-align: center !important;
                    vertical-align: middle !important;
                    -webkit-font-smoothing: antialiased !important;
                    position: absolute !important;
                    top: 50% !important;
                    left: 50% !important;
                    transform: translate(-50%, -50%) !important;
                }
            `;
            document.head.appendChild(style);
        },

        observeFilterChanges() {
            const debouncedUpdate = utils.debounce(() => {
                logger.log('Duplicator', 'Filter change detected');
                this.addButtons();
            }, config.duplicator.debounceDelay);

            const observer = new MutationObserver((mutations) => {
                let shouldUpdate = false;

                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        for (const node of mutation.addedNodes) {
                            if (this.isFilterGroupNode(node)) {
                                shouldUpdate = true;
                                break;
                            }
                        }
                        for (const node of mutation.removedNodes) {
                            if (this.isFilterGroupNode(node)) {
                                shouldUpdate = true;
                                break;
                            }
                        }
                    }

                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        const target = mutation.target;
                        if (target.classList?.contains('filter-group')) {
                            shouldUpdate = true;
                        }
                    }
                }

                if (shouldUpdate) {
                    debouncedUpdate();
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class']
            });
        },

        isFilterGroupNode(node) {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) {
                return false;
            }

            return (
                node.classList?.contains('filter-group') ||
                node.querySelector?.('.filter-group') ||
                node.classList?.contains('edit-btn')
            );
        },

        findStatFilterGroups() {
            const groups = [];
            const filterGroups = document.querySelectorAll('.filter-group.expanded');

            logger.log('Duplicator', `Found ${filterGroups.length} expanded filter groups`);

            filterGroups.forEach((group, domIndex) => {
                const titleElement = group.querySelector('.filter-title-clickable, .filter-title');
                const editButton = group.querySelector('.edit-btn:not(.poe2-duplicate-btn)');

                if (!titleElement || !editButton) {
                    logger.log('Duplicator', `Missing title or edit button for group at index ${domIndex}`);
                    return;
                }

                const title = this.extractTitle(titleElement);
                logger.log('Duplicator', `Processing group with title: "${title}"`);

                if (this.isStatGroup(title)) {
                    groups.push({
                        element: group,
                        title: title,
                        domIndex: domIndex,
                        editButton: editButton
                    });
                    logger.log('Duplicator', `✅ Added stat group: "${title}" at DOM index ${domIndex}`);
                } else {
                    logger.log('Duplicator', `❌ Skipped non-stat group: "${title}"`);
                }
            });

            logger.log('Duplicator', `Total stat groups found: ${groups.length}`);
            return groups;
        },

        extractTitle(titleElement) {
            let titleText = '';

            const titleNode = Array.from(titleElement.childNodes)
                .find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());

            if (titleNode) {
                titleText = titleNode.textContent.trim();
            } else {
                titleText = titleElement.textContent.trim();

                const firstPeriodIndex = titleText.indexOf('.');
                const firstNewlineIndex = titleText.indexOf('\n');

                if (firstPeriodIndex > 0 && (firstNewlineIndex === -1 || firstPeriodIndex < firstNewlineIndex)) {
                    titleText = titleText.substring(0, firstPeriodIndex).trim();
                } else if (firstNewlineIndex > 0) {
                    titleText = titleText.substring(0, firstNewlineIndex).trim();
                }
            }

            if (titleText.includes('Count each stat')) {
                titleText = 'Count';
            }

            logger.log('Duplicator', `Cleaned title: "${titleText}"`);
            return titleText;
        },

        isStatGroup(title) {
            return (
                title.includes('Stat Filters') ||
                title === 'And' ||
                title === 'Not' ||
                title === 'If' ||
                title === 'Count' ||
                title.includes('Weighted Sum') ||
                title === 'Weighted Sum v2'
            );
        },

        addButtons() {
            const groups = this.findStatFilterGroups();
            logger.log('Duplicator', `Adding buttons to ${groups.length} filter groups`);

            groups.forEach(group => {
                this.addButtonToGroup(group);
            });
        },

        addButtonToGroup(groupInfo) {
            if (groupInfo.element.querySelector('.poe2-duplicate-btn')) {
                return;
            }

            const button = document.createElement('button');

            groupInfo.editButton.classList.forEach(className => {
                button.classList.add(className);
            });

            button.classList.add('poe2-duplicate-btn');
            button.title = 'Duplicate Filter Group';

            const icon = document.createElement('span');
            icon.className = 'poe2-duplicate-icon';
            icon.textContent = 'tab_inactive';

            button.appendChild(icon);
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleDuplicate(groupInfo);
            });

            const container = groupInfo.editButton.parentNode;
            if (groupInfo.editButton.nextSibling) {
                container.insertBefore(button, groupInfo.editButton.nextSibling);
            } else {
                container.appendChild(button);
            }
        },

        handleDuplicate(groupInfo) {
            logger.log('Duplicator', `=== DUPLICATE BUTTON CLICKED ===`);
            logger.log('Duplicator', `Group title: ${groupInfo.title}`);
            logger.log('Duplicator', `DOM index: ${groupInfo.domIndex}`);

            if (!window.app || !window.app.$store || !window.app.$store.state.persistent) {
                logger.error('Duplicator', 'Vue app or store not available');
                return false;
            }

            try {
                const groupIndex = this.getVueStoreIndex(groupInfo);
                if (groupIndex === -1) {
                    logger.error('Duplicator', 'Could not find group index');
                    return false;
                }

                logger.log('Duplicator', `Duplicating stat group at Vue store index: ${groupIndex}`);

                const currentStats = window.app.$store.state.persistent.stats;

                if (!Array.isArray(currentStats) || groupIndex >= currentStats.length) {
                    logger.error('Duplicator', 'Invalid stats array or index');
                    logger.log('Duplicator', `Stats array length: ${currentStats?.length}, requested index: ${groupIndex}`);
                    return false;
                }

                const groupToDuplicate = currentStats[groupIndex];

                if (!groupToDuplicate) {
                    logger.error('Duplicator', 'Could not find group in store');
                    return false;
                }

                logger.log('Duplicator', 'Original group data:', groupToDuplicate);
                logger.log('Duplicator', 'Original group type:', groupToDuplicate.type);

                const duplicatedGroup = utils.deepClone(groupToDuplicate);

                logger.log('Duplicator', `Preserving original group type: ${duplicatedGroup.type}`);

                if (!duplicatedGroup.filters) {
                    duplicatedGroup.filters = [];
                }

                switch (duplicatedGroup.type) {
                    case 'count':
                        logger.log('Duplicator', 'Processing COUNT group duplication');
                        break;

                    case 'weighted-sum':
                    case 'weighted-sum-v2':
                        logger.log('Duplicator', `Processing ${duplicatedGroup.type} group duplication`);
                        break;

                    case 'and':
                    case 'not':
                    case 'if':
                    default:
                        logger.log('Duplicator', `Processing ${duplicatedGroup.type} group duplication`);
                        break;
                }

                logger.log('Duplicator', 'Final duplicated group data:', duplicatedGroup);
                logger.log('Duplicator', 'Committing new group to Vue store');

                window.app.$store.commit('pushStatGroup', duplicatedGroup);

                logger.log('Duplicator', 'Successfully duplicated stat group');

                setTimeout(() => {
                    this.addButtons();
                }, config.duplicator.buttonUpdateDelay);

                return true;

            } catch (error) {
                logger.error('Duplicator', 'Error duplicating stat group', error);
                logger.error('Duplicator', 'Error stack:', error.stack);

                if (window.app && window.app.$store) {
                    logger.log('Duplicator', 'Vue store state:', window.app.$store.state.persistent?.stats);
                }

                return false;
            }
        },

        getVueStoreIndex(groupInfo) {
            try {
                if (!window.app || !window.app.$store || !window.app.$store.state.persistent) {
                    logger.log('Duplicator', 'Vue store not available');
                    return -1;
                }

                const currentStats = window.app.$store.state.persistent.stats;
                if (!Array.isArray(currentStats)) {
                    logger.log('Duplicator', 'Stats array not available');
                    return -1;
                }

                logger.log('Duplicator', 'Vue store stats array:', currentStats);
                logger.log('Duplicator', `Vue store has ${currentStats.length} entries`);

                const allGroups = this.findStatFilterGroups();
                const foundGroup = allGroups.find(g => g.element === groupInfo.element);

                if (!foundGroup) {
                    logger.log('Duplicator', 'Group not found in stat groups list');
                    logger.log('Duplicator', 'Available groups:', allGroups.map(g => g.title));
                    return -1;
                }

                logger.log('Duplicator', `Found group: "${foundGroup.title}" at DOM index ${foundGroup.domIndex}`);

                const statGroupIndex = allGroups.indexOf(foundGroup);

                logger.log('Duplicator', `Stat group order index: ${statGroupIndex}`);

                if (statGroupIndex >= 0 && statGroupIndex < currentStats.length) {
                    const storeEntry = currentStats[statGroupIndex];
                    logger.log('Duplicator', `Store entry at index ${statGroupIndex}:`, storeEntry);
                    return statGroupIndex;
                } else {
                    logger.log('Duplicator', `Index ${statGroupIndex} is out of bounds for stats array of length ${currentStats.length}`);
                    return -1;
                }

            } catch (error) {
                logger.error('Duplicator', 'Error getting Vue index', error);
                return -1;
            }
        }
    };

    function initialize() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initialize);
            return;
        }

        logger.log('Main', 'PoE2 Better Trade initializing');

        fuzzySearch.init();
        itemCopy.init();
        filterDuplicator.init();

        logger.log('Main', 'All features initialized successfully');
    }

    initialize();
})();
