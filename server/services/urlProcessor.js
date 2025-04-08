// server/services/urlProcessor.js

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Extract URLs from the document and download them as PDFs
 * @param {string} letter - The generated letter text
 * @param {string} outputDir - Directory to save the PDFs
 * @returns {Object} - Object containing updated letter text and attachment information
 */
async function extractAndDownloadUrls(letter, outputDir) {
  console.log("==== URL EXTRACTION DEBUG ====");
  
  // Extract URLs ONLY from the dedicated Sources section
  let urls = [];
  let sourceDescriptions = {};
  
  try {
    // Look for a dedicated Sources section
    const sourcesRegex = /SOURCES:\s*([\s\S]+?)(?:\n\n|$)/i;
    const sourcesMatch = letter.match(sourcesRegex);
    
    if (sourcesMatch && sourcesMatch[1]) {
      // Extract numbered URLs from the Sources section
      const sourceContent = sourcesMatch[1];
      const urlLines = sourceContent.split('\n').filter(line => line.trim());
      
      console.log(`Found Sources section with ${urlLines.length} entries`);
      
      // Extract URL from each line (format: "1. https://example.gov - Description")
      for (const line of urlLines) {
        // Extract URL and description using regex
        const urlMatch = line.match(/\d+\.\s*(https?:\/\/[^\s]+)(?:\s*-\s*(.+))?/);
        
        if (urlMatch && urlMatch[1]) {
          const url = urlMatch[1].trim();
          const description = urlMatch[2] ? urlMatch[2].trim() : '';
          
          if (url.length > 10) { // Simple validation
            // Check if this URL is already in our list (avoid duplicates)
            if (!urls.includes(url)) {
              urls.push(url);
              sourceDescriptions[url] = description;
            }
          }
        }
      }
      
      console.log(`Extracted ${urls.length} unique source URLs`);
    } else {
      console.log("No Sources section found in document");
      
      // Fallback to scanning for URLs only if no sources section found
      // This is just a safety fallback
      console.log("Using fallback URL detection method");
      
      // Only scan for government URLs as these are most likely to be valid sources
      const govUrlRegex = /https?:\/\/[^\s\)\"\']+\.gov[^\s\)\"\']+/gi;
      const govMatches = [...new Set(letter.match(govUrlRegex) || [])];
      
      // Add .us state sites too
      const stateUrlRegex = /https?:\/\/[^\s\)\"\']+\.us[^\s\)\"\']+/gi;
      const stateMatches = [...new Set(letter.match(stateUrlRegex) || [])];
      
      urls = [...govMatches, ...stateMatches];
      console.log(`Fallback: Found ${urls.length} government/state URLs`);
      
      // Limit to max 10 URLs in fallback mode to avoid over-attachment
      if (urls.length > 10) {
        console.log(`Limiting fallback URLs from ${urls.length} to 10`);
        urls = urls.slice(0, 10);
      }
    }
    
    // Store for debugging
    await fs.writeFile(
      path.join(outputDir, 'extracted_source_urls.txt'), 
      urls.join('\n'), 
      'utf8'
    );
    
  } catch (err) {
    console.error("Error extracting sources:", err);
    return { letter, attachments: [] };
  }
  
  const attachments = [];
  
  if (urls.length === 0) {
    console.log("No source URLs found for processing.");
    return { letter, attachments };
  }
  
  // Pre-check URLs for accessibility
  console.log("Pre-checking URLs for accessibility...");
  const validUrls = [];
  for (const url of urls) {
    try {
      // Simple HEAD request to quickly check if URL is accessible
      const headResponse = await axios.head(url, { 
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      console.log(`URL ${url} is accessible (status ${headResponse.status})`);
      validUrls.push(url);
    } catch (error) {
      console.log(`URL ${url} appears to be inaccessible - skipping`);
      // Don't add to validUrls, effectively skipping it
    }
  }
  
  console.log(`${validUrls.length} of ${urls.length} URLs appear to be accessible`);
  
  // If no valid URLs, return early
  if (validUrls.length === 0) {
    console.log("No accessible URLs found, skipping PDF generation step");
    return { letter, attachments };
  }
  
  // Launch browser for downloading
  console.log("Launching browser to process valid URLs...");
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    for (let i = 0; i < validUrls.length; i++) {
      const url = validUrls[i];
      const description = sourceDescriptions[url] || '';
      
      // Create a sanitized filename with source number
      const sourceNum = i + 1;
      const urlDomain = new URL(url).hostname.replace('www.', '');
      const filename = `source_${sourceNum}_${urlDomain}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const pdfPath = path.join(outputDir, filename);
      
      console.log(`Processing source #${sourceNum}: ${url}`);
      
      // Check if URL is already a PDF
      let isPdf = url.toLowerCase().endsWith('.pdf');
      
      if (!isPdf) {
        try {
          // Check Content-Type header
          const headResponse = await axios.head(url, { 
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          });
          const contentType = headResponse.headers['content-type'];
          isPdf = contentType && contentType.includes('application/pdf');
          console.log(`Content-Type for ${url}: ${contentType}, isPdf: ${isPdf}`);
        } catch (error) {
          console.log(`Could not check content type for ${url}, will process as regular URL: ${error.message}`);
          isPdf = false;
        }
      }
      
      if (isPdf) {
        // Direct download for PDF URLs
        try {
          console.log(`Downloading PDF directly: ${url}`);
          const response = await axios({
            method: 'get',
            url: url,
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
          });
          
          await fs.writeFile(pdfPath, response.data);
          console.log(`Successfully downloaded PDF from ${url} to ${pdfPath}`);
          
          attachments.push({
            originalUrl: url,
            filename: filename,
            path: pdfPath,
            description: description
          });
          
          // Update letter references
          letter = letter.replace(
            new RegExp(`\\b${sourceNum}\\.\\s*${escapeRegExp(url)}\\b`, 'g'), 
            `${sourceNum}. [Attachment ${sourceNum}: ${filename}]`
          );
        } catch (error) {
          console.error(`Error directly downloading PDF from ${url}:`, error);
          console.log(`Trying Puppeteer as fallback for PDF URL: ${url}`);
          await processPuppeteer(browser, url, pdfPath, sourceNum, filename, description, letter, attachments);
        }
      } else {
        // Use Puppeteer for non-PDF URLs
        await processPuppeteer(browser, url, pdfPath, sourceNum, filename, description, letter, attachments);
      }
    }
  } finally {
    await browser.close();
  }
  
  console.log(`Processed ${attachments.length} attachments from ${validUrls.length} URLs`);
  
  // Final update to letter - replace the entire Sources section with an Attachments section
  if (attachments.length > 0) {
    const attachmentsSection = `ATTACHMENTS:\n${attachments.map((a, i) => 
      `${i+1}. ${a.filename} - ${a.description || a.originalUrl}`
    ).join('\n')}`;
    
    // Replace the Sources section with Attachments section
    letter = letter.replace(/SOURCES:[\s\S]+?(?:\n\n|$)/i, attachmentsSection + '\n\n');
  }
  
  return { letter, attachments };
}

// Helper function to process a URL using Puppeteer to generate a PDF
async function processPuppeteer(browser, url, pdfPath, sourceNum, filename, description, letter, attachments) {
  const page = await browser.newPage();
  try {
    // Set a longer timeout and try to wait for network idle
    await page.setDefaultNavigationTimeout(60000);
    
    // Block images and other non-essential resources for faster loading
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['image', 'font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });
    
    console.log(`Navigating to ${url} with Puppeteer`);
    
    // First check if the page is accessible with a quicker timeout
    try {
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 15000
      });
    } catch (navError) {
      console.log(`URL appears to be inaccessible: ${url} - Error: ${navError.message}`);
      console.log(`Skipping broken link: ${url}`);
      return;
    }
    
    // Continue with full loading
    try {
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });
    } catch (fullLoadError) {
      console.log(`Full page load failed but page is accessible, continuing: ${fullLoadError.message}`);
    }
    
    // Wait a bit for any remaining rendering
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(`Generating PDF from ${url}`);
    await page.pdf({ 
      path: pdfPath, 
      format: 'Letter',
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      },
      printBackground: true
    });
    
    console.log(`Successfully created PDF at ${pdfPath}`);
    attachments.push({
      originalUrl: url,
      filename: filename,
      path: pdfPath,
      description: description
    });
    
    // Update letter references
    letter = letter.replace(
      new RegExp(`\\b${sourceNum}\\.\\s*${escapeRegExp(url)}\\b`, 'g'), 
      `${sourceNum}. [Attachment ${sourceNum}: ${filename}]`
    );
  } catch (err) {
    console.error(`Error capturing PDF for ${url}:`, err);
    console.log(`Skipping broken link: ${url}`);
  } finally {
    await page.close();
  }
}

// Helper function to escape special characters for regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  extractAndDownloadUrls
};