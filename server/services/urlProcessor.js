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
  console.log("Processing attachments from sources section...");
  
  // Extract URLs from the dedicated Sources section using a more robust approach
  const urls = [];
  const sourceDescriptions = {};
  
  // Look for the Sources section which should be structured in a numbered list format
  // More flexible regex to catch different variations of the SOURCES section
  const sourcesRegex = /(?:SOURCES|REFERENCES|ATTACHMENTS):\s*([\s\S]+?)(?:\n\n|$)/i;
  const sourcesMatch = letter.match(sourcesRegex);
  
  if (!sourcesMatch || !sourcesMatch[1]) {
    console.log("No Sources section found in document. Trying to find URLs directly in text...");
    
    // Fallback - try to find URLs directly in the text
    const urlRegex = /(https?:\/\/[^\s\)]+)(?=[\s\)])/g;
    let match;
    let counter = 1;
    
    while ((match = urlRegex.exec(letter)) !== null) {
      const url = match[1];
      if (url.length > 10 && !urls.includes(url)) { // Basic validation and deduplication
        urls.push(url);
        sourceDescriptions[url] = `Reference ${counter}`;
        counter++;
        console.log(`Found URL directly in text: ${url}`);
      }
    }
    
    if (urls.length === 0) {
      console.log("No valid URLs found in the document");
      return { letter, attachments: [] };
    }
  } else {
    // Process the sources section line by line
    const sourceContent = sourcesMatch[1];
    const sourceLines = sourceContent.split('\n').filter(line => line.trim());
    
    console.log(`Found Sources section with ${sourceLines.length} entries`);
    
    // More flexible regex to extract URLs with various numbering/formatting styles
    for (const line of sourceLines) {
      // Match numbered items, bulleted items, or plain URLs
      const urlMatch = line.match(/(?:\d+\.|\•|\-|\*)\s*(https?:\/\/[^\s]+)(?:\s*[\-\–]\s*(.+))?/) || 
                       line.match(/(https?:\/\/[^\s]+)(?:\s*[\-\–]\s*(.+))?/);
      
      if (urlMatch && urlMatch[1]) {
        const url = urlMatch[1].trim();
        // Clean up URL if it has trailing punctuation
        const cleanUrl = url.replace(/[.,;:]+$/, '');
        const description = urlMatch[2] ? urlMatch[2].trim() : '';
        
        if (cleanUrl.length > 10 && !urls.includes(cleanUrl)) { // Basic validation and deduplication
          urls.push(cleanUrl);
          sourceDescriptions[cleanUrl] = description;
          console.log(`Found source URL: ${cleanUrl}`);
        }
      }
    }
  }
  
  if (urls.length === 0) {
    console.log("No valid URLs found after processing");
    return { letter, attachments: [] };
  }
  
  console.log(`Processing ${urls.length} source URLs...`);
  const attachments = [];
  
  // Create PDF directory if it doesn't exist
  const pdfDir = path.join(outputDir, 'attachments');
  try {
    await fs.mkdir(pdfDir, { recursive: true });
    console.log(`Created attachments directory: ${pdfDir}`);
  } catch (err) {
    console.log(`Using existing attachments directory: ${pdfDir}`);
  }
  
  // Launch browser for processing URLs
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    // Process each URL and generate an attachment
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const sourceNum = i + 1;
      const description = sourceDescriptions[url] || '';
      
      // Create a filename based on the source number and URL domain
      let urlDomain = 'source';
      try {
        urlDomain = new URL(url).hostname.replace('www.', '');
      } catch (e) {
        console.log(`Invalid URL format for ${url}, using generic domain name`);
      }
      
      const filename = `source_${sourceNum}_${urlDomain}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const pdfPath = path.join(pdfDir, filename);
      
      console.log(`Processing source #${sourceNum}: ${url}`);
      
      let success = false;
      let retries = 2; // Number of retries for each URL
      
      while (retries > 0 && !success) {
        // Determine if URL is a PDF or other supported document type
        const isPdf = url.toLowerCase().endsWith('.pdf');
        const isDoc = url.toLowerCase().match(/\.(doc|docx|xls|xlsx|ppt|pptx|txt)$/);
        
        // Try direct download first (works for PDFs and some documents)
        try {
          console.log(`Attempting direct download for ${url}`);
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
          console.log(`Successfully downloaded content from ${url}`);
          success = true;
        } catch (error) {
          console.log(`Direct download failed: ${error.message}`);
          if (isPdf || isDoc) {
            // If it's a document type that should be directly downloadable, wait and retry
            await new Promise(resolve => setTimeout(resolve, 2000));
            retries--;
            continue;
          }
        }
        
        // If direct download failed and it's not a direct document, use Puppeteer
        if (!success) {
          try {
            console.log(`Attempting to capture webpage with Puppeteer: ${url}`);
            const page = await browser.newPage();
            await page.setDefaultNavigationTimeout(60000);
            
            // Set up request interception to block unnecessary resources
            await page.setRequestInterception(true);
            page.on('request', (req) => {
              const resourceType = req.resourceType();
              // Block unnecessary resources to speed up loading
              if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
                req.abort();
              } else {
                req.continue();
              }
            });
            
            // Try to navigate to the page with retry logic
            let loaded = false;
            try {
              await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
              loaded = true;
            } catch (navError) {
              console.log(`Navigation error with networkidle2: ${navError.message}`);
              try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                loaded = true;
              } catch (navError2) {
                console.log(`Navigation error with domcontentloaded: ${navError2.message}`);
                try {
                  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
                  loaded = true;
                } catch (navError3) {
                  console.log(`Final navigation error: ${navError3.message}`);
                }
              }
            }
            
            if (loaded) {
              // Wait for content to be more fully loaded
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              // Remove cookie banners and other overlays that might obstruct content
              await page.evaluate(() => {
                // Find and remove common cookie banner selectors
                const selectors = [
                  '.cookie-banner', '#cookie-banner', '.cookie-notice', '#cookie-notice',
                  '.consent-banner', '#consent-banner', '.gdpr', '#gdpr',
                  '.modal', '.popup', '.overlay', '[class*="cookie"]', '[class*="consent"]',
                  '[id*="cookie"]', '[id*="consent"]'
                ];
                selectors.forEach(selector => {
                  document.querySelectorAll(selector).forEach(el => {
                    el.remove();
                  });
                });
              });
              
              // Generate PDF from the page
              await page.pdf({ 
                path: pdfPath, 
                format: 'Letter',
                margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
                printBackground: true
              });
              
              console.log(`Successfully created PDF from ${url}`);
              success = true;
            }
            
            await page.close();
          } catch (puppeteerError) {
            console.error(`Error capturing with Puppeteer: ${puppeteerError.message}`);
          }
        }
        
        retries--;
      }
      
      // If still not successful, create a placeholder PDF
      if (!success) {
        try {
          console.log(`Creating placeholder PDF for failed URL: ${url}`);
          const placeholderPage = await browser.newPage();
          await placeholderPage.setContent(`
            <html>
              <head>
                <title>Source ${sourceNum} - Unable to Download</title>
                <style>
                  body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                  h1 { color: #d9534f; }
                  .url { word-break: break-all; color: #0275d8; }
                  .box { border: 1px solid #ddd; padding: 20px; margin-top: 20px; background-color: #f9f9f9; }
                </style>
              </head>
              <body>
                <h1>Source ${sourceNum} - Unable to Download</h1>
                <p>The system attempted to download the following URL but was unsuccessful:</p>
                <div class="box">
                  <p class="url">${url}</p>
                  <p><strong>Description:</strong> ${description || 'No description provided'}</p>
                </div>
                <p>This placeholder document has been generated to maintain the document reference order.</p>
                <p>Please manually visit the URL above to view the source content.</p>
                <hr>
                <p>Generated on: ${new Date().toISOString()}</p>
              </body>
            </html>
          `);
          
          await placeholderPage.pdf({ 
            path: pdfPath, 
            format: 'Letter',
            margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' }
          });
          
          await placeholderPage.close();
          console.log(`Created placeholder PDF for ${url}`);
          success = true;
        } catch (placeholderError) {
          console.error(`Error creating placeholder PDF: ${placeholderError.message}`);
        }
      }
      
      // Verify the PDF exists and has content before adding to attachments
      try {
        const stats = fsSync.statSync(pdfPath);
        if (stats.size > 0) {
          attachments.push({
            originalUrl: url,
            filename: filename,
            path: pdfPath,
            description: description
          });
          
          // Update the letter text to reference the attachment
          const pattern = new RegExp(`(\\d+\\.\\s*)${escapeRegExp(url)}\\b`, 'g');
          letter = letter.replace(pattern, `$1[See Attachment ${sourceNum}: ${filename}]`);
          
          // Also handle cases where URL is not prefixed with a number
          const patternWithoutNumber = new RegExp(`\\b${escapeRegExp(url)}\\b`, 'g');
          letter = letter.replace(patternWithoutNumber, `[See Attachment ${sourceNum}: ${filename}]`);
          
          console.log(`Added attachment ${sourceNum}: ${filename}`);
        } else {
          console.log(`PDF file is empty, skipping attachment: ${pdfPath}`);
          // Delete empty file
          await fs.unlink(pdfPath);
        }
      } catch (statError) {
        console.error(`Error verifying PDF file: ${statError.message}`);
      }
    }
  } finally {
    await browser.close();
  }
  
  // Replace Sources section with Attachments section
  if (attachments.length > 0) {
    const attachmentsSection = `ATTACHMENTS:\n${attachments.map((a, i) => 
      `${i+1}. ${a.filename} - ${a.description || a.originalUrl}`
    ).join('\n')}`;
    
    if (sourcesMatch) {
      letter = letter.replace(/(?:SOURCES|REFERENCES):\s*[\s\S]+?(?=\n\n|$)/i, attachmentsSection);
    } else {
      // If no existing Sources section, add Attachments section at the end
      letter += `\n\n${attachmentsSection}`;
    }
  }
  
  console.log(`Successfully processed ${attachments.length} attachments`);
  return { letter, attachments };
}

// Helper function to escape special characters for regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  extractAndDownloadUrls
};