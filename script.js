// Global state
let csvData = null;

// DOM elements
const markdownInput = document.getElementById('markdownInput');
const convertBtn = document.getElementById('convertBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resultSection = document.getElementById('resultSection');
const resultMessage = document.getElementById('resultMessage');

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    convertBtn.addEventListener('click', handleConvert);
    downloadBtn.addEventListener('click', handleDownload);
    
    // Enable convert button when there's content
    markdownInput.addEventListener('input', () => {
        if (markdownInput.value.trim()) {
            convertBtn.disabled = false;
        } else {
            convertBtn.disabled = true;
        }
    });
});

/**
 * Handle convert button click
 */
function handleConvert() {
    const markdown = markdownInput.value.trim();
    
    if (!markdown) {
        showResult('Please enter or paste markdown content first.', 'error');
        return;
    }

    try {
        const testCases = parseMarkdown(markdown);
        
        if (testCases.length === 0) {
            showResult('No test cases found. Make sure your markdown contains headings starting with "#### " (H4).', 'error');
            return;
        }

        // Generate CSV
        csvData = generateCSV(testCases);
        
        // Show success message
        const missingSections = countMissingSections(testCases);
        let message = `✅ Parsed ${testCases.length} test case${testCases.length === 1 ? '' : 's'} successfully.`;
        if (missingSections > 0) {
            message += `\n⚠️ ${missingSections} test case${missingSections === 1 ? '' : 's'} had missing sections.`;
        }
        showResult(message, 'success');
        
        downloadBtn.disabled = false;
    } catch (error) {
        showResult(`Error parsing markdown: ${error.message}`, 'error');
        console.error('Parse error:', error);
    }
}

/**
 * Parse markdown into test case objects
 */
function parseMarkdown(markdown) {
    const lines = markdown.split('\n');
    const testCases = [];
    let currentTestCase = null;
    let currentBlockLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Ignore separator lines (---)
        if (trimmedLine === '---' || trimmedLine.match(/^-{3,}$/)) {
            continue;
        }

        // Ignore H3 block headers (### BLOCK...)
        if (trimmedLine.startsWith('### ') && !trimmedLine.startsWith('#### ')) {
            continue;
        }

        // Check if this is a test case heading (#### )
        if (trimmedLine.startsWith('#### ')) {
            // Save previous test case if exists
            if (currentTestCase) {
                // Process the collected block lines
                processTestCaseBlock(currentTestCase, currentBlockLines);
                testCases.push(currentTestCase);
            }

            // Start new test case
            const heading = trimmedLine.substring(5).trim(); // Remove '#### '
            const { id, title, priority } = parseHeading(heading);
            
            currentTestCase = {
                id: id,
                title: title,
                priority: priority,
                given: [],
                steps: [],
                expectedResults: [],
                actualResults: []
            };
            currentBlockLines = [];
        } else if (currentTestCase) {
            // Continue collecting lines for current test case
            currentBlockLines.push(line);
        }
    }

    // Don't forget the last test case
    if (currentTestCase) {
        processTestCaseBlock(currentTestCase, currentBlockLines);
        testCases.push(currentTestCase);
    }

    // Auto-generate IDs for test cases without IDs
    autoGenerateIds(testCases);

    return testCases;
}

/**
 * Parse heading to extract ID, title, and priority
 * Format: TC01 — Update Name (Happy Path) — P1
 */
function parseHeading(heading) {
    // Extract priority first (— P1 or — P0 at the end)
    let priority = 'P1'; // default
    const priorityMatch = heading.match(/\s*—\s*(P[0-9]+)\s*$/i);
    if (priorityMatch) {
        priority = priorityMatch[1].toUpperCase();
        // Remove priority from heading for further parsing
        heading = heading.replace(/\s*—\s*P[0-9]+\s*$/i, '').trim();
    }

    // Pattern: TC followed by alphanumeric, underscore, or dash, then separator (—, -, or :), then title
    const idPattern = /^(TC[0-9A-Za-z_-]+)\s*[—\-:]\s*(.+)$/i;
    const match = heading.match(idPattern);

    if (match) {
        return {
            id: match[1].toUpperCase(),
            title: match[2].trim(),
            priority: priority
        };
    }

    // No ID found
    return {
        id: '',
        title: heading.trim(),
        priority: priority
    };
}

/**
 * Process a test case block to extract sections
 * Handles inline format: **Given** content here
 */
