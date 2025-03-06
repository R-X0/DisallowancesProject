// server/routes/chatgpt-scraper.js

const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cheerio = require('cheerio');
const AdmZip = require('adm-zip');
const googleDriveService = require('../services/googleDriveService');
const googleSheetsService = require('../services/googleSheetsService');

// For openai@4.x+ in CommonJS, use default import:
const OpenAI = require('openai').default;

// Instantiate the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Upload files to Google Drive and update tracking info
 */
async function uploadFilesToDriveAndUpdateTracking(trackingId, businessName, pdfPath, zipPath) {
  try {
    console.log(`Uploading protest files to Google Drive for ${trackingId}...`);
    console.log(`PDF path: ${pdfPath}`);
    console.log(`ZIP path: ${zipPath}`);
    
    // Verify files exist before upload
    if (!fsSync.existsSync(pdfPath)) {
      throw new Error(`PDF file does not exist at ${pdfPath}`);
    }
    
    if (!fsSync.existsSync(zipPath)) {
      throw new Error(`ZIP file does not exist at ${zipPath}`);
    }
    
    // Get file sizes for verification
    const pdfStats = fsSync.statSync(pdfPath);
    const zipStats = fsSync.statSync(zipPath);
    console.log(`PDF size: ${pdfStats.size} bytes`);
    console.log(`ZIP size: ${zipStats.size} bytes`);
    
    if (pdfStats.size === 0) {
      throw new Error('PDF file is empty');
    }
    
    if (zipStats.size === 0) {
      throw new Error('ZIP file is empty');
    }
    
    // Initialize Google Drive service if needed
    if (!googleDriveService.initialized) {
      console.log('Initializing Google Drive service...');
      await googleDriveService.initialize();
    }
    
    // Call the Google Drive service directly
    console.log(`Calling uploadProtestFiles with trackingId=${trackingId}, businessName=${businessName}`);
    const driveFiles = await googleDriveService.uploadProtestFiles(
      trackingId,
      businessName,
      pdfPath,
      zipPath
    );
    
    console.log(`Files uploaded to Drive for ${trackingId}:`, driveFiles);
    console.log(`- Protest Letter Link: ${driveFiles.protestLetterLink}`);
    console.log(`- ZIP Package Link: ${driveFiles.zipPackageLink}`);
    console.log(`- Folder Link: ${driveFiles.folderLink}`);
    
    // Update Google Sheet with file links
    console.log(`Updating Google Sheet for ${trackingId} with file links...`);
    await googleSheetsService.updateSubmission(trackingId, {
      status: 'PDF done',
      protestLetterPath: driveFiles.protestLetterLink,
      zipPath: driveFiles.zipPackageLink,
      googleDriveLink: driveFiles.folderLink,
      timestamp: new Date().toISOString()
    });
    
    console.log(`Google Sheet updated for ${trackingId}`);
    
    // Update the local file if it exists
    try {
      const submissionPath = path.join(__dirname, `../data/ERC_Disallowances/${trackingId}/submission_info.json`);
      const submissionData = await fs.readFile(submissionPath, 'utf8');
      const submissionInfo = JSON.parse(submissionData);
      
      submissionInfo.status = 'PDF done';
      submissionInfo.protestLetterPath = driveFiles.protestLetterLink;
      submissionInfo.zipPath = driveFiles.zipPackageLink;
      submissionInfo.googleDriveLink = driveFiles.folderLink;
      submissionInfo.timestamp = new Date().toISOString();
      
      await fs.writeFile(
        submissionPath,
        JSON.stringify(submissionInfo, null, 2)
      );
      
      console.log(`Updated local file for ${trackingId} with Google Drive links`);
    } catch (fileErr) {
      console.log(`Local file for ${trackingId} not found, skipping update`);
    }
    
    return driveFiles;
  } catch (error) {
    console.error(`Error uploading to Drive for ${trackingId}:`, error);
    throw error;
  }
}

/**
 * Use GPT to sanitize raw HTML from ChatGPT's page
 * Return only user messages, ChatGPT messages, and relevant links.
 */
