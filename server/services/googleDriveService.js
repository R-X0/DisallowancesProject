// server/services/googleDriveService.js
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

class GoogleDriveService {
  constructor() {
    this.initialized = false;
    this.initializing = false; // Add flag to prevent multiple initialization attempts
    this.drive = null;
    
    // Email to share files with
    this.shareWithEmail = process.env.SHARE_EMAIL || 'stealkeyidea321@gmail.com';
    
    // Root folder ID where to store all ERC protest files
    this.rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    console.log('GoogleDriveService constructor - Share email:', this.shareWithEmail);
  }

  async initialize() {
    // Prevent multiple simultaneous initialization attempts
    if (this.initializing) {
      console.log('Drive service initialization already in progress, waiting...');
      
      // Wait for the initialization to complete
      while (this.initializing) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      return this.initialized;
    }
    
    if (this.initialized) {
      return true;
    }
    
    this.initializing = true;
    
    try {
      console.log('Initializing Google Drive service...');
      
      const auth = new google.auth.GoogleAuth({
        keyFile: path.join(__dirname, '../config/google-credentials.json'),
        scopes: [
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/drive.file'
        ],
      });
      
      const client = await auth.getClient();
      this.drive = google.drive({ version: 'v3', auth: client });
      
      if (!this.rootFolderId) {
        console.log('No Google Drive folder ID found in env vars, creating root folder');
        
        try {
          // First check if we already have a root folder from a previous run
          const configFilePath = path.join(__dirname, '../config/drive-config.json');
          
          try {
            // Try to read existing config
            const configData = fs.readFileSync(configFilePath, 'utf8');
            const config = JSON.parse(configData);
            if (config.rootFolderId) {
              this.rootFolderId = config.rootFolderId;
              console.log('Found existing root folder ID in config:', this.rootFolderId);
            }
          } catch (readError) {
            // Config file doesn't exist yet, that's OK
            console.log('No existing drive config found, will create new root folder');
          }
          
          // If we still don't have a root folder ID, create one
          if (!this.rootFolderId) {
            const rootFolder = await this.createFolderInternal('ERC_Protests_Data', null);
            this.rootFolderId = rootFolder.id;
            console.log('Created root folder with ID:', this.rootFolderId);
            
            // Save this ID to a config file so we don't recreate it on restart
            const config = { rootFolderId: this.rootFolderId };
            fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
            console.log('Saved root folder ID to config file');
          }
        } catch (folderError) {
          console.error('Error creating/finding root folder:', folderError);
          throw folderError;
        }
      }
      
      this.initialized = true;
      console.log('Google Drive service initialized successfully with root folder ID:', this.rootFolderId);
      return true;
    } catch (error) {
      console.error('Failed to initialize Google Drive service:', error);
      this.initialized = false;
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Verify that we have a valid Drive instance
    if (!this.drive) {
      throw new Error('Google Drive service not properly initialized');
    }
  }
  
  /**
   * Internal method to create a folder without checking initialization
   * Used only by the initialize method
   */
  async createFolderInternal(folderName, parentFolderId) {
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    
    if (parentFolderId) {
      fileMetadata.parents = [parentFolderId];
    }
    
    try {
      const response = await this.drive.files.create({
        resource: fileMetadata,
        fields: 'id, webViewLink'
      });
      
      console.log(`Created folder: ${folderName} with ID: ${response.data.id}`);
      return response.data;
    } catch (error) {
      console.error(`Error creating folder ${folderName}:`, error);
      throw error;
    }
  }
  
  /**
   * Create a folder in Google Drive
   * @param {string} folderName - Name of the folder
   * @param {string} parentFolderId - ID of the parent folder, null for root
   */
  async createFolder(folderName, parentFolderId) {
    await this.ensureInitialized();
    
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    
    if (parentFolderId) {
      fileMetadata.parents = [parentFolderId];
    } else if (this.rootFolderId) {
      fileMetadata.parents = [this.rootFolderId];
    } else {
      throw new Error('No parent folder ID or root folder ID provided for creating folder');
    }
    
    try {
      console.log(`Creating folder "${folderName}" with parent: ${parentFolderId || this.rootFolderId}`);
      const response = await this.drive.files.create({
        resource: fileMetadata,
        fields: 'id, webViewLink'
      });
      
      console.log(`Created folder: ${folderName} with ID: ${response.data.id}`);
      
      // Make the folder accessible by anyone with the link with writer permissions
      await this.drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
          role: 'writer', // Changed from 'reader' to 'writer'
          type: 'anyone'
        }
      });
      console.log(`Set permissions for folder ${folderName} to "anyone" with "writer" role`);
      
