const fs = require('fs');
const https = require('https');
const path = require('path');

const LISTS = [
    {
        name: 'easylist',
        url: 'https://easylist.to/easylist/easylist.txt',
        output: '../rules/easylist.json',
        idStart: 10000
    },
    {
        name: 'easyprivacy',
        url: 'https://easylist.to/easylist/easyprivacy.txt',
        output: '../rules/easyprivacy.json',
        idStart: 100000
    }
];

// Max rules per ruleset in Chrome is usually 30,000 (safe limit) for older Mainfest V3, 
// strictly it's higher now but good to be safe. 
// We will limit to 25000 entries per file for safety.
const MAX_RULES = 25000;

function fetchList(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function parseRule(line, id) {
    line = line.trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) return null;

    // Cosmetic rules (##, #@#) - Skip for DNR, maybe save for separate injection later
    // For now, we only focus on network blocking
    if (line.includes('##') || line.includes('#@#')) {
        return null; 
    }

    // Whitelist rules (@@) - Skip for now to assume strict blocking, or implement as 'allow'
    // Simplified: AdBlock syntax is complex. We focus on '||domain^' typical blocking.
    let action = 'block';
    if (line.startsWith('@@')) {
        return null; // Skip exception rules for this simple v1 implementation
    }

    // Basic domain blocking ||example.com^
    // regex for ||domain^ or ||domain$
    // We are looking for lines that are primarily URL filters
    
    let urlFilter = line;
    let resourceTypes = [];
    
    // Parse options $script,image,etc.
    const optionsIndex = line.lastIndexOf('$');
    if (optionsIndex !== -1) {
        const optionsPart = line.substring(optionsIndex + 1);
        urlFilter = line.substring(0, optionsIndex);
        
        const options = optionsPart.split(',');
        // Map Adblock options to DNR resourceTypes
        if (options.includes('script')) resourceTypes.push('script');
        if (options.includes('image')) resourceTypes.push('image');
        if (options.includes('subdocument')) resourceTypes.push('sub_frame');
        if (options.includes('stylesheet')) resourceTypes.push('stylesheet');
        if (options.includes('xmlhttprequest')) resourceTypes.push('xmlhttprequest');
        
        // If domain= option is present, it's more complex. We skip domain-specific rules for simplicity or handle later.
        if (options.some(o => o.startsWith('domain='))) return null; 
    }

    // transform || to nothing, but add suitable filter pattern
    // DNR supports || natively in urlFilter
    
    // VALIDATION: urlFilter cannot be empty
    if (!urlFilter) return null;

    const rule = {
        id: id,
        priority: 1,
        action: {
            type: action
        },
        condition: {
            urlFilter: urlFilter,
            resourceTypes: resourceTypes.length > 0 ? resourceTypes : ['script', 'image', 'xmlhttprequest', 'sub_frame'] 
        }
    };
    
    return rule;
}

async function processList(listDef) {
    console.log(`Processing ${listDef.name}...`);
    try {
        const rawData = await fetchList(listDef.url);
        const lines = rawData.split('\n');
        
        const rules = [];
        let ruleId = listDef.idStart;
        
        for (const line of lines) {
            const rule = parseRule(line, ruleId);
            if (rule) {
                rules.push(rule);
                ruleId++;
                if (rules.length >= MAX_RULES) break;
            }
        }
        
        const outputPath = path.resolve(__dirname, listDef.output);
        fs.writeFileSync(outputPath, JSON.stringify(rules, null, 2));
        console.log(`Saved ${rules.length} rules to ${listDef.output}`);
        
    } catch (error) {
        console.error(`Error processing ${listDef.name}:`, error);
    }
}

async function main() {
    for (const list of LISTS) {
        await processList(list);
    }
}

main();