async function sendToGPTForSanitization(rawHtml) {
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'o3-mini',
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

/**
 * Extract URLs from the letter and download them as PDFs
 */
async function extractAndDownloadUrls(letter, outputDir) {
  // Regular expression to match URLs in the letter
  const urlRegex = /(https?:\/\/[^\s\)]+)/g;
  const urls = [...new Set(letter.match(urlRegex) || [])];
  const attachments = [];
  
  console.log(`Found ${urls.length} unique URLs to process`);
  
  if (urls.length === 0) return { letter, attachments };
  
  // Launch browser for downloading
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
      
      // Create new page for each URL
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
        
        await page.goto(url, { 
          waitUntil: 'networkidle2', 
          timeout: 30000 
        });
        
        // Wait a bit for any remaining rendering
        await new Promise(resolve => setTimeout(resolve, 2000));
        
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
        
        attachments.push({
          originalUrl: url,
          filename: filename,
          path: pdfPath
        });
        
        // Replace URL in letter with reference to attachment
        letter = letter.replace(new RegExp(url, 'g'), `[See Attachment ${i+1}: ${filename}]`);
        
      } catch (err) {
        console.error(`Error capturing PDF for ${url}:`, err);
        // Even if there's an error, we'll try to continue with other URLs
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  
  return { letter, attachments };
}

/**
 * Generate a PDF version of the letter
 */
async function generatePdf(text, outputPath) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    const page = await browser.newPage();
    
    // Create HTML with proper formatting
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              font-size: 12pt;
              line-height: 1.5;
              margin: 1in;
            }
            pre {
              white-space: pre-wrap;
              font-family: Arial, sans-serif;
              font-size: 12pt;
            }
          </style>
        </head>
        <body>
          <pre>${text}</pre>
        </body>
      </html>
    `);
    
    await page.pdf({
      path: outputPath,
      format: 'Letter',
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      }
    });
    
    return outputPath;
  } finally {
    await browser.close();
  }
}

/**
 * Generate protest letter using OpenAI with example template
 */
async function generateERCProtestLetter(businessInfo, covidData, templateContent) {
  try {
    console.log('Generating document using GPT...');
    
    // Determine which template to use based on the document type
    let promptTemplate;
    let systemPrompt;
    
    if (businessInfo.documentType === 'form886A') {
      // For Form 886-A document
      systemPrompt = `You are an expert in creating IRS Form 886-A documents for Employee Retention Credit (ERC) substantiation. 
      Create a comprehensive Form 886-A document with sections for Issue, Facts, Law, Argument, and Conclusion based on the specific business information and COVID-19 research data provided.`;
      
      promptTemplate = `Please create a Form 886-A document for ERC substantiation using the following information:

BUSINESS INFORMATION:
Business Name: ${businessInfo.businessName}
EIN: ${businessInfo.ein}
Location: ${businessInfo.location}
Time Periods: ${businessInfo.timePeriod} and other relevant quarters
Business Type: ${businessInfo.businessType || 'business'}

COVID-19 RESEARCH DATA:
${covidData}

IMPORTANT FORMATTING INSTRUCTIONS:
1. DO NOT include direct links or URLs in the document content - they may not work and should be omitted
2. DO NOT reference "business internal records" or documentation that has not been explicitly provided
3. Use CONSISTENT formatting throughout - use bullet points (•) for all lists, not dashes or mixed formats
4. For each government order mentioned, use the EXACT following format:

• Order Name: [Full Name of Order]
• Order Number: [Official Number/Identifier]
• Date Enacted: [MM/DD/YYYY]
• Date Rescinded: [MM/DD/YYYY or "Still in effect" if applicable]
• Order Summary: [2-3 sentence description of what the order mandated]
• Impact on Quarter: [How this specifically affected the business during the relevant quarter]

FORMAT: Create a comprehensive Form 886-A document with the following structure:
1. Issue - Define the question of whether the business was fully or partially suspended by government orders
2. Facts - Detail the business operations and how they were affected by specific government orders
3. Law - Explain the ERC provisions, IRS Notice 2021-20, and other relevant guidance
4. Argument - Present the case for why the business qualifies quarter by quarter
5. Conclusion - Summarize the eligibility determination

