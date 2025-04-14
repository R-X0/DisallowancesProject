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
const jobQueue = require('../services/jobQueue');
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

// NEW ENDPOINT: Process pasted ChatGPT content directly
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
    
    // Create a new job
    const jobId = await jobQueue.createJob(req.body);
    
    // Return the job ID immediately
    res.status(202).json({
      success: true,
      message: 'Document generation started',
      jobId: jobId
    });
    
    // Process the job asynchronously after sending response
    setTimeout(() => {
      processContentJobAsync(jobId, req.body);
    }, 100);
  } catch (error) {
    console.error('Error initiating document generation:', error);
    res.status(500).json({
      success: false,
      message: `Error initiating document generation: ${error.message}`
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

// Add a new endpoint to check job status with improved error handling
router.get('/job-status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Add request timeout handling
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out')), 30000);
    });
    
    // Wrap the job fetch in a promise to race with timeout
    const fetchJobPromise = new Promise(async (resolve) => {
      try {
        const job = await jobQueue.getJob(jobId);
        resolve(job);
      } catch (err) {
        console.error(`Error fetching job ${jobId}:`, err);
        resolve(null); // Return null instead of rejecting to handle in next block
      }
    });
    
    // Race the job fetch with timeout
    const job = await Promise.race([fetchJobPromise, timeoutPromise]);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found or access error'
      });
    }
    
    // Return job status
    res.status(200).json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        created: job.created,
        updated: job.updated,
        progress: job.progress || 0,
        result: job.status === 'completed' ? job.result : null,
        error: job.status === 'failed' ? job.error : null
      }
    });
  } catch (error) {
    console.error('Error checking job status:', error);
    
    // Determine if it's a timeout error
    const isTimeout = error.message === 'Request timed out';
    
    res.status(isTimeout ? 504 : 500).json({
      success: false,
      message: isTimeout ? 
        'Timeout while checking job status. The job is still processing in the background.' :
        `Error checking job status: ${error.message}`
    });
  }
});

