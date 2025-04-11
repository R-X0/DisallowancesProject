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
  
  // Extract URLs from the dedicated Sources section using a simpler approach
  const urls = [];
  const sourceDescriptions = {};
  
  // Look for the Sources section which should be structured in a numbered list format
  const sourcesRegex = /SOURCES:\s*([\s\S]+?)(?:\n\n|$)/i;
  const sourcesMatch = letter.match(sourcesRegex);
  
  if (!sourcesMatch || !sourcesMatch[1]) {
    console.log("No Sources section found in document");
    return { letter, attachments: [] };
  }
  
  // Process the sources section line by line
  const sourceContent = sourcesMatch[1];
  const sourceLines = sourceContent.split('\n').filter(line => line.trim());
  
  console.log(`Found Sources section with ${sourceLines.length} entries`);
  
  // Extract numbered URLs (format: "1. https://example.gov - Description")
  for (const line of sourceLines) {
    const urlMatch = line.match(/\d+\.\s*(https?:\/\/[^\s]+)(?:\s*-\s*(.+))?/);
    
    if (urlMatch && urlMatch[1]) {
      const url = urlMatch[1].trim();
      const description = urlMatch[2] ? urlMatch[2].trim() : '';
      
      if (url.length > 10) { // Basic validation
        urls.push(url);
        sourceDescriptions[url] = description;
        console.log(`Found source URL: ${url}`);
      }
    }
  }
  
  if (urls.length === 0) {
    console.log("No valid URLs found in the Sources section");
    return { letter, attachments: [] };
  }
  
  console.log(`Processing ${urls.length} source URLs...`);
  const attachments = [];
  
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
      const urlDomain = new URL(url).hostname.replace('www.', '');
      const filename = `source_${sourceNum}_${urlDomain}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const pdfPath = path.join(outputDir, filename);
      
      console.log(`Processing source #${sourceNum}: ${url}`);
      
      let success = false;
      
      // Determine if URL is a PDF
      const isPdf = url.toLowerCase().endsWith('.pdf');
      
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
      }
      
      // If direct download failed and it's not a PDF, use Puppeteer
      if (!success && !isPdf) {
        try {
          const page = await browser.newPage();
          await page.setDefaultNavigationTimeout(60000);
          
          // Try to navigate to the page
          try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            console.log(`Successfully loaded ${url}`);
          } catch (navError) {
            console.log(`Navigation timeout, continuing with partial load: ${navError.message}`);
            // Continue anyway, we might have loaded enough content
          }
          
          // Generate PDF from the page
          await page.pdf({ 
            path: pdfPath, 
            format: 'Letter',
            margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
            printBackground: true
          });
          
          console.log(`Successfully created PDF from ${url}`);
          success = true;
          await page.close();
        } catch (puppeteerError) {
          console.error(`Error capturing with Puppeteer: ${puppeteerError.message}`);
        }
      }
      
      if (success) {
        // Add to attachments list
        attachments.push({
          originalUrl: url,
          filename: filename,
          path: pdfPath,
          description: description
        });
        
        // Update the letter text to reference the attachment
        letter = letter.replace(
          new RegExp(`\\b${sourceNum}\\.\\s*${escapeRegExp(url)}\\b`, 'g'),
          `${sourceNum}. [Attachment ${sourceNum}: ${filename}]`
        );
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
    
    letter = letter.replace(/SOURCES:[\s\S]+?(?:\n\n|$)/i, attachmentsSection + '\n\n');
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