      // Share with specified email - with error handling
      try {
        await this.drive.permissions.create({
          fileId: response.data.id,
          requestBody: {
            role: 'writer',
            type: 'user',
            emailAddress: this.shareWithEmail
          },
          sendNotificationEmail: false // Changed to avoid notification spam
        });
        console.log(`Shared folder ${folderName} with ${this.shareWithEmail}`);
      } catch (shareError) {
        console.log(`Warning: Could not share folder with ${this.shareWithEmail}, but folder is still accessible: ${shareError.message}`);
        // Continue anyway since the folder is publicly accessible with the link
      }
      
      return response.data;
    } catch (error) {
      console.error(`Error creating folder ${folderName}:`, error);
      throw error;
    }
  }
  
  /**
   * Upload a file to Google Drive
   * @param {string} filePath - Path to the file
   * @param {string} fileName - Name to use for the file
   * @param {string} parentFolderId - ID of the parent folder
   * @param {string} mimeType - MIME type of the file
   */
  async uploadFile(filePath, fileName, parentFolderId, mimeType = null) {
    await this.ensureInitialized();
    
    try {
      // First, verify the file exists and is readable
      try {
        await fs.promises.access(filePath, fs.constants.R_OK);
        const stats = await fs.promises.stat(filePath);
        console.log(`File exists and is readable: ${filePath} (${stats.size} bytes)`);
      } catch (fileError) {
        throw new Error(`Cannot access file at ${filePath}: ${fileError.message}`);
      }
      
      // Determine mime type if not provided
      if (!mimeType) {
        if (filePath.endsWith('.pdf')) {
          mimeType = 'application/pdf';
        } else if (filePath.endsWith('.zip')) {
          mimeType = 'application/zip';
        } else {
          mimeType = 'application/octet-stream';
        }
      }
      
      // Verify parent folder ID
      if (!parentFolderId && !this.rootFolderId) {
        throw new Error('No parent folder ID or root folder ID provided for uploading file');
      }
      
      const fileMetadata = {
        name: fileName,
        parents: [parentFolderId || this.rootFolderId]
      };
      
      console.log(`Uploading file ${fileName} to folder ID: ${parentFolderId || this.rootFolderId}`);
      console.log(`File path: ${filePath}, MIME type: ${mimeType}`);
      
      // Create readable stream and check it's working
      const readStream = fs.createReadStream(filePath);
      readStream.on('error', (err) => {
        console.error(`Error reading file ${filePath} for upload:`, err);
      });
      
      const media = {
        mimeType: mimeType,
        body: readStream
      };
      
      // Use a timeout to ensure the upload doesn't hang indefinitely
      const uploadPromise = this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, webViewLink',
      });
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Upload timeout for ${fileName}`)), 60000); // 60 second timeout
      });
      
      const response = await Promise.race([uploadPromise, timeoutPromise]);
      
      console.log(`Successfully uploaded file: ${fileName} with ID: ${response.data.id}`);
      
      // Make the file viewable by anyone with the link with writer permissions
      await this.drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
          role: 'writer', // Changed from 'reader' to 'writer'
          type: 'anyone'
        }
      });
      console.log(`Set permissions for file ${fileName} to "anyone" with "writer" role`);
      
      // Share with specified email - only if needed
      try {
        await this.drive.permissions.create({
          fileId: response.data.id,
          requestBody: {
            role: 'writer',
            type: 'user',
            emailAddress: this.shareWithEmail
          },
          sendNotificationEmail: false // Changed from true to avoid notification spam
        });
        console.log(`Shared file ${fileName} with ${this.shareWithEmail}`);
      } catch (shareError) {
        console.log(`Warning: Could not share with ${this.shareWithEmail}, but file is still accessible: ${shareError.message}`);
        // Continue anyway since the file is publicly accessible with the link
      }
      
      return response.data;
    } catch (error) {
      console.error(`Error uploading file ${fileName} from ${filePath}:`, error);
      
      // Additional error details for debugging
      if (error.response) {
        console.error('API Error Response:', error.response.data);
      }
      
      throw error;
    }
  }
  
  /**
   * Create a submission folder and upload files for an ERC submission
   * @param {string} trackingId - Tracking ID for the submission
   * @param {string} businessName - Business name for folder naming
   * @param {Array} files - Array of file objects to upload {path, name, type}
   */
  async createSubmissionFolder(trackingId, businessName) {
    await this.ensureInitialized();
    
    try {
      // Create a folder for this submission
      const folderName = `${trackingId} - ${businessName}`;
      const folder = await this.createFolder(folderName, this.rootFolderId);
      
      return {
        folderId: folder.id,
        folderLink: folder.webViewLink
      };
    } catch (error) {
      console.error(`Error creating submission folder for ${trackingId}:`, error);
      throw error;
    }
  }
  
  /**
   * Upload protest letter and zip package for a submission
   * @param {string} trackingId - Tracking ID
   * @param {string} businessName - Business name
   * @param {string} pdfPath - Path to the PDF letter
   * @param {string} zipPath - Path to the ZIP package
   */
  async uploadProtestFiles(trackingId, businessName, pdfPath, zipPath) {
    try {
      await this.ensureInitialized();
      
      // Verify files exist before proceeding
      console.log('Verifying files exist:');
      console.log(`PDF path: ${pdfPath}`);
      console.log(`ZIP path: ${zipPath}`);
      
      if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file does not exist at path: ${pdfPath}`);
      }
      
      if (!fs.existsSync(zipPath)) {
        throw new Error(`ZIP file does not exist at path: ${zipPath}`);
      }
      
      console.log('Files verified, creating folder...');
      
      // Create folder for this submission
      const folderResult = await this.createSubmissionFolder(trackingId, businessName);
      console.log(`Created folder for ${trackingId} with ID: ${folderResult.folderId}`);
      
      // Upload the PDF letter
      console.log(`Uploading PDF letter from ${pdfPath}...`);
      const pdfFile = await this.uploadFile(
        pdfPath,
        `${trackingId}_Protest_Letter.pdf`,
        folderResult.folderId,
        'application/pdf'
      );
      console.log(`PDF letter uploaded with ID: ${pdfFile.id}`);
      
      // Upload the ZIP package
      console.log(`Uploading ZIP package from ${zipPath}...`);
      const zipFile = await this.uploadFile(
        zipPath,
        `${trackingId}_Complete_Package.zip`,
        folderResult.folderId,
        'application/zip'
      );
      console.log(`ZIP package uploaded with ID: ${zipFile.id}`);
      
      return {
        folderLink: folderResult.folderLink,
        protestLetterLink: pdfFile.webViewLink,
        zipPackageLink: zipFile.webViewLink
      };
    } catch (error) {
      console.error(`Error uploading protest files for ${trackingId}:`, error);
      throw error;
    }
  }
  
  /**
   * Verify service is working by listing files in the root folder
   * @returns {boolean} - True if service is working
   */
  async verifyService() {
    try {
      await this.ensureInitialized();
      
      console.log(`Listing files in root folder (${this.rootFolderId})...`);
      const response = await this.drive.files.list({
        q: `'${this.rootFolderId}' in parents`,
        fields: 'files(id, name, webViewLink)'
      });
      
      console.log(`Found ${response.data.files.length} files in root folder:`);
      response.data.files.forEach(file => {
        console.log(`- ${file.name} (${file.id}): ${file.webViewLink}`);
      });
      
      return true;
    } catch (error) {
      console.error('Error verifying Google Drive service:', error);
      return false;
    }
  }
}

// Singleton instance
const driveService = new GoogleDriveService();

module.exports = driveService;