// Helper function to process the job with pasted content asynchronously
async function processContentJobAsync(jobId, requestData) {
  try {
    // Update job status to processing
    await jobQueue.updateJob(jobId, { 
      status: 'processing_content',
      progress: 5,
      message: 'Processing conversation content'
    });
    
    // Create unique directory for request
    const requestId = uuidv4().substring(0, 8);
    const outputDir = path.join(__dirname, `../../data/ChatGPT_Conversations/${requestId}`);
    await fs.mkdir(outputDir, { recursive: true });

    try {
      // 1. Save the conversation content to a file
      const conversationContent = requestData.chatGptContent;
      await fs.writeFile(
        path.join(outputDir, 'conversation.txt'),
        conversationContent,
        'utf8'
      );
      console.log(`Saved conversation content (${conversationContent.length} chars)`);

      await jobQueue.updateJob(jobId, { 
        status: 'preparing_document',
        progress: 30,
        message: 'Preparing document template'
      });
      
      // 2. Get the appropriate template based on document type
      let templateContent = await documentGenerator.getTemplateContent(requestData.documentType || 'protestLetter');

      // 3. Create business info object
      const businessInfo = {
        businessName: requestData.businessName,
        ein: requestData.ein,
        location: requestData.location,
        timePeriod: requestData.timePeriod,
        allTimePeriods: requestData.allTimePeriods || [requestData.timePeriod],
        businessType: requestData.businessType || 'business',
        documentType: requestData.documentType || 'protestLetter',
        // Add IRS address if provided
        irsAddress: requestData.irsAddress || '',
        // Include all quarterly revenue data
        q1_2019: requestData.q1_2019, 
        q2_2019: requestData.q2_2019, 
        q3_2019: requestData.q3_2019, 
        q4_2019: requestData.q4_2019,
        q1_2020: requestData.q1_2020, 
        q2_2020: requestData.q2_2020, 
        q3_2020: requestData.q3_2020, 
        q4_2020: requestData.q4_2020,
        q1_2021: requestData.q1_2021, 
        q2_2021: requestData.q2_2021, 
        q3_2021: requestData.q3_2021,
        // Include additional context
        revenueReductionInfo: requestData.revenueReductionInfo,
        governmentOrdersInfo: requestData.governmentOrdersInfo,
        // Include pre-calculated data if available
        revenueDeclines: requestData.revenueDeclines,
        qualifyingQuarters: requestData.qualifyingQuarters,
        // Include approach focus
        approachFocus: requestData.approachFocus || 'governmentOrders',
        // Include new parameters
        includeRevenueSection: requestData.includeRevenueSection !== false,
        includeSupplyChainDisruption: requestData.includeSupplyChainDisruption || false,
        disallowanceReason: requestData.disallowanceReason || 'no_orders',
        customDisallowanceReason: requestData.customDisallowanceReason || '',
        outputFormat: requestData.outputFormat || 'pdf'
      };

      // 4. Generate document using the conversation content and template
      await jobQueue.updateJob(jobId, { 
        status: 'generating_document',
        progress: 40,
        message: 'Generating document'
      });
      
      // Generate the initial document
      let document = await documentGenerator.generateERCDocument(
        businessInfo,
        conversationContent,
        templateContent
      );
      
      // Ensure proper SOURCES section formatting
      document = documentGenerator.ensureProperSourcesFormat(document);
      
      // Save the generated document in text format
      const documentFileName = requestData.documentType === 'form886A' ? 'form_886a.txt' : 'protest_letter.txt';
      await fs.writeFile(
        path.join(outputDir, documentFileName),
        document,
        'utf8'
      );
      
      // 5. Process URLs in the document and download as PDFs
      await jobQueue.updateJob(jobId, { 
        status: 'extracting_urls',
        progress: 60,
        message: 'Extracting and downloading URLs'
      });
      
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
      const updatedFileName = requestData.documentType === 'form886A' ? 'form_886a_with_attachments.txt' : 'protest_letter_with_attachments.txt';
      await fs.writeFile(
        path.join(outputDir, updatedFileName),
        updatedDocument,
        'utf8'
      );
      
      // 6. Generate PDF version of the document
      await jobQueue.updateJob(jobId, { 
        status: 'generating_pdf',
        progress: 75,
        message: 'Generating PDF'
      });
      
      const pdfFileName = requestData.documentType === 'form886A' ? 'form_886a.pdf' : 'protest_letter.pdf';
      const pdfPath = path.join(outputDir, pdfFileName);
      await pdfGenerator.generatePdf(updatedDocument, pdfPath);
      
      // 7. Generate DOCX version if requested
      let docxPath = null;
      if (requestData.outputFormat === 'docx') {
        await jobQueue.updateJob(jobId, { 
          status: 'generating_docx',
          progress: 80,
          message: 'Generating DOCX'
        });
        
        const docxFileName = requestData.documentType === 'form886A' ? 'form_886a.docx' : 'protest_letter.docx';
        docxPath = path.join(outputDir, docxFileName);
        await documentGenerator.generateDocx(updatedDocument, docxPath);
      }
      
      // 8. Create a complete package as a ZIP file
      await jobQueue.updateJob(jobId, { 
        status: 'creating_package',
        progress: 85,
        message: 'Creating package'
      });
      
      const packageName = requestData.documentType === 'form886A' ? 'form_886a_package.zip' : 'complete_protest_package.zip';
      const zipPath = path.join(outputDir, packageName);
      
      console.log(`Creating package with ${attachments.length} attachments`);
      // Use the correct format when creating the package
      await packageCreator.createPackage(
        requestData.outputFormat === 'docx' ? docxPath : pdfPath, 
        attachments, 
        zipPath, 
        requestData.documentType,
        requestData.outputFormat
      );
      
      // 9. Upload to Google Drive if tracking ID is provided
      let driveUrls = null;
      if (requestData.trackingId) {
        await jobQueue.updateJob(jobId, { 
          status: 'uploading',
          progress: 90,
          message: 'Uploading to Google Drive'
        });
        
        try {
          console.log(`Tracking ID provided: ${requestData.trackingId}, uploading to Google Drive...`);
          driveUrls = await protestDriveUploader.uploadToGoogleDrive(
            requestData.trackingId,
            requestData.businessName,
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

      // 10. Update job with successful result
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
      
      await jobQueue.updateJob(jobId, { 
        status: 'completed',
        progress: 100,
        message: 'Document generation complete',
        result
      });
      
      console.log(`Job ${jobId} completed successfully`);

    } catch (processingError) {
      console.error('Error during document generation:', processingError);
      
      // Update job with error
      await jobQueue.updateJob(jobId, { 
        status: 'failed',
        error: `Error processing document: ${processingError.message}`
      });
    }
  } catch (outerError) {
    console.error('Critical error in job processing:', outerError);
    await jobQueue.updateJob(jobId, { 
      status: 'failed',
      error: `Critical error: ${outerError.message}`
    });
  }
}

module.exports = router;