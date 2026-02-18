#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Script to validate asset integrity and translation status.
 * Usage: ./check-links.js <source-en.md> <target-translated.md>
 */

async function checkMarkdownLinks() {
  const sourcePath = process.argv[2];
  const targetPath = process.argv[3];

  if (!sourcePath || !targetPath) {
    console.error('Error: Please provide both source and target markdown files.');
    console.log('Usage: ./check-links.js source-en.md target-es.md');
    process.exit(1);
  }

  try {
    const sourceContent = fs.readFileSync(path.resolve(sourcePath), 'utf8');
    const targetContent = fs.readFileSync(path.resolve(targetPath), 'utf8');

    // Matches ![Alt Text](url) or [Link Text](url)
    // Group 1: optional '!' | Group 2: Text | Group 3: URL
    const assetRegex = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;

    const extract = (content) => {
      const results = [];
      let match;
      while ((match = assetRegex.exec(content)) !== null) {
        results.push({
          isImage: match[1] === '!',
          text: match[2].trim(),
          url: match[3].trim()
        });
      }
      return results;
    };

    const sourceAssets = extract(sourceContent);
    const targetAssets = extract(targetContent);

    if (sourceAssets.length !== targetAssets.length) {
      console.warn(`⚠️ Warning: Asset count mismatch! Source: ${sourceAssets.length}, Target: ${targetAssets.length}\n`);
    }

    let errors = [];
    let externalLinksToCheck = [];

    // 1. Validation Loop
    sourceAssets.forEach((src, i) => {
      const trg = targetAssets[i];
      if (!trg) {
        errors.push(`Missing asset in target: [${src.text}](${src.url})`);
        return;
      }

      // Check if text is translated (should NOT match unless it's an empty string or code)
      const isCode = src.text.startsWith('`') && src.text.endsWith('`');
      if (src.text && src.text === trg.text && !isCode) {
        errors.push(`Untranslated Text: Asset #${i+1} still says "${src.text}"`);
      }

      // Check URL Integrity (Internal paths might differ if depth changed, but external must match)
      if (src.url.startsWith('http')) {
        if (src.url !== trg.url) {
          errors.push(`URL Mismatch: Source "${src.url}" vs Target "${trg.url}"`);
        }
        externalLinksToCheck.push(trg.url);
      } else {
        // For relative paths, we ensure they aren't accidentally translated into words
        // (e.g., ../assets/ changed to ../activos/)
        if (trg.url.match(/[^\x00-\x7F]/)) { 
           errors.push(`Relative Path Error: Path "${trg.url}" contains non-English characters.`);
        }
      }
    });

    // 2. Report Integrity Errors
    if (errors.length > 0) {
      console.log('❌ Integrity & Translation Errors:');
      errors.forEach(err => console.log(`  - ${err}`));
    } else {
      console.log('✅ Asset integrity and translation checks passed.');
    }

    // 3. Optional: Validate External Links Connectivity
    if (externalLinksToCheck.length > 0) {
      console.log(`\nChecking connectivity for ${externalLinksToCheck.length} external links...`);
      await validateConnectivity(externalLinksToCheck);
    }

    if (errors.length > 0) process.exit(1);

  } catch (err) {
    console.error(`File Error: ${err.message}`);
    process.exit(1);
  }
}

async function validateConnectivity(urls) {
  const results = await Promise.all(urls.map(async (url) => {
    try {
      let response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      if (!response.ok) response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
      return { url, ok: response.ok, status: response.status };
    } catch (e) {
      return { url, ok: false, status: 'Error/Timeout' };
    }
  }));

  results.forEach(res => {
    if (!res.ok) console.log(`  ❌ [${res.status}] ${res.url}`);
  });
}

checkMarkdownLinks();