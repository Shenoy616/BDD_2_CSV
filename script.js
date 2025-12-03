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
 * Handles both markdown format (#### headings) and plain BDD format (TC01 - Title)
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

        // Check if this is a test case heading
        // Format 1: #### TC01 — Title — P1 (markdown format)
        // Format 2: TC01 - Title - Subtitle [Priority: P1] (plain format)
        const isMarkdownHeading = trimmedLine.startsWith('#### ');
        const isPlainHeading = /^TC\d+\s*[-–—]\s*.+/.test(trimmedLine);
        
        if (isMarkdownHeading || isPlainHeading) {
            // Save previous test case if exists
            if (currentTestCase) {
                // Process the collected block lines
                processTestCaseBlock(currentTestCase, currentBlockLines);
                testCases.push(currentTestCase);
            }

            // Start new test case
            let heading;
            if (isMarkdownHeading) {
                heading = trimmedLine.substring(5).trim(); // Remove '#### '
            } else {
                heading = trimmedLine;
            }
            
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
 * Formats:
 *   - TC01 — Update Name (Happy Path) — P1
 *   - TC01 - Update Profile Name - Happy Path [Priority: P1]
 */
function parseHeading(heading) {
    let priority = 'P1'; // default
    
    // Extract priority from [Priority: P1] format
    const bracketPriorityMatch = heading.match(/\[Priority:\s*(P[0-9]+)\]/i);
    if (bracketPriorityMatch) {
        priority = bracketPriorityMatch[1].toUpperCase();
        // Remove priority from heading for further parsing
        heading = heading.replace(/\s*\[Priority:\s*P[0-9]+\]/i, '').trim();
    }
    
    // Extract priority from — P1 format at the end
    const emDashPriorityMatch = heading.match(/\s*[—–]\s*(P[0-9]+)\s*$/i);
    if (emDashPriorityMatch) {
        priority = emDashPriorityMatch[1].toUpperCase();
        // Remove priority from heading for further parsing
        heading = heading.replace(/\s*[—–]\s*P[0-9]+\s*$/i, '').trim();
    }

    // Pattern: TC followed by numbers, then separator (—, –, -, or :), then title
    // Matches: TC01 - Title, TC01 — Title, TC01: Title
    const idPattern = /^(TC\d+)\s*[—–\-:]\s*(.+)$/i;
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
 * Handles multiple formats:
 *   - **Given** content (markdown bold)
 *   - Given content (plain BDD)
 *   - And content (continuation)
 */
function processTestCaseBlock(testCase, blockLines) {
    let currentSection = null; // 'given', 'steps', 'expectedResults', 'actualResults'
    
    for (const line of blockLines) {
        const trimmed = line.trim();
        if (!trimmed) {
            // Empty line resets current section
            currentSection = null;
            continue;
        }

        // Check for markdown inline format: **Given** content
        const markdownPattern = /^\*\*((?:Given|When|Then|Actual\s+Results))\*\*\s*(.+)$/i;
        const markdownMatch = trimmed.match(markdownPattern);

        if (markdownMatch) {
            const sectionType = markdownMatch[1].toLowerCase().replace(/\s+/g, ' ');
            const content = markdownMatch[2].trim();

            // Map to our section keys
            if (sectionType === 'given') {
                currentSection = 'given';
                testCase.given.push(cleanContentLine(content));
            } else if (sectionType === 'when') {
                currentSection = 'steps';
                testCase.steps.push(cleanContentLine(content));
            } else if (sectionType === 'then') {
                currentSection = 'expectedResults';
                testCase.expectedResults.push(cleanContentLine(content));
            } else if (sectionType === 'actual results') {
                currentSection = 'actualResults';
                testCase.actualResults.push(cleanContentLine(content));
            }
            continue;
        }

        // Check for plain BDD format: Given/When/Then/And at start of line
        // Pattern matches: "Given ...", "When ...", "Then ...", "And ..."
        const bddPattern = /^(Given|When|Then|And)\s+(.+)$/i;
        const bddMatch = trimmed.match(bddPattern);

        if (bddMatch) {
            const keyword = bddMatch[1].toLowerCase();
            const content = bddMatch[2].trim();

            // Map keywords to sections
            if (keyword === 'given') {
                currentSection = 'given';
                testCase.given.push(cleanContentLine(content));
            } else if (keyword === 'when') {
                currentSection = 'steps';
                testCase.steps.push(cleanContentLine(content));
            } else if (keyword === 'then') {
                currentSection = 'expectedResults';
                testCase.expectedResults.push(cleanContentLine(content));
            } else if (keyword === 'and') {
                // "And" continues the current section
                if (currentSection === 'given') {
                    testCase.given.push(cleanContentLine(content));
                } else if (currentSection === 'steps') {
                    testCase.steps.push(cleanContentLine(content));
                } else if (currentSection === 'expectedResults') {
                    testCase.expectedResults.push(cleanContentLine(content));
                } else if (currentSection === 'actualResults') {
                    testCase.actualResults.push(cleanContentLine(content));
                } else {
                    // If no current section, default to expectedResults (most common after Then)
                    currentSection = 'expectedResults';
                    testCase.expectedResults.push(cleanContentLine(content));
                }
            }
            continue;
        }

        // Check for standalone section headers (for backward compatibility)
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
                currentSection = sectionKey;
                break;
            }
        }

        // If it's a continuation line (starts with bullet or indentation) and we have a current section
        if (!matchedSection && currentSection) {
            const bulletPattern = /^[-*+•]\s*(.+)$/;
            const bulletMatch = trimmed.match(bulletPattern);
            const content = bulletMatch ? bulletMatch[1].trim() : trimmed;
            
            if (currentSection === 'given') {
                testCase.given.push(cleanContentLine(content));
            } else if (currentSection === 'steps') {
                testCase.steps.push(cleanContentLine(content));
            } else if (currentSection === 'expectedResults') {
                testCase.expectedResults.push(cleanContentLine(content));
            } else if (currentSection === 'actualResults') {
                testCase.actualResults.push(cleanContentLine(content));
            }
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

