/**
 * File Upload Utility
 * Handles secure file uploads with validation and processing
 */

import { createClient } from '@supabase/supabase-js';
import { validateFileUpload } from './validation.js';
import crypto from 'crypto';
import path from 'path';

// Initialize Supabase client for file storage
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * Upload files to storage
 * @param {Array} files - Array of file objects
 * @param {string} bucket - Storage bucket name
 * @param {Object} options - Upload options
 * @returns {Promise<Array>} Array of uploaded file URLs
 */
export async function uploadFiles(files, bucket = 'buyback-attachments', options = {}) {
  const uploadedUrls = [];
  
  try {
    if (!Array.isArray(files)) {
      files = [files];
    }

    // Validate file count
    if (files.length > (options.maxFiles || 10)) {
      throw new Error(`最大${options.maxFiles || 10}ファイルまでアップロード可能です`);
    }

    for (const file of files) {
      // Validate individual file
      const validation = validateFileUpload(file, {
        maxSize: options.maxSize || 5 * 1024 * 1024, // 5MB default
        allowedTypes: options.allowedTypes || [
          'image/jpeg',
          'image/png', 
          'image/gif',
          'image/webp'
        ]
      });

      if (!validation.isValid) {
        throw new Error(`ファイル "${file.name}": ${validation.error}`);
      }

      // Generate unique filename
      const uniqueFilename = generateUniqueFilename(file.name);
      const filePath = `${bucket}/${uniqueFilename}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Supabase upload error:', error);
        throw new Error(`ファイルアップロードに失敗しました: ${file.name}`);
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      if (publicUrlData?.publicUrl) {
        uploadedUrls.push({
          originalName: file.name,
          filename: uniqueFilename,
          url: publicUrlData.publicUrl,
          size: file.size,
          type: file.type
        });
      } else {
        throw new Error(`公開URLの取得に失敗しました: ${file.name}`);
      }
    }

    console.log(`Successfully uploaded ${uploadedUrls.length} files to ${bucket}`);
    return uploadedUrls;

  } catch (error) {
    console.error('File upload error:', error);
    
    // Clean up any partially uploaded files
    await cleanupFailedUploads(uploadedUrls, bucket);
    
    throw error;
  }
}

/**
 * Generate unique filename to prevent conflicts
 * @param {string} originalName - Original filename
 * @returns {string} Unique filename
 */
function generateUniqueFilename(originalName) {
  const ext = path.extname(originalName);
  const nameWithoutExt = path.basename(originalName, ext);
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  
  // Sanitize filename
  const sanitizedName = nameWithoutExt
    .replace(/[^a-zA-Z0-9\-_]/g, '_')
    .substring(0, 50);
  
  return `${sanitizedName}_${timestamp}_${randomString}${ext}`;
}

/**
 * Clean up failed uploads
 * @param {Array} uploadedFiles - List of uploaded files to clean up
 * @param {string} bucket - Storage bucket name
 */
async function cleanupFailedUploads(uploadedFiles, bucket) {
  try {
    for (const file of uploadedFiles) {
      if (file.filename) {
        const filePath = `${bucket}/${file.filename}`;
        await supabase.storage
          .from(bucket)
          .remove([filePath]);
      }
    }
  } catch (error) {
    console.error('Cleanup failed uploads error:', error);
  }
}

/**
 * Delete uploaded files
 * @param {Array} fileUrls - Array of file URLs to delete
 * @param {string} bucket - Storage bucket name
 * @returns {Promise<boolean>} Success status
 */
export async function deleteFiles(fileUrls, bucket = 'buyback-attachments') {
  try {
    if (!Array.isArray(fileUrls)) {
      fileUrls = [fileUrls];
    }

    const filePaths = fileUrls.map(url => {
      // Extract filename from URL
      const urlParts = url.split('/');
      const filename = urlParts[urlParts.length - 1];
      return `${bucket}/${filename}`;
    });

    const { error } = await supabase.storage
      .from(bucket)
      .remove(filePaths);

    if (error) {
      console.error('File deletion error:', error);
      return false;
    }

    console.log(`Successfully deleted ${filePaths.length} files from ${bucket}`);
    return true;

  } catch (error) {
    console.error('Delete files error:', error);
    return false;
  }
}

/**
 * Get file information from URL
 * @param {string} fileUrl - File URL
 * @param {string} bucket - Storage bucket name
 * @returns {Promise<Object>} File information
 */
export async function getFileInfo(fileUrl, bucket = 'buyback-attachments') {
  try {
    // Extract filename from URL
    const urlParts = fileUrl.split('/');
    const filename = urlParts[urlParts.length - 1];
    const filePath = `${bucket}/${filename}`;

    // Get file metadata
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(bucket, {
        search: filename
      });

    if (error || !data || data.length === 0) {
      throw new Error('ファイル情報の取得に失敗しました');
    }

    const fileInfo = data[0];
    return {
      name: fileInfo.name,
      size: fileInfo.metadata?.size,
      type: fileInfo.metadata?.mimetype,
      lastModified: fileInfo.updated_at,
      url: fileUrl
    };

  } catch (error) {
    console.error('Get file info error:', error);
    throw error;
  }
}

/**
 * Generate signed URL for secure file access
 * @param {string} filePath - File path in storage
 * @param {string} bucket - Storage bucket name
 * @param {number} expiresIn - URL expiration time in seconds
 * @returns {Promise<string>} Signed URL
 */
export async function generateSignedUrl(filePath, bucket = 'buyback-attachments', expiresIn = 3600) {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      throw new Error('署名付きURLの生成に失敗しました');
    }

    return data.signedUrl;

  } catch (error) {
    console.error('Generate signed URL error:', error);
    throw error;
  }
}

/**
 * Process and resize image if needed
 * @param {Buffer} imageBuffer - Image buffer
 * @param {Object} options - Processing options
 * @returns {Promise<Buffer>} Processed image buffer
 */
export async function processImage(imageBuffer, options = {}) {
  try {
    // For now, return the original image
    // In production, you might want to add image processing with Sharp or similar
    
    const {
      maxWidth = 1920,
      maxHeight = 1080,
      quality = 80,
      format = 'jpeg'
    } = options;

    // TODO: Implement image processing
    // const sharp = require('sharp');
    // const processedImage = await sharp(imageBuffer)
    //   .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
    //   .jpeg({ quality })
    //   .toBuffer();
    
    return imageBuffer;

  } catch (error) {
    console.error('Image processing error:', error);
    throw new Error('画像の処理に失敗しました');
  }
}

/**
 * Check if file exists in storage
 * @param {string} filePath - File path to check
 * @param {string} bucket - Storage bucket name
 * @returns {Promise<boolean>} Whether file exists
 */
export async function fileExists(filePath, bucket = 'buyback-attachments') {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(bucket);

    if (error) {
      return false;
    }

    return data.some(file => file.name === path.basename(filePath));

  } catch (error) {
    console.error('File exists check error:', error);
    return false;
  }
}

/**
 * Get storage usage statistics
 * @param {string} bucket - Storage bucket name
 * @returns {Promise<Object>} Storage statistics
 */
export async function getStorageStats(bucket = 'buyback-attachments') {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list('', {
        limit: 1000,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) {
      throw error;
    }

    const stats = data.reduce((acc, file) => {
      acc.totalFiles++;
      acc.totalSize += file.metadata?.size || 0;
      return acc;
    }, { totalFiles: 0, totalSize: 0 });

    return {
      ...stats,
      totalSizeMB: Math.round(stats.totalSize / 1024 / 1024 * 100) / 100
    };

  } catch (error) {
    console.error('Get storage stats error:', error);
    throw error;
  }
}

export default {
  uploadFiles,
  deleteFiles,
  getFileInfo,
  generateSignedUrl,
  processImage,
  fileExists,
  getStorageStats
};