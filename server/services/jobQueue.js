// server/services/jobQueue.js
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const jobsDir = path.join(__dirname, '../data/jobs');
const jobs = new Map();

// Ensure jobs directory exists
const initializeJobsDirectory = async () => {
  try {
    if (!fsSync.existsSync(jobsDir)) {
      await fs.mkdir(jobsDir, { recursive: true });
    }
    console.log('Jobs directory initialized');
    
    // Load existing jobs if there are any
    try {
      const files = await fs.readdir(jobsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const jobData = await fs.readFile(path.join(jobsDir, file), 'utf8');
            const job = JSON.parse(jobData);
            
            // Only load jobs that are pending, processing or were created in the last 24 hours
            const jobAge = new Date() - new Date(job.created);
            const isRecent = jobAge < 24 * 60 * 60 * 1000; // 24 hours in milliseconds
            
            if (job.status === 'pending' || job.status === 'processing' || isRecent) {
              jobs.set(job.id, job);
              console.log(`Loaded job ${job.id}, status: ${job.status}, age: ${Math.round(jobAge / 1000 / 60)} minutes`);
            }
          } catch (err) {
            console.error(`Error loading job file ${file}:`, err);
          }
        }
      }
      console.log(`Loaded ${jobs.size} existing jobs`);
    } catch (err) {
      console.error('Error loading existing jobs:', err);
    }
  } catch (error) {
    console.error('Error creating jobs directory:', error);
  }
};

// Create a new job
const createJob = async (data) => {
  const jobId = uuidv4();
  const job = {
    id: jobId,
    status: 'pending',
    created: new Date().toISOString(),
    data: data,
    result: null,
    error: null,
    lastAccessed: new Date().toISOString(),
    heartbeat: new Date().toISOString()
  };
  
  jobs.set(jobId, job);
  
  // Save job to disk for persistence
  try {
    await fs.writeFile(
      path.join(jobsDir, `${jobId}.json`),
      JSON.stringify(job, null, 2)
    );
  } catch (error) {
    console.error(`Error saving job ${jobId}:`, error);
  }
  
  return jobId;
};

// Update job status with resilient error handling
const updateJob = async (jobId, updates) => {
  let retries = 3;
  let success = false;
  let updatedJob = null;
  
  while (retries > 0 && !success) {
    try {
      const job = jobs.get(jobId);
      if (!job) {
        console.error(`Job ${jobId} not found for update`);
        return null;
      }
      
      // Add heartbeat to track job is still being processed
      updates.heartbeat = new Date().toISOString();
      
      updatedJob = { 
        ...job, 
        ...updates, 
        updated: new Date().toISOString(),
        lastAccessed: new Date().toISOString()
      };
      
      jobs.set(jobId, updatedJob);
      
      // Save updated job to disk with proper error handling
      await fs.writeFile(
        path.join(jobsDir, `${jobId}.json`),
        JSON.stringify(updatedJob, null, 2)
      );
      
      success = true;
    } catch (error) {
      console.error(`Error updating job ${jobId} (attempt ${4-retries}/3):`, error);
      retries--;
      
      if (retries > 0) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  if (!success) {
    console.error(`Failed to update job ${jobId} after multiple attempts`);
  }
  
  return updatedJob;
};

// Get job status with better error handling
const getJob = async (jobId) => {
  try {
    // Try memory first
    if (jobs.has(jobId)) {
      const job = jobs.get(jobId);
      
      // Update last accessed timestamp
      job.lastAccessed = new Date().toISOString();
      
      // Don't write to disk for simple reads to avoid I/O pressure
      // Only update the in-memory object
      
      return job;
    }
    
    // If not in memory, try to load from disk
    const jobPath = path.join(jobsDir, `${jobId}.json`);
    
    if (!fsSync.existsSync(jobPath)) {
      return null;
    }
    
    const jobData = await fs.readFile(jobPath, 'utf8');
    const job = JSON.parse(jobData);
    
    // Update last accessed timestamp
    job.lastAccessed = new Date().toISOString();
    
    // Cache in memory
    jobs.set(jobId, job);
    
    // Update the file asynchronously without waiting
    fs.writeFile(
      jobPath,
      JSON.stringify(job, null, 2)
    ).catch(err => {
      console.error(`Error updating last accessed time for job ${jobId}:`, err);
    });
    
    return job;
  } catch (error) {
    console.error(`Error loading job ${jobId}:`, error);
    return null;
  }
};

// Clean up old jobs with improved error handling
const cleanupOldJobs = async (maxAgeHours = 24) => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - (maxAgeHours * 60 * 60 * 1000));
  
  console.log(`Cleaning up jobs older than ${maxAgeHours} hours (before ${cutoff.toISOString()})`);
  
  try {
    const files = await fs.readdir(jobsDir);
    let cleaned = 0;
    let preserved = 0;
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(jobsDir, file);
          const stats = await fs.stat(filePath);
          
          // Read the file to check job status
          const jobData = await fs.readFile(filePath, 'utf8');
          const job = JSON.parse(jobData);
          
          // Keep the job if it's not completed/failed or if it's recent
          const jobCreated = new Date(job.created);
          const isOld = jobCreated < cutoff;
          const isDone = job.status === 'completed' || job.status === 'failed';
          
          if (isOld && isDone) {
            // Remove old completed/failed jobs
            await fs.unlink(filePath);
            cleaned++;
            
            // Also remove from memory cache
            const jobId = file.replace('.json', '');
            if (jobs.has(jobId)) {
              jobs.delete(jobId);
            }
          } else {
            preserved++;
          }
        } catch (err) {
          console.error(`Error processing job file ${file}:`, err);
        }
      }
    }
    
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} old job files, preserved ${preserved} jobs`);
    }
    
    return cleaned;
  } catch (error) {
    console.error('Error cleaning up old jobs:', error);
    return 0;
  }
};

// New function: detect and recover stalled jobs
const recoverStalledJobs = async (stalledThresholdMinutes = 15) => {
  const now = new Date();
  const stalledThreshold = new Date(now.getTime() - (stalledThresholdMinutes * 60 * 1000));
  
  let recovered = 0;
  
  // Iterate through in-memory jobs
  for (const [jobId, job] of jobs.entries()) {
    // Check for processing jobs with old heartbeats
    if (job.status === 'processing' && job.heartbeat) {
      const lastHeartbeat = new Date(job.heartbeat);
      
      if (lastHeartbeat < stalledThreshold) {
        console.log(`Found stalled job ${jobId}, last heartbeat: ${job.heartbeat}`);
        
        // Mark job as failed
        try {
          await updateJob(jobId, {
            status: 'failed',
            error: `Job stalled after ${stalledThresholdMinutes} minutes of inactivity`
          });
          recovered++;
        } catch (error) {
          console.error(`Error recovering stalled job ${jobId}:`, error);
        }
      }
    }
  }
  
  if (recovered > 0) {
    console.log(`Recovered ${recovered} stalled jobs`);
  }
  
  return recovered;
};

module.exports = {
  initializeJobsDirectory,
  createJob,
  updateJob,
  getJob,
  cleanupOldJobs,
  recoverStalledJobs
};