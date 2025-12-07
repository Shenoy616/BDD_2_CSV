// Global state
let csvData = null;

// DOM elements
const markdownInput = document.getElementById('markdownInput');
const testcaseInput = document.getElementById('testcaseInput');
const convertBtn = document.getElementById('convertBtn');
const convertTestcaseBtn = document.getElementById('convertTestcaseBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resultSection = document.getElementById('resultSection');
const resultMessage = document.getElementById('resultMessage');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            switchTab(tabName);
        });
    });

    // BDD converter
    convertBtn.addEventListener('click', handleConvert);
    
    // Testcase converter
    convertTestcaseBtn.addEventListener('click', handleTestcaseConvert);
    
    // Download button
    downloadBtn.addEventListener('click', handleDownload);
    
    // Enable convert buttons when there's content
    markdownInput.addEventListener('input', () => {
        if (markdownInput.value.trim()) {
            convertBtn.disabled = false;
        } else {
            convertBtn.disabled = true;
        }
    });

    testcaseInput.addEventListener('input', () => {
        if (testcaseInput.value.trim()) {
            convertTestcaseBtn.disabled = false;
        } else {
            convertTestcaseBtn.disabled = true;
        }
    });
});

/**
 * Switch between tabs
 */
function switchTab(tabName) {
    // Update tab buttons
    tabButtons.forEach(btn => {
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update tab contents
    tabContents.forEach(content => {
        if (content.id === `${tabName}Tab`) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });

    // Hide result section when switching tabs
    resultSection.style.display = 'none';
    csvData = null;
}

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

        // Ignore separator lines (---, ---, etc.)
        if (/^-{3,}\s*$/.test(trimmedLine)) {
            continue;
        }

        // Ignore H3 block headers (### BLOCK...)
        if (trimmedLine.startsWith('### ') && !trimmedLine.startsWith('#### ')) {
            continue;
        }

        // Check if this is a test case heading
        // Format 1: #### TC01 — Title — P1 (markdown format)
        // Format 2: TC01 - Title - Subtitle [Priority: P1] (plain format)
        const isMarkdownHeading = /^####\s+/.test(trimmedLine);
        const isPlainHeading = /^TC\d+\s*[-–—:]\s*.+/.test(trimmedLine);
        
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
    
    // Extract priority from [Priority: P1] or [Priority:P1] format
    const bracketPriorityMatch = heading.match(/\[Priority\s*:\s*(P\d+)\]/i);
    if (bracketPriorityMatch) {
        priority = bracketPriorityMatch[1].toUpperCase();
        // Remove priority from heading for further parsing
        heading = heading.replace(/\s*\[Priority\s*:\s*P\d+\]\s*/i, '').trim();
    }
    
    // Extract priority from — P1 or - P1 format at the end
    const emDashPriorityMatch = heading.match(/[\s—–\-]+\s*(P\d+)\s*$/i);
    if (emDashPriorityMatch) {
        priority = emDashPriorityMatch[1].toUpperCase();
        // Remove priority from heading for further parsing
        heading = heading.replace(/[\s—–\-]+\s*P\d+\s*$/i, '').trim();
    }

    // Pattern: TC followed by numbers, then separator (—, –, -, or :), then title
    // Matches: TC01 - Title, TC01 — Title, TC01: Title, TC01 – Title
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

        // Check for markdown inline format: **Given** content or **Given:** content
        const markdownPattern = /^\*\*((?:Given|When|Then|Actual\s+Results?))\*\*\s*:?\s*(.+)$/i;
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
        // Pattern matches: "Given ...", "When ...", "Then ...", "And ...", "Given:", "When:", etc.
        const bddPattern = /^(Given|When|Then|And)\s*:?\s+(.+)$/i;
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
        // Remove markdown formatting (**, __, etc.)
        normalizedLine = normalizedLine.replace(/\*\*|__/g, '').trim();

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
            // Match various bullet styles: -, *, +, •, ◦, ▪, ▫, or numbered lists (1., 2., etc.)
            const bulletPattern = /^([-*+•◦▪▫]|\d+[.)])\s*(.+)$/;
            const bulletMatch = trimmed.match(bulletPattern);
            const content = bulletMatch ? bulletMatch[2].trim() : trimmed;
            
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
    // Remove leading bullet markers (-, *, +, •, ◦, ▪, ▫) or numbered lists
    let cleaned = line.replace(/^([-*+•◦▪▫]|\d+[.)])\s+/, '');
    
    // Remove markdown emphasis markers
    // First remove bold markers (**bold**, __bold__) - must be done first
    cleaned = cleaned.replace(/\*\*/g, '');
    cleaned = cleaned.replace(/__/g, '');
    // Then remove remaining italic markers (*italic*, _italic_) - single asterisk/underscore
    // Use word boundaries to avoid removing asterisks in the middle of words
    cleaned = cleaned.replace(/\b\*\b/g, '');
    cleaned = cleaned.replace(/\b_\b/g, '');
    // Also handle standalone asterisks/underscores at word boundaries
    cleaned = cleaned.replace(/\s*\*\s*/g, ' ');
    cleaned = cleaned.replace(/\s*_\s*/g, ' ');
    
    // Remove markdown code markers (`code`)
    cleaned = cleaned.replace(/`/g, '');
    
    // Clean up multiple spaces
    cleaned = cleaned.replace(/\s+/g, ' ');
    
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

/**
 * Handle testcase convert button click (new format)
 */
function handleTestcaseConvert() {
    const input = testcaseInput.value.trim();
    
    if (!input) {
        showResult('Please enter or paste test case content first.', 'error');
        return;
    }

    try {
        const testCases = parseTestcaseFormat(input);
        
        if (testCases.length === 0) {
            showResult('No test cases found. Make sure your input contains test case titles.', 'error');
            return;
        }

        // Generate CSV
        csvData = generateTestcaseCSV(testCases);
        
        // Show success message
        showResult(`✅ Parsed ${testCases.length} test case${testCases.length === 1 ? '' : 's'} successfully.`, 'success');
        
        downloadBtn.disabled = false;
    } catch (error) {
        showResult(`Error parsing test cases: ${error.message}`, 'error');
        console.error('Parse error:', error);
    }
}

/**
 * Parse testcase format into test case objects
 * Format:
 *   Title line
 *   Given (Preconditions)
 *   ...content...
 *   Steps (When)
 *   ...content...
 *   Expected Results (Then)
 *   ...content...
 *   Actual Results
 *   ...content...
 */
function parseTestcaseFormat(input) {
    const lines = input.split('\n');
    const testCases = [];
    let currentTestCase = null;
    let currentSection = null;
    let sectionContent = [];
    let previousLineWasEmpty = false;

    // Helper function to save current section
    function saveCurrentSection() {
        if (currentTestCase && currentSection && sectionContent.length > 0) {
            if (currentSection === 'given') {
                currentTestCase.given = [...sectionContent];
            } else if (currentSection === 'steps') {
                currentTestCase.steps = [...sectionContent];
            } else if (currentSection === 'expectedResults') {
                currentTestCase.expectedResults = [...sectionContent];
            } else if (currentSection === 'actualResults') {
                currentTestCase.actualResults = [...sectionContent];
            }
            sectionContent = [];
        }
    }

    // Helper function to check if a line is a section header
    // Handles both formats: "Given (Preconditions)" and "##Given (Preconditions)"
    function isSectionHeader(line) {
        const trimmed = line.trim();
        // Remove leading markdown headers (##, ###, ####) if present
        const cleaned = trimmed.replace(/^#{1,4}\s*/, '').trim();
        // Comprehensive pattern that handles spacing variations, optional parentheses, and case variations
        // Handles: "Given (Preconditions)", "Given(Preconditions)", "Given", "##Given (Preconditions)", etc.
        const sectionPattern = /^(Given\s*\(?\s*Preconditions?\s*\)?|When\s*\(?\s*Steps?\s*\)?|Steps\s*\(?\s*When\s*\)?|Then\s*\(?\s*Expected\s+Results?\s*\)?|Expected\s+Results?\s*\(?\s*Then\s*\)?|Actual\s+Results?)\s*$/i;
        return sectionPattern.test(cleaned);
    }

    // Helper function to check if a line is a separator (dash line)
    function isSeparator(line) {
        const trimmed = line.trim();
        // Match lines that are primarily dashes, hyphens, or equal signs (separators)
        // Must have at least 10 consecutive dashes/hyphens/equals to be considered a separator
        return /^[-=]{10,}\s*$/.test(trimmed);
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Handle separator lines (dash separators between test cases)
        if (isSeparator(trimmed)) {
            // Save current test case if exists
            if (currentTestCase) {
                saveCurrentSection();
                testCases.push(currentTestCase);
                currentTestCase = null;
                currentSection = null;
                sectionContent = [];
            }
            previousLineWasEmpty = true;
            continue;
        }

        // Handle empty lines
        if (!trimmed) {
            previousLineWasEmpty = true;
            continue;
        }

        // Check if this is a section header
        if (isSectionHeader(trimmed)) {
            // Save previous section
            saveCurrentSection();

            // Determine section type (remove markdown header prefix if present)
            const cleaned = trimmed.replace(/^#{1,4}\s*/, '').trim();
            const sectionText = cleaned.toLowerCase();
            if (sectionText.includes('given')) {
                currentSection = 'given';
            } else if (sectionText.includes('steps') || sectionText.includes('when')) {
                currentSection = 'steps';
            } else if (sectionText.includes('expected') || sectionText.includes('then')) {
                currentSection = 'expectedResults';
            } else if (sectionText.includes('actual')) {
                currentSection = 'actualResults';
            }
            previousLineWasEmpty = false;
            continue;
        }

        // Check if this is a new test case title
        // A new title appears when:
        // 1. We don't have a current test case (first test case or after separator), OR
        // 2. We have a test case, previous line was empty, and this line is NOT a section header
        //    (meaning we've finished the previous test case and this is a new title)
        // Must not be a section header
        const isNewTitle = !isSectionHeader(trimmed) && 
                          (!currentTestCase || (currentTestCase && previousLineWasEmpty));

        if (isNewTitle) {
            // Save previous test case if exists
            if (currentTestCase) {
                saveCurrentSection();
                testCases.push(currentTestCase);
            }

            // Start new test case
            currentTestCase = {
                title: trimmed,
                given: [],
                steps: [],
                expectedResults: [],
                actualResults: []
            };
            currentSection = null;
            sectionContent = [];
            previousLineWasEmpty = false;
            continue;
        }

        // If we have a current section, this is content for that section
        if (currentSection) {
            sectionContent.push(trimmed);
            previousLineWasEmpty = false;
            continue;
        }

        // If we reach here, we have a test case but no section yet
        // This might be title continuation (though typically title is single line)
        // Or it might be content before first section - treat as title continuation
        if (currentTestCase) {
            currentTestCase.title += ' ' + trimmed;
        }
        previousLineWasEmpty = false;
    }

    // Save the last test case
    if (currentTestCase) {
        saveCurrentSection();
        testCases.push(currentTestCase);
    }

    return testCases;
}

/**
 * Generate CSV string from test cases (Title and Description only)
 */
function generateTestcaseCSV(testCases) {
    const headers = ['Title', 'Description'];

    const rows = testCases.map(testCase => {
        // Build description with section headers prefixed with ##
        const descriptionParts = [];

        if (testCase.given.length > 0) {
            descriptionParts.push('##Given (Preconditions)');
            descriptionParts.push(...testCase.given);
            descriptionParts.push(''); // Add blank line after section
        }

        if (testCase.steps.length > 0) {
            descriptionParts.push('##Steps (When)');
            descriptionParts.push(...testCase.steps);
            descriptionParts.push(''); // Add blank line after section
        }

        if (testCase.expectedResults.length > 0) {
            descriptionParts.push('##Expected Results (Then)');
            descriptionParts.push(...testCase.expectedResults);
            descriptionParts.push(''); // Add blank line after section
        }

        if (testCase.actualResults.length > 0) {
            descriptionParts.push('##Actual Results');
            descriptionParts.push(...testCase.actualResults);
        }

        // Remove trailing blank line if exists
        if (descriptionParts[descriptionParts.length - 1] === '') {
            descriptionParts.pop();
        }

        return {
            'Title': testCase.title.trim(),
            'Description': descriptionParts.join('\n')
        };
    });

    return toCSV(rows, headers);
}