function processTestCaseBlock(testCase, blockLines) {
    for (const line of blockLines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Check for inline format: **Given** content or **When** content or **Then** content
        // Pattern matches: **Given** content, **When** content, **Then** content, **Actual Results** content
        const inlinePattern = /^\*\*((?:Given|When|Then|Actual\s+Results))\*\*\s*(.+)$/i;
        const inlineMatch = trimmed.match(inlinePattern);

        if (inlineMatch) {
            const sectionType = inlineMatch[1].toLowerCase().replace(/\s+/g, ' ');
            const content = inlineMatch[2].trim();

            // Map to our section keys
            if (sectionType === 'given') {
                testCase.given.push(cleanContentLine(content));
            } else if (sectionType === 'when') {
                testCase.steps.push(cleanContentLine(content));
            } else if (sectionType === 'then') {
                testCase.expectedResults.push(cleanContentLine(content));
            } else if (sectionType === 'actual results') {
                testCase.actualResults.push(cleanContentLine(content));
            }
        } else {
            // Also check for standalone section headers (for backward compatibility)
            const sectionMap = {
                'given (preconditions)': 'given',
                'given': 'given',
                'steps (when)': 'steps',
                'when': 'steps',
                'expected results (then)': 'expectedResults',
                'then': 'expectedResults',
                'actual results': 'actualResults'
            };

            let normalizedLine = trimmed.toLowerCase();
            normalizedLine = normalizedLine.replace(/\*\*/g, '').trim();

            // Check if it's a section header
            let matchedSection = null;
            for (const [key, sectionKey] of Object.entries(sectionMap)) {
                if (normalizedLine === key || normalizedLine.startsWith(key + ':')) {
                    matchedSection = sectionKey;
                    break;
                }
            }

            // If not a header and we have content, it might be continuation
            // For now, we'll skip continuation lines in this format
        }
    }
}

/**
 * Clean a content line (remove bullets, markdown markers, etc.)
 */
function cleanContentLine(line) {
    // Remove leading bullet markers (-, *, +)
    let cleaned = line.replace(/^[-*+]\s+/, '');
    
    // Remove markdown emphasis markers (simple removal of ** and _)
    cleaned = cleaned.replace(/\*\*/g, '');
    cleaned = cleaned.replace(/^_|_$/g, '');
    
    // Trim whitespace
    cleaned = cleaned.trim();
    
    return cleaned;
}

/**
 * Auto-generate IDs for test cases without IDs
 */
function autoGenerateIds(testCases) {
    let counter = 1;
    for (const testCase of testCases) {
        if (!testCase.id) {
            testCase.id = `TC${String(counter).padStart(2, '0')}`;
            counter++;
        }
    }
}

/**
 * Count test cases with missing sections
 */
function countMissingSections(testCases) {
    let count = 0;
    for (const testCase of testCases) {
        const hasGiven = testCase.given.length > 0;
        const hasSteps = testCase.steps.length > 0;
        const hasExpected = testCase.expectedResults.length > 0;
        const hasActual = testCase.actualResults.length > 0;
        
        if (!hasGiven || !hasSteps || !hasExpected || !hasActual) {
            count++;
        }
    }
    return count;
}

/**
 * Generate CSV string from test cases
 */
function generateCSV(testCases) {
    const headers = [
        'Test Case ID',
        'Title',
        'Test Steps',
        'Actual Results',
        'Priority',
        'Tags'
    ];

    const rows = testCases.map(testCase => {
        // Combine Given, When (Steps), and Then (Expected Results) into Test Steps
        // Each on a separate line
        const testSteps = [];
        
        // Given line
        if (testCase.given.length > 0) {
            testSteps.push(`Given: ${testCase.given.join('; ')}`);
        }
        
        // When line
        if (testCase.steps.length > 0) {
            testSteps.push(`When: ${testCase.steps.join('; ')}`);
        }
        
        // Then line
        if (testCase.expectedResults.length > 0) {
            testSteps.push(`Then: ${testCase.expectedResults.join('; ')}`);
        }
        
        return {
            'Test Case ID': testCase.id,
            'Title': testCase.title,
            'Test Steps': testSteps.join('\n'),
            'Actual Results': testCase.actualResults.join('; '),
            'Priority': testCase.priority || 'P1',
            'Tags': ''
        };
    });

    return toCSV(rows, headers);
}

/**
 * Convert array of objects to CSV string
 */
function toCSV(rows, headers) {
    // Escape CSV value
    const escapeCSV = (value) => {
        if (value === null || value === undefined) {
            return '""';
        }
        const str = String(value);
        // Escape quotes by doubling them
        const escaped = str.replace(/"/g, '""');
        // Wrap in quotes
        return `"${escaped}"`;
    };

    // Build header row
    const headerRow = headers.map(escapeCSV).join(',');

    // Build data rows
    const dataRows = rows.map(row => {
        return headers.map(header => escapeCSV(row[header] || '')).join(',');
    });

    // Combine header and data rows
    return [headerRow, ...dataRows].join('\n');
}

/**
 * Handle download button click
 */
function handleDownload() {
    if (!csvData) {
        showResult('No CSV data available. Please convert first.', 'error');
        return;
    }

    // Generate filename
    const filename = 'testcases.csv';

    // Create blob and download
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Show result message
 */
function showResult(message, type = 'info') {
    resultMessage.textContent = message;
    resultMessage.className = `result-message ${type}`;
    resultSection.style.display = 'block';
}

