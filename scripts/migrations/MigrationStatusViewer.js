/**
 * Migration Status Viewer
 * Displays migration status and history in a formatted table
 */

import chalk from 'chalk';
import { format, formatDistance } from 'date-fns';

export class MigrationStatusViewer {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Show migration status
   */
  async showStatus(options = {}) {
    const { verbose = false, limit = 20 } = options;
    
    try {
      // Get migrations
      const { rows: migrations } = await this.pool.query(`
        SELECT 
          m.version,
          m.filename,
          m.status,
          m.executed_at,
          m.executed_by,
          m.execution_time_ms,
          m.error_message,
          m.checksum
        FROM _migrations m
        ORDER BY m.version DESC
        LIMIT $1
      `, [limit]);

      // Get pending migrations from filesystem
      const pendingFromFiles = await this.getPendingFromFilesystem();
      
      // Get lock status
      const { rows: locks } = await this.pool.query(`
        SELECT locked_by, locked_at, pid, hostname
        FROM _migration_locks
        WHERE id = 1 AND locked_at IS NOT NULL
      `);

      // Display header
      console.log(chalk.blue('\n╔════════════════════════════════════════════════════════════════╗'));
      console.log(chalk.blue('║                     Migration Status                           ║'));
      console.log(chalk.blue('╚════════════════════════════════════════════════════════════════╝'));

      // Display lock status
      if (locks.length > 0 && locks[0].locked_at) {
        const lock = locks[0];
        const lockedAgo = formatDistance(new Date(lock.locked_at), new Date(), { addSuffix: true });
        console.log(chalk.yellow(`\n⚠️  Migrations locked by ${lock.locked_by} on ${lock.hostname} (PID: ${lock.pid}) ${lockedAgo}`));
      }

      // Display executed migrations
      if (migrations.length > 0) {
        console.log(chalk.white('\n📋 Executed Migrations:'));
        console.log(chalk.gray('─'.repeat(80)));
        
        if (verbose) {
          this.displayVerboseTable(migrations);
        } else {
          this.displaySimpleTable(migrations);
        }
      } else {
        console.log(chalk.yellow('\nNo migrations have been executed yet.'));
      }

      // Display pending migrations
      if (pendingFromFiles.length > 0) {
        console.log(chalk.white('\n⏳ Pending Migrations:'));
        console.log(chalk.gray('─'.repeat(80)));
        
        pendingFromFiles.forEach(migration => {
          console.log(chalk.gray(`  ${migration.version} - ${migration.filename}`));
        });
      } else {
        console.log(chalk.green('\n✓ All migrations are up to date!'));
      }

      // Display statistics
      await this.displayStatistics();

      // Display recent history if verbose
      if (verbose) {
        await this.displayRecentHistory();
      }

    } catch (error) {
      console.error(chalk.red('Failed to get migration status:'), error.message);
      throw error;
    }
  }

  /**
   * Display simple table
   */
  displaySimpleTable(migrations) {
    // Header
    console.log(
      chalk.bold(
        this.padEnd('Version', 16) +
        this.padEnd('Status', 12) +
        this.padEnd('Executed At', 20) +
        this.padEnd('Time', 8) +
        'Filename'
      )
    );
    console.log(chalk.gray('─'.repeat(80)));

    // Rows
    migrations.forEach(m => {
      const statusColor = this.getStatusColor(m.status);
      const statusIcon = this.getStatusIcon(m.status);
      
      console.log(
        chalk.cyan(this.padEnd(m.version, 16)) +
        statusColor(this.padEnd(`${statusIcon} ${m.status}`, 12)) +
        chalk.gray(this.padEnd(m.executed_at ? format(new Date(m.executed_at), 'yyyy-MM-dd HH:mm') : '-', 20)) +
        chalk.gray(this.padEnd(m.execution_time_ms ? `${m.execution_time_ms}ms` : '-', 8)) +
        chalk.white(m.filename)
      );

      if (m.error_message) {
        console.log(chalk.red(`     └─ Error: ${m.error_message.substring(0, 60)}...`));
      }
    });
  }

  /**
   * Display verbose table
   */
  displayVerboseTable(migrations) {
    migrations.forEach((m, index) => {
      if (index > 0) console.log(chalk.gray('─'.repeat(80)));
      
      const statusColor = this.getStatusColor(m.status);
      const statusIcon = this.getStatusIcon(m.status);
      
      console.log(chalk.cyan(`Version: ${m.version}`));
      console.log(`  File:        ${m.filename}`);
      console.log(`  Status:      ${statusColor(`${statusIcon} ${m.status}`)}`);
      console.log(`  Executed:    ${m.executed_at ? format(new Date(m.executed_at), 'yyyy-MM-dd HH:mm:ss') : '-'}`);
      console.log(`  By:          ${m.executed_by || '-'}`);
      console.log(`  Duration:    ${m.execution_time_ms ? `${m.execution_time_ms}ms` : '-'}`);
      console.log(`  Checksum:    ${m.checksum.substring(0, 16)}...`);
      
      if (m.error_message) {
        console.log(chalk.red(`  Error:       ${m.error_message}`));
      }
    });
  }

