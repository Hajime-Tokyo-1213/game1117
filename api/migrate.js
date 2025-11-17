/**
 * Migration API Endpoint
 * Handles localStorage to Supabase migration requests from the frontend
 */

import SupabaseMigrator from '../scripts/migrations/SupabaseMigrator.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, options = {} } = req.body;

    if (!data) {
      return res.status(400).json({ error: 'Data is required' });
    }

    // Validate environment
    if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return res.status(500).json({ 
        error: 'Supabase configuration missing',
        details: 'SUPABASE_URL environment variable is required'
      });
    }

    const migrator = new SupabaseMigrator();

    // Set default options for API usage
    const migrationOptions = {
      batchSize: 50, // Smaller batches for API
      concurrency: 3, // Lower concurrency for API
      dryRun: options.dryRun || false,
      continueOnError: true,
      validateOnly: options.validateOnly || false,
      ...options
    };

    // Track progress
    let progressCallback;
    if (options.trackProgress) {
      progressCallback = (progress) => {
        // In a real implementation, this would use WebSockets or Server-Sent Events
        // For now, we'll just log the progress
        console.log(`Migration progress: ${progress}%`);
      };
    }

    const startTime = Date.now();

    // Run migration
    const result = await migrator.migrateFromLocalStorage(data, migrationOptions);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // Return results
    res.status(200).json({
      success: true,
      message: 'Migration completed successfully',
      stats: {
        processed: migrator.stats.processed,
        succeeded: migrator.stats.succeeded,
        failed: migrator.stats.failed,
        skipped: migrator.stats.skipped,
        duration: duration
      },
      errors: migrator.errors.length > 0 ? migrator.errors : null
    });

  } catch (error) {
    console.error('Migration API error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Migration failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// Stats endpoint
export async function statsHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // This would typically query the database for current stats
    // For now, return sample data
    const stats = {
      users: 0,
      products: 0,
      buybackRequests: 0,
      sales: 0,
      ledgerEntries: 0,
      lastMigration: null
    };

    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
}