// server/routes/chatgpt-scraper.js

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { v4: uuidv4 } = require('uuid');
const documentGenerator = require('../services/documentGenerator');
const pdfGenerator = require('../services/pdfGenerator');
const urlProcessor = require('../services/urlProcessor');
const packageCreator = require('../services/packageCreator');
const protestDriveUploader = require('../services/protestDriveUploader');
const multer = require('multer');

// Configure multer for PDF uploads
const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/temp'));
  },
  filename: (req, file, cb) => {
    cb(null, `address-extract-${Date.now()}-${file.originalname}`);
  }
});

const pdfUpload = multer({ storage: pdfStorage });

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

// New endpoint to extract IRS address from PDF files
router.post('/extract-irs-address', pdfUpload.array('pdfFiles', 5), async (req, res) => {
  try {
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No PDF files provided'
      });
    }
    
    console.log(`Received ${files.length} PDFs for IRS address extraction`);
    
    // Try to extract address from each file until we find one
    let extractedAddress = null;
    
    for (const file of files) {
      try {
        const pdfPath = file.path;
        console.log(`Attempting to extract IRS address from: ${pdfPath}`);
        
        // Use the documentGenerator function to extract the address
        const address = await documentGenerator.extractIrsAddressFromFile(pdfPath);
        
        if (address) {
          extractedAddress = address;
          console.log(`Successfully extracted IRS address: ${address}`);
          break;
        }
      } catch (extractError) {
        console.error(`Error extracting from ${file.originalname}:`, extractError);
        // Continue to next file
      }
    }
    
    res.status(200).json({
      success: true,
      address: extractedAddress
    });
    
    // Clean up temporary files after response is sent
    try {
      for (const file of files) {
        fs.unlink(file.path, (err) => {
          if (err) console.error(`Error deleting temp file ${file.path}:`, err);
        });
      }
    } catch (cleanupError) {
      console.error('Error cleaning up temp files:', cleanupError);
    }
    
  } catch (error) {
    console.error('Error extracting IRS address from PDFs:', error);
    res.status(500).json({
      success: false,
      message: `Error extracting IRS address: ${error.message}`
    });
  }
});