Use today's date: ${new Date().toLocaleDateString()}`;
    
    } else {
      // Default to protest letter (original functionality)
      systemPrompt = `You are an expert in creating IRS Employee Retention Credit (ERC) protest letters. 
      Create a formal protest letter following the exact format and style of the example letter provided, 
      using the specific business information and COVID-19 research data provided.`;
      
      promptTemplate = `Please create an ERC protest letter using the following information:

BUSINESS INFORMATION:
Business Name: ${businessInfo.businessName}
EIN: ${businessInfo.ein}
Location: ${businessInfo.location}
Time Period: ${businessInfo.timePeriod}
Business Type: ${businessInfo.businessType || 'business'}

COVID-19 RESEARCH DATA FROM CHATGPT:
${covidData}

IMPORTANT FORMATTING INSTRUCTIONS:
1. DO NOT include direct links or URLs in the letter body - they may not work and should be omitted
2. DO NOT reference "business internal records" or documentation that has not been explicitly provided
3. Use CONSISTENT formatting throughout - use bullet points (•) for all lists, not dashes or mixed formats
4. For each government order mentioned, use the EXACT following format:

• Order Name: [Full Name of Order]
• Order Number: [Official Number/Identifier]
• Date Enacted: [MM/DD/YYYY]
• Date Rescinded: [MM/DD/YYYY or "Still in effect" if applicable]
• Order Summary: [2-3 sentence description of what the order mandated]
• Impact on Quarter: [How this specifically affected the business during the relevant quarter]

FORMAT EXAMPLE (FOLLOW THIS EXACT FORMAT AND STRUCTURE):
${templateContent}

Create a comprehensive protest letter using the business information and COVID data above, following the format and structure of the example letter. Make it specific to the time period and location of the business. Use today's date: ${new Date().toLocaleDateString()}`;
    }
    
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'o3-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: promptTemplate
        }
      ],
    });
    
    const generatedDocument = response.choices[0].message.content.trim();
    console.log('Document successfully generated');
    
    return generatedDocument;
  } catch (error) {
    console.error('Error generating document:', error);
    throw new Error(`Failed to generate document: ${error.message}`);
  }
}

// Generate customized COVID prompt through OpenAI
router.post('/generate-prompt', async (req, res) => {
  try {
    const { basePrompt, businessInfo } = req.body;
    
    if (!basePrompt || !businessInfo) {
      return res.status(400).json({
        success: false,
        message: 'Base prompt and business information are required'
      });
    }
    
    // Use OpenAI to generate a customized prompt
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'o3-mini',
      messages: [
        {
          role: 'system',
          content: `You are a tool that generates COVID-19 government order research prompts. 
          Your output must be ONLY the finished prompt with no explanations, introductions, or meta-commentary.
          Do not include phrases like "Here is a prompt" or "This is a customized prompt."
          Just provide the actual prompt content that the user will copy and paste.`
        },
        {
          role: 'user',
          content: `Create a detailed research prompt about COVID-19 government orders for a ${businessInfo.businessType} 
          in ${businessInfo.city}, ${businessInfo.state} during ${businessInfo.timePeriod}.
          
          Base your response on this template but improve and expand it:
          ${basePrompt}
          
          Make it more specific with questions relevant to this business type and time period.
          Format with numbered sections if appropriate, but do NOT include any explanatory text about what you're doing.
          Your entire response should be ONLY the prompt that will be copied and pasted.`
        }
      ],
    });

    // Get GPT's customized prompt
    const customizedPrompt = response.choices[0].message.content.trim();
    
    res.status(200).json({
      success: true,
      prompt: customizedPrompt
    });
  } catch (error) {
    console.error('Error generating customized prompt:', error);
    res.status(500).json({
      success: false,
      message: `Error generating prompt: ${error.message}`
    });
  }
});

// ----------------------------------------------------------------------------
// MAIN ROUTE
// ----------------------------------------------------------------------------