  /**
   * Display statistics
   */
  async displayStatistics() {
    const { rows } = await this.pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'rolled_back') as rolled_back,
        COUNT(*) FILTER (WHERE status = 'running') as running,
        AVG(execution_time_ms) FILTER (WHERE status = 'completed') as avg_time,
        MAX(execution_time_ms) FILTER (WHERE status = 'completed') as max_time,
        MIN(execution_time_ms) FILTER (WHERE status = 'completed') as min_time
      FROM _migrations
    `);
    
    const stats = rows[0];
    
    console.log(chalk.white('\n📊 Statistics:'));
    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.green(`  ✓ Completed:   ${stats.completed || 0}`));
    if (stats.failed > 0) {
      console.log(chalk.red(`  ✗ Failed:      ${stats.failed}`));
    }
    if (stats.rolled_back > 0) {
      console.log(chalk.yellow(`  ↩ Rolled back: ${stats.rolled_back}`));
    }
    if (stats.running > 0) {
      console.log(chalk.blue(`  ⟳ Running:     ${stats.running}`));
    }
    
    if (stats.avg_time) {
      console.log(chalk.gray(`\n  Average execution time: ${Math.round(stats.avg_time)}ms`));
      console.log(chalk.gray(`  Fastest migration:      ${Math.round(stats.min_time)}ms`));
      console.log(chalk.gray(`  Slowest migration:      ${Math.round(stats.max_time)}ms`));
    }
  }

  /**
   * Display recent history
   */
  async displayRecentHistory() {
    const { rows } = await this.pool.query(`
      SELECT 
        h.action,
        h.performed_by,
        h.performed_at,
        h.details,
        m.version,
        m.filename
      FROM _migration_history h
      JOIN _migrations m ON h.migration_id = m.id
      ORDER BY h.performed_at DESC
      LIMIT 10
    `);
    
    if (rows.length > 0) {
      console.log(chalk.white('\n📜 Recent History:'));
      console.log(chalk.gray('─'.repeat(80)));
      
      rows.forEach(h => {
        const actionIcon = h.action === 'executed' ? '▶' : '↩';
        const actionColor = h.action === 'executed' ? chalk.green : chalk.yellow;
        
        console.log(
          chalk.gray(format(new Date(h.performed_at), 'MM/dd HH:mm')) + ' ' +
          actionColor(`${actionIcon} ${h.action}`) + ' ' +
          chalk.cyan(h.version) + ' ' +
          chalk.gray(`by ${h.performed_by}`)
        );
      });
    }
  }

  /**
   * Get pending migrations from filesystem
   */
  async getPendingFromFilesystem() {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const sqlDir = path.join(__dirname, 'sql');
    
    try {
      const files = await fs.readdir(sqlDir);
      
      // Get executed versions
      const { rows } = await this.pool.query(
        'SELECT version FROM _migrations WHERE status IN ($1, $2)',
        ['completed', 'running']
      );
      const executedVersions = new Set(rows.map(r => r.version));
      
      // Filter pending
      return files
        .filter(f => f.endsWith('.sql') && !f.includes('.down.'))
        .map(filename => {
          const version = filename.match(/^(\d+)_/)?.[1] || '0';
          return { version, filename };
        })
        .filter(m => !executedVersions.has(m.version))
        .sort((a, b) => a.version.localeCompare(b.version));
    } catch {
      return [];
    }
  }

  /**
   * Get status color
   */
  getStatusColor(status) {
    switch (status) {
      case 'completed': return chalk.green;
      case 'failed': return chalk.red;
      case 'rolled_back': return chalk.yellow;
      case 'running': return chalk.blue;
      default: return chalk.gray;
    }
  }

  /**
   * Get status icon
   */
  getStatusIcon(status) {
    switch (status) {
      case 'completed': return '✓';
      case 'failed': return '✗';
      case 'rolled_back': return '↩';
      case 'running': return '⟳';
      default: return '○';
    }
  }

  /**
   * Pad string to length
   */
  padEnd(str, length) {
    return (str || '').toString().padEnd(length);
  }
}

export default MigrationStatusViewer;