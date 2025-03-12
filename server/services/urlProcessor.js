// server/services/urlProcessor.js

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const axios = require('axios'); // Make sure to install this: npm install axios --save

/**
 * Extract URLs from the conversation and download them as PDFs
 * @param {string} letter - The generated letter text
 * @param {string} outputDir - Directory to save the PDFs
 * @returns {Object} - Object containing updated letter text and attachment information
 */
async function extractAndDownloadUrls(letter, outputDir) {
  console.log("==== URL EXTRACTION DEBUG ====");
  
  // We'll extract URLs from the conversation.txt file instead of the letter
  let urls = [];
  let conversationContent = "";
  
  try {
    const conversationPath = path.join(outputDir, 'conversation.txt');
    if (!fsSync.existsSync(conversationPath)) {
      console.log("No conversation.txt file found, cannot extract URLs");
      return { letter, attachments: [] };
    }
    
    conversationContent = await fs.readFile(conversationPath, 'utf8');
    console.log(`Read conversation content: ${conversationContent.length} characters`);
    
    // Store for debugging
    await fs.writeFile(path.join(outputDir, 'conversation_for_url_extraction.txt'), conversationContent, 'utf8');
    
    // Comprehensive regex for URL detection
    const urlRegex = /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
    
    // Find all matches in the conversation content
    const matches = conversationContent.match(urlRegex) || [];
    console.log(`Raw URL matches found in conversation: ${matches.length}`);
    
    // Post-process matches to normalize and filter
    urls = [...new Set(matches)]
      .filter(url => {
        // Basic filtering to remove false positives
        return url.includes('.') && 
               !url.startsWith('...') && 
               url.length > 4 &&
               !/^[0-9.]+$/.test(url); // Avoid IP-like numbers
      })
      .map(url => {
        // Normalize the URL by adding protocol if missing
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return `https://${url}`;
        }
        return url;
      });
    
    console.log(`Found ${urls.length} unique URLs to process from conversation`);
    console.log('URLs to process:', urls);
    
  } catch (err) {
    console.error("Error reading conversation file:", err);
    return { letter, attachments: [] };
  }
  
  const attachments = [];
  
  if (urls.length === 0) {
    console.log("WARNING: No URLs found in conversation for processing.");
    return { letter, attachments };
  }
  
  // Launch browser for downloading
  console.log("Launching browser to process URLs...");
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const filename = `attachment_${i+1}_${url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}.pdf`;
      const pdfPath = path.join(outputDir, filename);
      
      console.log(`Processing URL (${i+1}/${urls.length}): ${url}`);
      
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
        console.log(`Detected PDF URL, downloading directly: ${url}`);
        try {
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
          console.log(`Successfully downloaded PDF directly from ${url} to ${pdfPath}`);
          
          attachments.push({
            originalUrl: url,
            filename: filename,
            path: pdfPath
          });
          
          // Update letter references
          if (letter.includes(url)) {
            letter = letter.replace(
              new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 
              `[See Attachment ${i+1}: ${filename}]`
            );
          }
        } catch (error) {
          console.error(`Error directly downloading PDF from ${url}:`, error);
          // Fall back to Puppeteer method if direct download fails
          console.log(`Falling back to browser-based capture for ${url}`);
          await processPuppeteer(browser, url, pdfPath, i, filename, letter, attachments);
        }
      } else {
        // Use Puppeteer for non-PDF URLs
        await processPuppeteer(browser, url, pdfPath, i, filename, letter, attachments);
      }
    }
  } finally {
    await browser.close();
  }
  
  console.log(`Processed ${attachments.length} attachments from ${urls.length} URLs`);
  return { letter, attachments };
}

/**
 * Process a URL using Puppeteer to generate a PDF
 * @param {Object} browser - Puppeteer browser instance
 * @param {string} url - URL to process
 * @param {string} pdfPath - Path to save the PDF
 * @param {number} index - Index of the URL in the list
 * @param {string} filename - Filename for the attachment
 * @param {string} letter - The letter text to update references in
 * @param {Array} attachments - Array to add the attachment to
 */
async function processPuppeteer(browser, url, pdfPath, index, filename, letter, attachments) {
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
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
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
      path: pdfPath
    });
    
    // Update letter references
    if (letter.includes(url)) {
      letter = letter.replace(
        new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 
        `[See Attachment ${index+1}: ${filename}]`
      );
    } else {
      console.log(`URL ${url} not found in letter, not replacing`);
    }
  } catch (err) {
    console.error(`Error capturing PDF for ${url}:`, err);
    // Even if there's an error, we'll try to continue with other URLs
  } finally {
    await page.close();
  }
}

module.exports = {
  extractAndDownloadUrls
};