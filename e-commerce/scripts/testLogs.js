const fs = require('fs');
const path = require('path');

const logFiles = ['app.log', 'error.log'];
const logsDir = path.join(__dirname, '..', 'logs');

console.log('Checking logs...\n');

let allValid = true;

logFiles.forEach(file => {
    const filePath = path.join(logsDir, file);
    let validEntries = 0;
    let invalidEntries = 0;

    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
            if (line.trim()) {
                try {
                    JSON.parse(line);
                    validEntries++;
                } catch (e) {
                    invalidEntries++;
                    console.error(`Invalid JSON in ${file} at line ${index + 1}: ${line}`);
                }
            }
        });

        console.log(`${file}:`);
        console.log(`Valid entries: ${validEntries}`);
        console.log(`Invalid entries: ${invalidEntries}\n`);

        if (invalidEntries > 0) {
            allValid = false;
        }
    } else {
        console.log(`${file} does not exist.\n`);
    }
});

if (allValid) {
    console.log('Log validation PASSED');
    process.exit(0);
} else {
    console.log('Log validation FAILED');
    process.exit(1);
}