router.post('/process-chatgpt', async (req, res) => {
  try {
    const {
      chatGptLink,
      businessName,
      ein,
      location,
      timePeriod,
      businessType,
      trackingId,
      documentType = 'protestLetter' // Default to protest letter if not specified
    } = req.body;

    // Validate required inputs
    if (!chatGptLink) {
      return res.status(400).json({
        success: false,
        message: 'ChatGPT conversation link is required'
      });
    }
    
    if (!businessName || !ein || !timePeriod) {
      return res.status(400).json({
        success: false,
        message: 'Business name, EIN, and time period are required'
      });
    }

    console.log(`Processing ChatGPT link: ${chatGptLink}`);
    console.log(`Business: ${businessName}, Period: ${timePeriod}, Type: ${businessType || 'Not specified'}`);
    console.log(`Document Type: ${documentType}`);

    // Create unique directory for request
    const requestId = uuidv4().substring(0, 8);
    const outputDir = path.join(__dirname, `../../data/ChatGPT_Conversations/${requestId}`);
    await fs.mkdir(outputDir, { recursive: true });

    // Launch Puppeteer with robust error handling
    let browser;
    try {
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

      // 1) Grab the entire HTML
      const rawHTML = await page.content();
      console.log(`Raw HTML captured (${rawHTML.length} bytes)`);

      // 2) Send the full HTML to GPT for sanitization
      console.log('Sending to GPT for sanitization...');
      const conversationContent = await sendToGPTForSanitization(rawHTML);
      console.log(`Clean conversation length: ${conversationContent.length} chars`);

      // Save sanitized conversation
      await fs.writeFile(
        path.join(outputDir, 'conversation.txt'),
        conversationContent,
        'utf8'
      );

      // Take screenshot for reference
      try {
        await page.screenshot({
          path: path.join(outputDir, 'screenshot.png'),
          fullPage: true
        });
        console.log('Screenshot captured');
      } catch (screenshotError) {
        console.error('Screenshot error:', screenshotError);
      }

      // Close browser
      await browser.close();
      console.log('Browser closed');

      // Get the appropriate template based on document type
      let templateContent = '';
      
      if (documentType === 'form886A') {
        // Get the Form 886-A template
        try {
          templateContent = await fs.readFile(
            path.join(__dirname, '../templates/form_886a_template.txt'),
            'utf8'
          );
        } catch (err) {
          console.log('Form 886-A template not found, using default template');
          // Use a default template structure if file not found
          templateContent = 'Form 886-A template with Issue, Facts, Law, Argument, and Conclusion sections';
        }
      } else {
        // Default to the Haven for Hope example for protest letters
        try {
          templateContent = await fs.readFile(
            path.join(__dirname, '../templates/haven_for_hope_letter.txt'),
            'utf8'
          );
        } catch (err) {
          console.log('Haven for Hope template not found, using default template');
          templateContent = 'Standard protest letter format';
        }
      }

      // 3) Create business info object
      const businessInfo = {
        businessName,
        ein,
        location,
        timePeriod,
        businessType: businessType || 'business',
        documentType
      };

      // 4) Generate document using GPT with appropriate template
      const document = await generateERCProtestLetter(
        businessInfo,
        conversationContent, // Pass the entire cleaned conversation as the COVID data
        templateContent
      );
      
      // Save the generated document in text format
      const documentFileName = documentType === 'form886A' ? 'form_886a.txt' : 'protest_letter.txt';
      await fs.writeFile(
        path.join(outputDir, documentFileName),
        document,
        'utf8'
      );
      
      // 5) Process URLs in the document and download as PDFs
      console.log('Extracting and downloading URLs from the document...');
      const { letter: updatedDocument, attachments } = await extractAndDownloadUrls(
        document, 
        outputDir
      );
      
      // Save the updated document with attachment references
      const updatedFileName = documentType === 'form886A' ? 'form_886a_with_attachments.txt' : 'protest_letter_with_attachments.txt';
      await fs.writeFile(
        path.join(outputDir, updatedFileName),
        updatedDocument,
        'utf8'
      );
      
      // 6) Generate PDF version of the document
      console.log('Generating PDF version of the document...');
      const pdfFileName = documentType === 'form886A' ? 'form_886a.pdf' : 'protest_letter.pdf';
      const pdfPath = path.join(outputDir, pdfFileName);
      await generatePdf(updatedDocument, pdfPath);
      
      // 7) Create a complete package as a ZIP file
      console.log('Creating complete package ZIP file...');
      const packageName = documentType === 'form886A' ? 'form_886a_package.zip' : 'complete_protest_package.zip';
      const zipPath = path.join(outputDir, packageName);
      const zip = new AdmZip();
      
      // Add the main document PDF
      zip.addLocalFile(pdfPath);
      
      // Add all attachment PDFs
      for (const attachment of attachments) {
        zip.addLocalFile(attachment.path);
      }
      
      // Add a README file explaining the package contents
      const readmeContent = documentType === 'form886A' 
        ? `ERC FORM 886-A PACKAGE

Main Document:
- ${pdfFileName} (The main Form 886-A document)

Attachments:
${attachments.map((a, i) => `${i+1}. ${a.filename} (original URL: ${a.originalUrl})`).join('\n')}

Generated on: ${new Date().toISOString()}`
        : `ERC PROTEST PACKAGE

Main Document:
- ${pdfFileName} (The main protest letter)

Attachments:
${attachments.map((a, i) => `${i+1}. ${a.filename} (original URL: ${a.originalUrl})`).join('\n')}

Generated on: ${new Date().toISOString()}`;
      
      zip.addFile('README.txt', Buffer.from(readmeContent));
      
      // Write the ZIP file
      zip.writeZip(zipPath);
      console.log(`ZIP package created at: ${zipPath}`);

      // Upload to Google Drive if tracking ID is provided
      let driveUrls = null;
      if (trackingId) {
        try {
          console.log(`Tracking ID provided: ${trackingId}, uploading to Google Drive...`);
          
          // Verify files exist before attempting upload
          console.log(`File details for upload:`);
          console.log(`- PDF Path: ${pdfPath} (exists: ${fsSync.existsSync(pdfPath)})`);
          console.log(`- ZIP Path: ${zipPath} (exists: ${fsSync.existsSync(zipPath)})`);
          
          if (fsSync.existsSync(pdfPath) && fsSync.existsSync(zipPath)) {
            // Get file sizes
            const pdfStats = fsSync.statSync(pdfPath);
            const zipStats = fsSync.statSync(zipPath);
            console.log(`- PDF Size: ${pdfStats.size} bytes`);
            console.log(`- ZIP Size: ${zipStats.size} bytes`);
            
            // Upload files to Drive
            driveUrls = await uploadFilesToDriveAndUpdateTracking(
              trackingId,
              businessName,
              pdfPath,
              zipPath
            );
            
            console.log(`Upload complete. Drive URLs:`, driveUrls);
          } else {
            throw new Error('One or more files do not exist for upload');
          }
        } catch (driveError) {
          console.error('Error uploading to Google Drive:', driveError);
          // Continue anyway, this shouldn't fail the whole request
        }
      }

      // Include Drive URLs in the response if available
      if (driveUrls) {
        res.status(200).json({
          success: true,
          letter: updatedDocument,
          conversationContent,
          outputPath: outputDir,
          pdfPath,
          attachments,
          zipPath,
          packageFilename: path.basename(zipPath),
          googleDriveLink: driveUrls.folderLink,
          protestLetterLink: driveUrls.protestLetterLink,
          zipPackageLink: driveUrls.zipPackageLink
        });
      } else {
        res.status(200).json({
          success: true,
          letter: updatedDocument,
          conversationContent,
          outputPath: outputDir,
          pdfPath,
          attachments,
          zipPath,
          packageFilename: path.basename(zipPath)
        });
      }
    } catch (error) {
      console.error('Error during processing:', error);
      
      // Close browser if it's open
      if (browser) {
        try { 
          await browser.close();
          console.log('Browser closed after error');
        } catch (closeError) {
          console.error('Error closing browser:', closeError);
        }
      }
      
      // Send error response
      res.status(500).json({
        success: false,
        message: `Error processing ChatGPT conversation: ${error.message}`
      });
    }
  } catch (outerError) {
    console.error('Outer error in route handler:', outerError);
    res.status(500).json({
      success: false,
      message: `Critical error in request processing: ${outerError.message}`
    });
  }
});

module.exports = router;