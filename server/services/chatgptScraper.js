// server/services/chatgptScraper.js

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');
const OpenAI = require('openai').default;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Scrape and process a ChatGPT conversation from a shared link
 * @param {string} chatGptLink - The shared ChatGPT conversation link
 * @param {string} outputDir - Directory to save output files
 * @returns {string} - The sanitized conversation content
 */
async function scrapeConversation(chatGptLink, outputDir) {
  let browser;
  
  try {
    // Launch Puppeteer with robust error handling
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
      ],
    });

    console.log('Browser launched');
    const page = await browser.newPage();
    
    // Set longer timeouts for stability
    await page.setDefaultNavigationTimeout(90000);
    await page.setDefaultTimeout(60000);

    // Block non-essential resources for faster loading
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Navigate with robust error handling
    console.log(`Navigating to: ${chatGptLink}`);
    try {
      await page.goto(chatGptLink, { 
        waitUntil: 'networkidle2',
        timeout: 60000 
      });
      console.log('Navigation complete (networkidle2)');
    } catch (navError) {
      console.error('Initial navigation error:', navError);
      try {
        console.log('Trying domcontentloaded instead');
        await page.goto(chatGptLink, { 
          waitUntil: 'domcontentloaded',
          timeout: 60000 
        });
        console.log('Navigation complete (domcontentloaded)');
      } catch (secondNavError) {
        console.error('Second navigation error:', secondNavError);
        console.log('Trying with basic load');
        await page.goto(chatGptLink, { 
          waitUntil: 'load',
          timeout: 90000 
        });
        console.log('Basic navigation complete');
      }
    }

    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Grab the entire HTML
    const rawHTML = await page.content();
    console.log(`Raw HTML captured (${rawHTML.length} bytes)`);

    // Take screenshot for reference
    try {
      await page.screenshot({
        path: path.join(outputDir, 'screenshot.png'),
        fullPage: true
      });
      console.log('Screenshot captured');
    } catch (screenshotError) {
      console.error('Screenshot error:', screenshotError);
      // Continue even if screenshot fails
    }

    // Close browser
    await browser.close();
    console.log('Browser closed');
    
    // Send the full HTML to GPT for sanitization
    console.log('Sending to GPT for sanitization...');
    const conversationContent = await sanitizeConversation(rawHTML);
    
    // Save sanitized conversation
    await fs.writeFile(
      path.join(outputDir, 'conversation.txt'),
      conversationContent,
      'utf8'
    );
    
    return conversationContent;
  } catch (error) {
    // Close browser if it's open
    if (browser) {
      try { 
        await browser.close(); 
        console.log('Browser closed after error');
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
    
    throw new Error(`Failed to scrape ChatGPT conversation: ${error.message}`);
  }
}

/**
 * Use GPT to sanitize raw HTML from ChatGPT's page
 * Returns only user messages, ChatGPT messages, and relevant links.
 */
async function sanitizeConversation(rawHtml) {
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'o1',
      messages: [
        {
          role: 'system',
          content: `You are a specialized assistant that extracts COVID-19 related government orders and regulations from ChatGPT conversations. 
          YOUR GOAL IS TO SANITIZE THE CONVERSATION FROM THE HTML/SERIALIZATION. RETURN THE ENTIRE CONVERSATION IN FULL CLEANED WITH ALL LINKS PROVIDED AS WELL`
        },
        {
          role: 'user',
          content: `Here is the entire HTML of a ChatGPT page discussing COVID-19 government orders.:
${rawHtml}`
        }
      ],
    });

    // Get GPT's cleaned-up text
    const cleanedText = response.choices[0].message.content.trim();
    return cleanedText;
  } catch (error) {
    console.error('Error calling OpenAI for sanitization:', error);
    
    // Fallback: basic HTML parsing with cheerio if OpenAI call fails
    try {
      const $ = cheerio.load(rawHtml);
      const messages = [];
      
      // Get all message elements (this selector may need updating based on ChatGPT's HTML structure)
      $('div[data-message]').each((i, el) => {
        const role = $(el).attr('data-message-author-role');
        const text = $(el).text().trim();
        
        if (text && (role === 'user' || role === 'assistant')) {
          messages.push(`${role === 'user' ? 'User:' : 'ChatGPT:'} ${text}`);
        }
      });
      
      return messages.join('\n\n');
    } catch (cheerioError) {
      console.error('Cheerio fallback also failed:', cheerioError);
      // Last resort: return raw HTML with tags stripped out
      return rawHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '';
    }
  }
}

module.exports = {
  scrapeConversation
};