// Process pasted ChatGPT content directly
router.post('/process-content', async (req, res) => {
  try {
    const {
      chatGptContent,
      businessName,
      ein,
      location,
      timePeriod
    } = req.body;

    // Validate required inputs
    if (!chatGptContent) {
      return res.status(400).json({
        success: false,
        message: 'ChatGPT conversation content is required'
      });
    }
    
    if (!businessName || !ein || !timePeriod) {
      return res.status(400).json({
        success: false,
        message: 'Business name, EIN, and time period are required'
      });
    }

    console.log(`Processing ChatGPT content (${chatGptContent.length} chars)`);
    console.log(`Business: ${businessName}, Period: ${timePeriod}`);
    
    // Create unique directory for request
    const requestId = uuidv4().substring(0, 8);
    const outputDir = path.join(__dirname, `../../data/ChatGPT_Conversations/${requestId}`);
    await fs.mkdir(outputDir, { recursive: true });
    
    try {
      // 1. Save the conversation content to a file
      await fs.writeFile(
        path.join(outputDir, 'conversation.txt'),
        chatGptContent,
        'utf8'
      );
      console.log(`Saved conversation content (${chatGptContent.length} chars)`);

      // 2. Get the appropriate template based on document type
      let templateContent = await documentGenerator.getTemplateContent(req.body.documentType || 'protestLetter');

      // 3. Create business info object
      const businessInfo = {
        businessName: req.body.businessName,
        ein: req.body.ein,
        location: req.body.location,
        timePeriod: req.body.timePeriod,
        allTimePeriods: req.body.allTimePeriods || [req.body.timePeriod],
        businessType: req.body.businessType || 'business',
        documentType: req.body.documentType || 'protestLetter',
        // Add IRS address if provided
        irsAddress: req.body.irsAddress || '',
        // Include all quarterly revenue data
        q1_2019: req.body.q1_2019, 
        q2_2019: req.body.q2_2019, 
        q3_2019: req.body.q3_2019, 
        q4_2019: req.body.q4_2019,
        q1_2020: req.body.q1_2020, 
        q2_2020: req.body.q2_2020, 
        q3_2020: req.body.q3_2020, 
        q4_2020: req.body.q4_2020,
        q1_2021: req.body.q1_2021, 
        q2_2021: req.body.q2_2021, 
        q3_2021: req.body.q3_2021,
        // Include additional context
        revenueReductionInfo: req.body.revenueReductionInfo,
        governmentOrdersInfo: req.body.governmentOrdersInfo,
        // Include pre-calculated data if available
        revenueDeclines: req.body.revenueDeclines,
        qualifyingQuarters: req.body.qualifyingQuarters,
        // Include approach focus
        approachFocus: req.body.approachFocus || 'governmentOrders',
        // Include new parameters
        includeRevenueSection: req.body.includeRevenueSection !== false,
        includeSupplyChainDisruption: req.body.includeSupplyChainDisruption || false,
        disallowanceReason: req.body.disallowanceReason || 'no_orders',
        customDisallowanceReason: req.body.customDisallowanceReason || '',
        outputFormat: req.body.outputFormat || 'pdf'
      };

      // 4. Generate document using the conversation content and template
      // Generate the initial document
      let document = await documentGenerator.generateERCDocument(
        businessInfo,
        chatGptContent,
        templateContent
      );
      
      // Ensure proper SOURCES section formatting
      document = documentGenerator.ensureProperSourcesFormat(document);
      
      // Save the generated document in text format
      const documentFileName = req.body.documentType === 'form886A' ? 'form_886a.txt' : 'protest_letter.txt';
      await fs.writeFile(
        path.join(outputDir, documentFileName),
        document,
        'utf8'
      );
      
      // 5. Process URLs in the document and download as PDFs
      console.log('Starting URL extraction and download process...');
      const { letter: updatedDocument, attachments } = await urlProcessor.extractAndDownloadUrls(
        document, 
        outputDir
      );
      
      console.log(`URL processing complete. Downloaded ${attachments.length} attachments.`);
      for (const attachment of attachments) {
        console.log(`- ${attachment.filename} (from ${attachment.originalUrl})`);
      }
      
      // Save the updated document with attachment references
      const updatedFileName = req.body.documentType === 'form886A' ? 'form_886a_with_attachments.txt' : 'protest_letter_with_attachments.txt';
      await fs.writeFile(
        path.join(outputDir, updatedFileName),
        updatedDocument,
        'utf8'
      );
      
      // 6. Generate PDF version of the document
      const pdfFileName = req.body.documentType === 'form886A' ? 'form_886a.pdf' : 'protest_letter.pdf';
      const pdfPath = path.join(outputDir, pdfFileName);
      await pdfGenerator.generatePdf(updatedDocument, pdfPath);
      
      // 7. Generate DOCX version if requested
      let docxPath = null;
      if (req.body.outputFormat === 'docx') {
        const docxFileName = req.body.documentType === 'form886A' ? 'form_886a.docx' : 'protest_letter.docx';
        docxPath = path.join(outputDir, docxFileName);
        await documentGenerator.generateDocx(updatedDocument, docxPath);
      }
      
      // 8. Create a complete package as a ZIP file
      const packageName = req.body.documentType === 'form886A' ? 'form_886a_package.zip' : 'complete_protest_package.zip';
      const zipPath = path.join(outputDir, packageName);
      
      console.log(`Creating package with ${attachments.length} attachments`);
      // Use the correct format when creating the package
      await packageCreator.createPackage(
        req.body.outputFormat === 'docx' ? docxPath : pdfPath, 
        attachments, 
        zipPath, 
        req.body.documentType,
        req.body.outputFormat
      );
      
      // 9. Upload to Google Drive if tracking ID is provided
      let driveUrls = null;
      if (req.body.trackingId) {
        try {
          console.log(`Tracking ID provided: ${req.body.trackingId}, uploading to Google Drive...`);
          driveUrls = await protestDriveUploader.uploadToGoogleDrive(
            req.body.trackingId,
            req.body.businessName,
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

      // 10. Send successful result
      const result = {
        outputPath: outputDir,
        letter: updatedDocument,
        pdfPath: pdfPath,
        docxPath,
        attachments,
        zipPath,
        packageFilename: path.basename(zipPath)
      };
      
      // Add Google Drive URLs if available
      if (driveUrls) {
        result.googleDriveLink = driveUrls.folderLink;
        result.protestLetterLink = driveUrls.protestLetterLink;
        result.zipPackageLink = driveUrls.zipPackageLink;
      }
      
      res.status(200).json({
        success: true,
        message: 'Document generated successfully',
        result
      });

    } catch (processingError) {
      console.error('Error during document generation:', processingError);
      res.status(500).json({
        success: false,
        message: `Error processing document: ${processingError.message}`
      });
    }
  } catch (error) {
    console.error('Critical error in document processing:', error);
    res.status(500).json({
      success: false,
      message: `Critical error: ${error.message}`
    });
  }
});

// Old endpoint for backward compatibility - redirects to new process
router.post('/process-chatgpt', async (req, res) => {
  try {
    const { chatGptLink } = req.body;

    // Validate required inputs
    if (!chatGptLink) {
      return res.status(400).json({
        success: false,
        message: 'ChatGPT conversation link is required'
      });
    }
    
    // Return a helpful message suggesting to use the new process
    res.status(202).json({
      success: false,
      message: 'This endpoint is deprecated. Please use /process-content with pasted conversation text instead.',
    });
  } catch (error) {
    console.error('Error in legacy process:', error);
    res.status(500).json({
      success: false,
      message: `Error: ${error.message}`
    });
  }
});

module.exports = router;