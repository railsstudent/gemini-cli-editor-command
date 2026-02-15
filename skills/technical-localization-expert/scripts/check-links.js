#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Script to validate external HTTP/HTTPS links in a Markdown file.
 * Usage: ./check-links.js <path-to-markdown-file>
 */

async function checkMarkdownLinks() {
  // 1. Get the file path from CLI arguments
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Error: Please provide a markdown file path.');
    console.log('Usage: ./check-links.js document.md');
    process.exit(1);
  }

  // 2. Read the file
  let content;
  try {
    content = fs.readFileSync(path.resolve(filePath), 'utf8');
  } catch (err) {
    console.error(`Error: Could not read file "${filePath}"`);
    process.exit(1);
  }

  // 3. Extract links using Regex
  // Matches [text](url) where url starts with http or https
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const links = [];
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    links.push({ text: match[1], url: match[2] });
  }

  if (links.length === 0) {
    console.log('No external links found to check.');
    process.exit(0);
  }

  console.log(`Found ${links.length} links. Checking status...\n`);

  // 4. Validate links in parallel
  const results = await Promise.all(links.map(async (link) => {
    try {
      // Use HEAD request first (faster, no body download)
      // Some servers block HEAD, so we fallback to GET if needed
      let response = await fetch(link.url, { 
        method: 'HEAD', 
        signal: AbortSignal.timeout(5000) 
      });

      if (!response.ok) {
        response = await fetch(link.url, { 
            method: 'GET', 
            signal: AbortSignal.timeout(5000) 
        });
      }

      return {
        url: link.url,
        status: response.status,
        ok: response.ok
      };
    } catch (error) {
      return {
        url: link.url,
        status: error.name === 'TimeoutError' ? 'Timeout' : 'Error',
        ok: false,
        error: error.message
      };
    }
  }));

  // 5. Report Results
  let brokenCount = 0;
  results.forEach(res => {
    if (res.ok) {
      console.log(`✅ [${res.status}] ${res.url}`);
    } else {
      console.log(`❌ [${res.status}] ${res.url}`);
      brokenCount++;
    }
  });

  console.log('\n--- Summary ---');
  if (brokenCount === 0) {
    console.log('All links are valid! 🎉');
    process.exit(0);
  } else {
    console.log(`${brokenCount} broken link(s) detected.`);
    process.exit(1); // Exit with error for the Agent to catch
  }
}

checkMarkdownLinks();