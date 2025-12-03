# Markdown → Test Case CSV Converter

A simple, browser-based tool to convert BDD-style markdown test cases into CSV format. Works entirely in your browser with no backend required.

## Features

- ✅ 100% client-side - no server needed
- ✅ Converts BDD markdown test cases to CSV
- ✅ Supports H4 headings (`#### TC01 — Title — P1`)
- ✅ Extracts priority from headings
- ✅ Combines Given/When/Then into a single "Test Steps" column
- ✅ GitHub Pages ready

## Usage

1. Open `index.html` in your browser (or visit the GitHub Pages URL)
2. Paste your markdown test cases in the textarea
3. Click "Convert to CSV"
4. Download the generated CSV file

## Markdown Format

The tool expects test cases in this format:

```markdown
#### TC01 — Update Name (Happy Path) — P1
**Given** the user is logged into Unifize and opens the Profile menu
**When** the user updates their display name with a valid new name
**Then** the system should save the new name and immediately reflect it across the platform
```

### Format Details

- Test cases start with `####` (H4 heading)
- Format: `#### TC01 — Title — P1`
- Sections use inline format: `**Given** content`, `**When** content`, `**Then** content`
- Priority is extracted from the heading (P0, P1, etc.)
- Block headers (`### BLOCK...`) and separators (`---`) are automatically ignored

## CSV Output

The generated CSV contains these columns:

- **Test Case ID**: Extracted from heading (e.g., TC01)
- **Title**: Test case title
- **Test Steps**: Combined Given/When/Then on separate lines
- **Actual Results**: Any actual results section
- **Priority**: Extracted from heading (defaults to P1)
- **Tags**: Empty by default

## GitHub Pages Setup

1. Create a new repository on GitHub
2. Push these files to the repository
3. Go to Settings → Pages
4. Select the main branch as the source
5. Your app will be available at `https://yourusername.github.io/repository-name/`

## Files

- `index.html` - Main HTML file
- `style.css` - Styling
- `script.js` - Parsing and conversion logic

## License

Free to use and modify.

