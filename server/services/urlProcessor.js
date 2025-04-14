// urlProcessor.js - Improved URL handling and PDF generation

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const axios = require('axios');
const { PDFDocument } = require('pdf-lib'); // Add this dependency if not already included

/**
 * Extract URLs from the document and download them as PDFs with enhanced error handling
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
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
          // Add these arguments to help with government websites
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-web-security',
          '--disable-features=BlockInsecurePrivateNetworkRequests']
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
      let retries = 3; // Increased number of retries for each URL
      
      while (retries > 0 && !success) {
        // Determine if URL is a PDF or other supported document type
        const isPdf = url.toLowerCase().endsWith('.pdf');
        const isDoc = url.toLowerCase().match(/\.(doc|docx|xls|xlsx|ppt|pptx|txt)$/);
        
        // Try direct download with different methods
        try {
          console.log(`Attempt #${4-retries}: Direct download for ${url}`);
          
          // IMPROVED: Try fetch with different user agents
          const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15'
          ];
          
          const response = await axios({
            method: 'get',
            url: url,
            responseType: 'arraybuffer',
            timeout: 45000, // Longer timeout
            headers: {
              'User-Agent': userAgents[retries % userAgents.length],
              'Accept': 'text/html,application/xhtml+xml,application/xml,application/pdf;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
              'Cache-Control': 'max-age=0'
            }
          });
          
          // IMPROVED: Validate response before saving
          if (response.status === 200 && response.data && response.data.byteLength > 500) {
            // Check if it's actually a PDF (if it claims to be)
            const contentType = response.headers['content-type'] || '';
            if (isPdf || contentType.includes('pdf')) {
              try {
                // Validate PDF structure before saving
                await validatePdfContent(response.data);
                await fs.writeFile(pdfPath, response.data);
                console.log(`Successfully downloaded and validated PDF from ${url}`);
                success = true;
              } catch (pdfError) {
                console.log(`Downloaded content is not a valid PDF (${pdfError.message}). Will try Puppeteer fallback.`);
              }
            } else {
              // Not a PDF - write the file and we'll convert it with Puppeteer
              const tempFilePath = path.join(pdfDir, `temp_${sourceNum}_${urlDomain}.html`);
              await fs.writeFile(tempFilePath, response.data);
              console.log(`Downloaded HTML content for subsequent PDF conversion: ${tempFilePath}`);
              
              // NEW: Convert directly from downloaded HTML file to avoid network issues
              try {
                const page = await browser.newPage();
                await page.setDefaultNavigationTimeout(60000);
                
                // Load from local file
                await page.goto(`file://${tempFilePath}`, { waitUntil: 'domcontentloaded' });
                
                // Wait for content to render
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Generate PDF
                await page.pdf({ 
                  path: pdfPath, 
                  format: 'Letter',
                  margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
                  printBackground: true
                });
                
                await page.close();
                
                // Validate the created PDF
                if (await validatePdfFile(pdfPath)) {
                  console.log(`Successfully converted downloaded HTML to PDF from ${url}`);
                  success = true;
                } else {
                  console.log(`PDF conversion from downloaded HTML failed validation`);
                }
                
                // Clean up temp file
                try { await fs.unlink(tempFilePath); } catch (e) {}
              } catch (conversionError) {
                console.log(`Error converting downloaded HTML: ${conversionError.message}`);
              }
            }
          } else {
            console.log(`Downloaded content too small or empty (${response.data?.byteLength || 0} bytes)`);
          }
        } catch (error) {
          console.log(`Direct download failed: ${error.message}`);
        }
        
        // If direct download and conversion failed, try Puppeteer to render the page
        if (!success) {
          try {
            console.log(`Attempting to capture webpage with Puppeteer: ${url}`);
            const page = await browser.newPage();
            await page.setDefaultNavigationTimeout(60000);
            
            // IMPROVED: Set more realistic viewport and user agent
            await page.setViewport({ width: 1200, height: 1500 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            
            // IMPROVED: Set extra HTTP headers that might help with government sites
            await page.setExtraHTTPHeaders({
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Upgrade-Insecure-Requests': '1'
            });
            
            // Try to navigate to the page with retry logic
            let loaded = false;
            try {
              await page.goto(url, { 
                waitUntil: 'networkidle2', 
                timeout: 30000 
              });
              loaded = true;
            } catch (navError) {
              console.log(`Navigation error with networkidle2: ${navError.message}`);
              try {
                await page.goto(url, { 
                  waitUntil: 'domcontentloaded', 
                  timeout: 30000 
                });
                loaded = true;
              } catch (navError2) {
                console.log(`Navigation error with domcontentloaded: ${navError2.message}`);
                try {
                  await page.goto(url, { 
                    waitUntil: 'load', 
                    timeout: 45000 
                  });
                  loaded = true;
                } catch (navError3) {
                  console.log(`Final navigation error: ${navError3.message}`);
                }
              }
            }
            
            if (loaded) {
              // NEW: Try to bypass paywalls, cookie banners, etc.
              await page.evaluate(() => {
                // Remove overlay elements
                const selectors = [
                  // General overlays
                  '.overlay', '.modal', '.popup', '.dialog', '.cookie-banner', '.consent-banner',
                  // Access denied and login walls
                  '.paywall', '#paywall', '[class*="paywall"]', '[id*="paywall"]',
                  '.login-wall', '#login-wall', '[class*="login"]',
                  // Cookie notices
                  '[class*="cookie"]', '[id*="cookie"]', '.gdpr', '#gdpr', '[class*="consent"]',
                  // Any fixed position elements that might block content
                  'div[style*="position: fixed"]', 'div[style*="position:fixed"]'
                ];
                
                selectors.forEach(selector => {
                  document.querySelectorAll(selector).forEach(el => {
                    try { el.remove(); } catch (e) {}
                  });
                });
                
                // Add special handling for common government websites
                if (window.location.hostname.includes('.gov')) {
                  // Some gov sites hide content before accepting terms
                  const acceptButtons = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"]'))
                    .filter(el => {
                      const text = el.innerText?.toLowerCase() || '';
                      return text.includes('accept') || text.includes('agree') || text.includes('continue');
                    });
                  
                  acceptButtons.forEach(button => {
                    try { button.click(); } catch (e) {}
                  });
                }
                
                // Try to make content visible if hidden
                document.body.style.overflow = 'visible';
                document.documentElement.style.overflow = 'visible';
              });
              
              // Wait a bit longer for content to be more fully loaded
              await new Promise(resolve => setTimeout(resolve, 5000));
              
              // Try to find "Access Denied" text that indicates the page is blocked
              const isAccessDenied = await page.evaluate(() => {
                const pageText = document.body.innerText.toLowerCase();
                return pageText.includes('access denied') || 
                       pageText.includes('access forbidden') || 
                       pageText.includes('403 forbidden') ||
                       pageText.includes('not authorized');
              });
              
              if (isAccessDenied) {
                console.log('Detected "Access Denied" on page, trying special handling...');
                // Special handling for access denied pages - create custom PDF later
                await page.close();
              } else {
                // Generate PDF from the page
                await page.pdf({ 
                  path: pdfPath, 
                  format: 'Letter',
                  margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
                  printBackground: true
                });
                
                await page.close();
                
                // Validate the created PDF
                if (await validatePdfFile(pdfPath)) {
                  console.log(`Successfully created and validated PDF from ${url}`);
                  success = true;
                } else {
                  console.log(`Created PDF failed validation`);
                }
              }
            } else {
              await page.close();
            }
          } catch (puppeteerError) {
            console.error(`Error capturing with Puppeteer: ${puppeteerError.message}`);
          }
        }
        
        retries--;
        
        // Wait between retries
        if (!success && retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      // If still not successful, create a better placeholder PDF
      if (!success) {
        try {
          console.log(`Creating enhanced placeholder PDF for failed URL: ${url}`);
          const placeholderPage = await browser.newPage();
          
          // Create a more comprehensive placeholder with styling and details
          await placeholderPage.setContent(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="UTF-8">
                <title>Source ${sourceNum} - Reference Document</title>
                <style>
                  body {
                    font-family: Arial, sans-serif;
                    margin: 40px;
                    line-height: 1.6;
                    color: #333;
                  }
                  h1 {
                    color: #2c3e50;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 10px;
                  }
                  h2 {
                    color: #3498db;
                    margin-top: 25px;
                  }
                  .url-box {
                    border: 1px solid #ddd;
                    padding: 15px;
                    margin: 20px 0;
                    background-color: #f9f9f9;
                    border-radius: 5px;
                  }
                  .url {
                    word-break: break-all;
                    color: #2980b9;
                    font-family: monospace;
                    font-size: 14px;
                  }
                  .note {
                    background-color: #fef9e7;
                    border-left: 4px solid #f1c40f;
                    padding: 15px;
                    margin: 20px 0;
                  }
                  .footer {
                    margin-top: 40px;
                    border-top: 1px solid #eee;
                    padding-top: 10px;
                    font-size: 12px;
                    color: #7f8c8d;
                  }
                </style>
              </head>
              <body>
                <h1>Source ${sourceNum}: Government Order Reference</h1>
                
                <div class="url-box">
                  <h2>Source Information</h2>
                  <p><strong>URL:</strong></p>
                  <p class="url">${url}</p>
                  <p><strong>Description:</strong> ${description || 'Government order or directive referenced in protest letter'}</p>
                </div>
                
                <div class="note">
                  <h2>Important Note</h2>
                  <p>This document serves as a reference to the government order cited in the protest letter. The source URL could not be automatically converted to PDF due to one of the following reasons:</p>
                  <ul>
                    <li>The page requires authentication or has access restrictions</li>
                    <li>The website uses security measures that prevent automated access</li>
                    <li>The content may have been modified or moved since it was originally cited</li>
                    <li>Technical limitations in capturing certain types of web content</li>
                  </ul>
                </div>
                
                <h2>Manual Access Instructions</h2>
                <p>To view the original content, please:</p>
                <ol>
                  <li>Copy the URL above into your web browser</li>
                  <li>If prompted for credentials or blocked by security measures, you may need to:</li>
                  <ul>
                    <li>Access from a government network if it's a restricted government resource</li>
                    <li>Contact the website administrator for appropriate access</li>
                    <li>Use an Internet Archive service like the Wayback Machine to find an archived version</li>
                  </ul>
                </ol>
                
                <div class="footer">
                  <p>Reference document created: ${new Date().toISOString()}</p>
                  <p>This placeholder document maintains the citation order referenced in the protest letter.</p>
                </div>
              </body>
            </html>
          `);
          
          await placeholderPage.pdf({ 
            path: pdfPath, 
            format: 'Letter',
            margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
            printBackground: true
          });
          
          await placeholderPage.close();
          
          // Validate the created PDF placeholder
          if (await validatePdfFile(pdfPath)) {
            console.log(`Created enhanced placeholder PDF for ${url}`);
            success = true;
          } else {
            // Last resort - create a minimal PDF directly using pdf-lib
            await createMinimalPlaceholderPdf(pdfPath, url, sourceNum, description);
            success = true;
          }
        } catch (placeholderError) {
          console.error(`Error creating placeholder PDF: ${placeholderError.message}`);
          // Last resort - create a minimal PDF directly using pdf-lib
          await createMinimalPlaceholderPdf(pdfPath, url, sourceNum, description);
          success = true;
        }
      }
      
      // Verify the PDF exists and has content before adding to attachments
      try {
        if (await validatePdfFile(pdfPath)) {
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
          console.log(`PDF file failed validation, creating minimal fallback: ${pdfPath}`);
          // Final fallback - create a minimal PDF
          await createMinimalPlaceholderPdf(pdfPath, url, sourceNum, description);
          
          // Add it only if it exists
          if (fsSync.existsSync(pdfPath) && fsSync.statSync(pdfPath).size > 0) {
            attachments.push({
              originalUrl: url,
              filename: filename,
              path: pdfPath,
              description: description
            });
            
            // Update letter text
            letter = letter.replace(new RegExp(`\\b${escapeRegExp(url)}\\b`, 'g'), 
              `[See Attachment ${sourceNum}: ${filename}]`);
              
            console.log(`Added minimal fallback attachment ${sourceNum}: ${filename}`);
          }
        }
      } catch (finalError) {
        console.error(`Fatal error processing attachment ${sourceNum}: ${finalError.message}`);
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

/**
 * Validate PDF content from a buffer
 * @param {Buffer} buffer - PDF content as buffer
 * @returns {Promise<boolean>} - True if valid PDF
 */
