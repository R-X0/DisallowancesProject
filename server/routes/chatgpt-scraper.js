// server/routes/chatgpt-scraper.js

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const chatgptScraper = require('../services/chatgptScraper');
const documentGenerator = require('../services/documentGenerator');
const pdfGenerator = require('../services/pdfGenerator');
const urlProcessor = require('../services/urlProcessor');
const packageCreator = require('../services/packageCreator');
const protestDriveUploader = require('../services/protestDriveUploader');

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
    
    // Use the documentGenerator to create a customized prompt
    const customizedPrompt = await documentGenerator.generateCustomPrompt(basePrompt, businessInfo);
    
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

// Main process to handle ChatGPT conversation
router.post('/process-chatgpt', async (req, res) => {
  try {
    const {
      chatGptLink,
      businessName,
      ein,
      location,
      timePeriod,
      allTimePeriods,
      businessType,
      trackingId,
      documentType = 'protestLetter', // Default to protest letter if not specified
      // Extract all revenue fields
      q1_2019, q2_2019, q3_2019, q4_2019,
      q1_2020, q2_2020, q3_2020, q4_2020,
      q1_2021, q2_2021, q3_2021,
      // Additional context information
      revenueReductionInfo,
      governmentOrdersInfo,
      // Pre-calculated data if provided
      revenueDeclines,
      qualifyingQuarters,
      approachFocus,
      // New parameters
      includeRevenueSection,
      disallowanceReason,
      customDisallowanceReason,
      outputFormat = 'pdf' // Default to PDF if not specified
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
    console.log(`Include Revenue Section: ${includeRevenueSection !== false ? 'Yes' : 'No'}`);
    console.log(`Output Format: ${outputFormat}`);
    
    // Log if multiple time periods are provided
    if (allTimePeriods && Array.isArray(allTimePeriods)) {
      console.log(`All Time Periods: ${allTimePeriods.join(', ')}`);
    }

    // Create unique directory for request
    const requestId = uuidv4().substring(0, 8);
    const outputDir = path.join(__dirname, `../../data/ChatGPT_Conversations/${requestId}`);
    await fs.mkdir(outputDir, { recursive: true });

    try {
      // 1. Scrape and process the ChatGPT conversation
      console.log('Scraping ChatGPT conversation...');
      const conversationContent = await chatgptScraper.scrapeConversation(chatGptLink, outputDir);
      console.log(`Conversation content retrieved (${conversationContent.length} chars)`);

      // 2. Get the appropriate template based on document type
      let templateContent = await documentGenerator.getTemplateContent(documentType);

      // 3. Create business info object - now with ALL revenue data and new parameters
      const businessInfo = {
        businessName,
        ein,
        location,
        timePeriod,
        allTimePeriods: allTimePeriods || [timePeriod],
        businessType: businessType || 'business',
        documentType,
        // Include all quarterly revenue data
        q1_2019, q2_2019, q3_2019, q4_2019,
        q1_2020, q2_2020, q3_2020, q4_2020,
        q1_2021, q2_2021, q3_2021,
        // Include additional context
        revenueReductionInfo,
        governmentOrdersInfo,
        // Include pre-calculated data if available
        revenueDeclines,
        qualifyingQuarters,
        // Include approach focus
        approachFocus: approachFocus || 'governmentOrders',
        // Include new parameters
        includeRevenueSection: includeRevenueSection !== false,
        disallowanceReason: disallowanceReason || 'no_orders',
        customDisallowanceReason: customDisallowanceReason || '',
        outputFormat: outputFormat || 'pdf'
      };

      // Log revenue data that's being passed
      console.log('Business Info for Revenue Calculation:', {
        q1_2019: businessInfo.q1_2019,
        q2_2019: businessInfo.q2_2019,
        q3_2019: businessInfo.q3_2019,
        q4_2019: businessInfo.q4_2019,
        q1_2020: businessInfo.q1_2020,
        q2_2020: businessInfo.q2_2020,
        q3_2020: businessInfo.q3_2020,
        q4_2020: businessInfo.q4_2020,
        q1_2021: businessInfo.q1_2021,
        q2_2021: businessInfo.q2_2021,
        q3_2021: businessInfo.q3_2021,
        includeRevenueSection: businessInfo.includeRevenueSection
      });

      // 4. Generate document using the conversation content and template
      console.log('Generating document...');
      const document = await documentGenerator.generateERCDocument(
        businessInfo,
        conversationContent,
        templateContent
      );
      
      // Save the generated document in text format
      const documentFileName = documentType === 'form886A' ? 'form_886a.txt' : 'protest_letter.txt';
      await fs.writeFile(
        path.join(outputDir, documentFileName),
        document,
        'utf8'
      );
      
      // 5. Process URLs in the document and download as PDFs
      console.log('Extracting and downloading URLs from the document...');
      const { letter: updatedDocument, attachments } = await urlProcessor.extractAndDownloadUrls(
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
      
      // 6. Generate PDF version of the document
      console.log('Generating PDF version of the document...');
      const pdfFileName = documentType === 'form886A' ? 'form_886a.pdf' : 'protest_letter.pdf';
      const pdfPath = path.join(outputDir, pdfFileName);
      await pdfGenerator.generatePdf(updatedDocument, pdfPath);
      
      // 7. Generate DOCX version if requested
      let docxPath = null;
      if (outputFormat === 'docx') {
        console.log('Generating DOCX version of the document...');
        const docxFileName = documentType === 'form886A' ? 'form_886a.docx' : 'protest_letter.docx';
        docxPath = path.join(outputDir, docxFileName);
        await documentGenerator.generateDocx(updatedDocument, docxPath);
      }
      
      // 8. Create a complete package as a ZIP file
      console.log('Creating complete package ZIP file...');
      const packageName = documentType === 'form886A' ? 'form_886a_package.zip' : 'complete_protest_package.zip';
      const zipPath = path.join(outputDir, packageName);
      
      // Use the correct format when creating the package
      await packageCreator.createPackage(
        outputFormat === 'docx' ? docxPath : pdfPath, 
        attachments, 
        zipPath, 
        documentType,
        outputFormat
      );
      
      // 9. Upload to Google Drive if tracking ID is provided
      let driveUrls = null;
      if (trackingId) {
        try {
          console.log(`Tracking ID provided: ${trackingId}, uploading to Google Drive...`);
          driveUrls = await protestDriveUploader.uploadToGoogleDrive(
            trackingId,
            businessName,
            pdfPath,
            zipPath,
            docxPath
          );
          console.log(`Upload complete. Drive URLs:`, driveUrls);
        } catch (driveError) {
          console.error('Error uploading to Google Drive:', driveError);
          // Continue anyway, this shouldn't fail the whole request
        }
      }

      // 10. Send response with all generated content
      if (driveUrls) {
        res.status(200).json({
          success: true,
          letter: updatedDocument,
          conversationContent,
          outputPath: outputDir,
          pdfPath,
          docxPath, // Include docxPath in response
          attachments,
          zipPath,
          packageFilename: path.basename(zipPath),
          googleDriveLink: driveUrls.folderLink,
          protestLetterLink: driveUrls.protestLetterLink,
          zipPackageLink: driveUrls.zipPackageLink,
          outputFormat: outputFormat // Include the format in response
        });
      } else {
        res.status(200).json({
          success: true,
          letter: updatedDocument,
          conversationContent,
          outputPath: outputDir,
          pdfPath,
          docxPath, // Include docxPath in response
          attachments,
          zipPath,
          packageFilename: path.basename(zipPath),
          outputFormat: outputFormat // Include the format in response
        });
      }
    } catch (error) {
      console.error('Error during processing:', error);
      
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