async function validatePdfContent(buffer) {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();
    // Only valid if it has at least one page
    return pageCount > 0;
  } catch (error) {
    console.log(`PDF validation error: ${error.message}`);
    return false;
  }
}

/**
 * Validate an existing PDF file
 * @param {string} filePath - Path to PDF file
 * @returns {Promise<boolean>} - True if valid PDF
 */
async function validatePdfFile(filePath) {
  try {
    // First check if file exists and has minimum size
    const stats = fsSync.statSync(filePath);
    if (stats.size < 100) {
      return false;
    }
    
    // Then check PDF structure
    const buffer = await fs.readFile(filePath);
    return await validatePdfContent(buffer);
  } catch (error) {
    console.log(`PDF file validation error: ${error.message}`);
    return false;
  }
}

/**
 * Create a minimal placeholder PDF using pdf-lib as final fallback
 * @param {string} outputPath - Where to save the PDF
 * @param {string} url - URL that failed
 * @param {number} sourceNum - Source number
 * @param {string} description - Source description
 */
async function createMinimalPlaceholderPdf(outputPath, url, sourceNum, description) {
  try {
    console.log(`Creating minimal fallback PDF for ${url} using pdf-lib`);
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Add a page
    const page = pdfDoc.addPage([612, 792]); // Letter size
    
    // Add text content
    const { width, height } = page.getSize();
    
    // Title
    page.drawText(`Source ${sourceNum}: Reference Document`, {
      x: 50,
      y: height - 50,
      size: 18
    });
    
    // URL (broken into multiple lines if needed)
    page.drawText('URL:', {
      x: 50,
      y: height - 100,
      size: 12
    });
    
    // Wrap long URLs
    const maxWidth = width - 100;
    let urlText = url;
    let urlY = height - 120;
    
    while (urlText.length > 0 && urlY > 100) {
      // Take a chunk of the URL that fits
      let chunk = urlText;
      if (urlText.length > 80) { // Simple estimate, proper text measuring would be better
        chunk = urlText.substring(0, 80);
      }
      
      page.drawText(chunk, {
        x: 50,
        y: urlY,
        size: 10
      });
      
      urlText = urlText.substring(chunk.length);
      urlY -= 20;
    }
    
    // Description
    page.drawText('Description:', {
      x: 50,
      y: urlY - 20,
      size: 12
    });
    
    page.drawText(description || 'Government order or directive referenced in protest letter', {
      x: 50,
      y: urlY - 40,
      size: 10
    });
    
    // Note
    page.drawText('Note: This source could not be automatically downloaded.', {
      x: 50,
      y: urlY - 80,
      size: 12
    });
    
    page.drawText('Please access the URL manually to view the referenced content.', {
      x: 50,
      y: urlY - 100,
      size: 10
    });
    
    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outputPath, pdfBytes);
    
    console.log(`Successfully created minimal fallback PDF at ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`Error creating minimal fallback PDF: ${error.message}`);
    return false;
  }
}

// Helper function to escape special characters for regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  extractAndDownloadUrls
};